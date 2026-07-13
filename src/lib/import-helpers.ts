import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

/**
 * Detecta encoding do arquivo CSV.
 * Tenta UTF-8 primeiro (padrao moderno). Se aparecerem muitos U+FFFD
 * (caracteres de substituicao — indicam bytes invalidos), tenta
 * windows-1252 (comum em CSV do Excel BR). Usa o que tiver menos falhas.
 */
export function decodeCsvSmart(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const badU8 = (utf8.match(/�/g) ?? []).length;

  // Poucas falhas em UTF-8 -> aceita direto
  if (badU8 <= 2) return utf8;

  // Tenta windows-1252 (compat com Latin-1)
  try {
    const win = new TextDecoder("windows-1252", { fatal: false }).decode(buf);
    const badWin = (win.match(/�/g) ?? []).length;
    if (badWin < badU8) return win;
  } catch {
    // encoding pode nao ser suportado em algum runtime; fallback UTF-8
  }
  return utf8;
}

/** Detecta e parseia CSV/XLSX pra estrutura uniforme. */
export async function parseFileToTable(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { columns: [], rows: [] };
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

  // CSV (ou TSV — Papa detecta delimitador). Detecta encoding automaticamente.
  const text = decodeCsvSmart(buf);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    // Nao falha catastroficamente — apenas ignora linhas quebradas
    console.warn("CSV parse errors:", parsed.errors.slice(0, 3));
  }
  const rows = parsed.data.filter((r) => r && Object.values(r).some((v) => v != null && v !== ""));
  const columns = rows.length ? Object.keys(rows[0]) : (parsed.meta.fields ?? []);
  return { columns, rows };
}

/**
 * Extrai numeros de um bloco de texto colado (uma linha por numero,
 * pode ter separadores como ; ou virgula, ignora nao-digitos entre).
 */
export function extractNumbersFromText(text: string): string[] {
  const numbers = new Set<string>();
  for (const raw of text.split(/[\r\n,;]+/)) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 8) numbers.add(digits);
  }
  return Array.from(numbers);
}
