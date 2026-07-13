"use client";
import * as React from "react";
import { Bold, Italic, Strikethrough, Code, Wand2, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpintaxOpt {
  name: string;
  label: string | null;
  isSystem: boolean;
  sampleValues: string[];
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  spintaxVars: SpintaxOpt[];
  placeholder?: string;
  rows?: number;
  showBuiltIns?: boolean;
  className?: string;
}

const BUILT_INS = [
  { name: "primeiro_nome", label: "Primeiro nome", icon: User },
  { name: "nome", label: "Nome completo", icon: User },
  { name: "whatsapp", label: "Número", icon: Phone },
];

export function MessageEditor({
  value,
  onChange,
  spintaxVars,
  placeholder,
  rows = 6,
  showBuiltIns = true,
  className,
}: Props) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(insert: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    // Preserva foco e posiciona o cursor depois do que foi inserido
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + insert.length;
    }, 0);
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const inner = selected || "texto";
    const wrapped = `${prefix}${inner}${suffix}`;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    onChange(next);
    setTimeout(() => {
      ta.focus();
      if (selected) {
        // Cursor no fim do trecho envolvido
        ta.selectionStart = ta.selectionEnd = start + wrapped.length;
      } else {
        // Seleciona o placeholder "texto" pra sobrescrever
        ta.selectionStart = start + prefix.length;
        ta.selectionEnd = start + prefix.length + inner.length;
      }
    }, 0);
  }

  // Atalhos: Ctrl/Cmd + B / I
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      wrapSelection("*");
    } else if (k === "i") {
      e.preventDefault();
      wrapSelection("_");
    }
  }

  return (
    <div
      className={cn(
        "border rounded-md overflow-hidden bg-background focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {/* Toolbar de formatacao */}
      <div className="flex items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
        <ToolBtn
          onClick={() => wrapSelection("*")}
          title="Negrito (Ctrl+B) — *texto*"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => wrapSelection("_")}
          title="Itálico (Ctrl+I) — _texto_"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => wrapSelection("~")}
          title="Riscado — ~texto~"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => wrapSelection("```")}
          title="Monoespaçado — ```texto```"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>
        <div className="ml-auto text-[10px] text-muted-foreground pr-1 hidden sm:block">
          formatação estilo WhatsApp
        </div>
      </div>

      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-sans placeholder:text-muted-foreground"
      />

      {/* Chips de variaveis sempre visiveis */}
      <div className="border-t bg-muted/30 px-2 py-2">
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Wand2 className="h-3.5 w-3.5" />
            Variáveis:
          </div>
          {showBuiltIns &&
            BUILT_INS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => insertAtCursor(`{${v.name}}`)}
                  title={v.label}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-mono bg-background hover:bg-accent border transition-colors"
                >
                  <Icon className="h-3 w-3 opacity-60" />
                  {"{" + v.name + "}"}
                </button>
              );
            })}
          {spintaxVars.length > 0 && showBuiltIns && (
            <div className="w-px h-4 bg-border mx-0.5" />
          )}
          {spintaxVars.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => insertAtCursor(`{${v.name}}`)}
              title={
                v.sampleValues.length
                  ? `${v.label ?? v.name}: ${v.sampleValues.slice(0, 3).join(" / ")}${
                      v.sampleValues.length > 3 ? "..." : ""
                    }`
                  : v.label ?? v.name
              }
              className={cn(
                "text-xs px-2 py-1 rounded font-mono border transition-colors",
                v.isSystem
                  ? "bg-background hover:bg-accent"
                  : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20",
              )}
            >
              {"{" + v.name + "}"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent"
    >
      {children}
    </button>
  );
}
