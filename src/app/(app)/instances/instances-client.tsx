"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Smartphone,
  Trash2,
  QrCode,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { Instance } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  initialInstances: Instance[];
}

const statusStyles: Record<Instance["status"], { variant: React.ComponentProps<typeof Badge>["variant"]; label: string }> = {
  CONNECTED: { variant: "success", label: "Conectada" },
  CONNECTING: { variant: "warning", label: "Aguardando QR" },
  DISCONNECTED: { variant: "secondary", label: "Desconectada" },
  BANNED: { variant: "destructive", label: "Banida" },
  ERROR: { variant: "destructive", label: "Erro" },
};

export function InstancesClient({ initialInstances }: Props) {
  const router = useRouter();
  const [instances, setInstances] = React.useState(initialInstances);
  const [creating, setCreating] = React.useState(false);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [qrInstance, setQrInstance] = React.useState<Instance | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/instances", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setInstances(data.instances);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpenCreate(true)}>
          <Plus /> Nova instância
        </Button>
      </div>

      {instances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-primary/10 text-primary rounded-full p-4 mb-4">
              <Smartphone className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">Nenhuma instância ainda</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Crie uma instância para conectar um número do WhatsApp via QR code. Cada instância é
              um chip usado nas suas campanhas.
            </p>
            <Button className="mt-6" onClick={() => setOpenCreate(true)}>
              <Plus /> Criar primeira instância
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {instances.map((inst) => (
            <Card key={inst.id} className="relative">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{inst.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {inst.evolutionInstance}
                    </p>
                  </div>
                  <Badge variant={statusStyles[inst.status].variant}>
                    {statusStyles[inst.status].label}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Número</div>
                    <div className="font-medium">{inst.phoneNumber ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Tipo</div>
                    <div className="font-medium">
                      {inst.tier === "ENTERPRISE" ? "Enterprise" : "Standard"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Enviadas hoje</div>
                    <div className="font-medium">
                      {inst.sentToday}/{inst.maxPerDay}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Peso rotação</div>
                    <div className="font-medium">{inst.weight}</div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setQrInstance(inst)}
                  >
                    <QrCode /> {inst.status === "CONNECTED" ? "Ver conexão" : "Conectar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Remover a instância "${inst.name}"?`)) return;
                      const res = await fetch(`/api/instances/${inst.id}`, { method: "DELETE" });
                      if (res.ok) {
                        toast.success("Instância removida");
                        setInstances((prev) => prev.filter((i) => i.id !== inst.id));
                        router.refresh();
                      } else {
                        toast.error("Erro ao remover");
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateInstanceDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        creating={creating}
        onCreate={async (form) => {
          setCreating(true);
          try {
            const res = await fetch("/api/instances", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
              toast.error(data.error ?? "Erro ao criar");
              return;
            }
            toast.success("Instância criada. Escaneie o QR code para conectar.");
            setInstances((prev) => [data.instance, ...prev]);
            setOpenCreate(false);
            setQrInstance(data.instance);
            router.refresh();
          } finally {
            setCreating(false);
          }
        }}
      />

      <QrCodeDialog
        instance={qrInstance}
        onClose={() => {
          setQrInstance(null);
          refresh();
        }}
        onStatusChange={(updated) => {
          setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }}
      />
    </div>
  );
}

// ---------- Create dialog ---------------------------------------------------

function CreateInstanceDialog({
  open,
  onOpenChange,
  creating,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creating: boolean;
  onCreate: (form: {
    name: string;
    tier: "STANDARD" | "ENTERPRISE";
    weight: number;
    maxPerDay: number;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [tier, setTier] = React.useState<"STANDARD" | "ENTERPRISE">("STANDARD");
  const [weight, setWeight] = React.useState(1);
  const [maxPerDay, setMaxPerDay] = React.useState(500);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setTier("STANDARD");
      setWeight(1);
      setMaxPerDay(500);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova instância</DialogTitle>
          <DialogDescription>
            Crie uma instância para conectar um número do WhatsApp. Depois de criar, escaneie o QR
            code com o WhatsApp do celular.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nome do chip</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Chip 01 - Vendas"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Tipo de conexão</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as "STANDARD" | "ENTERPRISE")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STANDARD">Standard — delays padrão</SelectItem>
                <SelectItem value="ENTERPRISE">
                  Enterprise — +30s texto / +90s mídia (automático)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="weight">Peso na rotação</Label>
              <Input
                id="weight"
                type="number"
                min={1}
                max={100}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Chips com peso maior recebem mais envios.
              </p>
            </div>
            <div>
              <Label htmlFor="maxPerDay">Máx. por dia</Label>
              <Input
                id="maxPerDay"
                type="number"
                min={1}
                max={10000}
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(Number(e.target.value))}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">Limite hard por 24h.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button
            onClick={() => onCreate({ name, tier, weight, maxPerDay })}
            disabled={creating || !name.trim()}
          >
            {creating ? "Criando..." : "Criar instância"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- QR dialog -------------------------------------------------------

function QrCodeDialog({
  instance,
  onClose,
  onStatusChange,
}: {
  instance: Instance | null;
  onClose: () => void;
  onStatusChange: (i: Instance) => void;
}) {
  const [qr, setQr] = React.useState<string | null>(instance?.lastQrCode ?? null);
  const [status, setStatus] = React.useState<Instance["status"] | null>(instance?.status ?? null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setQr(instance?.lastQrCode ?? null);
    setStatus(instance?.status ?? null);
  }, [instance?.id, instance?.lastQrCode, instance?.status]);

  const poll = React.useCallback(async () => {
    if (!instance) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/instances/${instance.id}/connect`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setQr(data.qrcode ?? data.instance.lastQrCode);
      setStatus(data.instance.status);
      onStatusChange(data.instance);
    } finally {
      setLoading(false);
    }
  }, [instance, onStatusChange]);

  React.useEffect(() => {
    if (!instance) return;
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id]);

  return (
    <Dialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{instance?.name}</DialogTitle>
          <DialogDescription>
            {status === "CONNECTED"
              ? `Conectado como ${instance?.phoneNumber ?? "—"}.`
              : "Abra o WhatsApp no celular > Aparelhos conectados > Conectar aparelho e escaneie o QR abaixo."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          {status === "CONNECTED" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="h-16 w-16 text-success" />
              <p className="text-sm text-muted-foreground">Instância conectada com sucesso.</p>
            </div>
          ) : status === "BANNED" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-sm text-muted-foreground">Instância banida pelo WhatsApp.</p>
            </div>
          ) : qr ? (
            // QR ja vem como data:image/png;base64,...
            <img
              src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code"
              className="w-64 h-64 border rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <AlertTriangle className="h-10 w-10" />
              <p className="text-sm">Aguardando QR code do Evolution...</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={poll} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
