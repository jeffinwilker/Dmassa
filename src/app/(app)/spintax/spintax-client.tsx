"use client";
import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Sparkles, X, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SpintaxVar {
  id: string;
  ownerId: string | null;
  name: string;
  label: string | null;
  values: string[];
  description: string | null;
  isSystem: boolean;
}

export function SpintaxClient() {
  const [vars, setVars] = React.useState<SpintaxVar[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editVar, setEditVar] = React.useState<SpintaxVar | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/spintax", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setVars(data.variables);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function deleteVar(v: SpintaxVar) {
    if (!confirm(`Excluir variável {${v.name}}?`)) return;
    const res = await fetch(`/api/spintax/${v.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Variável removida");
      load();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro");
    }
  }

  const systemVars = vars.filter((v) => v.isSystem);
  const userVars = vars.filter((v) => !v.isSystem);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Nova variável
        </Button>
      </div>

      {/* Built-ins do contato */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Variáveis automáticas do contato</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { name: "nome", desc: "Nome do contato" },
              { name: "primeiro_nome", desc: "Primeiro nome" },
              { name: "whatsapp", desc: "Número do WhatsApp" },
            ].map((v) => (
              <div key={v.name} className="border rounded-md px-2 py-1.5 bg-muted/30">
                <code className="font-mono font-semibold">{`{${v.name}}`}</code>
                <span className="text-muted-foreground ml-1.5">{v.desc}</span>
              </div>
            ))}
            <div className="border rounded-md px-2 py-1.5 bg-muted/30 text-muted-foreground">
              + qualquer campo importado do CSV vira <code className="font-mono">{"{campo}"}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suas variaveis */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Suas variáveis</h3>
        {userVars.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              Nenhuma variável criada ainda. Clique em <b>Nova variável</b> para começar.
            </CardContent>
          </Card>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {userVars.map((v) => (
            <VarCard
              key={v.id}
              v={v}
              onEdit={() => setEditVar(v)}
              onDelete={() => deleteVar(v)}
            />
          ))}
        </div>
      </div>

      {/* Sistema */}
      {systemVars.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            Variáveis de sistema
            <Badge variant="secondary" className="font-normal">somente leitura</Badge>
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {systemVars.map((v) => (
              <VarCard key={v.id} v={v} readOnly />
            ))}
          </div>
        </div>
      )}

      <VarDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />
      <VarDialog
        open={!!editVar}
        onOpenChange={(o) => !o && setEditVar(null)}
        variable={editVar}
        onSaved={() => {
          setEditVar(null);
          load();
        }}
      />
    </div>
  );
}

// ---------- Card de variavel -----------------------------------------------

function VarCard({
  v,
  onEdit,
  onDelete,
  readOnly,
}: {
  v: SpintaxVar;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const shuffle = () => setPicked(v.values[Math.floor(Math.random() * v.values.length)]);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <code className="font-mono font-semibold text-primary">{`{${v.name}}`}</code>
              {v.label && <span className="text-sm text-muted-foreground">— {v.label}</span>}
            </div>
            {v.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
            )}
          </div>
          {!readOnly && (
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={onEdit} className="h-7 w-7">
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onDelete}
                className="h-7 w-7 text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {v.values.map((val, i) => (
            <Badge key={i} variant="secondary" className="font-normal text-xs">
              {val}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Button size="sm" variant="outline" onClick={shuffle}>
            <Shuffle className="h-3 w-3" /> Sortear
          </Button>
          {picked && (
            <span className="text-muted-foreground">
              → <b className="text-foreground">{picked}</b>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Dialog de criar/editar variavel --------------------------------

const nameRe = /^[a-z][a-z0-9_]{1,39}$/;

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function VarDialog({
  open,
  onOpenChange,
  onSaved,
  variable,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  variable?: SpintaxVar | null;
}) {
  const isEdit = !!variable;
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [valuesText, setValuesText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [nameEdited, setNameEdited] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (variable) {
      setName(variable.name);
      setLabel(variable.label ?? "");
      setDescription(variable.description ?? "");
      setValuesText(variable.values.join("\n"));
      setNameEdited(true);
    } else {
      setName("");
      setLabel("");
      setDescription("");
      setValuesText("");
      setNameEdited(false);
    }
  }, [open, variable]);

  // Auto-gera name a partir do label enquanto usuario nao tocou o name
  React.useEffect(() => {
    if (!isEdit && !nameEdited && label) {
      setName(slugify(label));
    }
  }, [label, nameEdited, isEdit]);

  const values = valuesText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const nameError =
    name && !nameRe.test(name) ? "use snake_case: minusculas, dígitos e _, começando com letra" : null;

  async function save() {
    setSaving(true);
    try {
      const body = {
        name,
        label: label || undefined,
        description: description || undefined,
        values,
      };
      const url = isEdit ? `/api/spintax/${variable!.id}` : "/api/spintax";
      const method = isEdit ? "PATCH" : "POST";
      // No PATCH nao mandamos name (imutavel)
      const payload = isEdit
        ? { label: body.label, description: body.description, values: body.values }
        : body;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro");
        return;
      }
      toast.success(isEdit ? "Variável atualizada" : "Variável criada");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar variável" : "Nova variável"}</DialogTitle>
          <DialogDescription>
            Um valor por linha. O worker sorteia aleatoriamente a cada envio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="label">Nome amigável</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Saudações"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="name">Identificador (usado nas mensagens)</Label>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-muted-foreground font-mono">{"{"}</span>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                disabled={isEdit}
                className="font-mono"
                placeholder="saudacao"
              />
              <span className="text-muted-foreground font-mono">{"}"}</span>
            </div>
            {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
            {isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                Identificador não pode ser alterado (mensagens antigas dependem dele).
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="values">Valores (um por linha)</Label>
            <Textarea
              id="values"
              value={valuesText}
              onChange={(e) => setValuesText(e.target.value)}
              rows={6}
              placeholder="Oi&#10;Olá&#10;E aí&#10;Opa"
              className="mt-1.5 font-mono text-sm"
            />
            <div className="text-xs text-muted-foreground mt-1">
              {values.length} valor{values.length !== 1 ? "es" : ""}
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Descrição (opcional)</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
              placeholder="Para que serve essa variável"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving || !name || !!nameError || values.length === 0}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
