import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { CampaignDetailClient } from "./campaign-detail-client";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getOwnerId();

  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerId },
    include: {
      media: true,
      instances: { include: { instance: true } },
    },
  });
  if (!campaign) notFound();

  const instances = await prisma.instance.findMany({
    where: { ownerId, status: "CONNECTED" },
    select: { id: true, name: true, phoneNumber: true, tier: true },
  });

  return (
    <div>
      <PageHeader title={campaign.name} description={`Campanha #${campaign.id.slice(-6)}`} />
      <CampaignDetailClient
        campaign={JSON.parse(JSON.stringify(campaign))}
        connectedInstances={instances}
      />
    </div>
  );
}
