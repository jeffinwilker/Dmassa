import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface Props {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}

/** Retorna cor do texto (branco/preto) que da bom contraste sobre a cor de fundo hex. */
function textOn(hex: string) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // luminancia relativa
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#000" : "#fff";
}

export function TagChip({ name, color, onRemove, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{ backgroundColor: color, color: textOn(color) }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-70"
          aria-label={`Remover tag ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
