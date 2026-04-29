import { Loader2 } from "lucide-react";

interface InfiniteScrollSentinelProps {
  sentinelRef: React.RefObject<HTMLDivElement>;
  hasMore: boolean;
  visibleCount: number;
  total: number;
  className?: string;
}

/**
 * Indicador visual no fim de uma lista paginada por scroll infinito.
 * Mostra spinner enquanto há mais para carregar, ou contador final.
 */
export function InfiniteScrollSentinel({
  sentinelRef,
  hasMore,
  visibleCount,
  total,
  className = "",
}: InfiniteScrollSentinelProps) {
  if (total === 0) return null;

  return (
    <div
      ref={sentinelRef}
      className={`flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground ${className}`}
    >
      {hasMore ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Carregando mais... ({visibleCount} de {total})</span>
        </>
      ) : (
        <span>{total} {total === 1 ? "item" : "itens"} no total</span>
      )}
    </div>
  );
}
