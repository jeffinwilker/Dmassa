/**
 * Fila BullMQ para disparos de campanha.
 *
 * Fila unica "campaign-messages":
 *   - 1 job por (campaign, contact)
 *   - Producer: /api/campaigns/[id]/start (server)
 *   - Consumer: src/workers/index.ts (processo PM2 separado)
 *
 * NAO importar em Edge runtime (middleware).
 */
import { Queue, QueueEvents, type ConnectionOptions, type JobsOptions } from "bullmq";

export const CAMPAIGN_QUEUE = "campaign-messages";

export interface CampaignJobData {
  messageJobId: string;
  campaignId: string;
  contactId: string;
  instanceId: string;
}

/**
 * Config de conexao Redis (formato aceito pelo BullMQ e ioredis interno).
 * Preferimos passar as opcoes cruas em vez de uma instancia ioredis pra
 * evitar conflito de versao (BullMQ traz ioredis como dep interna).
 */
export function redisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL nao configurada");
  const u = new URL(url);
  const db = u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname,
    port: Number(u.port || "6379"),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    db: Number.isFinite(db) ? db : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

let _queue: Queue<CampaignJobData> | null = null;

export function campaignQueue(): Queue<CampaignJobData> {
  if (_queue) return _queue;
  const q = new Queue<CampaignJobData>(CAMPAIGN_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 1000, age: 60 * 60 * 24 * 7 },
      removeOnFail: { count: 1000, age: 60 * 60 * 24 * 30 },
    },
  });
  _queue = q;
  return q;
}

let _events: QueueEvents | null = null;
export function campaignQueueEvents(): QueueEvents {
  if (_events) return _events;
  const e = new QueueEvents(CAMPAIGN_QUEUE, { connection: redisConnection() });
  _events = e;
  return e;
}

export type { JobsOptions };
