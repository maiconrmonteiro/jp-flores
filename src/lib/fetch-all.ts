import { supabase } from "@/integrations/supabase/client";

const BATCH_SIZE = 1000;

/**
 * Fetches ALL rows from a table, bypassing the Supabase 1000-row default limit.
 * Uses pagination via .range() in batches of 1000.
 *
 * @param table - Table name
 * @param select - Select string (with embedded relations if needed)
 * @param orderBy - Column to order by (required for stable pagination)
 * @param ascending - Sort direction
 */
export async function fetchAll<T = any>(
  table: string,
  select: string = "*",
  orderBy: string = "created_at",
  ascending: boolean = true,
  filters?: { gte?: { column: string; value: string }; eq?: { column: string; value: any } }
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    let q: any = (supabase as any)
      .from(table)
      .select(select)
      .order(orderBy, { ascending })
      .range(from, to);
    if (filters?.gte) q = q.gte(filters.gte.column, filters.gte.value);
    if (filters?.eq) q = q.eq(filters.eq.column, filters.eq.value);
    const { data, error } = await q;

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));

    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return all;
}

/**
 * Paginates an arbitrary query builder. Pass a function that returns a fresh
 * query builder; it will be called repeatedly with .range() applied.
 *
 * Example:
 *   const all = await paginateQuery(() =>
 *     supabase.from("itens_saida")
 *       .select("*, pedidos_saida!inner(data)")
 *       .eq("pedidos_saida.data", date)
 *   );
 */
export async function paginateQuery<T = any>(
  buildQuery: () => any
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return all;
}
