import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface TimeWindowControlProps {
  label: string;
  nextLabel: string | null;
  canExpand: boolean;
  onExpand: () => void;
  /** Mostra um aviso à direita só quando relevante (ex.: Incluir faturados ativo) */
  showHint?: boolean;
  className?: string;
}

/**
 * Controle visual do "use-time-window" para colocar ao lado do checkbox
 * "Incluir faturados/arquivados". Mostra a janela atual e botão para expandir.
 */
export function TimeWindowControl({
  label,
  nextLabel,
  canExpand,
  onExpand,
  showHint = true,
  className = "",
}: TimeWindowControlProps) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {showHint && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          <Clock className="h-3 w-3" />
          Exibindo últimos {label}
        </span>
      )}
      {canExpand && nextLabel && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={onExpand}
        >
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
