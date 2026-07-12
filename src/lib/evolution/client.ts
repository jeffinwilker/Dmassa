/**
 * Cliente HTTP tipado da Evolution API v2.
 *
 * Uso:
 *   const evo = evolutionClient();
 *   await evo.createInstance({ instanceName: "chip01" });
 *   await evo.sendText("chip01", { number: "5511999999999", text: "Oi" });
 */
import type {
  ConnectionStateResponse,
  CreateInstanceInput,
  CreateInstanceResponse,
  EvolutionErrorBody,
  FetchGroupsResponse,
  QrCodeResponse,
  SendAudioInput,
  SendContactInput,
  SendLocationInput,
  SendMediaInput,
  SendMessageResponse,
  SendPresenceInput,
  SendTextInput,
  WhatsappNumberCheck,
  WhatsappNumbersInput,
} from "./types";

export class EvolutionError extends Error {
  status: number;
  body?: EvolutionErrorBody;
  constructor(status: number, message: string, body?: EvolutionErrorBody) {
    super(message);
    this.name = "EvolutionError";
    this.status = status;
    this.body = body;
  }
}

interface EvolutionConfig {
  baseUrl: string;
  globalApiKey: string;   // AUTHENTICATION_API_KEY
  timeoutMs?: number;
}

export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly globalApiKey: string;
  private readonly timeoutMs: number;

  constructor(cfg: EvolutionConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.globalApiKey = cfg.globalApiKey;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    opts: { body?: unknown; instanceApiKey?: string } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    // Endpoints de mensagem/chat aceitam a apikey especifica da instancia OU a global;
    // endpoints administrativos (create, delete, fetch) exigem a global.
    const apiKey = opts.instanceApiKey ?? this.globalApiKey;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });

      const text = await res.text();
      let json: unknown = undefined;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        // resposta nao-JSON
      }

      if (!res.ok) {
        const body = json as EvolutionErrorBody | undefined;
        const msg =
          (body && (Array.isArray(body.message) ? body.message.join("; ") : body.message)) ||
          body?.error ||
          `Evolution HTTP ${res.status}`;
        throw new EvolutionError(res.status, msg, body);
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- Instancias ---------------------------------------------------

  createInstance(input: CreateInstanceInput) {
    return this.request<CreateInstanceResponse>("POST", "/instance/create", {
      body: {
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        rejectCall: false,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
        ...input,
      },
    });
  }

  fetchInstances() {
    return this.request<unknown[]>("GET", "/instance/fetchInstances");
  }

  connect(instanceName: string) {
    return this.request<QrCodeResponse>(
      "GET",
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
  }

  connectionState(instanceName: string) {
    return this.request<ConnectionStateResponse>(
      "GET",
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
  }

  logoutInstance(instanceName: string) {
    return this.request<unknown>(
      "DELETE",
      `/instance/logout/${encodeURIComponent(instanceName)}`,
    );
  }

  deleteInstance(instanceName: string) {
    return this.request<unknown>(
      "DELETE",
      `/instance/delete/${encodeURIComponent(instanceName)}`,
    );
  }

  restartInstance(instanceName: string) {
    return this.request<unknown>(
      "POST",
      `/instance/restart/${encodeURIComponent(instanceName)}`,
    );
  }

  // ---------- Envio de mensagem -------------------------------------------

  sendText(
    instanceName: string,
    input: SendTextInput,
    instanceApiKey?: string,
  ) {
    return this.request<SendMessageResponse>(
      "POST",
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  sendMedia(
    instanceName: string,
    input: SendMediaInput,
    instanceApiKey?: string,
  ) {
    return this.request<SendMessageResponse>(
      "POST",
      `/message/sendMedia/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  /** Envio de audio como PTT (mensagem de voz). */
  sendWhatsAppAudio(
    instanceName: string,
    input: SendAudioInput,
    instanceApiKey?: string,
  ) {
    return this.request<SendMessageResponse>(
      "POST",
      `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  sendLocation(
    instanceName: string,
    input: SendLocationInput,
    instanceApiKey?: string,
  ) {
    return this.request<SendMessageResponse>(
      "POST",
      `/message/sendLocation/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  sendContact(
    instanceName: string,
    input: SendContactInput,
    instanceApiKey?: string,
  ) {
    return this.request<SendMessageResponse>(
      "POST",
      `/message/sendContact/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  // ---------- Chat helpers ------------------------------------------------

  /** Envia presenca (composing/recording/etc.). Use antes do envio real. */
  sendPresence(
    instanceName: string,
    input: SendPresenceInput,
    instanceApiKey?: string,
  ) {
    return this.request<unknown>(
      "POST",
      `/chat/sendPresence/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  /** Valida quais numeros efetivamente existem no WhatsApp. */
  whatsappNumbers(
    instanceName: string,
    input: WhatsappNumbersInput,
    instanceApiKey?: string,
  ) {
    return this.request<WhatsappNumberCheck[]>(
      "POST",
      `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
      { body: input, instanceApiKey },
    );
  }

  // ---------- Grupos ------------------------------------------------------

  fetchAllGroups(instanceName: string, getParticipants = false) {
    return this.request<FetchGroupsResponse>(
      "GET",
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=${getParticipants}`,
    );
  }
}

/** Factory que le do process.env. */
export function evolutionClient(cfg?: Partial<EvolutionConfig>) {
  const baseUrl = cfg?.baseUrl ?? process.env.EVOLUTION_BASE_URL ?? "http://localhost:8080";
  const globalApiKey = cfg?.globalApiKey ?? process.env.EVOLUTION_GLOBAL_API_KEY ?? "";
  if (!globalApiKey) {
    throw new Error(
      "EVOLUTION_GLOBAL_API_KEY nao configurada. Defina no .env antes de usar o cliente.",
    );
  }
  return new EvolutionClient({ baseUrl, globalApiKey, timeoutMs: cfg?.timeoutMs });
}
