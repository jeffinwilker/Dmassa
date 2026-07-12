"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  X,
  Sparkles,
  Users,
  Clock,
  Smartphone,
  Save,
  Play,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  FileIcon,
  MapPin,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagChip } from "@/components/contacts/tag-chip";

interface Tag {
  id: string;
  name: string;
  color: string;
}
interface InstanceOpt {
  id: string;
  name: string;
  status: string;
  tier: string;
  phoneNumber: string | null;
  sentToday: number;
  maxPerDay: number;
}
interface SpintaxOpt {
  name: string;
  label: string | null;
  isSystem: boolean;
  sampleValues: string[];
}

type MessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "CONTACT" | "LOCATION";

const typeOptions: { value: MessageType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "TEXT", label: "Texto", icon: FileText },
  { value: "IMAGE", label: "Imagem", icon: ImageIcon },
  { value: "VIDEO", label: "Vídeo", icon: Video },
  { value: "AUDIO", label: "Áudio (voz)", icon: Mic },
  { value: "DOCUMENT", label: "Documento", icon: FileIcon },
  { value: "CONTACT", label: "Contato (vCard)", icon: UserIcon },
  { value: "LOCATION", label: "Localização", icon: MapPin },
];

const ACCEPT_BY_TYPE: Record<string, string> = {
  IMAGE: "image/*",
  VIDEO: "video/*",
  AUDIO: "audio/*",
  DOCUMENT: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip",
};

interface Props {
  tags: Tag[];
  instances: InstanceOpt[];
  spintaxVars: SpintaxOpt[];
}

