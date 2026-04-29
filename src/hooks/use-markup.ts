import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MARKUP_PRESETS = [70, 75, 80];

function getStoredMarkup(key: string): number {
  const stored = localStorage.getItem(`markup_${key}`);
  return stored ? Number(stored) : 70;
}

function setStoredMarkup(key: string, value: number) {
  localStorage.setItem(`markup_${key}`, String(value));
}

export function useMarkup(storageKey: string) {
  const [markup, setMarkupState] = useState(70);
  const [customMarkup, setCustomMarkup] = useState("");
  const [isCustomMarkup, setIsCustomMarkup] = useState(false);

  const syncFromStorage = useCallback(() => {
    if (storageKey) {
      const stored = getStoredMarkup(storageKey);
      setMarkupState(stored);
      if (!MARKUP_PRESETS.includes(stored)) {
        setIsCustomMarkup(true);
        setCustomMarkup(String(stored));
      } else {
        setIsCustomMarkup(false);
        setCustomMarkup("");
      }
    }
  }, [storageKey]);

  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage]);

  // Listen for changes from other components via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === storageKey) syncFromStorage();
    };
    window.addEventListener("markup-changed", handler);
    return () => window.removeEventListener("markup-changed", handler);
  }, [storageKey, syncFromStorage]);

  const handleMarkupChange = (value: number) => {
    setMarkupState(value);
    setIsCustomMarkup(false);
    setCustomMarkup("");
    if (storageKey) {
      setStoredMarkup(storageKey, value);
      window.dispatchEvent(new CustomEvent("markup-changed", { detail: { key: storageKey } }));
    }
  };

  const handleCustomMarkupChange = (val: string) => {
    setCustomMarkup(val);
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      setMarkupState(num);
      if (storageKey) {
        setStoredMarkup(storageKey, num);
        window.dispatchEvent(new CustomEvent("markup-changed", { detail: { key: storageKey } }));
      }
    }
  };

  const setCustomActive = () => {
    setIsCustomMarkup(true);
    setCustomMarkup(String(markup));
  };

  return { markup, customMarkup, isCustomMarkup, handleMarkupChange, handleCustomMarkupChange, setCustomActive };
}

/**
 * Fetch cost prices for a specific date: highest preco_custo per product
 * on entries with that exact date, considering custo_overrides.
 */
/**
 * Fetch cost prices for a specific date with fallback to previous dates.
 * Overrides take priority, then exact date entries, then most recent previous entries.
 */
export async function fetchCostPricesForDate(date: string): Promise<Record<string, number>> {
  // 1. Fetch overrides for this exact date
  const { data: overrides } = await supabase
    .from("custo_overrides")
    .select("produto_id, preco_custo")
    .eq("data", date);

  const overrideMap: Record<string, number> = {};
  (overrides || []).forEach((o: any) => {
    overrideMap[o.produto_id] = Number(o.preco_custo);
  });

  // 2. Fetch entries ON the exact date first
  const { data: sameDayData, error: sdErr } = await supabase
    .from("itens_entrada")
    .select("produto_id, preco_custo, pedidos_entrada!inner(data)")
    .eq("pedidos_entrada.data", date);
  if (sdErr) throw sdErr;

  const priceMap: Record<string, number> = {};
  const hasEntryOnDate = new Set<string>();

  (sameDayData || []).forEach((item: any) => {
    const prodId = item.produto_id;
    const cost = Number(item.preco_custo);
    hasEntryOnDate.add(prodId);
    if (!priceMap[prodId] || cost > priceMap[prodId]) {
      priceMap[prodId] = cost;
    }
  });

  // 3. For products WITHOUT entries on the exact date, fall back to most recent previous
  // Paginate to avoid the 1000-row default limit
  const fallbackDate: Record<string, string> = {};
  const fallbackPrice: Record<string, number> = {};
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: prevData, error: prevErr } = await supabase
      .from("itens_entrada")
      .select("produto_id, preco_custo, pedidos_entrada!inner(data)")
      .lt("pedidos_entrada.data", date)
      .range(from, from + pageSize - 1);
    if (prevErr) throw prevErr;

    (prevData || []).forEach((item: any) => {
      const prodId = item.produto_id;
      if (hasEntryOnDate.has(prodId)) return;
      const itemDate = item.pedidos_entrada?.data;
      if (!itemDate) return;
      const cost = Number(item.preco_custo);

      if (!fallbackDate[prodId] || itemDate > fallbackDate[prodId]) {
        fallbackDate[prodId] = itemDate;
        fallbackPrice[prodId] = cost;
      } else if (itemDate === fallbackDate[prodId] && cost > fallbackPrice[prodId]) {
        fallbackPrice[prodId] = cost;
      }
    });

    hasMore = (prevData || []).length === pageSize;
    from += pageSize;
  }

  for (const [pid, price] of Object.entries(fallbackPrice)) {
    if (!priceMap[pid]) priceMap[pid] = price;
  }

  // 4. Overrides take absolute priority
  for (const [pid, price] of Object.entries(overrideMap)) {
    priceMap[pid] = price;
  }

  return priceMap;
}

