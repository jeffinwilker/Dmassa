/**
 * Valida em lote quais numeros de fato tem WhatsApp, chamando a Evolution API
 * (endpoint /chat/whatsappNumbers). Atualiza Contact.hasWhatsapp.
 */
import type { Contact, Instance } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";

const BATCH_SIZE = 50;
const CACHE_DAYS = 7; // nao re-valida se validado nos ultimos N dias

export async function validateContactsHaveWhatsapp(
  contacts: Contact[],
  instance: Instance,
): Promise<{ validated: number; hasWa: number; noWa: number; errors: number }> {
  const evo = evolutionClient();
  const now = Date.now();
  const cacheCutoff = now - CACHE_DAYS * 86400_000;

  // Filtra os que precisam ser validados
  const toValidate = contacts.filter((c) => {
    if (c.hasWhatsapp !== null && c.lastValidatedAt) {
      return c.lastValidatedAt.getTime() < cacheCutoff;
    }
    return true;
  });

  const stats = { validated: 0, hasWa: 0, noWa: 0, errors: 0 };

  for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
    const batch = toValidate.slice(i, i + BATCH_SIZE);
    const numbers = batch.map((c) => c.whatsapp);
    try {
      const results = await evo.whatsappNumbers(
        instance.evolutionInstance,
        { numbers },
        instance.apiKey ?? undefined,
      );
      // results: [{ exists, number, jid }]
      const byNumber = new Map<string, boolean>();
      for (const r of results) {
        // Evolution as vezes retorna com/sem "+" ou @s.whatsapp.net
        const num = String(r.number ?? "").replace(/\D/g, "");
        if (num) byNumber.set(num, !!r.exists);
      }
      const nowDate = new Date();
      for (const c of batch) {
        const exists = byNumber.get(c.whatsapp);
        if (exists === undefined) {
          stats.errors++;
          continue;
        }
        await prisma.contact.update({
          where: { id: c.id },
          data: { hasWhatsapp: exists, lastValidatedAt: nowDate },
        });
        stats.validated++;
        if (exists) stats.hasWa++;
        else stats.noWa++;
      }
    } catch (err) {
      if (err instanceof EvolutionError) {
        console.warn(`[validate] batch falhou: ${err.message}`);
      } else {
        console.warn("[validate] erro:", (err as Error).message);
      }
      stats.errors += batch.length;
    }
  }

  return stats;
}