export function NewCampaignClient({ tags, instances, spintaxVars }: Props) {
  const router = useRouter();

  // Mensagem
  const [name, setName] = React.useState("");
  const [messageType, setMessageType] = React.useState<MessageType>("TEXT");
  const [text, setText] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [mediaAssetId, setMediaAssetId] = React.useState<string | null>(null);
  const [mediaFile, setMediaFile] = React.useState<{ id: string; fileName: string; url: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // Localizacao
  const [locationLat, setLocationLat] = React.useState<string>("");
  const [locationLng, setLocationLng] = React.useState<string>("");
  const [locationName, setLocationName] = React.useState<string>("");

  // Contato (vCard simplificado)
  const [contactVcard, setContactVcard] = React.useState<string>("");
  const [contactVcardName, setContactVcardName] = React.useState<string>("");

  // Publico
  const [audienceMode, setAudienceMode] = React.useState<"ALL" | "TAGS">("ALL");
  const [audienceTagIds, setAudienceTagIds] = React.useState<string[]>([]);
  const [requireAllTags, setRequireAllTags] = React.useState(false);
  const [excludeBlacklisted, setExcludeBlacklisted] = React.useState(true);
  const [excludeInConversation, setExcludeInConversation] = React.useState(true);
  const [audiencePreview, setAudiencePreview] = React.useState<{ total: number } | null>(null);

  // Config anti-ban
  const [delayMin, setDelayMin] = React.useState(5);
  const [delayMax, setDelayMax] = React.useState(15);
  const [restEveryN, setRestEveryN] = React.useState(20);
  const [restForSec, setRestForSec] = React.useState(600);
  const [hourStart, setHourStart] = React.useState(8);
  const [hourEnd, setHourEnd] = React.useState(20);
  const [simulateTyping, setSimulateTyping] = React.useState(true);
  const [shuffleContacts, setShuffleContacts] = React.useState(true);
  const [validateBeforeSend, setValidateBeforeSend] = React.useState(true);

  // Instancias
  const [useAllInstances, setUseAllInstances] = React.useState(true);
  const [selectedInstances, setSelectedInstances] = React.useState<string[]>([]);

  // Agendamento
  const [scheduledFor, setScheduledFor] = React.useState<string>("");

  const [saving, setSaving] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Preview do publico
  const previewAudience = React.useCallback(async () => {
    const res = await fetch("/api/campaigns/preview-audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: audienceMode,
        tagIds: audienceTagIds,
        requireAllTags,
        excludeBlacklisted,
        excludeInConversation,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setAudiencePreview({ total: data.total });
    }
  }, [audienceMode, audienceTagIds, requireAllTags, excludeBlacklisted, excludeInConversation]);

  React.useEffect(() => {
    const t = setTimeout(previewAudience, 250);
    return () => clearTimeout(t);
  }, [previewAudience]);

  function insertVarAtCursor(varName: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = `{${varName}}`;
    const next = text.slice(0, start) + insert + text.slice(end);
    setText(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + insert.length;
    }, 0);
  }

  async function onFilePick(f: File | null) {
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro no upload");
        return;
      }
      setMediaAssetId(data.media.id);
      setMediaFile({ id: data.media.id, fileName: data.media.fileName, url: data.media.url });
      toast.success("Mídia carregada");
    } finally {
      setUploading(false);
    }
  }

  async function save(startNow: boolean) {
    if (!name.trim()) {
      toast.error("Dê um nome à campanha");
      return;
    }
    if (delayMax < delayMin) {
      toast.error("delay max deve ser >= delay min");
      return;
    }
    if (messageType === "TEXT" && !text.trim()) {
      toast.error("Escreva o texto da mensagem");
      return;
    }
    if (["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(messageType) && !mediaAssetId) {
      toast.error("Envie o arquivo de mídia");
      return;
    }
    if (
      messageType === "LOCATION" &&
      (!locationLat || !locationLng || isNaN(Number(locationLat)) || isNaN(Number(locationLng)))
    ) {
      toast.error("Preencha latitude e longitude");
      return;
    }
    if (messageType === "CONTACT" && (!contactVcard || !contactVcardName)) {
      toast.error("Preencha nome e número do contato");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name,
        messageType,
        text: text || undefined,
        caption: caption || undefined,
        mediaAssetId: mediaAssetId || undefined,
        contactVcard: contactVcard || undefined,
        contactVcardName: contactVcardName || undefined,
        locationLat: locationLat ? Number(locationLat) : undefined,
        locationLng: locationLng ? Number(locationLng) : undefined,
        locationName: locationName || undefined,
        audience: {
          mode: audienceMode,
          tagIds: audienceTagIds,
          requireAllTags,
          excludeBlacklisted,
          excludeInConversation,
        },
        settings: {
          delayMinSec: delayMin,
          delayMaxSec: delayMax,
          restEveryN,
          restForSec,
          allowedHourStart: hourStart,
          allowedHourEnd: hourEnd,
          simulateTyping,
          shuffleContacts,
          validateBeforeSend,
        },
        instances: { useAll: useAllInstances, ids: selectedInstances },
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      };

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao criar");
        return;
      }
      const campaignId = data.campaign.id as string;

      if (startNow && !scheduledFor) {
        const r2 = await fetch(`/api/campaigns/${campaignId}/start`, { method: "POST" });
        const d2 = await r2.json();
        if (!r2.ok) {
          toast.error(d2.error ?? "Erro ao iniciar (rascunho salvo)");
          router.push(`/campaigns/${campaignId}`);
          return;
        }
        toast.success(`Campanha iniciada — ${d2.enqueued} envios agendados`);
      } else {
        toast.success("Rascunho salvo");
      }
      router.push(`/campaigns/${campaignId}`);
    } finally {
      setSaving(false);
    }
  }

  const showCaption = ["IMAGE", "VIDEO", "DOCUMENT"].includes(messageType);
  const showMediaUpload = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(messageType);

  return (
    <div className="space-y-4">
      {/* Nome */}
      <Card>
        <CardContent className="pt-4">
          <Label htmlFor="cname">Nome da campanha</Label>
          <Input
            id="cname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Promoção de Sexta"
            className="mt-1.5"
          />
        </CardContent>
      </Card>

      {/* 1. Mensagem */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" /> 1. Mensagem
          </h3>

          <div>
            <Label>Tipo</Label>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mt-1.5">
              {typeOptions.map((t) => {
                const Icon = t.icon;
                const active = messageType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setMessageType(t.value)}
                    type="button"
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(messageType === "TEXT" || showCaption) && (
            <div>
              <div className="flex items-center justify-between">
                <Label>{messageType === "TEXT" ? "Texto" : "Legenda (opcional)"}</Label>
                <span className="text-xs text-muted-foreground">
                  Use <code>{"{nome}"}</code>, <code>{"{primeiro_nome}"}</code> ou suas variáveis
                </span>
              </div>
              <Textarea
                ref={textareaRef}
                value={messageType === "TEXT" ? text : caption}
                onChange={(e) =>
                  messageType === "TEXT" ? setText(e.target.value) : setCaption(e.target.value)
                }
                rows={5}
                placeholder="Ex: Olá {primeiro_nome}, {saudacao}!"
                className="mt-1.5"
              />
              {messageType === "TEXT" && spintaxVars.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Inserir variável
                  </summary>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[
                      { name: "nome", label: "Nome" },
                      { name: "primeiro_nome", label: "Primeiro nome" },
                      { name: "whatsapp", label: "WhatsApp" },
                    ].map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => insertVarAtCursor(v.name)}
                        className="text-xs bg-muted hover:bg-accent px-2 py-1 rounded font-mono"
                      >
                        {"{" + v.name + "}"}
                      </button>
                    ))}
                    {spintaxVars.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => insertVarAtCursor(v.name)}
                        className={`text-xs px-2 py-1 rounded font-mono ${
                          v.isSystem
                            ? "bg-muted hover:bg-accent"
                            : "bg-primary/10 hover:bg-primary/20 text-primary"
                        }`}
                        title={v.sampleValues.join(", ")}
                      >
                        {"{" + v.name + "}"}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {showMediaUpload && (
            <div>
              <Label>Arquivo</Label>
              {mediaFile ? (
                <div className="mt-1.5 flex items-center gap-2 border rounded-md p-2 bg-muted/30">
                  <FileIcon className="h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{mediaFile.fileName}</div>
                    <a
                      href={mediaFile.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver
                    </a>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setMediaAssetId(null);
                      setMediaFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="mt-1.5">
                  <Input
                    type="file"
                    accept={ACCEPT_BY_TYPE[messageType]}
                    onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
                    disabled={uploading}
                  />
                  {uploading && <p className="text-xs text-muted-foreground mt-1">Enviando...</p>}
                </div>
              )}
            </div>
          )}

          {messageType === "LOCATION" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Latitude</Label>
                <Input
                  value={locationLat}
                  onChange={(e) => setLocationLat(e.target.value)}
                  placeholder="-23.5505"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  value={locationLng}
                  onChange={(e) => setLocationLng(e.target.value)}
                  placeholder="-46.6333"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Nossa loja"
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          {messageType === "CONTACT" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Nome do contato</Label>
                <Input
                  value={contactVcardName}
                  onChange={(e) => setContactVcardName(e.target.value)}
                  placeholder="Suporte Loja XYZ"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Número (com DDI)</Label>
                <Input
                  value={contactVcard}
                  onChange={(e) => setContactVcard(e.target.value)}
                  placeholder="5511999999999"
                  className="mt-1.5 font-mono"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Publico */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> 2. Público-alvo
          </h3>

          <div className="flex gap-2">
            <Button
              variant={audienceMode === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setAudienceMode("ALL")}
              type="button"
            >
              Todos os contatos
            </Button>
            <Button
              variant={audienceMode === "TAGS" ? "default" : "outline"}
              size="sm"
              onClick={() => setAudienceMode("TAGS")}
              type="button"
            >
              Filtrar por tag
            </Button>
          </div>

          {audienceMode === "TAGS" && (
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhuma tag criada.</span>
                )}
                {tags.map((t) => {
                  const active = audienceTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setAudienceTagIds((s) =>
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
              {audienceTagIds.length > 1 && (
                <label className="flex items-center gap-2 text-sm mt-2">
                  <input
                    type="checkbox"
                    checked={requireAllTags}
                    onChange={(e) => setRequireAllTags(e.target.checked)}
                  />
                  Contato deve ter TODAS as tags (senão: qualquer uma delas)
                </label>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={excludeBlacklisted}
                onChange={(e) => setExcludeBlacklisted(e.target.checked)}
              />
              Excluir contatos em blacklist
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={excludeInConversation}
                onChange={(e) => setExcludeInConversation(e.target.checked)}
              />
              Excluir contatos em conversa ativa (que responderam)
            </label>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {audiencePreview?.total.toLocaleString("pt-BR") ?? "..."}
              </span>
              <span className="text-sm text-muted-foreground">contatos serão atingidos</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Configuracoes */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" /> 3. Anti-ban
          </h3>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Intervalo entre envios (segundos)</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  type="number"
                  min={0}
                  max={600}
                  value={delayMin}
                  onChange={(e) => setDelayMin(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  type="number"
                  min={0}
                  max={600}
                  value={delayMax}
                  onChange={(e) => setDelayMax(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>
            <div>
              <Label>Descanso periódico</Label>
              <div className="flex items-center gap-2 mt-1.5 text-sm">
                a cada
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={restEveryN}
                  onChange={(e) => setRestEveryN(Number(e.target.value))}
                  className="w-20"
                />
                envios, aguardar
                <Input
                  type="number"
                  min={0}
                  max={3600}
                  value={restForSec}
                  onChange={(e) => setRestForSec(Number(e.target.value))}
                  className="w-20"
                />
                s
              </div>
            </div>
            <div>
              <Label>Horário permitido</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={hourStart}
                  onChange={(e) => setHourStart(Number(e.target.value))}
                  className="w-20"
                />
                <span>h até</span>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={hourEnd}
                  onChange={(e) => setHourEnd(Number(e.target.value))}
                  className="w-20"
                />
                <span>h</span>
              </div>
            </div>
            <div>
              <Label>Agendar início (opcional)</Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={simulateTyping}
                onChange={(e) => setSimulateTyping(e.target.checked)}
              />
              Simular “digitando…” / “gravando…” antes de enviar
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shuffleContacts}
                onChange={(e) => setShuffleContacts(e.target.checked)}
              />
              Embaralhar ordem dos contatos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={validateBeforeSend}
                onChange={(e) => setValidateBeforeSend(e.target.checked)}
              />
              Validar que número tem WhatsApp antes de enviar
            </label>
          </div>
        </CardContent>
      </Card>

      {/* 4. Instancias */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> 4. Instâncias (chips)
          </h3>

          <div className="flex gap-2">
            <Button
              variant={useAllInstances ? "default" : "outline"}
              size="sm"
              onClick={() => setUseAllInstances(true)}
              type="button"
            >
              Usar todas conectadas
            </Button>
            <Button
              variant={!useAllInstances ? "default" : "outline"}
              size="sm"
              onClick={() => setUseAllInstances(false)}
              type="button"
            >
              Selecionar
            </Button>
          </div>

          {instances.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma instância criada. Crie uma em Instâncias e conecte via QR.
            </p>
          )}

          {instances.length > 0 && (
            <div className="grid gap-2">
              {instances.map((i) => {
                const disabled = i.status !== "CONNECTED";
                const selected = useAllInstances
                  ? i.status === "CONNECTED"
                  : selectedInstances.includes(i.id);
                return (
                  <label
                    key={i.id}
                    className={`flex items-center gap-2 border rounded-md p-2 text-sm ${
                      disabled ? "opacity-50" : "cursor-pointer hover:bg-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled || useAllInstances}
                      onChange={(e) =>
                        setSelectedInstances((s) =>
                          e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id),
                        )
                      }
                    />
                    <div className="flex-1">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.phoneNumber ?? "—"} • {i.status} • {i.sentToday}/{i.maxPerDay} hoje
                      </div>
                    </div>
                    {i.tier === "ENTERPRISE" && (
                      <Badge variant="warning" className="text-xs">
                        Enterprise
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acoes */}
      <div className="flex gap-2 justify-end sticky bottom-0 bg-background border-t py-3">
        <Button variant="outline" onClick={() => save(false)} disabled={saving}>
          <Save /> Salvar rascunho
        </Button>
        <Button onClick={() => save(true)} disabled={saving}>
          <Play />{" "}
          {scheduledFor ? "Agendar" : "Salvar e iniciar agora"}
        </Button>
      </div>
    </div>
  );
}
