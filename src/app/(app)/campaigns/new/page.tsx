import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { NewCampaignClient } from "./new-campaign-client";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const ownerId = await getOwnerId();

  const [tags, instances, spintaxVars] = await Promise.all([
    prisma.contactTag.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
    }),
    prisma.instance.findMany({
      where: { ownerId },
      orderBy: [{ status: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        tier: true,
        phoneNumber: true,
        sentToday: true,
        maxPerDay: true,
      },
    }),
    prisma.spintaxVariable.findMany({
      where: { OR: [{ ownerId }, { ownerId: null }] },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { name: true, label: true, values: true, isSystem: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Nova campanha" description="Configure sua campanha e dispare quando estiver pronto." />
      <NewCampaignClient
        tags={tags}
        instances={instances}
        spintaxVars={spintaxVars.map((v) => ({
          name: v.name,
          label: v.label,
          isSystem: v.isSystem,
          sampleValues: v.values.slice(0, 3),
        }))}
      />
    </div>
  );
}
