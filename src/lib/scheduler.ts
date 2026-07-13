/**
 * Scheduler: dado uma campanha e a lista de contatos alvo,
 * calcula (contactId, instanceId, delayMs) para cada envio.
 *
 * Aplica:
 *  - delay aleatorio entre delayMinSec e delayMaxSec
 *  - descanso periodico a cada restEveryN mensagens
 *  - ajuste enterprise (+30s texto / +90s midia)
 *  - rotacao ponderada de instancias (weighted round-robin)
 *  - embaralhamento da ordem dos contatos (se shuffleContacts)
 */
import type { Campaign, Instance } from "@prisma/client";
import { randInt, shuffle } from "@/lib/utils";

export interface ScheduledSend {
  contactId: string;
  instanceId: string;
  /** ms a partir de "agora" (ao enfileirar) */
  delayMs: number;
}

interface Env {
  enterpriseExtraText: number; // segundos
  enterpriseExtraMedia: number;
}

function envDefaults(): Env {
  return {
    enterpriseExtraText: Number(process.env.ENTERPRISE_EXTRA_DELAY_TEXT_SEC ?? "30"),
    enterpriseExtraMedia: Number(process.env.ENTERPRISE_EXTRA_DELAY_MEDIA_SEC ?? "90"),
  };
}

/**
 * Constroi um "pool" de indices de instancias respeitando o peso.
 * Ex: [{id:A, weight:1}, {id:B, weight:2}] -> ['A','B','B']
 * Depois so faz round-robin pra ter distribuicao proporcional.
 */
function buildWeightedPool(instances: Instance[]): string[] {
  const pool: string[] = [];
  for (const inst of instances) {
    const w = Math.max(1, inst.weight);
    for (let i = 0; i < w; i++) pool.push(inst.id);
  }
  return pool;
}

/**
 * Aquecimento de chip: cap diario cresce por 14 dias.
 * Stage 0 = chip acabou de conectar. Stage 14 = maduro (usa maxPerDay cheio).
 */
const WARMUP_SCHEDULE = [
  30,  // dia 0
  60,  // dia 1
  100, // dia 2
  150,
  200,
  250,
  300,
  350,
  400,
  450,
  500,
  600,
  700,
  800,
  1000, // dia 14 (efetivamente sem cap de warmup)
];

export function warmupCap(stage: number): number {
  const s = Math.max(0, Math.min(14, stage));
  return WARMUP_SCHEDULE[s];
}

/** Cap efetivo por dia = min(maxPerDay, warmupCap(stage)). */
export function effectiveMaxPerDay(instance: Instance): number {
  return Math.min(instance.maxPerDay, warmupCap(instance.warmupStage));
}

/**
 * Distribui contatos entre instancias respeitando pesos e limite diario.
 * Retorna array na mesma ordem dos contatos (com instanceId atribuido).
 */
export function assignInstancesToContacts(
  contactIds: string[],
  instances: Instance[],
): { contactId: string; instanceId: string }[] | { error: string } {
  const active = instances.filter((i) => i.status === "CONNECTED");
  if (active.length === 0) return { error: "nenhuma instancia conectada" };

  const pool = buildWeightedPool(active);
  const capacityByInstance = new Map<string, number>();
  for (const i of active) {
    capacityByInstance.set(i.id, Math.max(0, effectiveMaxPerDay(i) - i.sentToday));
  }

  const result: { contactId: string; instanceId: string }[] = [];
  let cursor = 0;
  for (const contactId of contactIds) {
    // Encontra proxima instancia com capacidade
    let picked: string | null = null;
    for (let tries = 0; tries < pool.length * 2; tries++) {
      const cand = pool[cursor % pool.length];
      cursor++;
      const cap = capacityByInstance.get(cand) ?? 0;
      if (cap > 0) {
        picked = cand;
        capacityByInstance.set(cand, cap - 1);
        break;
      }
    }
    if (!picked) {
      return { error: "capacidade diaria das instancias esgotada" };
    }
    result.push({ contactId, instanceId: picked });
  }
  return result;
}

/**
 * Calcula cronograma de disparos.
 * assignments = saida de assignInstancesToContacts (ja com instancia atribuida).
 */
export function computeSchedule(
  campaign: Pick<
    Campaign,
    | "messageType"
    | "delayMinSec"
    | "delayMaxSec"
    | "restEveryN"
    | "restForSec"
    | "shuffleContacts"
  >,
  assignments: { contactId: string; instanceId: string }[],
  instances: Instance[],
): ScheduledSend[] {
  const env = envDefaults();
  const isMedia = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(campaign.messageType);
  const enterpriseExtra = isMedia
    ? env.enterpriseExtraMedia * 1000
    : env.enterpriseExtraText * 1000;

  const instanceById = new Map(instances.map((i) => [i.id, i]));

  let ordered = assignments;
  if (campaign.shuffleContacts) ordered = shuffle(assignments);

  const out: ScheduledSend[] = [];
  let cumMs = 0;

  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    const inst = instanceById.get(a.instanceId);

    // Delta aleatorio entre delayMin e delayMax
    let deltaMs = i === 0 ? 0 : randInt(campaign.delayMinSec, campaign.delayMaxSec) * 1000;

    // Descanso periodico: apos cada restEveryN mensagens
    if (i > 0 && campaign.restEveryN > 0 && i % campaign.restEveryN === 0) {
      deltaMs += campaign.restForSec * 1000;
    }

    // Enterprise adjustment
    if (inst?.tier === "ENTERPRISE") {
      deltaMs += enterpriseExtra;
    }

    cumMs += deltaMs;
    out.push({ contactId: a.contactId, instanceId: a.instanceId, delayMs: cumMs });
  }
  return out;
}
