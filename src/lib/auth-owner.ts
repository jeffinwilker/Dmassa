/**
 * Retorna o ownerId da requisicao atual = user.id da sessao.
 * Single-user: user.id do usuario logado e o dono de tudo.
 * Multi-tenant no futuro: substituir por session.organizationId.
 *
 * IMPORTANTE: chamar apenas em contexto autenticado (middleware ja protege
 * todas as rotas dentro de /(app) e /api/*, exceto webhooks publicos).
 */
import { getSession } from "./session";

export async function getOwnerId() {
  const s = await getSession();
  if (!s.userId) throw new Error("UNAUTHORIZED: sessao ausente");
  return s.userId;
}
