/**
 * Renderer de Spintax + variaveis do contato.
 *
 * Suporta:
 *  - Variaveis nomeadas: "Olá {saudacao}, tudo bem?"
 *    → sorteia um valor de SpintaxVariable.name = "saudacao"
 *
 *  - Campos do contato (built-in):
 *      {nome}          -> contact.name
 *      {primeiro_nome} -> primeiro token de contact.name
 *      {whatsapp}      -> contact.whatsapp
 *      {numero}        -> alias de whatsapp
 *
 *  - Campos custom vindos do CSV (contact.meta):
 *      {cpf}, {cidade}, {empresa}, etc.
 *
 *  - Spintax inline (compat com sintaxe classica):
 *      "Olá {oi|olá|e aí}!"
 *    → sorteia entre "oi", "olá", "e aí"
 *
 *  - Fallback quando variavel nao existe: mantem o placeholder cru.
 */
import { prisma } from "@/lib/prisma";

export interface RenderContact {
  name?: string | null;
  whatsapp: string;
  meta?: Record<string, unknown> | null;
}

export interface RenderContext {
  contact: RenderContact;
  variables: Map<string, string[]>;
}

const PLACEHOLDER_RE = /\{([^{}]+)\}/g;

/** Sorteia um valor de um array (nao vazio). */
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Normaliza chave: lowercase, trim, sem acentos. */
function normKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function renderSpintax(template: string, ctx: RenderContext): string {
  if (!template) return template;

  return template.replace(PLACEHOLDER_RE, (raw, tokenRaw: string) => {
    const token = tokenRaw.trim();

    // ---- Spintax inline: {a|b|c}
    if (token.includes("|")) {
      const opts = token.split("|").map((s) => s.trim()).filter(Boolean);
      return opts.length ? pick(opts) : raw;
    }

    const key = normKey(token);

    // ---- Built-in do contato
    switch (key) {
      case "nome":
      case "name":
        return ctx.contact.name ?? "";
      case "primeiro_nome":
      case "primeironome":
      case "first_name":
      case "firstname":
        return (ctx.contact.name ?? "").split(/\s+/)[0] ?? "";
      case "whatsapp":
      case "numero":
      case "telefone":
      case "phone":
        return ctx.contact.whatsapp ?? "";
    }

    // ---- Variavel do usuario/sistema
    const values = ctx.variables.get(key);
    if (values && values.length) {
      return pick(values);
    }

    // ---- Campo custom do CSV (contact.meta)
    if (ctx.contact.meta && typeof ctx.contact.meta === "object") {
      // procura tanto pela chave crua quanto normalizada
      for (const [k, v] of Object.entries(ctx.contact.meta)) {
        if (normKey(k) === key) {
          return v == null ? "" : String(v);
        }
      }
    }

    // ---- Nao encontrado: mantem cru
    return raw;
  });
}

/**
 * Carrega variaveis Spintax visiveis para o owner (as dele + as de sistema).
 * Retorna um Map name→values pronto pra usar em renderSpintax.
 */
export async function loadSpintaxVariables(ownerId: string) {
  const rows = await prisma.spintaxVariable.findMany({
    where: { OR: [{ ownerId }, { ownerId: null }] },
    select: { name: true, values: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (r.values && r.values.length) map.set(normKey(r.name), r.values);
  }
  return map;
}

/** Extrai a lista de placeholders usados num template (deduplicado). */
export function extractPlaceholders(template: string): string[] {
  const set = new Set<string>();
  const re = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const tok = m[1].trim();
    if (!tok.includes("|")) set.add(tok);
  }
  return Array.from(set);
}

/**
 * Valida um template pra uso em campanha: quais variaveis existem, quais nao.
 * Nao trata built-in nem meta (esses so o worker sabe se o contato tem).
 */
export async function validateTemplate(template: string, ownerId: string) {
  const vars = await loadSpintaxVariables(ownerId);
  const used = extractPlaceholders(template);
  const builtIn = new Set([
    "nome", "name", "primeiro_nome", "first_name", "whatsapp", "numero", "telefone", "phone",
  ]);
  const unknown: string[] = [];
  for (const tok of used) {
    const key = normKey(tok);
    if (builtIn.has(key)) continue;
    if (vars.has(key)) continue;
    unknown.push(tok);
  }
  return { used, unknown, variableCount: vars.size };
}
