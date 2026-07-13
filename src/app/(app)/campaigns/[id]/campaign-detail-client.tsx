"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Pause,
  Square,
  Send,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  status: string;
  messageType: string;
  text: string | null;
  caption: string | null;
  totalContacts: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  skippedCount: number;
  delayMinSec: number;
  delayMaxSec: number;
  restEveryN: number;
  restForSec: number;
  allowedHourStart: number;
  allowedHourEnd: number;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  media: { url: string; fileName: string; mimeType: string; kind: string } | null;
  instances: { instance: { id: string; name: string } }[];
}

interface Job {
  id: string;
  status: string;
  contact: { id: string; name: string | null; whatsapp: string };
  instance: { id: string; name: string } | null;
  renderedText: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

const statusStyle: Record<
  string,
  { variant: "default" | "secondary" | "success" | "warning" | "destructive"; label: string }
> = {
  DRAFT: { variant: "secondary", label: "Rascunho" },
  SCHEDULED: { variant: "warning", label: "Agendada" },
  RUNNING: { variant: "success", label: "Rodando" },
  PAUSED: { variant: "warning", label: "Pausada" },
  COMPLETED: { variant: "default", label: "Concluída" },
  CANCELLED: { variant: "destructive", label: "Cancelada" },
};

const jobStatusStyle: Record<
  string,
  { variant: "default" | "secondary" | "success" | "warning" | "destructive"; label: string }
> = {
  PENDING: { variant: "secondary", label: "Pendente" },
  SCHEDULED: { variant: "secondary", label: "Agendado" },
  SENDING: { variant: "warning", label: "Enviando" },
  SENT: { variant: "success", label: "Enviado" },
  DELIVERED: { variant: "success", label: "Entregue" },
  READ: { variant: "success", label: "Lido" },
  FAILED: { variant: "destructive", label: "Falha" },
  SKIPPED: { variant: "secondary", label: "Pulado" },
};

interface Props {
  campaign: Campaign;
  connectedInstances: { id: string; name: string; phoneNumber: string | null; tier: string }[];
}

export function CampaignDetailClient({ campaign: initial, connectedInstances }: Props) {
  const router = useRouter();
  const [campaign, setCampaign] = React.useState(initial);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [jobFilter, setJobFilter] = React.useState<string>("all");
  const [busy, setBusy] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);

  const isTerminal = ["COMPLETED", "CANCELLED"].includes(campaign.status);
  const isRunning = campaign.status === "RUNNING";
  const canStart = ["DRAFT", "SCHEDULED", "PAUSED"].includes(campaign.status);

  const refresh = React.useCallback(async () => {
    const [cRes, jRes] = await Promise.all([
      fetch(`/api/campaigns/${campaign.id}`, { cache: "no-store" }),
      fetch(
        `/api/campaigns/${campaign.id}/jobs?${
          jobFilter !== "all" ? `status=${jobFilter}` : ""
        }`,
        { cache: "no-store" },
      ),
    ]);
    if (cRes.ok) {
      const data = await cRes.json();
      setCampaign((prev) => ({ ...prev, ...data.campaign }));
    }
    if (jRes.ok) {
      const data = await jRes.json();
      setJobs(data.jobs);
    }
  }, [campaign.id, jobFilter]);

  React.useEffect(() => {
    refresh();
    if (isRunning) {
      const t = setInterval(refresh, 5000);
      return () => clearInterval(t);
    }
  }, [refresh, isRunning]);

