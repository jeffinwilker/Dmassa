import Link from "next/link";
import {
  Send,
  CheckCircle2,
  Eye,
  XCircle,
  Ban,
  Users,
  TrendingUp,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  const ownerId = await getOwnerId();
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 86400_000);
  const last30 = new Date(now.getTime() - 30 * 86400_000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    aggAll,
    agg7,
    agg30,
    sentToday,
    activeContacts,
    blacklistCount,
    topCampaigns,
    recentJobs,
  ] = await Promise.all([
    prisma.campaign.aggregate({
      where: { ownerId },
      _sum: {
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        failedCount: true,
        skippedCount: true,
        totalContacts: true,
      },
    }),
    prisma.messageJob.count({
      where: {
        campaign: { ownerId },
        sentAt: { gte: last7 },
      },
    }),
    prisma.messageJob.count({
      where: {
        campaign: { ownerId },
        sentAt: { gte: last30 },
      },
    }),
    prisma.messageJob.count({
      where: {
        campaign: { ownerId },
        sentAt: { gte: todayStart },
      },
    }),
    prisma.contact.count({ where: { ownerId, isBlacklisted: false } }),
    prisma.contact.count({ where: { ownerId, isBlacklisted: true } }),
    prisma.campaign.findMany({
      where: { ownerId },
      orderBy: { sentCount: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        totalContacts: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        failedCount: true,
        skippedCount: true,
        createdAt: true,
      },
    }),
    prisma.messageJob.findMany({
      where: { campaign: { ownerId }, status: "FAILED" },
      orderBy: { failedAt: "desc" },
      take: 10,
      select: {
        id: true,
        errorMessage: true,
        failedAt: true,
        contact: { select: { whatsapp: true, name: true } },
        campaign: { select: { name: true, id: true } },
      },
    }),
  ]);

  const totalSent = aggAll._sum.sentCount ?? 0;
  const totalDelivered = aggAll._sum.deliveredCount ?? 0;
  const totalRead = aggAll._sum.readCount ?? 0;
  const totalFailed = aggAll._sum.failedCount ?? 0;
  const totalSkipped = aggAll._sum.skippedCount ?? 0;

  return {
    totalSent,
    totalDelivered,
    totalRead,
    totalFailed,
    totalSkipped,
    sent7: agg7,
    sent30: agg30,
    sentToday,
    activeContacts,
    blacklistCount,
    topCampaigns,
    recentFailures: recentJobs,
    deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
    readRate: totalSent > 0 ? (totalRead / totalSent) * 100 : 0,
    optOutRate: activeContacts + blacklistCount > 0
      ? (blacklistCount / (activeContacts + blacklistCount)) * 100
      : 0,
  };
}

export default async function ReportsPage() {
  const s = await getStats();

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Métricas gerais de envio e engajamento das suas campanhas."
      />

      {/* Metricas de volume */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard
          label="Enviadas hoje"
          value={s.sentToday.toLocaleString("pt-BR")}
          icon={Send}
          color="text-primary"
        />
        <MetricCard
          label="Últimos 7 dias"
          value={s.sent7.toLocaleString("pt-BR")}
          icon={TrendingUp}
          color="text-emerald-600"
        />
        <MetricCard
          label="Últimos 30 dias"
          value={s.sent30.toLocaleString("pt-BR")}
          icon={TrendingUp}
          color="text-blue-600"
        />
        <MetricCard
          label="Total (sempre)"
          value={s.totalSent.toLocaleString("pt-BR")}
          icon={Send}
          color="text-muted-foreground"
        />
      </div>

      {/* Taxas */}
      <div className="grid gap-3 md:grid-cols-3 mb-6">
        <RateCard
          label="Taxa de entrega"
          value={s.deliveryRate}
          total={s.totalDelivered}
          totalOf={s.totalSent}
          color="bg-emerald-500"
          icon={CheckCircle2}
        />
        <RateCard
          label="Taxa de leitura"
          value={s.readRate}
          total={s.totalRead}
          totalOf={s.totalSent}
          color="bg-blue-500"
          icon={Eye}
        />
        <RateCard
          label="Taxa de opt-out"
          value={s.optOutRate}
          total={s.blacklistCount}
          totalOf={s.activeContacts + s.blacklistCount}
          color="bg-destructive"
          icon={Ban}
          reverse
        />
      </div>

      {/* Contadores auxiliares */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard
          label="Contatos ativos"
          value={s.activeContacts.toLocaleString("pt-BR")}
          icon={Users}
          color="text-emerald-600"
        />
        <MetricCard
          label="Em blacklist"
          value={s.blacklistCount.toLocaleString("pt-BR")}
          icon={Ban}
          color="text-destructive"
        />
        <MetricCard
          label="Falhas totais"
          value={s.totalFailed.toLocaleString("pt-BR")}
          icon={XCircle}
          color="text-destructive"
        />
        <MetricCard
          label="Pulados totais"
          value={s.totalSkipped.toLocaleString("pt-BR")}
          icon={Clock}
          color="text-muted-foreground"
        />
      </div>

      {/* Top campanhas */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Top campanhas por volume</h3>
          </div>
          {s.topCampaigns.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma campanha ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Campanha</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Alvo</th>
                    <th className="text-right px-4 py-2 font-medium">Enviados</th>
                    <th className="text-right px-4 py-2 font-medium">Entregues</th>
                    <th className="text-right px-4 py-2 font-medium">Lidos</th>
                    <th className="text-right px-4 py-2 font-medium">Falhas</th>
                    <th className="text-right px-4 py-2 font-medium">Pulados</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topCampaigns.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(c.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-xs">
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {c.totalContacts.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {c.sentCount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">
                        {c.deliveredCount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-blue-700">
                        {c.readCount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-destructive">
                        {c.failedCount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {c.skippedCount.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ultimas falhas */}
      {s.recentFailures.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm text-destructive">Últimas falhas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Campanha</th>
                    <th className="text-left px-4 py-2 font-medium">Contato</th>
                    <th className="text-left px-4 py-2 font-medium">Quando</th>
                    <th className="text-left px-4 py-2 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recentFailures.map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="px-4 py-2">
                        <Link
                          href={`/campaigns/${j.campaign.id}`}
                          className="text-primary hover:underline"
                        >
                          {j.campaign.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {j.contact.name ?? j.contact.whatsapp}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {j.failedAt ? formatDate(j.failedAt) : "—"}
                      </td>
                      <td className="px-4 py-2 text-destructive max-w-md truncate">
                        {j.errorMessage ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
          </div>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function RateCard({
  label,
  value,
  total,
  totalOf,
  color,
  icon: Icon,
  reverse,
}: {
  label: string;
  value: number;
  total: number;
  totalOf: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  reverse?: boolean;
}) {
  const pct = Math.round(value);
  const good = reverse ? value < 2 : value >= 80;
  const meh = reverse ? value < 5 : value >= 50;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon
            className={`h-4 w-4 ${
              good ? "text-emerald-600" : meh ? "text-warning" : "text-destructive"
            }`}
          />
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold">{pct}%</span>
          <span className="text-xs text-muted-foreground">
            {total.toLocaleString("pt-BR")} de {totalOf.toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
