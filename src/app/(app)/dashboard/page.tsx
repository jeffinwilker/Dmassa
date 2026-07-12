import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { Smartphone, Users, Megaphone, Send } from "lucide-react";

export const dynamic = "force-dynamic";

async function getStats() {
  const ownerId = await getOwnerId();
  const [instances, connectedInstances, contacts, activeCampaigns, sentToday] = await Promise.all([
    prisma.instance.count({ where: { ownerId } }),
    prisma.instance.count({ where: { ownerId, status: "CONNECTED" } }),
    prisma.contact.count({ where: { ownerId, isBlacklisted: false } }),
    prisma.campaign.count({ where: { ownerId, status: { in: ["RUNNING", "SCHEDULED"] } } }),
    prisma.messageJob.count({
      where: {
        campaign: { ownerId },
        sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);
  return { instances, connectedInstances, contacts, activeCampaigns, sentToday };
}

export default async function DashboardPage() {
  let stats;
  try {
    stats = await getStats();
  } catch {
    // Banco ainda nao disponivel na primeira execucao.
    stats = { instances: 0, connectedInstances: 0, contacts: 0, activeCampaigns: 0, sentToday: 0 };
  }

  const cards = [
    {
      label: "Instâncias conectadas",
      value: `${stats.connectedInstances}/${stats.instances}`,
      icon: Smartphone,
      color: "text-blue-600",
    },
    {
      label: "Contatos ativos",
      value: stats.contacts.toLocaleString("pt-BR"),
      icon: Users,
      color: "text-emerald-600",
    },
    {
      label: "Campanhas ativas",
      value: stats.activeCampaigns,
      icon: Megaphone,
      color: "text-violet-600",
    },
    {
      label: "Enviadas hoje",
      value: stats.sentToday.toLocaleString("pt-BR"),
      icon: Send,
      color: "text-amber-600",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral das suas instâncias e campanhas."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{c.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Bem-vindo ao Dmassa</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Para começar:{" "}
            <span className="font-medium text-foreground">
              1) crie uma instância em Instâncias e escaneie o QR,
            </span>{" "}
            2) importe seus contatos, 3) crie uma campanha.
          </p>
          <p className="text-xs">
            Esta plataforma implementa anti-ban por padrão: delays aleatórios, descanso periódico,
            validação prévia de números, simulação de digitação e opt-out automático.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
