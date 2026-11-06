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
 *  - DISTRIBUICAO MULTI-DIA: respeita o limite diario (maxPerDay) de cada
 *    chip e a janela de horario permitida (allowedHourStart..allowedHourEnd).
 *    O que nao couber hoje e agendado pro(s) dia(s) seguinte(s).
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
 * true se `lastResetAt` for anterior a meia-noite (local) de hoje — ou seja,
 * o contador diario `sentToday` esta "velho" e deve ser zerado.
 */
export function isSentTodayStale(lastResetAt: Date, now: Date = new Date()): boolean {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return lastResetAt.getTime() < midnight.getTime();
}

/**
 * Distribui contatos entre instancias (round-robin ponderado).
 * NAO rejeita mais por capacidade diaria — o cap diario agora e aplicado
 * em computeSchedule, que espalha os envios por varios dias.
 */
export function assignInstancesToContacts(
  contactIds: string[],
  instances: Instance[],
): { contactId: string; instanceId: string }[] | { error: string } {
  const active = instances.filter(
    (i) => i.status === "CONNECTED" && effectiveMaxPerDay(i) > 0,
  );
  if (active.length === 0) {
    return { error: "nenhuma instancia conectada com capacidade disponivel" };
  }

  const pool = buildWeightedPool(active);
  const result: { contactId: string; instanceId: string }[] = [];
  for (let idx = 0; idx < contactIds.length; idx++) {
    result.push({ contactId: contactIds[idx], instanceId: pool[idx % pool.length] });
  }
  return result;
}

/** Janela (start/end em ms) de um dia especifico, em horario LOCAL do servidor. */
function dayWindow(
  baseNow: number,
  dayOffset: number,
  startHour: number,
  endHour: number,
): { start: number; end: number } {
  const start = new Date(baseNow);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(baseNow);
  end.setDate(end.getDate() + dayOffset);
  end.setHours(endHour, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

/**
 * Calcula cronograma de disparos espalhado por varios dias.
 *
 * Para cada instancia: enche no maximo `effectiveMaxPerDay` envios por dia,
 * todos dentro da janela [allowedHourStart, allowedHourEnd). O primeiro envio
 * do dia cai no inicio da janela; os seguintes recebem delay aleatorio +
 * descanso periodico + ajuste enterprise. Quando estoura o cap do dia OU
 * passaria do fim da janela, pula pro inicio da janela do dia seguinte.
 *
 * `now` e injetavel pra facilitar testes.
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
    | "allowedHourStart"
    | "allowedHourEnd"
  >,
  assignments: { contactId: string; instanceId: string }[],
  instances: Instance[],
  now: number = Date.now(),
): ScheduledSend[] {
  const env = envDefaults();
  const isMedia = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(campaign.messageType);
  const enterpriseExtra = isMedia
    ? env.enterpriseExtraMedia * 1000
    : env.enterpriseExtraText * 1000;

  // Janela sanitizada: se invalida (fim <= inicio), usa o dia inteiro.
  let startHour = campaign.allowedHourStart;
  let endHour = campaign.allowedHourEnd;
  if (!(endHour > startHour)) {
    startHour = 0;
    endHour = 24;
  }

  const instanceById = new Map(instances.map((i) => [i.id, i]));

  let ordered = assignments;
  if (campaign.shuffleContacts) ordered = shuffle(assignments);

  // Agrupa por instancia preservando a ordem.
  const byInstance = new Map<string, string[]>();
  for (const a of ordered) {
    const arr = byInstance.get(a.instanceId);
    if (arr) arr.push(a.contactId);
    else byInstance.set(a.instanceId, [a.contactId]);
  }

  const out: ScheduledSend[] = [];

  for (const [instanceId, contactIds] of byInstance) {
    const inst = instanceById.get(instanceId);
    const cap = inst ? effectiveMaxPerDay(inst) : 0;
    if (cap <= 0) continue; // sem capacidade: nao agenda (nao deveria ocorrer)

    const isEnterprise = inst?.tier === "ENTERPRISE";
    const alreadyToday = inst ? Math.max(0, inst.sentToday) : 0;

    // Estado do dia corrente para esta instancia.
    let dayOffset = 0;
    let win = dayWindow(now, dayOffset, startHour, endHour);
    let cursorMs = Math.max(now, win.start);
    // Capacidade restante HOJE desconta o que o chip ja enviou hoje.
    let slotsLeft = Math.max(0, cap - alreadyToday);
    let sentThisDay = 0;
    let firstOfDay = true;

    const advanceDay = () => {
      dayOffset++;
      win = dayWindow(now, dayOffset, startHour, endHour);
      cursorMs = win.start;
      slotsLeft = cap;
      sentThisDay = 0;
      firstOfDay = true;
    };

    // Se hoje ja acabou (fora da janela) ou sem capacidade, comeca amanha.
    while (cursorMs >= win.end || slotsLeft <= 0) {
      advanceDay();
    }

    for (const contactId of contactIds) {
      // Sem slot hoje -> proximo dia.
      if (slotsLeft <= 0) advanceDay();

      let delta = 0;
      if (!firstOfDay) {
        delta = randInt(campaign.delayMinSec, campaign.delayMaxSec) * 1000;
        if (campaign.restEveryN > 0 && sentThisDay % campaign.restEveryN === 0) {
          delta += campaign.restForSec * 1000;
        }
        if (isEnterprise) delta += enterpriseExtra;
      }

      let target = cursorMs + delta;
      // Se passaria do fim da janela, joga pro inicio da janela do dia seguinte.
      if (target >= win.end) {
        advanceDay();
        target = cursorMs; // primeiro do novo dia cai no inicio da janela
      }

      cursorMs = target;
      out.push({ contactId, instanceId, delayMs: cursorMs - now });

      slotsLeft--;
      sentThisDay++;
      firstOfDay = false;
    }
  }

  return out;
}
