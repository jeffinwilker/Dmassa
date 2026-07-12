import Link from "next/link";
import { Plus, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, { variant: "default" | "secondary" | "success" | "warning" | "destructive"; label: string }> = {
  DRAFT: { variant: "secondary", label: "Rascunho" },
  SCHEDULED: { variant: "warning", label: "Agendada" },
  RUNNING: { variant: "success", label: "Rodando" },
  PAUSED: { variant: "warning", label: "Pausada" },
  COMPLETED: { variant: "default", label: "Concluída" },
  CANCELLED: { variant: "destructive", label: "Cancelada" },
};

const typeLabel: Record<string, string> = {
  TEXT: "Texto",
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  AUDIO: "Áudio",
  DOCUMENT: "Documento",
  CONTACT: "Contato",
  LOCATION: "Localização",
};

export default async function CampaignsPage() {
  const ownerId = await getOwnerId();
  const campaigns = await prisma.campaign.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Crie, dispare e acompanhe seus envios em massa."
        actions={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus /> Nova campanha
            </Link>
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-primary/10 text-primary rounded-full p-4 mb-4">
              <Megaphone className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">Nenhuma campanha ainda</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Crie sua primeira campanha para começar a disparar mensagens em massa com anti-ban.
            </p>
            <Button asChild className="mt-6">
              <Link href="/campaigns/new">
                <Plus /> Criar primeira campanha
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => {
            const st = statusStyle[c.status] ?? statusStyle.DRAFT;
            const progress =
              c.totalContacts > 0
                ? Math.round(
                    ((c.sentCount + c.failedCount + c.skippedCount) / c.totalContacts) * 100,
                  )
                : 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{c.name}</h3>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          <Badge variant="outline" className="text-xs font-normal">
                            {typeLabel[c.messageType]}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.scheduledFor
                            ? `Agendada para ${formatDate(c.scheduledFor)}`
                            : c.startedAt
                            ? `Iniciada em ${formatDate(c.startedAt)}`
                            : `Criada em ${formatDate(c.createdAt)}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold">
                          {c.sentCount.toLocaleString("pt-BR")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          de {c.totalContacts.toLocaleString("pt-BR")} enviados
                        </div>
                      </div>
                    </div>

                    {c.totalContacts > 0 && (
                      <div className="mt-3">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                          <span>{progress}%</span>
                          <span className="flex gap-3">
                            <span className="text-emerald-600">{c.deliveredCount} entregues</span>
                            <span className="text-blue-600">{c.readCount} lidas</span>
                            {c.failedCount > 0 && (
                              <span className="text-destructive">{c.failedCount} falhas</span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
