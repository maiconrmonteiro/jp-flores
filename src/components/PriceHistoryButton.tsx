import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History, Loader2 } from "lucide-react";

interface PriceRecord {
  data: string;
  preco_custo: number;
  fornecedor_nome: string;
}

interface Props {
  produtoId: string;
  produtoOptions: { value: string; label: string }[];
  dataAtual?: string; // YYYY-MM-DD
}

export default function PriceHistoryButton({ produtoId, produtoOptions, dataAtual }: Props) {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const productName = produtoOptions.find(p => p.value === produtoId)?.label || "";

  const fetchHistory = async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("itens_entrada")
        .select("preco_custo, pedidos_entrada!inner(data, fornecedor_id, fornecedores(nome))")
        .eq("produto_id", produtoId)
        .order("pedidos_entrada(data)", { ascending: false });

      if (error) throw error;

      // Keep up to 10 entries, allowing same supplier if price differs
      const result: PriceRecord[] = [];
      const seenKeys = new Set<string>();
      for (const row of data || []) {
        const fornId = row.pedidos_entrada?.fornecedor_id;
        if (!fornId) continue;
        const preco = Number(row.preco_custo);
        const key = `${fornId}_${preco}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        result.push({
          data: row.pedidos_entrada?.data || "",
          preco_custo: preco,
          fornecedor_nome: (row.pedidos_entrada as any)?.fornecedores?.nome || "—",
        });
        if (result.length >= 10) break;
      }

      setRecords(result);
    } catch {
      setRecords([]);
    }
    setLoading(false);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) fetchHistory();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!produtoId}
          title="Histórico de preços"
        >
          <History className="mr-1 h-3 w-3" />
          Histórico
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="px-3 py-2 border-b bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground">Últimas compras</p>
          <p className="text-sm font-medium truncate">{productName}</p>
        </div>
        <div className="p-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum registro encontrado</p>
          ) : (
            <div className="space-y-1">
              {records.map((r, i) => {
                const isCurrentDate = dataAtual && r.data === dataAtual;
                return (
                  <div
                    key={i}
                    className={`flex items-start justify-between gap-2 px-2 py-1.5 rounded text-sm ${
                      isCurrentDate
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs ${isCurrentDate ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {r.data.split("-").reverse().join("/")}
                        {isCurrentDate && " (hoje)"}
                      </div>
                      <div className="truncate">{r.fornecedor_nome}</div>
                    </div>
                    <span className="font-semibold shrink-0 whitespace-nowrap">
                      R$ {r.preco_custo.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
