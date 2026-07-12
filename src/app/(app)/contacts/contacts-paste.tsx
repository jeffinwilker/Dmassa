"use client";
import * as React from "react";
import { toast } from "sonner";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagChip } from "@/components/contacts/tag-chip";
import type { TagOption } from "./contacts-list";

interface Props {
  tags: TagOption[];
  onDone: () => void;
}

export function ContactsPaste({ tags, onDone }: Props) {
  const [text, setText] = React.useState("");
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  const detected = React.useMemo(() => {
    const set = new Set<string>();
    for (const raw of text.split(/[\r\n,;]+/)) {
      const d = raw.replace(/\D/g, "");
      if (d.length >= 8) set.add(d);
    }
    return set.size;
  }, [text]);

  async function submit() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tagIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro");
        return;
      }
      toast.success(
        `${data.report.created} novos, ${data.report.skipped} já existiam (${data.report.totalDetected} números)`,
      );
      setText("");
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <ClipboardPaste className="h-4 w-4" /> Copie e Cole
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Cole uma lista de números — um por linha, ou separados por vírgula/ponto-e-vírgula.
          Caracteres não-numéricos são ignorados. Números sem DDI recebem 55 automaticamente.
        </p>
      </div>

      <div>
        <Label>Números</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="5511999999999&#10;(11) 98888-7777&#10;11 97777-6666"
          className="mt-1.5 font-mono text-sm"
        />
        <div className="text-xs text-muted-foreground mt-1">
          {detected} número{detected !== 1 ? "s" : ""} detectado{detected !== 1 ? "s" : ""}
        </div>
      </div>

      {tags.length > 0 && (
        <div>
          <Label>Aplicar tags (opcional)</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
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
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={loading || detected === 0}>
          {loading ? "Importando..." : `Importar ${detected} contato${detected !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
