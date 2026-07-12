"use client";
import * as React from "react";
import { toast } from "sonner";
import { Upload, FileText, ChevronRight } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagChip } from "@/components/contacts/tag-chip";
import type { TagOption } from "./contacts-list";

interface Props {
  tags: TagOption[];
  onDone: () => void;
}

interface Parsed {
  columns: string[];
  rows: Record<string, string>[];
}

const NONE_COL = "__none__";

async function parseFileClient(file: File): Promise<Parsed> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    // Lazy load xlsx (biblioteca grande)
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return {
      columns,
      rows: rows.map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) out[k] = v == null ? "" : String(v);
        return out;
      }),
    };
  }
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data.filter((r) => r && Object.values(r).some((v) => v != null && v !== ""));
  return { columns: rows.length ? Object.keys(rows[0]) : (parsed.meta.fields ?? []), rows };
}

/** Adivinha qual coluna é o whatsapp e qual é o nome, baseado em heurísticas. */
function guessColumns(columns: string[]) {
  const lc = columns.map((c) => c.toLowerCase());
  const findByKeywords = (keywords: string[]) => {
    for (let i = 0; i < lc.length; i++) {
      if (keywords.some((k) => lc[i].includes(k))) return columns[i];
    }
    return undefined;
  };
  const whatsapp = findByKeywords(["whats", "telefone", "phone", "celular", "mobile", "fone"]);
  const name = findByKeywords(["nome", "name", "cliente", "contato"]);
  return { whatsapp, name };
}

export function ContactsImport({ tags, onDone }: Props) {
  const [file, setFile] = React.useState<File | null>(null);
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [waCol, setWaCol] = React.useState<string>("");
  const [nameCol, setNameCol] = React.useState<string>(NONE_COL);
  const [metaCols, setMetaCols] = React.useState<string[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [upsert, setUpsert] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [report, setReport] = React.useState<null | {
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    invalid: number;
    errors: { row: number; reason: string }[];
  }>(null);

  async function onFile(f: File | null) {
    setReport(null);
    setParsed(null);
    setFile(f);
    if (!f) return;
    setParsing(true);
    try {
      const p = await parseFileClient(f);
      if (!p.columns.length) {
        toast.error("Arquivo sem colunas detectáveis");
        return;
      }
      setParsed(p);
      const guess = guessColumns(p.columns);
      setWaCol(guess.whatsapp ?? p.columns[0]);
      setNameCol(guess.name ?? NONE_COL);
      setMetaCols([]);
    } catch (err) {
      toast.error(`Falha ao ler arquivo: ${(err as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    if (!file || !parsed || !waCol) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "mapping",
        JSON.stringify({
          whatsapp: waCol,
          name: nameCol === NONE_COL ? undefined : nameCol,
          metaColumns: metaCols,
        }),
      );
      fd.append("tagIds", JSON.stringify(tagIds));
      fd.append("upsert", String(upsert));
      const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro na importação");
        return;
      }
      setReport(data.report);
      toast.success(
        `${data.report.created} criados, ${data.report.updated} atualizados, ${data.report.skipped} pulados, ${data.report.invalid} inválidos`,
      );
      onDone();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4" /> Importar CSV / XLSX
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          A primeira linha do arquivo deve ser o cabeçalho. Depois de escolher o arquivo, você
          mapeia as colunas: qual é o WhatsApp, qual é o nome, e quais outras salvar como campos
          extras (usáveis nas campanhas via variáveis Spintax).
        </p>
      </div>

      {/* Step 1: arquivo */}
      <div>
        <Label>Arquivo CSV ou XLSX (máx 20MB)</Label>
        <div className="mt-1.5 flex gap-2 items-center">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls,.tsv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="flex-1"
          />
          {parsing && <span className="text-xs text-muted-foreground">Lendo...</span>}
        </div>
        {file && parsed && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <FileText className="h-3 w-3" /> {file.name} — {parsed.rows.length.toLocaleString("pt-BR")}{" "}
            linha{parsed.rows.length !== 1 ? "s" : ""}, {parsed.columns.length} coluna
            {parsed.columns.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Step 2: mapeamento */}
      {parsed && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <h4 className="font-medium text-sm">2. Mapeamento de colunas</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>WhatsApp <span className="text-destructive">*</span></Label>
              <Select value={waCol} onValueChange={setWaCol}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parsed.columns.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome</Label>
              <Select value={nameCol} onValueChange={setNameCol}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_COL}>— nenhum —</SelectItem>
                  {parsed.columns.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Campos extras (usáveis nas campanhas)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Colunas marcadas viram variáveis como <code>{"{empresa}"}</code>, <code>{"{cidade}"}</code>{" "}
              etc no editor de campanha.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {parsed.columns
                .filter((c) => c !== waCol && c !== nameCol)
                .map((c) => {
                  const active = metaCols.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        setMetaCols((s) =>
                          s.includes(c) ? s.filter((x) => x !== c) : [...s, c],
                        )
                      }
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-accent"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
            </div>
          </div>

          {tags.length > 0 && (
            <div>
              <Label>Aplicar tags a todos</Label>
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={upsert}
              onChange={(e) => setUpsert(e.target.checked)}
            />
            Atualizar contatos existentes (senão pula os que já existem)
          </label>
        </div>
      )}

      {/* Preview */}
      {parsed && parsed.rows.length > 0 && (
        <details className="border rounded-lg" open>
          <summary className="p-3 cursor-pointer text-sm font-medium bg-muted/30">
            Preview das 5 primeiras linhas
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {parsed.columns.map((c) => (
                    <th
                      key={c}
                      className={`text-left px-3 py-2 font-medium ${
                        c === waCol
                          ? "text-primary"
                          : c === nameCol
                          ? "text-emerald-600"
                          : metaCols.includes(c)
                          ? "text-amber-600"
                          : ""
                      }`}
                    >
                      {c}
                      {c === waCol && " *"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    {parsed.columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 max-w-[200px] truncate">
                        {row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Report */}
      {report && (
        <div className="border rounded-lg p-4 bg-emerald-50 dark:bg-emerald-950/30">
          <h4 className="font-medium">Relatório</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Total no arquivo</div>
              <div className="font-medium">{report.totalRows.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Criados</div>
              <div className="font-medium text-emerald-700">{report.created}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Atualizados</div>
              <div className="font-medium">{report.updated}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Pulados / inválidos</div>
              <div className="font-medium">
                {report.skipped} / {report.invalid}
              </div>
            </div>
          </div>
          {report.errors.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer">Primeiros erros ({report.errors.length})</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {report.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    linha {e.row}: {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {parsed && (
        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={importing || !waCol || !parsed.rows.length}
            size="lg"
          >
            {importing
              ? "Importando..."
              : `Importar ${parsed.rows.length.toLocaleString("pt-BR")} linha${parsed.rows.length !== 1 ? "s" : ""}`}
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
