/**
 * Worker BullMQ do Dmassa.
 *
 * Rodar via PM2:
 *   pm2 start ecosystem.config.cjs --only dmassa-worker
 *
 * Ou standalone:
 *   npm run worker
 *
 * O processamento real (renderizar spintax, chamar Evolution, aplicar
 * delays anti-ban) esta em ./process-message.ts. Este arquivo cuida
 * apenas do bootstrap.
 */
import "dotenv/config";
import { Worker } from "bullmq";
import { CAMPAIGN_QUEUE, redisConnection, type CampaignJobData } from "@/lib/queue";
import { processMessageJob } from "./process-message";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? "5");

console.log(`[worker] iniciando (concurrency=${concurrency})...`);

const worker = new Worker<CampaignJobData>(
  CAMPAIGN_QUEUE,
  async (job) => {
    return processMessageJob(job.data);
  },
  {
    connection: redisConnection(),
    concurrency,
    // Rate limit global de seguranca (nao ultrapassa isso mesmo com bug)
    limiter: {
      max: 30,
      duration: 60_000, // no maximo 30 mensagens/minuto GLOBAIS
    },
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] completed ${job.id}  (msg=${job.data.messageJobId})`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.id} (msg=${job?.data.messageJobId}):`, err.message);
});

worker.on("error", (err) => {
  console.error(`[worker] error:`, err);
});

async function shutdown(sig: string) {
  console.log(`[worker] recebido ${sig}, encerrando...`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`[worker] escutando fila ${CAMPAIGN_QUEUE}`);
