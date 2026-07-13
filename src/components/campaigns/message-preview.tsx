"use client";
import * as React from "react";
import {
  Check,
  CheckCheck,
  FileText,
  Mic,
  MapPin,
  User as UserIcon,
  Play,
  Paperclip,
} from "lucide-react";
import type { SpintaxOpt } from "./message-editor";

interface Props {
  messageType: string;
  text: string;
  caption: string;
  mediaFile: { fileName: string; url: string; mimeType?: string } | null;
  spintaxVars: SpintaxOpt[];
  contactName?: string;
  contactWhatsapp?: string;
  locationName?: string;
  contactVcardName?: string;
}

// Contato ficticio pra preview
const DEFAULT_CONTACT = {
  name: "João da Silva",
  firstName: "João",
  whatsapp: "5511987654321",
};

/**
 * Substitui variaveis por valores de amostra pra preview.
 * Nao usa a mesma logica do worker (aquela e async, servidor); aqui e
 * client-side e apenas cosmetico.
 */
function renderPreviewText(
  text: string,
  spintaxVars: SpintaxOpt[],
  contact: typeof DEFAULT_CONTACT,
): string {
  return text.replace(/\{([^{}]+)\}/g, (raw, tokenRaw: string) => {
    const token = tokenRaw.trim();
    // spintax inline {a|b|c}
    if (token.includes("|")) {
      const opts = token.split("|").map((s) => s.trim()).filter(Boolean);
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : raw;
    }
    const key = token.toLowerCase();
    if (key === "nome" || key === "name") return contact.name;
    if (key === "primeiro_nome" || key === "first_name") return contact.firstName;
    if (key === "whatsapp" || key === "numero" || key === "telefone") return contact.whatsapp;
    // variavel do usuario/sistema
    const v = spintaxVars.find((v) => v.name.toLowerCase() === key);
    if (v && v.sampleValues.length) {
      return v.sampleValues[Math.floor(Math.random() * v.sampleValues.length)];
    }
    return raw;
  });
}

/**
 * Converte formatacao do WhatsApp (*bold* _italic_ ~strike~ ```mono```)
 * pra JSX. Trata cada linha separadamente pra respeitar quebras.
 */
