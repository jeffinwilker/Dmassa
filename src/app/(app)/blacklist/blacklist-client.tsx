"use client";
import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Ban,
  UserCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

interface Row {
  id: string;
  name: string | null;
  whatsapp: string;
  blacklistedAt: string | null;
  blacklistReason: string | null;
}

export function BlacklistClient() {
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ items: Row[]; total: number; totalPages: number }>({
    items: [],
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("pageSize", "50");
      const res = await fetch(`/api/blacklist?${params}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData({ items: json.items, total: json.total, totalPages: json.totalPages });
      }
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function removeFromBlacklist(row: Row) {
    if (!confirm(`Remover ${row.name ?? row.whatsapp} da blacklist? Voltará a receber campanhas.`))
      return;
    const res = await fetch(`/api/blacklist/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Removido da blacklist");
      load();
    } else {
      toast.error("Erro ao remover");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
            <div>
              <Label>Buscar</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Nome ou número..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {loading
                ? "Carregando..."
                : `${data.total.toLocaleString("pt-BR")} contato${data.total !== 1 ? "s" : ""} em blacklist`}
            </div>
          </div>
          {data.items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Ban className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {q ? "Nenhum resultado." : "Ninguém na blacklist ainda."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Contato</th>
                    <th className="text-left px-4 py-2 font-medium">Bloqueado em</th>
                    <th className="text-left px-4 py-2 font-medium">Motivo</th>
                    <th className="text-right px-4 py-2 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.name || "—"}</div>
                        <div className="text-xs font-mono text-muted-foreground">{r.whatsapp}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.blacklistedAt ? formatDate(r.blacklistedAt) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{r.blacklistReason ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeFromBlacklist(r)}
                          title="Remover da blacklist"
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Desbloquear
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft /> Anterior
              </Button>
              <div className="text-sm text-muted-foreground">
                Página {page} de {data.totalPages}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={page === data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima <ChevronRight />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AddDialog open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: () => void;
}) {
  const [whatsapp, setWhatsapp] = React.useState("");
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setWhatsapp("");
      setName("");
      setReason("");
    }
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp, name: name || undefined, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro");
        return;
      }
      toast.success("Adicionado à blacklist");
      onAdded();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar à blacklist</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>WhatsApp (com DDI)</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="5511999999999"
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <Label>Nome (opcional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: pediu pra não receber"
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !whatsapp.trim()}>
            {saving ? "Adicionando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
