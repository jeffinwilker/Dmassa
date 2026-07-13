import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { campaignQueue } from "@/lib/queue";
import { buildAudienceWhere } from "@/lib/audience";
import { assignInstancesToContacts, computeSchedule } from "@/lib/scheduler";
import { validateContactsHaveWhatsapp } from "@/lib/validate-numbers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();

  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerId },
    include: { instances: true },
  });
  if (!campaign) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Campanha esta ${campaign.status} — nao pode iniciar` },
      { status: 409 },
    );
  }

  // 1. Resolver instancias elegiveis
  let instances;
  if (campaign.useAllInstances) {
    instances = await prisma.instance.findMany({ where: { ownerId, status: "CONNECTED" } });
  } else {
    const ids = campaign.instances.map((ci) => ci.instanceId);
    instances = await prisma.instance.findMany({
      where: { id: { in: ids }, ownerId, status: "CONNECTED" },
    });
  }
  if (instances.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma instancia conectada disponivel pra esta campanha" },
      { status: 400 },
    );
  }

  // 2. Resolver contatos alvo
  let contacts;
  if (campaign.audienceMode === "MANUAL") {
    const rows = await prisma.campaignContact.findMany({
      where: { campaignId: id },
      include: { contact: true },
    });
    contacts = rows.map((r) => r.contact);
  } else {
    const where = buildAudienceWhere(ownerId, {
      mode: campaign.audienceMode as "ALL" | "TAGS" | "MANUAL",
      tagIds: campaign.audienceTagIds,
      requireAllTags: campaign.audienceRequireAllTags,
      excludeBlacklisted: campaign.excludeBlacklisted,
      excludeInConversation: campaign.excludeInConversation,
    });
    contacts = await prisma.contact.findMany({ where });
  }
  if (contacts.length === 0) {
    return NextResponse.json({ error: "Nenhum contato no publico-alvo" }, { status: 400 });
  }

  // 2.5. Validar previamente se numeros tem WhatsApp (anti-ban).
  //     Chama Evolution em batches usando a primeira instancia conectada.
  let validationReport: {
    validated: number;
    hasWa: number;
    noWa: number;
    errors: number;
  } | null = null;
  let excludedNoWaCount = 0;
  if (campaign.validateBeforeSend) {
    validationReport = await validateContactsHaveWhatsapp(contacts, instances[0]);
    // recarrega hasWhatsapp atualizado
    const ids = contacts.map((c) => c.id);
    const fresh = await prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { id: true, hasWhatsapp: true },
    });
    const hasWaById = new Map(fresh.map((c) => [c.id, c.hasWhatsapp]));
    const filtered = contacts.filter((c) => hasWaById.get(c.id) !== false);
    excludedNoWaCount = contacts.length - filtered.length;
    contacts = filtered;
    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "Nenhum contato valido apos validacao (todos sem WhatsApp)" },
        { status: 400 },
      );
    }
  }

  const contactIds = contacts.map((c) => c.id);

  // 3. Distribui em instancias respeitando peso + limite diario
  const assignments = assignInstancesToContacts(contactIds, instances);
  if ("error" in assignments) {
    return NextResponse.json({ error: assignments.error }, { status: 400 });
  }

  // 4. Materializa CampaignContact (se nao for MANUAL, cria os links)
  if (campaign.audienceMode !== "MANUAL") {
    // Idempotente: se re-iniciando (era PAUSED), skipRelinking. Aqui zeramos e recriamos
    // Nota: em PAUSED nao chegamos aqui porque o start bloqueia? Deixa reiniciar do zero.
    await prisma.campaignContact.deleteMany({ where: { campaignId: id } });
    await prisma.campaignContact.createMany({
      data: assignments.map((a) => ({ campaignId: id, contactId: a.contactId })),
      skipDuplicates: true,
    });
  }

  // 5. Cria MessageJob pra cada contato (pending). Se ja existir para o mesmo
  // par (campaign, contact), pula pra permitir resume sem duplicar.
  const existingJobs = await prisma.messageJob.findMany({
    where: { campaignId: id, contactId: { in: contactIds } },
    select: { contactId: true, id: true, status: true },
  });
  const existingByContact = new Map(existingJobs.map((j) => [j.contactId, j]));

  const toCreate = assignments
    .filter((a) => !existingByContact.has(a.contactId))
    .map((a) => ({
      campaignId: id,
      contactId: a.contactId,
      instanceId: a.instanceId,
      status: "PENDING" as const,
    }));
  if (toCreate.length) {
    await prisma.messageJob.createMany({ data: toCreate });
  }

  // Recarrega jobs pra pegar ids
  const jobs = await prisma.messageJob.findMany({
    where: { campaignId: id },
    select: { id: true, contactId: true, status: true },
  });
  const jobByContact = new Map(jobs.map((j) => [j.contactId, j]));

  // 6. Calcula cronograma e enfileira
  const schedule = computeSchedule(campaign, assignments, instances);

  // Offset base: se agendada pra futuro, todos os jobs sao delayed por
  // (scheduledFor - agora) alem do delay individual.
  const nowMs = Date.now();
  const baseOffsetMs =
    campaign.scheduledFor && campaign.scheduledFor.getTime() > nowMs
      ? campaign.scheduledFor.getTime() - nowMs
      : 0;

  const queue = campaignQueue();
  let enqueued = 0;
  const enqueueErrors: string[] = [];
  for (const item of schedule) {
    const mj = jobByContact.get(item.contactId);
    if (!mj) continue;
    if (["SENT", "DELIVERED", "READ"].includes(mj.status)) continue;

    try {
      await queue.add(
        "send",
        {
          messageJobId: mj.id,
          campaignId: id,
          contactId: item.contactId,
          instanceId: item.instanceId,
        },
        {
          delay: item.delayMs + baseOffsetMs,
          // BullMQ v5 nao aceita ":" em custom jobId -> usar "-"
          jobId: `mj-${mj.id}`,
        },
      );
      enqueued++;
      await prisma.messageJob.update({
        where: { id: mj.id },
        data: { instanceId: item.instanceId, status: "SCHEDULED" },
      });
    } catch (err) {
      const msg = (err as Error).message;
      // Se ja existir job (retry), BullMQ v5 devolve o existente — mas se
      // outra falha (Redis fora, etc), registramos e continuamos.
      enqueueErrors.push(`${mj.id}: ${msg}`);
      console.error("[start] enqueue falhou:", mj.id, msg);
    }
  }

  if (enqueued === 0) {
    return NextResponse.json(
      {
        error: "Falha ao enfileirar todos os envios",
        details: enqueueErrors.slice(0, 5),
      },
      { status: 500 },
    );
  }

  // 7. Marca campanha como RUNNING
  await prisma.campaign.update({
    where: { id },
    data: {
      status: "RUNNING",
      startedAt: campaign.startedAt ?? new Date(),
      pausedAt: null,
      totalContacts: contactIds.length,
    },
  });

  return NextResponse.json({
    ok: true,
    totalContacts: contactIds.length,
    enqueued,
    excludedNoWaCount,
    validation: validationReport,
    estimatedFinishInSec: Math.max(...schedule.map((s) => s.delayMs), 0) / 1000,
  });
}
