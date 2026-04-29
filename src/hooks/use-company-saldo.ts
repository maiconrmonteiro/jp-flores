import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the company stock balance for a given date.
 * Saldo = Entradas - Saídas - Ambulante (per product)
 */
export function useCompanySaldo(date: string, enabled = false) {
  return useQuery({
    queryKey: ["company-saldo", date],
    enabled: enabled && !!date,
    queryFn: async () => {
      const saldo = new Map<string, number>();

      // Fetch entries for this date
      const { data: entradas } = await supabase
        .from("pedidos_entrada")
        .select("id")
        .eq("data", date);
      const entradaIds = (entradas || []).map((e) => e.id);

      if (entradaIds.length > 0) {
        const { data: itensEntrada } = await supabase
          .from("itens_entrada")
          .select("produto_id, quantidade")
          .in("pedido_id", entradaIds);
        (itensEntrada || []).forEach((i) => {
          saldo.set(i.produto_id, (saldo.get(i.produto_id) || 0) + Number(i.quantidade));
        });
      }

      // Fetch exits for this date
      const { data: saidas } = await supabase
        .from("pedidos_saida")
        .select("id")
        .eq("data", date);
      const saidaIds = (saidas || []).map((s) => s.id);

      if (saidaIds.length > 0) {
        const { data: itensSaida } = await supabase
          .from("itens_saida")
          .select("produto_id, quantidade")
          .in("pedido_id", saidaIds);
        (itensSaida || []).forEach((i) => {
          saldo.set(i.produto_id, (saldo.get(i.produto_id) || 0) - Number(i.quantidade));
        });
      }

      // Fetch ambulante for this date
      const { data: ambulantes } = await supabase
        .from("ambulantes")
        .select("id")
        .eq("data", date);
      const ambIds = (ambulantes || []).map((a) => a.id);

      if (ambIds.length > 0) {
        const { data: itensAmb } = await supabase
          .from("itens_ambulante")
          .select("produto_id, quantidade")
          .in("ambulante_id", ambIds);
        (itensAmb || []).forEach((i) => {
          saldo.set(i.produto_id, (saldo.get(i.produto_id) || 0) - Number(i.quantidade));
        });
      }

      return saldo;
    },
    refetchInterval: enabled ? 30000 : false, // Refresh every 30s when active
  });
}
