import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Hook de scroll infinito para paginar arrays já carregados em memória.
 * - Mantém o array completo intacto (para totais, exportação, impressão)
 * - Renderiza apenas os primeiros N itens incrementalmente
 * - Reseta automaticamente quando a "chave" muda (ex: filtros aplicados)
 *
 * Uso:
 *   const { visibleItems, sentinelRef, hasMore } = useInfiniteScroll(filteredItems, [filters]);
 *   {visibleItems.map(...)}
 *   {hasMore && <div ref={sentinelRef} />}
 */
export function useInfiniteScroll<T>(
  items: T[],
  resetDeps: unknown[] = [],
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset quando muda lista ou filtros relevantes
  useEffect(() => {
    setCount(pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, pageSize, ...resetDeps]);

  const hasMore = count < items.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, items.length, pageSize]);

  const visibleItems = useMemo(() => items.slice(0, count), [items, count]);

  return { visibleItems, sentinelRef, hasMore, total: items.length, visibleCount: visibleItems.length };
}
