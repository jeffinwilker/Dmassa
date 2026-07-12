import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { InstancesClient } from "./instances-client";

export const dynamic = "force-dynamic";

export default async function InstancesPage() {
  const ownerId = await getOwnerId();
  let instances: Awaited<ReturnType<typeof prisma.instance.findMany>> = [];
  try {
    instances = await prisma.instance.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // Banco ainda nao disponivel: mostramos vazio com aviso.
  }

  return (
    <div>
      <PageHeader
        title="Instâncias"
        description="Cada chip do WhatsApp conectado ao Evolution API vira uma instância aqui."
      />
      <InstancesClient initialInstances={instances} />
    </div>
  );
}
