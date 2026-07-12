import type { Prisma } from "@prisma/client";

export interface AudienceFilter {
  mode: "ALL" | "TAGS" | "MANUAL";
  tagIds: string[];
  requireAllTags: boolean;
  excludeBlacklisted: boolean;
  excludeInConversation: boolean;
}

/**
 * Constroi where do Prisma para o publico-alvo de uma campanha.
 * MANUAL fica sem filtro extra aqui — o start usa CampaignContact.
 */
export function buildAudienceWhere(
  ownerId: string,
  a: AudienceFilter,
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { ownerId };
  if (a.excludeBlacklisted) where.isBlacklisted = false;
  if (a.excludeInConversation) where.inConversation = false;

  if (a.mode === "TAGS" && a.tagIds.length) {
    if (a.requireAllTags) {
      where.AND = a.tagIds.map((tagId) => ({ tags: { some: { tagId } } }));
    } else {
      where.tags = { some: { tagId: { in: a.tagIds } } };
    }
  }
  return where;
}
