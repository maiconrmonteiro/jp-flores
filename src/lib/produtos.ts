import { supabase } from "@/integrations/supabase/client";

const FETCH_BATCH_SIZE = 1000;

const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };

/** Standard sort: unit hierarchy (MC > VS > CX > UN) then alphabetical */
export function sortProdutos<T>(
  items: T[],
  getUnit: (i: T) => string,
  getName: (i: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const ua = UNIT_ORDER[getUnit(a)] ?? 99;
    const ub = UNIT_ORDER[getUnit(b)] ?? 99;
    if (ua !== ub) return ua - ub;
    return getName(a).localeCompare(getName(b), "pt-BR");
  });
}

export async function fetchProdutosUpTo(limit = 5000) {
  const allProducts: any[] = [];

  for (let from = 0; from < limit; from += FETCH_BATCH_SIZE) {
    const to = Math.min(from + FETCH_BATCH_SIZE - 1, limit - 1);
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("descricao")
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allProducts.push(...data);

    if (data.length < FETCH_BATCH_SIZE) break;
  }

  return sortProdutos(allProducts, p => p.unidade || "UN", p => p.descricao || "");
}