function renderFormatted(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {parseInline(line)}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

function parseInline(text: string): React.ReactNode {
  // Ordem importa: monospace primeiro (usa 3 crases), depois bold/italic/strike
  const nodes: React.ReactNode[] = [];
  const remaining = text;
  // Regex que captura *b* _i_ ~s~ ```m``` sem cruzar em espacos
  const re = /(```([^`]+)```)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(~([^~\n]+)~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(remaining)) !== null) {
    if (m.index > last) nodes.push(remaining.slice(last, m.index));
    if (m[1]) {
      nodes.push(
        <code
          key={`m${m.index}`}
          className="bg-black/10 dark:bg-white/10 rounded px-1 font-mono text-[13px]"
        >
          {m[2]}
        </code>,
      );
    } else if (m[3]) {
      nodes.push(<b key={`b${m.index}`}>{m[4]}</b>);
    } else if (m[5]) {
      nodes.push(<i key={`i${m.index}`}>{m[6]}</i>);
    } else if (m[7]) {
      nodes.push(
        <s key={`s${m.index}`} className="opacity-70">
          {m[8]}
        </s>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < remaining.length) nodes.push(remaining.slice(last));
  return nodes.length ? nodes : text;
}

export function MessagePreview({
  messageType,
  text,
  caption,
  mediaFile,
  spintaxVars,
  contactName,
  locationName,
  contactVcardName,
}: Props) {
  // Seed pra permitir "atualizar" o sorteio de variaveis
  const [seed, setSeed] = React.useState(0);
  void seed;

  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const previewText = React.useMemo(
    () => renderPreviewText(text, spintaxVars, DEFAULT_CONTACT),
    [text, spintaxVars, seed],
  );
  const previewCaption = React.useMemo(
    () => renderPreviewText(caption, spintaxVars, DEFAULT_CONTACT),
    [caption, spintaxVars, seed],
  );

  const displayName = contactName ?? DEFAULT_CONTACT.name;

  const bubbleBase =
    "bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg px-2.5 py-1.5 text-[14px] leading-snug shadow-sm max-w-[85%] break-words whitespace-pre-wrap";

  return (
    <div className="sticky top-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Prévia</div>
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="text-xs text-primary hover:underline"
          title="Sortear novos valores das variáveis"
        >
          ↻ Sortear
        </button>
      </div>

      {/* Frame do celular */}
      <div className="border rounded-2xl overflow-hidden bg-white shadow-lg mx-auto max-w-[320px]">
        {/* Cabecalho estilo WhatsApp */}
        <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{displayName}</div>
            <div className="text-[10px] opacity-70">online</div>
          </div>
        </div>

        {/* Area de conversa */}
        <div
          className="p-3 min-h-[280px] max-h-[500px] overflow-y-auto"
          style={{
            backgroundColor: "#efeae2",
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='20' cy='20' r='1' fill='%23dcd6cd' opacity='0.5'/></svg>\")",
          }}
        >
          <div className="flex justify-end">
            <div className={bubbleBase}>
              {/* Midia */}
              {messageType === "IMAGE" && mediaFile && (
                <div className="mb-1 -mx-1.5 -mt-1 rounded overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaFile.url}
                    alt="preview"
                    className="w-full h-auto max-h-[250px] object-cover"
                  />
                </div>
              )}
              {messageType === "VIDEO" && mediaFile && (
                <div className="mb-1 -mx-1.5 -mt-1 rounded overflow-hidden bg-black relative aspect-video">
                  <video
                    src={mediaFile.url}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/50 rounded-full p-3">
                      <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                  </div>
                </div>
              )}
              {messageType === "AUDIO" && (
                <div className="mb-1 flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded p-2">
                  <Mic className="h-4 w-4" />
                  <div className="flex-1 h-1 bg-black/20 rounded-full">
                    <div className="h-full w-1/3 bg-black/40 rounded-full" />
                  </div>
                  <span className="text-xs opacity-60">0:12</span>
                </div>
              )}
              {messageType === "DOCUMENT" && mediaFile && (
                <div className="mb-1 flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded p-2">
                  <FileText className="h-6 w-6 opacity-60" />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate font-medium">{mediaFile.fileName}</div>
                    <div className="opacity-60">Documento</div>
                  </div>
                </div>
              )}
              {messageType === "LOCATION" && (
                <div className="mb-1 -mx-1.5 -mt-1 bg-emerald-100 aspect-video flex items-center justify-center">
                  <MapPin className="h-8 w-8 text-emerald-700" />
                  <span className="ml-2 text-xs text-emerald-900">
                    {locationName || "Localização"}
                  </span>
                </div>
              )}
              {messageType === "CONTACT" && (
                <div className="mb-1 flex items-center gap-2 bg-black/5 rounded p-2">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
                    <UserIcon className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-xs">
                    <div className="font-medium">{contactVcardName || "Contato"}</div>
                    <div className="opacity-60">WhatsApp</div>
                  </div>
                </div>
              )}

              {/* Texto / legenda */}
              {(messageType === "TEXT" ? previewText : previewCaption) ? (
                <div>{renderFormatted(messageType === "TEXT" ? previewText : previewCaption)}</div>
              ) : messageType === "TEXT" ? (
                <div className="text-black/40 italic">Escreva o texto...</div>
              ) : null}

              {/* Rodape do balao (hora + check duplo) */}
              <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
                <span className="text-[10px] text-black/50 dark:text-white/60">{time}</span>
                <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground text-center px-2">
        Prévia com contato fictício. Variáveis são sorteadas — clique em ↻ pra ver outra combinação.
      </div>
    </div>
  );
}