export function useLatestCostPrices(enabled = true) {
  return useQuery({
    queryKey: ["latest-cost-prices"],
    queryFn: async () => {
      // Fetch overrides
      const { data: overrides, error: ovErr } = await supabase
        .from("custo_overrides")
        .select("produto_id, data, preco_custo");
      if (ovErr) throw ovErr;

      // Build override map: produto_id -> { date -> preco }
      // We use the latest override date per product
      const overrideMap: Record<string, { date: string; preco: number }> = {};
      (overrides || []).forEach((o: any) => {
        const pid = o.produto_id;
        if (!overrideMap[pid] || o.data > overrideMap[pid].date) {
          overrideMap[pid] = { date: o.data, preco: Number(o.preco_custo) };
        }
      });

      // Fetch normal cost prices in batches to avoid 1000-row limit
      const priceMap: Record<string, number> = {};
      const latestDateMap: Record<string, string> = {};
      const BATCH = 1000;
      for (let from = 0; ; from += BATCH) {
        const { data, error } = await supabase
          .from("itens_entrada")
          .select("produto_id, preco_custo, pedidos_entrada!inner(data)")
          .order("data", { ascending: false, referencedTable: "pedidos_entrada" })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;

        data.forEach((item: any) => {
          const prodId = item.produto_id;
          const itemDate = item.pedidos_entrada?.data;
          if (!itemDate) return;

          if (!latestDateMap[prodId] || itemDate > latestDateMap[prodId]) {
            latestDateMap[prodId] = itemDate;
            priceMap[prodId] = Number(item.preco_custo);
          } else if (itemDate === latestDateMap[prodId] && Number(item.preco_custo) > priceMap[prodId]) {
            priceMap[prodId] = Number(item.preco_custo);
          }
        });

        if (data.length < BATCH) break;
      }

      // Override: if a product has an override, use that price instead
      for (const [pid, ov] of Object.entries(overrideMap)) {
        priceMap[pid] = ov.preco;
      }

      return priceMap;
    },
    enabled,
  });
}

export function useCostPricesForDate(date: string, enabled = true) {
  return useQuery({
    queryKey: ["cost-prices-for-date", date],
    queryFn: () => fetchCostPricesForDate(date),
    enabled: enabled && !!date,
  });
}

export function useSuggestedPrice(markup: number, enabled = true) {
  const { data: latestCostPrices = {} } = useLatestCostPrices(enabled);

  const getSuggestedPrice = useCallback((produtoId: string): number => {
    const costPrice = (latestCostPrices as Record<string, number>)[produtoId];
    if (!costPrice) return 0;
    return Math.round(costPrice * (1 + markup / 100) * 100) / 100;
  }, [latestCostPrices, markup]);

  return { getSuggestedPrice, latestCostPrices: latestCostPrices as Record<string, number> };
}

export function useSuggestedPriceForDate(markup: number, date: string, enabled = true) {
  const { data: costPrices = {} } = useCostPricesForDate(date, enabled);

  const getSuggestedPrice = useCallback((produtoId: string): number => {
    const costPrice = (costPrices as Record<string, number>)[produtoId];
    if (!costPrice) return 0;
    return Math.round(costPrice * (1 + markup / 100) * 100) / 100;
  }, [costPrices, markup]);

  return { getSuggestedPrice, costPrices: costPrices as Record<string, number> };
}
