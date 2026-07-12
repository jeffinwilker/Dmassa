// Tipos parciais dos payloads da Evolution API v2.
// Cobrimos so o que usamos; se algo mais chegar do server, e ignorado.

export type EvolutionIntegration = "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS";

export interface CreateInstanceInput {
  instanceName: string;
  token?: string;                       // apikey especifica desta instancia
  qrcode?: boolean;
  integration?: EvolutionIntegration;
  webhookUrl?: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  hash?: { apikey?: string } | string;
  qrcode?: { code?: string; base64?: string; count?: number };
}

export type EvolutionConnectionState =
  | "open"       // conectado
  | "connecting"
  | "close"      // desconectado
  | "refused";

export interface ConnectionStateResponse {
  instance?: {
    instanceName?: string;
    state?: EvolutionConnectionState;
  };
  state?: EvolutionConnectionState;
}

export interface QrCodeResponse {
  pairingCode?: string | null;
  code?: string;          // codigo textual
  base64?: string;        // data:image/png;base64,...
  count?: number;
}

export interface SendTextInput {
  number: string;                       // E.164 sem "+"
  text: string;
  delay?: number;                       // ms de "digitando" antes de enviar
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quoted?: {
    key: { id: string; remoteJid?: string; fromMe?: boolean };
    message?: { conversation?: string };
  };
}

export type EvolutionMediaKind = "image" | "video" | "document" | "audio";

export interface SendMediaInput {
  number: string;
  mediaType: EvolutionMediaKind;        // NOTA: para audio de voz (PTT) usar sendWhatsAppAudio
  media: string;                        // URL ou base64
  caption?: string;
  fileName?: string;
  mimetype?: string;
  delay?: number;
}

export interface SendAudioInput {
  number: string;
  audio: string;                        // URL ou base64
  delay?: number;
  encoding?: boolean;                   // encoding para PTT
}

export interface SendLocationInput {
  number: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  delay?: number;
}

export interface SendContactInput {
  number: string;
  contact: Array<{
    fullName: string;
    wuid?: string;                      // ex: 5511999999999@s.whatsapp.net
    phoneNumber: string;
    organization?: string;
    email?: string;
    url?: string;
  }>;
}

export type PresenceType = "composing" | "recording" | "paused" | "available";

export interface SendPresenceInput {
  number: string;
  delay?: number;                       // ms
  presence: PresenceType;
}

export interface WhatsappNumbersInput {
  numbers: string[];
}

export interface WhatsappNumberCheck {
  exists: boolean;
  jid?: string;
  number: string;
}

export interface SendMessageResponse {
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
  };
  message?: unknown;
  messageTimestamp?: number | string;
  status?: string;
}

export interface FetchGroupsResponse {
  groups?: Array<{
    id: string;
    subject: string;
    subjectOwner?: string;
    subjectTime?: number;
    size?: number;
    creation?: number;
    owner?: string;
    desc?: string;
    participants?: Array<{ id: string; admin?: string | null }>;
  }>;
}

export interface EvolutionErrorBody {
  status?: number;
  error?: string;
  message?: string | string[];
}