  async function action(
    path: string,
    method: "POST" | "DELETE" = "POST",
    okMsg?: string,
    body?: unknown,
  ) {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text.slice(0, 200) || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        const errStr = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        const details = Array.isArray(data.details) && data.details.length
          ? ` — ${(data.details as string[]).join(", ")}`
          : "";
        toast.error(`${errStr}${details}`);
        console.error(`[campaign] ${path} falhou:`, res.status, data);
        return;
      }
      if (okMsg) toast.success(okMsg);
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    // Se tinha agendamento, limpa antes pra disparar ja
    if (campaign.scheduledFor) {
      await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: null }),
      });
    }
    const data = await action("/start", "POST", "Campanha iniciada");
    if (data && data["ok"]) {
      const enq = data["enqueued"];
      const noWa = data["excludedNoWaCount"];
      const info = noWa ? ` (${enq} agendados, ${noWa} pulados sem WhatsApp)` : ` (${enq} agendados)`;
      toast.info(info);
      refresh();
    }
  }

  async function scheduleAndStart(when: Date) {
    setBusy(true);
    try {
      const patchRes = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: when.toISOString() }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        toast.error(d.error ?? "Erro ao agendar");
        return;
      }
    } finally {
      setBusy(false);
    }
    const data = await action("/start", "POST");
    if (data && data["ok"]) {
      toast.success(`Agendada para ${when.toLocaleString("pt-BR")}`);
      refresh();
    }
  }
  async function pauseCampaign() {
    if (await action("/pause", "POST", "Campanha pausada")) refresh();
  }
  async function resumeCampaign() {
    if (await action("/resume", "POST", "Campanha retomada")) refresh();
  }
  async function cancelCampaign() {
    if (!confirm("Cancelar a campanha? Envios pendentes serão marcados como pulados.")) return;
    if (await action("/cancel", "POST", "Campanha cancelada")) refresh();
  }
  async function deleteCampaign() {
    if (!confirm("Excluir a campanha? Esta ação não pode ser desfeita.")) return;
    if (await action("", "DELETE", "Campanha excluída")) router.push("/campaigns");
  }

  const progress =
    campaign.totalContacts > 0
      ? Math.round(
          ((campaign.sentCount + campaign.failedCount + campaign.skippedCount) /
            campaign.totalContacts) *
            100,
        )
      : 0;

  const st = statusStyle[campaign.status] ?? statusStyle.DRAFT;

  return (
    <div className="space-y-4">
      {/* Barra de status + acoes */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Badge variant={st.variant} className="text-sm">
                {st.label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {campaign.messageType} • {campaign.totalContacts.toLocaleString("pt-BR")} contatos
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTestOpen(true)} disabled={busy}>
                <Send /> Enviar teste
              </Button>
              <Button variant="outline" onClick={refresh} disabled={busy}>
                <RefreshCw className={busy ? "animate-spin" : ""} />
              </Button>
              {canStart && (
                <>
                  {campaign.status !== "PAUSED" && (
                    <Button
                      variant="outline"
                      onClick={() => setScheduleOpen(true)}
                      disabled={busy}
                    >
                      <CalendarClock /> Agendar
                    </Button>
                  )}
                  <Button onClick={sendNow} disabled={busy}>
                    <Play /> {campaign.status === "PAUSED" ? "Continuar" : "Enviar agora"}
                  </Button>
                </>
              )}
              {isRunning && (
                <>
                  <Button variant="outline" onClick={pauseCampaign} disabled={busy}>
                    <Pause /> Pausar
                  </Button>
                </>
              )}
              {campaign.status === "PAUSED" && (
                <Button variant="outline" onClick={resumeCampaign} disabled={busy}>
                  <Play /> Retomar
                </Button>
              )}
              {!isTerminal && (
                <Button variant="destructive" onClick={cancelCampaign} disabled={busy}>
                  <Square /> Cancelar
                </Button>
              )}
              {isTerminal && (
                <Button variant="ghost" onClick={deleteCampaign} disabled={busy}>
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metricas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Enviados" value={campaign.sentCount} icon={Send} color="text-emerald-600" />
        <MetricCard label="Entregues" value={campaign.deliveredCount} icon={CheckCircle2} color="text-emerald-600" />
        <MetricCard label="Lidos" value={campaign.readCount} icon={Eye} color="text-blue-600" />
        <MetricCard label="Falhas" value={campaign.failedCount} icon={XCircle} color="text-destructive" />
        <MetricCard label="Pulados" value={campaign.skippedCount} icon={Clock} color="text-muted-foreground" />
      </div>

      {/* Barra de progresso */}
      {campaign.totalContacts > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">Progresso</span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-muted-foreground mt-1.5">
              {campaign.sentCount + campaign.failedCount + campaign.skippedCount} de{" "}
              {campaign.totalContacts} processados
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuracoes rapidas */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium text-sm mb-2">Conteúdo</h4>
            {campaign.text && (
              <div className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {campaign.text}
              </div>
            )}
            {campaign.media && (
              <div className="mt-2 text-xs text-muted-foreground">
                Mídia: <b>{campaign.media.fileName}</b> ({campaign.media.mimeType})
              </div>
            )}
            {campaign.caption && (
              <div className="mt-2 text-sm bg-muted/50 rounded p-2">{campaign.caption}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium text-sm mb-2">Configurações</h4>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>
                Delay: <b className="text-foreground">{campaign.delayMinSec}s – {campaign.delayMaxSec}s</b>
              </li>
              <li>
                Descanso: <b className="text-foreground">
                  a cada {campaign.restEveryN} envios, {campaign.restForSec}s
                </b>
              </li>
              <li>
                Horário permitido:{" "}
                <b className="text-foreground">
                  {campaign.allowedHourStart}h – {campaign.allowedHourEnd}h
                </b>
              </li>
              <li>
                Instâncias:{" "}
                <b className="text-foreground">
                  {campaign.instances.length
                    ? campaign.instances.map((i) => i.instance.name).join(", ")
                    : "todas conectadas"}
                </b>
              </li>
              {campaign.scheduledFor && (
                <li>
                  Agendada para: <b className="text-foreground">{formatDate(campaign.scheduledFor)}</b>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de MessageJobs */}
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <h4 className="font-medium text-sm">Envios individuais</h4>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PENDING,SCHEDULED">Pendentes</SelectItem>
                <SelectItem value="SENDING">Enviando</SelectItem>
                <SelectItem value="SENT,DELIVERED,READ">Enviados</SelectItem>
                <SelectItem value="FAILED">Falhas</SelectItem>
                <SelectItem value="SKIPPED">Pulados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {jobs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nenhum envio ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Contato</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Instância</th>
                    <th className="text-left px-3 py-2 font-medium">Horário</th>
                    <th className="text-left px-3 py-2 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const js = jobStatusStyle[j.status] ?? jobStatusStyle.PENDING;
                    return (
                      <tr key={j.id} className="border-t">
                        <td className="px-3 py-1.5">
                          <div className="font-medium">
                            {j.contact.name || j.contact.whatsapp}
                          </div>
                          <div className="text-muted-foreground font-mono">
                            {j.contact.whatsapp}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge variant={js.variant}>{js.label}</Badge>
                        </td>
                        <td className="px-3 py-1.5">{j.instance?.name ?? "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {j.readAt
                            ? `Lido ${formatDate(j.readAt)}`
                            : j.deliveredAt
                            ? `Entregue ${formatDate(j.deliveredAt)}`
                            : j.sentAt
                            ? `Enviado ${formatDate(j.sentAt)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-destructive max-w-xs truncate">
                          {j.errorMessage ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de enviar teste */}
      <TestSendDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        campaignId={campaign.id}
        instances={connectedInstances}
      />

      {/* Dialog de agendamento */}
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        initial={campaign.scheduledFor}
        onConfirm={async (when) => {
          setScheduleOpen(false);
          await scheduleAndStart(when);
        }}
      />
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
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</div>
          </div>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function TestSendDialog({
  open,
  onOpenChange,
  campaignId,
  instances,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignId: string;
  instances: { id: string; name: string }[];
}) {
  const [number, setNumber] = React.useState("");
  const [instanceId, setInstanceId] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open && instances[0] && !instanceId) setInstanceId(instances[0].id);
  }, [open, instances, instanceId]);

  async function send() {
    if (!number.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, instanceId: instanceId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro");
        return;
      }
      toast.success(`Teste enviado pra ${data.sentTo}`);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar teste</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Número (com DDI)</Label>
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="5511999999999"
              className="mt-1.5 font-mono"
            />
          </div>
          {instances.length > 1 && (
            <div>
              <Label>Instância</Label>
              <Select value={instanceId} onValueChange={setInstanceId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            A mensagem vai ser renderizada com spintax normal (nome do contato = &quot;Teste&quot;).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={loading || !number.trim()}>
            {loading ? "Enviando..." : "Enviar teste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Dialog de agendamento ------------------------------------------

function toLocalDatetimeInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000); // +1h
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: string | null;
  onConfirm: (when: Date) => void | Promise<void>;
}) {
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    if (open) setValue(toLocalDatetimeInput(initial));
  }, [open, initial]);

  const parsed = value ? new Date(value) : null;
  const isFuture = parsed && parsed.getTime() > Date.now();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar envio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1.5"
            />
            {!isFuture && parsed && (
              <p className="text-xs text-destructive mt-1">
                Escolha um horário no futuro.
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Os envios ficam agendados no BullMQ e disparam automaticamente na hora escolhida,
            respeitando os delays e o horário permitido.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => parsed && isFuture && onConfirm(parsed)}
            disabled={!parsed || !isFuture}
          >
            <CalendarClock /> Agendar e enfileirar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
