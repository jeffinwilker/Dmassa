"use client";
import * as React from "react";
import { toast } from "sonner";
import { Search, Plus, Trash2, Edit, ChevronLeft, ChevronRight, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TagChip } from "@/components/contacts/tag-chip";

export interface TagOption {
  id: string;
  name: string;
  color: string;
  contactCount?: number;
}

export interface ContactRow {
  id: string;
  name: string | null;
  whatsapp: string;
  hasWhatsapp: boolean | null;
  isBlacklisted: boolean;
  tags: { id: string; name: string; color: string }[];
  meta?: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  tags: TagOption[];
  onTagsChanged: () => void;
}

export function ContactsList({ tags, onTagsChanged: _onTagsChanged }: Props) {
  const [q, setQ] = React.useState("");
  const [wa, setWa] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<{
    contacts: ContactRow[];
    total: number;
    totalPages: number;
  }>({ contacts: [], total: 0, totalPages: 1 });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editContact, setEditContact] = React.useState<ContactRow | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (wa) params.set("wa", wa);
      if (selectedTags.length) params.set("tags", selectedTags.join(","));
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/contacts?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao listar");
      const json = await res.json();
      setData({
        contacts: json.contacts,
        total: json.total,
        totalPages: json.totalPages,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, wa, selectedTags, page, pageSize]);

  React.useEffect(() => {
    load();
  }, [load]);

  function toggleTag(id: string) {
    setSelectedTags((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setPage(1);
  }

  async function deleteContact(id: string) {
    if (!confirm("Excluir este contato?")) return;
    const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Contato removido");
      load();
    } else {
      toast.error("Erro ao remover");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
            <div>
              <Label>Nome</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="João..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input
                className="mt-1.5"
                placeholder="5511..."
                value={wa}
                onChange={(e) => {
                  setWa(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Novo contato
            </Button>
          </div>

          {tags.length > 0 && (
            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">Filtrar por tag</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {tags.map((t) => {
                  const active = selectedTags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(t.id)}
                      className="focus:outline-none"
                      style={{ opacity: active ? 1 : 0.55 }}
                    >
                      <TagChip name={t.name} color={t.color} />
                    </button>
                  );
                })}
                {selectedTags.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
                    onClick={() => setSelectedTags([])}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 flex items-center justify-between border-b">
            <div className="text-sm text-muted-foreground">
              {loading
                ? "Carregando..."
                : `${data.total.toLocaleString("pt-BR")} contato${data.total !== 1 ? "s" : ""}`}
            </div>
          </div>

          {data.contacts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              {q || wa || selectedTags.length
                ? "Nenhum contato encontrado com esses filtros."
                : "Nenhum contato ainda. Importe um CSV ou clique em Novo contato."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Nome</th>
                    <th className="text-left px-4 py-2 font-medium">WhatsApp</th>
                    <th className="text-left px-4 py-2 font-medium">Tags</th>
                    <th className="text-right px-4 py-2 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contacts.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {c.isBlacklisted && (
                            <span title="Blacklist">
                              <Ban className="h-3.5 w-3.5 text-destructive" />
                            </span>
                          )}
                          <button
                            className="font-medium text-primary hover:underline text-left"
                            onClick={() => setEditContact(c)}
                          >
                            {c.name || c.whatsapp}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{c.whatsapp}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <TagChip key={t.id} name={t.name} color={t.color} />
                          ))}
                          {c.tags.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditContact(c)}
                          className="h-7 w-7"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteContact(c.id)}
                          className="h-7 w-7"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      <ContactFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        tags={tags}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <ContactFormDialog
        mode="edit"
        contact={editContact}
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
        tags={tags}
        onSaved={() => {
          setEditContact(null);
          load();
        }}
      />
    </div>
  );
}

// ---------- Form dialog (create/edit) --------------------------------------

function ContactFormDialog({
  mode,
  contact,
  open,
  onOpenChange,
  tags,
  onSaved,
}: {
  mode: "create" | "edit";
  contact?: ContactRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tags: TagOption[];
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && contact) {
      setName(contact.name ?? "");
      setWhatsapp(contact.whatsapp);
      setTagIds(contact.tags.map((t) => t.id));
      setIsBlacklisted(contact.isBlacklisted);
    } else {
      setName("");
      setWhatsapp("");
      setTagIds([]);
      setIsBlacklisted(false);
    }
  }, [open, mode, contact]);

  async function save() {
    setSaving(true);
    try {
      const body = { name: name || null, whatsapp, tagIds, isBlacklisted };
      const url = mode === "create" ? "/api/contacts" : `/api/contacts/${contact!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Erro");
        return;
      }
      toast.success(mode === "create" ? "Contato criado" : "Contato atualizado");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo contato" : "Editar contato"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              placeholder="João da Silva"
            />
          </div>
          <div>
            <Label htmlFor="wa">WhatsApp (com DDI, ex: 5511999999999)</Label>
            <Input
              id="wa"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="mt-1.5 font-mono"
              placeholder="5511999999999"
            />
          </div>
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {tags.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Nenhuma tag criada ainda.
                </span>
              )}
              {tags.map((t) => {
                const active = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      setTagIds((s) =>
                        s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id],
                      )
                    }
                    style={{ opacity: active ? 1 : 0.4 }}
                  >
                    <TagChip name={t.name} color={t.color} />
                  </button>
                );
              })}
            </div>
          </div>
          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isBlacklisted}
                onChange={(e) => setIsBlacklisted(e.target.checked)}
              />
              Adicionar à blacklist
            </label>
          )}
          {mode === "edit" && contact?.meta && Object.keys(contact.meta).length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Campos extras</Label>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {Object.entries(contact.meta).map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="font-normal">
                    {k}: {String(v).slice(0, 30)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !whatsapp.trim()}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
