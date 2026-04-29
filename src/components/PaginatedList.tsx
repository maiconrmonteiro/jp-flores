import { ReactNode } from "react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";

interface PaginatedListProps<T> {
  items: T[];
  resetDeps?: unknown[];
  pageSize?: number;
  /**
   * Render function recebe os itens visíveis (paginados) e deve devolver
   * o conjunto de elementos da lista (linhas, cards, etc).
   * Você pode chamá-lo duas vezes para renderizar mobile + desktop com os mesmos itens.
   */
  children: (visibleItems: T[]) => ReactNode;
  /** Conteúdo opcional renderizado APÓS a sentinela (ex: rodapé com totais). Usa items completos. */
  footer?: ReactNode;
  /** Esconde o indicador de "X de Y" no final */
  hideSentinel?: boolean;
}

/**
 * Wrapper de scroll infinito. Renderiza apenas os primeiros N itens
 * e carrega mais quando a sentinela entra na viewport.
 * - Totais e rodapés devem usar `items` original (passado fora deste componente).
 */
export function PaginatedList<T>({
  items,
  resetDeps = [],
  pageSize = 20,
  children,
  footer,
  hideSentinel = false,
}: PaginatedListProps<T>) {
  const { visibleItems, sentinelRef, hasMore, total, visibleCount } = useInfiniteScroll(
    items,
    resetDeps,
    pageSize,
  );
  return (
    <>
      {children(visibleItems)}
      {!hideSentinel && (
        <InfiniteScrollSentinel
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          visibleCount={visibleCount}
          total={total}
        />
      )}
      {footer}
    </>
  );
}
