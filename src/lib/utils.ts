import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

/**
 * Normaliza numero para o formato E.164 sem "+" (formato que Evolution usa).
 * Recebe "(11) 99999-9999" ou "11999999999" e devolve "5511999999999".
 * Se ja veio com codigo de pais, respeita.
 */
export function normalizeWhatsappNumber(input: string, defaultCountry = "55") {
  const digits = onlyDigits(input);
  if (!digits) return "";
  // Se ja tem codigo de pais (13+ digitos ou comeca com 55), respeita.
  if (digits.length >= 12) return digits;
  if (digits.startsWith(defaultCountry)) return digits;
  return `${defaultCountry}${digits}`;
}

/** Sorteia inteiro entre min e max, inclusivos. */
export function randInt(min: number, max: number) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/** Fisher-Yates shuffle (imutavel). */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
