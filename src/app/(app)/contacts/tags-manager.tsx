"use client";
import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TagChip } from "@/components/contacts/tag-chip";

interface Tag {
  id: string;
  name: string;
  color: string;
  contactCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#78716c", "#000000",
];

export function TagsManager({ open, onOpenChange, onChanged }: Props) {
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(PRESET_COLORS[11]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editColor, setEditColor] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tags", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setTags(data.tags);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function createTag() {
    if (!newName.trim()) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Erro ao criar");
      return;
    }
    toast.success("Tag criada");
    setNewName("");
    await load();
    onChanged();
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Erro");
      return;
    }
    setEditingId(null);
    await load();
    onChanged();
  }

  async function deleteTag(t: Tag) {
    if (t.contactCount > 0) {
      if (
        !confirm(
          `A tag "${t.name}" está em ${t.contactCount} contato(s). Confirmar exclusão? Os contatos ficam, só perdem a tag.`,
        )
      )
        return;
    } else if (!confirm(`Excluir a tag "${t.name}"?`)) return;

    const res = await fetch(`/api/tags/${t.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Tag removida");
      await load();
      onChanged();
    } else {
      toast.error("Erro ao remover");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
          <DialogDescription>
            Tags ajudam a segmentar contatos para campanhas específicas.
          </DialogDescription>
        </DialogHeader>

        {/* Nova tag */}
        <div className="border rounded-lg p-3 bg-muted/30">
          <Label className="text-xs text-muted-foreground">Nova tag</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ex: Clientes Novos"
              onKeyDown={(e) => e.key === "Enter" && createTag()}
              className="flex-1"
            />
            <Button onClick={createTag} disabled={!newName.trim()}>
              <Plus /> Criar
            </Button>
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-6 h-6 rounded-md border-2"
                style={{
                  backgroundColor: c,
                  borderColor: newColor === c ? "#000" : "transparent",
                }}
              />
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="max-h-96 overflow-y-auto space-y-1">
          {loading && <div className="text-sm text-muted-foreground">Carregando...</div>}
          {!loading && tags.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhuma tag criada.
            </div>
          )}
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border rounded-md p-2">
              {editingId === t.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                  />
                  <div className="flex gap-1">
                    {PRESET_COLORS.slice(0, 9).map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className="w-5 h-5 rounded"
                        style={{
                          backgroundColor: c,
                          outline: editColor === c ? "2px solid black" : "none",
                        }}
                      />
                    ))}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => saveEdit(t.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <TagChip name={t.name} color={t.color} />
                  <div className="flex-1 text-xs text-muted-foreground">
                    {t.contactCount} contato{t.contactCount !== 1 ? "s" : ""}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditName(t.name);
                      setEditColor(t.color);
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteTag(t)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
