import { useState, useCallback, useRef, useMemo } from "react";
import { getNextOperationDate, localToday, localDateStr } from "@/lib/utils";
import { useCompanySaldo } from "@/hooks/use-company-saldo";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Printer, Trash2, Percent, ClipboardList, MessageSquare, ArrowLeft, Search, X, Bluetooth, DollarSign, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { printSaida80mm, printSaidaA4 } from "@/lib/print";
import { btPrintSaida, isBluetoothSupported } from "@/lib/bluetooth-printer";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMarkup, useSuggestedPriceForDate, useCostPricesForDate, fetchCostPricesForDate, MARKUP_PRESETS } from "@/hooks/use-markup";
import OrderItemsEditor from "@/components/OrderItemsEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePastDateGuard } from "@/components/PastDateGuard";
import { extractPartialPaymentValue, stripPartialPaymentObservation, upsertPartialPaymentObservation } from "@/lib/order-payment";
import { CochoButton, stripCochoFromObs, parseCochoFromObs, cochoHasValues } from "@/components/CochoButton";
import { useTimeWindow } from "@/hooks/use-time-window";
import { TimeWindowControl } from "@/components/TimeWindowControl";
import { mergeCochoIntoCliente } from "@/lib/cocho-cobranca";
import { registrarPagamentoFaturamento } from "@/lib/avista-pagamento";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";

interface ItemSaida { _key?: string; id?: string; produto_id: string; quantidade: number; preco: number; is_baixa_ambulante?: boolean; }

function SaidasListBody({ filteredPedidos, filterDate, filterMotorista, filterCliente, filterPagamento, multiDateCostPrices, startEdit, setPrintTarget, setConfirmAction, setFaturarValorPago }: any) {
  const { visibleItems, sentinelRef, hasMore, total, visibleCount } = useInfiniteScroll(
    filteredPedidos,
    [filterDate, filterMotorista, filterCliente, filterPagamento],
  );
  return (
    <>
      {/* Mobile list */}
      <div className="md:hidden space-y-1">
        {visibleItems.map((p: any) => {
          const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
          const pDesconto = Number(p.desconto) || 0;
          const total = pDesconto > 0 ? subtotal * (1 - pDesconto / 100) : subtotal;
          const tp = p.tipo_pagamento || "pendente";
          return (
            <div key={p.id} className="border rounded-lg p-2 cursor-pointer active:bg-accent/50" onClick={() => startEdit(p)}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{p.data.split("-").reverse().join("/")}</span>
                <span className="font-medium text-sm truncate flex-1 ml-2">{p.clientes?.nome}</span>
                <Badge className={tp === "avista" ? "bg-emerald-600 text-white text-[10px]" : tp === "aprazo" ? "bg-amber-500 text-white text-[10px]" : tp === "parcial" ? "bg-blue-500 text-white text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                  {tp === "avista" ? "À vista" : tp === "aprazo" ? "A prazo" : tp === "parcial" ? (() => { const pv = extractPartialPaymentValue(p.observacao); return pv ? `Parcial R$${pv.toFixed(2)}` : "Parcial"; })() : "Pendente"}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{p.motoristas?.nome}</span>
                  <span className="text-sm font-semibold">R$ {total.toFixed(2)}</span>
                </div>
                <div className="flex gap-0" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPrintTarget(p)}><Printer className="h-4 w-4" /></Button>
                  {!p.archived && tp !== "pendente" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { const parcial = extractPartialPaymentValue(p.observacao); setFaturarValorPago(parcial !== null ? parcial.toFixed(2) : ""); setConfirmAction({ type: "faturar", pedido: p }); }}>
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmAction({ type: "delete", pedido: p })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <Table className="hidden md:table">
        <TableHeader><TableRow>
          <TableHead className="w-[12%]">Data</TableHead><TableHead className="w-[15%]">Motorista</TableHead><TableHead>Cliente</TableHead><TableHead className="w-[10%]">Total</TableHead><TableHead className="w-[10%]">Pagamento</TableHead><TableHead className="w-24">Ações</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {visibleItems.map((p: any) => {
            const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
            const pDesconto = Number(p.desconto) || 0;
            const total = pDesconto > 0 ? subtotal * (1 - pDesconto / 100) : subtotal;
            const tp = p.tipo_pagamento || "pendente";
            return (
              <TableRow key={p.id} className="cursor-pointer h-9" onClick={() => startEdit(p)}>
                <TableCell>{p.data.split("-").reverse().join("/")}</TableCell>
                <TableCell>{p.motoristas?.nome}</TableCell>
                <TableCell>{p.clientes?.nome}</TableCell>
                <TableCell>R$ {total.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge className={tp === "avista" ? "bg-emerald-600 text-white hover:bg-emerald-700" : tp === "aprazo" ? "bg-amber-500 text-white hover:bg-amber-600" : tp === "parcial" ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-muted text-muted-foreground"}>
                    {tp === "avista" ? "À vista" : tp === "aprazo" ? "A prazo" : tp === "parcial" ? (() => { const pv = extractPartialPaymentValue(p.observacao); return pv ? `Parcial R$${pv.toFixed(2)}` : "Parcial"; })() : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setPrintTarget(p)} title="Imprimir"><Printer className="h-4 w-4" /></Button>
                    {!p.archived && tp !== "pendente" && (
                      <Button variant="ghost" size="icon" onClick={() => { const parcial = extractPartialPaymentValue(p.observacao); setFaturarValorPago(parcial !== null ? parcial.toFixed(2) : ""); setConfirmAction({ type: "faturar", pedido: p }); }} title="Faturar">
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setConfirmAction({ type: "delete", pedido: p })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} visibleCount={visibleCount} total={total} />
      {filterDate && filteredPedidos.length > 0 && (() => {
        let totalVenda = 0;
        let totalCusto = 0;
        filteredPedidos.forEach((p: any) => {
          const disc = Number(p.desconto) || 0;
          (p.itens_saida || []).forEach((it: any) => {
            const qty = Number(it.quantidade);
            const preco = Number(it.preco);
            const subtItem = qty * preco;
            totalVenda += disc > 0 ? subtItem * (1 - disc / 100) : subtItem;
            const dateCosts = (multiDateCostPrices as any)[p.data] || {};
            const custo = dateCosts[it.produto_id] || 0;
            totalCusto += qty * custo;
          });
        });
        return (
          <div className="mt-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex flex-col sm:flex-row items-center justify-around gap-2 text-sm font-semibold">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>Total Compra (Custo):</span>
              <span className="text-destructive">R$ {totalCusto.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>Total Vendas:</span>
              <span className="text-emerald-600">R$ {totalVenda.toFixed(2)}</span>
            </div>
            {totalCusto > 0 && totalVenda > 0 && (
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <span>Markup:</span>
                <span className="text-primary">{((totalVenda / totalCusto - 1) * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}


export default function Saidas() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, role } = useAuth();
  const isFinanceiro = role === "financeiro";
  const isAdmin = role === "admin";
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [originalMotoristaId, setOriginalMotoristaId] = useState<string | null>(null);
  const [originalData, setOriginalData] = useState<string | null>(null);
  const [autoOrderId, _setAutoOrderId] = useState<string | null>(null);
  const autoOrderIdRef = useRef<string | null>(null);
  const setAutoOrderId = (id: string | null) => { autoOrderIdRef.current = id; _setAutoOrderId(id); };
  const [motoristaId, setMotoristaId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [data, setData] = useState(() => getNextOperationDate());
  const [itens, setItens] = useState<ItemSaida[]>([]);
  const [cooperfloraStage, setCooperfloraStage] = useState<0 | 1 | 2>(0);
  const { data: companySaldo, isLoading: companySaldoLoading } = useCompanySaldo(data, cooperfloraStage >= 1);
  const [showArchived, setShowArchived] = useState(false);
  const timeWindow = useTimeWindow("30d");
  const [confirmAction, setConfirmAction] = useState<{ type: "delete" | "faturar"; pedido: any } | null>(null);
  const [tipoPagamento, setTipoPagamento] = useState("pendente");
  const [filterPagamento, setFilterPagamento] = useState("");
  const [faturarValorPago, setFaturarValorPago] = useState("");
  const [faturarObs, setFaturarObs] = useState("");
  const [parcialDialog, setParcialDialog] = useState<{ orderId: string } | null>(null);
  const [parcialValor, setParcialValor] = useState("");
  const [valorPagoParcial, setValorPagoParcial] = useState("");
  const [printTarget, setPrintTarget] = useState<any>(null);
  
  const [confirmImportTpl, setConfirmImportTpl] = useState<any>(null);
  const [filterDate, setFilterDate] = useState("");
  const [filterMotorista, setFilterMotorista] = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const { guardedOnChange: guardedDateChange, dialog: pastDateDialog } = usePastDateGuard(setData);

  // Desconto
  const DISCOUNT_PRESETS = [5, 10, 15];
  const [desconto, setDesconto] = useState(0);
  const [customDesconto, setCustomDesconto] = useState("");
  const [isCustomDesconto, setIsCustomDesconto] = useState(false);
  const descontoRef = useRef(0);
  descontoRef.current = desconto;

  // Observação
  const [observacao, setObservacao] = useState("");
  const observacaoRef = useRef("");
  observacaoRef.current = observacao;

  const orderId = editId || autoOrderId;

  const { markup, customMarkup, isCustomMarkup, handleMarkupChange, handleCustomMarkupChange, setCustomActive } = useMarkup("admin");
  const { getSuggestedPrice } = useSuggestedPriceForDate(markup, data);


  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["pedidos_saida", showArchived, timeWindow.since],
    queryFn: async () => {
      // 1) Fetch pedidos WITHOUT itens_saida join (avoid 1000-row limit on flattened rows)
      const pedidosRows: any[] = [];
      {
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          let query = supabase.from("pedidos_saida")
            .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone)")
            .order("data", { ascending: false })
            .range(from, from + pageSize - 1);
          if (!showArchived) {
            query = (query as any).eq("archived", false);
          }
          if (timeWindow.since) {
            query = (query as any).gte("data", timeWindow.since);
          }
          const { data, error } = await query;
          if (error) throw error;
          const rows = data || [];
          pedidosRows.push(...rows);
          hasMore = rows.length === pageSize;
          from += pageSize;
        }
      }

      // 2) Fetch itens_saida in batches by pedido_id (so no pedido is silently dropped)
      const pedidoIds = pedidosRows.map((p: any) => p.id);
      const itemsByPedido = new Map<string, any[]>();
      const ID_BATCH = 200;
      for (let i = 0; i < pedidoIds.length; i += ID_BATCH) {
        const slice = pedidoIds.slice(i, i + ID_BATCH);
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("itens_saida")
            .select("*, produtos(descricao, unidade)")
            .in("pedido_id", slice)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = data || [];
          for (const it of rows) {
            const arr = itemsByPedido.get(it.pedido_id) || [];
            arr.push(it);
            itemsByPedido.set(it.pedido_id, arr);
          }
          hasMore = rows.length === pageSize;
          from += pageSize;
        }
      }

      // 3) Attach itens back to each pedido
      for (const p of pedidosRows) {
        (p as any).itens_saida = itemsByPedido.get(p.id) || [];
      }

      return pedidosRows.sort((a: any, b: any) => {
        if (b.data !== a.data) return b.data.localeCompare(a.data);
        return (a.clientes?.nome || "").localeCompare(b.clientes?.nome || "", "pt-BR");
      });
    },
  });

  const { data: motoristas = [] } = useQuery({ queryKey: ["motoristas"], queryFn: async () => { const { data } = await supabase.from("motoristas").select("*").order("nome"); return data || []; } });
  const terceirizadoIds = useMemo(() => new Set(motoristas.filter((m: any) => m.terceirizado).map((m: any) => m.id)), [motoristas]);

  // Collect unique dates from filtered pedidos for multi-date cost lookup
  const uniquePedidoDates = useMemo(() => {
    if (!filterDate) return [];
    const dates = new Set<string>();
    pedidos.forEach((p: any) => {
      if (isFinanceiro && terceirizadoIds.has(p.motorista_id)) return;
      if (isFinanceiro ? p.data <= filterDate : p.data === filterDate) {
        dates.add(p.data);
      }
    });
    return Array.from(dates).sort();
  }, [pedidos, filterDate, isFinanceiro, terceirizadoIds]);

  // Fetch ALL cost data once (overrides + entries) and build per-date cost maps
  const { data: multiDateCostPrices = {} } = useQuery({
    queryKey: ["cost-prices-multi-date-bulk", uniquePedidoDates, timeWindow.since],
    queryFn: async () => {
      if (uniquePedidoDates.length === 0) return {};
      const maxDate = uniquePedidoDates[uniquePedidoDates.length - 1];
      const minDate = uniquePedidoDates[0];
      // Lower bound: usa a janela de tempo (com folga de 60 dias para fallback de "preço mais recente")
      const lowerBound = (() => {
        const d = new Date(minDate + "T00:00:00");
        d.setDate(d.getDate() - 60);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      })();

      // 1. Fetch overrides between lowerBound and maxDate
      const overrides: any[] = [];
      {
        let from = 0;
        while (true) {
          const { data } = await supabase
            .from("custo_overrides")
            .select("produto_id, preco_custo, data")
            .gte("data", lowerBound)
            .lte("data", maxDate)
            .order("data", { ascending: true })
            .range(from, from + 999);
          if (!data || data.length === 0) break;
          overrides.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
      }

      // 2. Fetch pedidos_entrada dates between lowerBound and maxDate
      const peList: any[] = [];
      {
        let from = 0;
        while (true) {
          const { data } = await supabase
            .from("pedidos_entrada")
            .select("id, data")
            .gte("data", lowerBound)
            .lte("data", maxDate)
            .order("data", { ascending: true })
            .range(from, from + 999);
          if (!data || data.length === 0) break;
          peList.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
      }
      const pedidoDateMap: Record<string, string> = {};
      peList.forEach((pe: any) => { pedidoDateMap[pe.id] = pe.data; });
      const validPedidoIds = new Set(Object.keys(pedidoDateMap));

      // 3. Fetch itens_entrada ONLY for valid pedido_ids (batched .in())
      const allEntries: any[] = [];
      const pedidoIdList = Array.from(validPedidoIds);
      const ID_BATCH = 200;
      const pageSize = 1000;
      for (let i = 0; i < pedidoIdList.length; i += ID_BATCH) {
        const slice = pedidoIdList.slice(i, i + ID_BATCH);
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: page } = await supabase
            .from("itens_entrada")
            .select("produto_id, preco_custo, pedido_id")
            .in("pedido_id", slice)
            .range(from, from + pageSize - 1);
          const rows = page || [];
          for (const r of rows) {
            allEntries.push({ produto_id: r.produto_id, preco_custo: r.preco_custo, entry_date: pedidoDateMap[r.pedido_id] });
          }
          hasMore = rows.length === pageSize;
          from += pageSize;
        }
      }
      console.log("[multiDateCostPrices] entries loaded:", allEntries.length, "dates:", uniquePedidoDates.length);

      // Build per-date cost map
      const result: Record<string, Record<string, number>> = {};
      const dateSet = new Set(uniquePedidoDates);

      for (const targetDate of dateSet) {
        const priceMap: Record<string, number> = {};

        // entries on exact date
        const hasOnDate = new Set<string>();
        for (const e of allEntries) {
          const d = e.entry_date;
          if (d === targetDate) {
            hasOnDate.add(e.produto_id);
            const c = Number(e.preco_custo);
            if (!priceMap[e.produto_id] || c > priceMap[e.produto_id]) {
              priceMap[e.produto_id] = c;
            }
          }
        }

        // fallback to most recent previous date
        const fallbackDate: Record<string, string> = {};
        const fallbackPrice: Record<string, number> = {};
        for (const e of allEntries) {
          const d = e.entry_date;
          if (!d || d >= targetDate || hasOnDate.has(e.produto_id)) continue;
          const c = Number(e.preco_custo);
          if (!fallbackDate[e.produto_id] || d > fallbackDate[e.produto_id]) {
            fallbackDate[e.produto_id] = d;
            fallbackPrice[e.produto_id] = c;
          } else if (d === fallbackDate[e.produto_id] && c > fallbackPrice[e.produto_id]) {
            fallbackPrice[e.produto_id] = c;
          }
        }
        for (const [pid, price] of Object.entries(fallbackPrice)) {
          if (!priceMap[pid]) priceMap[pid] = price;
        }

        // overrides take priority
        for (const o of (overrides || [])) {
          if (o.data === targetDate) {
            priceMap[o.produto_id] = Number(o.preco_custo);
          }
        }

        result[targetDate] = priceMap;
      }

      return result;
    },
    enabled: uniquePedidoDates.length > 0,
  }) as { data: Record<string, Record<string, number>> };
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: async () => { const { data } = await supabase.from("clientes").select("*").order("nome"); return data || []; } });
  const { data: produtos = [] } = useQuery({ queryKey: ["produtos"], queryFn: async () => await fetchProdutosUpTo(5000) });

  const { data: cliTemplates = [] } = useQuery({
    queryKey: ["cliente-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cliente_templates")
        .select("*, clientes(nome), itens_cliente_template(*, produtos(descricao, unidade))")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const templatesForCliente = cliTemplates.filter((t: any) => t.cliente_id === clienteId);

  const importCliTemplate = async (templateId: string) => {
    const template = cliTemplates.find((t: any) => t.id === templateId);
    if (!template) return;
    try {
      const oid = await ensureOrder();
      for (const ti of (template.itens_cliente_template || [])) {
        if (itens.some(i => i.produto_id === ti.produto_id)) continue;
        // Se o template tem preço definido (> 0), usa ele; senão calcula custo + margem
        const preco = Number(ti.preco) > 0 ? Number(ti.preco) : getSuggestedPrice(ti.produto_id);
        const { data: saved, error } = await supabase.from("itens_saida")
          .insert({ pedido_id: oid, produto_id: ti.produto_id, quantidade: ti.quantidade, preco, is_baixa_ambulante: false })
          .select().single();
        if (error) throw error;
        setItens(prev => [...prev, { _key: `ct_${saved.id}`, id: saved.id, produto_id: ti.produto_id, quantidade: Number(ti.quantidade), preco }]);
      }
      qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
      toast({ title: `Itens do "${template.nome}" importados!` });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }
  };

  // Produtos com entrada nos últimos 15 dias em relação à data do pedido
  const { data: entradasRecentes = [] } = useQuery({
    queryKey: ["entradas-recentes-produtos-admin", data],
    queryFn: async () => {
      const refDate = new Date(data + "T00:00:00");
      refDate.setDate(refDate.getDate() - 15);
      const startDate = localDateStr(refDate);
      const { data: items } = await supabase
        .from("itens_entrada")
        .select("produto_id, pedidos_entrada!inner(data)")
        .gte("pedidos_entrada.data", startDate)
        .lte("pedidos_entrada.data", data);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });
  // Produtos já digitados em saídas na mesma data
  const { data: saidasRecentesDoDia = [] } = useQuery({
    queryKey: ["saidas-do-dia-produtos-admin", data],
    queryFn: async () => {
      const { data: items } = await supabase
        .from("itens_saida")
        .select("produto_id, pedidos_saida!inner(data)")
        .eq("pedidos_saida.data", data);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });
  const produtosPrioritarios = new Set([...entradasRecentes, ...saidasRecentesDoDia]);
  const { data: ambulantes = [] } = useQuery({
    queryKey: ["ambulantes_saida", motoristaId, data],
    queryFn: async () => {
      const { data: d } = await supabase.from("ambulantes")
        .select("*, itens_ambulante(*, produtos(descricao, unidade))")
        .eq("motorista_id", motoristaId).eq("data", data);
      return d || [];
    },
    enabled: !!motoristaId,
  });

  // currentStock: itens_ambulante.quantidade IS the saldo now (trigger auto-decrements)
  const currentStock = (() => {
    const stock = new Map<string, { descricao: string; unidade: string; total: number; baixado: number }>();
    (ambulantes as any[]).forEach((a: any) => {
      (a.itens_ambulante || []).forEach((i: any) => {
        const cur = stock.get(i.produto_id) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", total: 0, baixado: 0 };
        cur.total += Number(i.quantidade);
        stock.set(i.produto_id, cur);
      });
    });
    return stock;
  })();

  const remove = async (id: string) => {
    const { error } = await supabase.from("pedidos_saida").delete().eq("id", id);
    if (!error) { qc.invalidateQueries({ queryKey: ["pedidos_saida"] }); toast({ title: "Excluído!" }); }
  };


  const resetForm = () => { setEditId(null); setOriginalMotoristaId(null); setOriginalData(null); setAutoOrderId(null); setMotoristaId(""); setClienteId(""); setData(localToday()); setItens([]); setDesconto(0); setCustomDesconto(""); setIsCustomDesconto(false); setObservacao(""); setTipoPagamento("pendente"); setParcialValor(""); setValorPagoParcial(""); };

  const startEdit = (p: any) => {
    const parcialExistente = extractPartialPaymentValue(p.observacao);
    setEditId(p.id);
    setOriginalMotoristaId(p.motorista_id);
    setOriginalData(p.data);
    setMotoristaId(p.motorista_id);
    setClienteId(p.cliente_id);
    setData(p.data);
    setItens((p.itens_saida || []).map((i: any) => ({ _key: `s_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: i.quantidade, preco: i.preco, is_baixa_ambulante: i.is_baixa_ambulante || false })));
    const disc = Number(p.desconto) || 0; setDesconto(disc); setCustomDesconto(disc > 0 && !DISCOUNT_PRESETS.includes(disc) ? String(disc) : ""); setIsCustomDesconto(disc > 0 && !DISCOUNT_PRESETS.includes(disc));
    setObservacao(stripPartialPaymentObservation(p.observacao || ""));
    setTipoPagamento(p.tipo_pagamento || "pendente");
    setValorPagoParcial(parcialExistente ? parcialExistente.toFixed(2) : "");
    setOpen(true);
  };

  const handleDialogClose = async () => {
    if (autoOrderId && itens.length === 0) {
      await supabase.from("pedidos_saida").delete().eq("id", autoOrderId);
    } else if (autoOrderId && itens.length > 0) {
      // Salvar observação/desconto/tipo_pagamento para pedidos auto-criados ao fechar
      const observacaoFinal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0
        ? upsertPartialPaymentObservation(observacaoRef.current, Number(valorPagoParcial))
        : stripPartialPaymentObservation(observacaoRef.current);
      await supabase.from("pedidos_saida").update({ observacao: observacaoFinal, tipo_pagamento: tipoPagamento, desconto: descontoRef.current } as any).eq("id", autoOrderId);
    }

    // Salvar mudanças de motorista/cliente/data ao fechar o diálogo
    if (editId && motoristaId && clienteId) {
      const mudouMotorista = !!originalMotoristaId && motoristaId !== originalMotoristaId;
      const dataOriginalPedido = originalData || data;

      const baixaIds: string[] = [];
      const baixaPorProduto = new Map<string, number>();

      if (mudouMotorista) {
        const { data: baixasAtuais } = await supabase
          .from("itens_saida")
          .select("id, produto_id, quantidade")
          .eq("pedido_id", editId)
          .eq("is_baixa_ambulante", true);

        for (const b of baixasAtuais || []) {
          baixaIds.push(b.id);
          baixaPorProduto.set(
            b.produto_id,
            (baixaPorProduto.get(b.produto_id) || 0) + Number(b.quantidade || 0)
          );
        }
      }

      const observacaoFinal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0
        ? upsertPartialPaymentObservation(observacaoRef.current, Number(valorPagoParcial))
        : stripPartialPaymentObservation(observacaoRef.current);

      await supabase.from("pedidos_saida").update({ motorista_id: motoristaId, cliente_id: clienteId, data, observacao: observacaoFinal, tipo_pagamento: tipoPagamento, desconto: descontoRef.current } as any).eq("id", editId);

      // Se trocou o motorista, converter baixas em saída normal (trigger auto-incrementa ambulante do motorista antigo)
      if (mudouMotorista && baixaIds.length > 0) {
        await supabase.from("itens_saida").update({ is_baixa_ambulante: false }).in("id", baixaIds);
      }
    }

    resetForm();
    qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
    qc.invalidateQueries({ queryKey: ["ambulantes_saida"] });
  };

  const ensureOrder = async (): Promise<string> => {
    const currentId = orderId || autoOrderIdRef.current;
    const observacaoFinal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0
      ? upsertPartialPaymentObservation(observacao.trim(), Number(valorPagoParcial))
      : stripPartialPaymentObservation(observacao.trim());
    if (currentId) {
      await supabase.from("pedidos_saida").update({ motorista_id: motoristaId, cliente_id: clienteId, data, observacao: observacaoFinal, tipo_pagamento: tipoPagamento, desconto } as any).eq("id", currentId);
      return currentId;
    }
    if (!motoristaId) throw new Error("Selecione o motorista");
    if (!clienteId) throw new Error("Selecione o cliente");
    const { data: pedido, error } = await supabase.from("pedidos_saida")
      .insert({ motorista_id: motoristaId, cliente_id: clienteId, data, created_by: user?.id, tipo_pagamento: tipoPagamento, desconto } as any)
      .select().single();
    if (error) throw error;
    setAutoOrderId(pedido.id);
    return pedido.id;
  };

  const handleAddItem = useCallback(async (item: any, _isBaixa: boolean) => {
    try {
      const oid = await ensureOrder();
      const { data: saved, error } = await supabase.from("itens_saida")
        .insert({ pedido_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: item.preco || 0, is_baixa_ambulante: item.is_baixa_ambulante || false })
        .select().single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
      qc.invalidateQueries({ queryKey: ["ambulantes_saida"] });
      return { id: saved.id };
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      throw e;
    }
  }, [orderId, motoristaId, clienteId, data, user?.id]);

  const handleEditItem = useCallback(async (item: any) => {
    if (!item.id) return;
    await supabase.from("itens_saida").update({ quantidade: item.quantidade, preco: item.preco }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
  }, []);

  const handleRemoveItem = useCallback(async (item: any) => {
    if (!item.id) return;
    await supabase.from("itens_saida").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
    qc.invalidateQueries({ queryKey: ["ambulantes_saida"] });
  }, []);

  const [inlinePrintChoice, setInlinePrintChoice] = useState(false);

  const handlePrint80mm = async () => {
    if (isBluetoothSupported()) {
      setInlinePrintChoice(true);
      return;
    }
    const oid = orderId;
    if (!oid) return;
    const { data: fullOrder } = await supabase.from("pedidos_saida")
      .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
      .eq("id", oid).single();
    if (fullOrder) printSaida80mm({ ...fullOrder, observacao: observacaoRef.current || fullOrder.observacao }, desconto);
  };

  const handleInlineBtPrint = async () => {
    const oid = orderId;
    if (!oid) return;
    try {
      const { data: full } = await supabase.from("pedidos_saida")
        .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
        .eq("id", oid).single();
      if (full) await btPrintSaida({ ...full, observacao: observacaoRef.current || full.observacao }, desconto);
      toast({ title: "Impresso via Bluetooth!" });
    } catch (e: any) {
      toast({ title: "Erro Bluetooth", description: e.message, variant: "destructive" });
    }
    setInlinePrintChoice(false);
  };

  const handleInlinePdfPrint = async () => {
    const oid = orderId;
    if (!oid) return;
    const { data: fullOrder } = await supabase.from("pedidos_saida")
      .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
      .eq("id", oid).single();
    if (fullOrder) printSaida80mm({ ...fullOrder, observacao: observacaoRef.current || fullOrder.observacao }, desconto);
    setInlinePrintChoice(false);
  };

  const handlePrintA4 = async () => {
    const oid = orderId;
    if (!oid) return;
    const { data: fullOrder } = await supabase.from("pedidos_saida")
      .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
      .eq("id", oid).single();
    if (fullOrder) printSaidaA4(fullOrder, desconto, observacao);
  };

  const motoristaOptions = motoristas.filter(m => m.user_id).map(m => ({ value: m.id, label: m.nome }));
  const clienteOptions = clientes.map(c => ({ value: c.id, label: c.nome }));
  const produtoOptions = produtos.map(p => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Pedidos de Saída</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Checkbox id="show-archived-saidas" checked={showArchived} onCheckedChange={v => { setShowArchived(!!v); if (!v) timeWindow.reset(); }} />
            <label htmlFor="show-archived-saidas" className="text-sm cursor-pointer text-muted-foreground">Incluir faturados</label>
            <TimeWindowControl
              label={timeWindow.label}
              nextLabel={timeWindow.nextLabel}
              canExpand={timeWindow.canExpand}
              onExpand={timeWindow.expand}
              showHint={showArchived}
            />
          </div>
        </div>
        <Dialog open={open} onOpenChange={v => { if (!v) handleDialogClose(); setOpen(v); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova Saída</Button></DialogTrigger>
          <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
            <div className="rounded-lg border bg-muted/40 px-2 py-1.5 space-y-1.5">
              <Button variant="ghost" className="w-full justify-center gap-1.5 h-7 text-xs font-semibold" onClick={() => { handleDialogClose(); setOpen(false); }}>
                <ArrowLeft className="h-3.5 w-3.5" />
                {editId ? "Editar" : "Nova"} Saída — Voltar
              </Button>
              <div className="grid grid-cols-3 gap-1.5">
                <SearchableSelect options={motoristaOptions} value={motoristaId} onValueChange={(v) => { setMotoristaId(v); const oid = editId || autoOrderIdRef.current; if (oid && v) { supabase.from("pedidos_saida").update({ motorista_id: v } as any).eq("id", oid).then(() => qc.invalidateQueries({ queryKey: ["pedidos_saida"] })); } }} placeholder="Motorista" />
                <SearchableSelect options={clienteOptions} value={clienteId} onValueChange={(v) => { setClienteId(v); const oid = editId || autoOrderIdRef.current; if (oid && v) { supabase.from("pedidos_saida").update({ cliente_id: v } as any).eq("id", oid).then(() => qc.invalidateQueries({ queryKey: ["pedidos_saida"] })); } }} placeholder="Cliente" />
                <DatePicker value={data} onChange={guardedDateChange} className="w-full" />
              </div>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto pr-1">

              {clienteId && templatesForCliente.length > 0 && (
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <Select onValueChange={(id) => {
                    const tpl = templatesForCliente.find((t: any) => t.id === id);
                    if (tpl) setConfirmImportTpl(tpl);
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Importar pedido fixo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesForCliente.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome} ({(t.itens_cliente_template || []).length} itens)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <OrderItemsEditor
                items={itens}
                setItems={setItens}
                produtoOptions={produtoOptions}
                priceField="preco"
                getSuggestedPrice={getSuggestedPrice}
                showAmbulanteButton={true}
                currentStock={currentStock}
                onAddItem={handleAddItem}
                onEditItem={handleEditItem}
                onRemoveItem={handleRemoveItem}
                priorityProductIds={produtosPrioritarios}
                orderDate={data}
                showCooperfloraButton
                companySaldo={companySaldo}
                companySaldoLoading={companySaldoLoading}
                cooperfloraStage={cooperfloraStage}
                onCooperfloraStageChange={setCooperfloraStage}
              />
              {/* Desconto + Observação inline */}
              <div className="flex items-center gap-1">
                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant={desconto > 0 ? "default" : "outline"} className="h-8 px-2 gap-1 text-xs">
                      <Percent className="h-3.5 w-3.5" />
                      {desconto > 0 ? `${desconto}%` : "0"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant={desconto === 0 && !isCustomDesconto ? "default" : "outline"} onClick={() => { setDesconto(0); setIsCustomDesconto(false); setCustomDesconto(""); }} className="h-7 px-2 text-xs">Sem</Button>
                      {DISCOUNT_PRESETS.map(p => (
                        <Button key={p} type="button" size="sm" variant={desconto === p && !isCustomDesconto ? "default" : "outline"} onClick={() => { setDesconto(p); setIsCustomDesconto(false); setCustomDesconto(""); }} className="h-7 px-2 text-xs">{p}%</Button>
                      ))}
                      <Button type="button" size="sm" variant={isCustomDesconto ? "default" : "outline"} onClick={() => { setIsCustomDesconto(true); setCustomDesconto(desconto > 0 ? String(desconto) : ""); }} className="h-7 px-2 text-xs">Outro</Button>
                      {isCustomDesconto && (
                        <div className="flex items-center gap-1">
                          <Input type="number" value={customDesconto} onChange={e => { setCustomDesconto(e.target.value); const n = Number(e.target.value); if (!isNaN(n) && n >= 0) setDesconto(n); }} className="h-7 w-14 text-xs" min={0} max={100} step={1} placeholder="%" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>
                    {desconto > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Total c/ desconto: R$ {((itens.reduce((s, i) => s + i.quantidade * i.preco, 0)) * (1 - desconto / 100)).toFixed(2)}
                      </p>
                    )}
                  </PopoverContent>
                </Popover>

                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant={observacao.trim() ? "default" : "outline"} className="h-8 w-8 p-0">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Observação (cabeçalho A4)</Label>
                      <Textarea
                        value={stripCochoFromObs(observacao)}
                        onChange={e => {
                          const cochoMatch = observacao.match(/\[COCHO:preto=\d+,velling=\d+,quebrado=\d+\]/);
                          const newText = e.target.value + (cochoMatch ? ` ${cochoMatch[0]}` : "");
                          setObservacao(newText);
                        }}
                        onKeyDown={e => e.stopPropagation()}
                        placeholder="Digite a observação..."
                        className="min-h-[80px] text-sm"
                      />
                      {stripCochoFromObs(observacao).trim() && (
                        <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => {
                          const cochoMatch = observacao.match(/\[COCHO:preto=\d+,velling=\d+,quebrado=\d+\]/);
                          setObservacao(cochoMatch ? cochoMatch[0] : "");
                        }}>
                          Limpar
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <CochoButton observacao={observacao} onObservacaoChange={setObservacao} />

                {orderId && itens.length > 0 && (
                  <>
                    <Button type="button" size="sm" variant="secondary" className="h-8 px-2 gap-1 text-xs" onClick={handlePrint80mm}>
                      <Printer className="h-3.5 w-3.5" />80mm
                    </Button>
                    <Button type="button" size="sm" variant="secondary" className="h-8 px-2 gap-1 text-xs" onClick={handlePrintA4}>
                      <Printer className="h-3.5 w-3.5" />A4
                    </Button>
                  </>
                )}

                <Select value={tipoPagamento} onValueChange={async (v) => {
                  if (v === "parcial") {
                    setParcialDialog({ orderId: orderId || "" });
                    setParcialValor(valorPagoParcial);
                    return;
                  }
                  setTipoPagamento(v);
                  if (v !== "parcial") setValorPagoParcial("");
                  if (orderId) {
                    await supabase.from("pedidos_saida").update({ tipo_pagamento: v } as any).eq("id", orderId);
                    qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
                  }
                }}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="avista">À vista</SelectItem>
                    <SelectItem value="aprazo">A prazo</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                  </SelectContent>
              </Select>
              </div>

              {/* Subtotal / Desconto / Total Final */}
              {itens.length > 0 && (() => {
                const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
                const totalFinal = desconto > 0 ? subtotal * (1 - desconto / 100) : subtotal;
                const parcialVal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0 ? Number(valorPagoParcial) : null;
                return (
                  <div className="rounded-md border bg-muted/40 p-2 space-y-0.5 text-sm">
                    {desconto > 0 ? (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
                        <div className="flex justify-between text-destructive"><span>Desconto ({desconto}%)</span><span>- R$ {(subtotal - totalFinal).toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold text-base"><span>Total Final</span><span>R$ {totalFinal.toFixed(2)}</span></div>
                      </>
                    ) : (
                      <div className="flex justify-between font-bold"><span>Total</span><span>R$ {subtotal.toFixed(2)}</span></div>
                    )}
                    {parcialVal !== null && (
                      <>
                        <div className="flex justify-between text-blue-600"><span>Pagou</span><span>R$ {parcialVal.toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold text-amber-600"><span>Ficou</span><span>R$ {(totalFinal - parcialVal).toFixed(2)}</span></div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>


      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {isFinanceiro ? (
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Pedidos até</Label>
            <DatePicker value={filterDate} onChange={setFilterDate} />
            {filterDate && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFilterDate("")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <select
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as datas</option>
            {[...new Set(pedidos.filter((p: any) => !isFinanceiro || !terceirizadoIds.has(p.motorista_id)).map((p: any) => p.data))].sort().reverse().map(d => (
              <option key={d} value={d}>{d.split("-").reverse().join("/")}</option>
            ))}
          </select>
        )}
        <select
          value={filterMotorista}
          onChange={e => setFilterMotorista(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos motoristas</option>
          {[...new Set(pedidos.filter((p: any) => !isFinanceiro || !terceirizadoIds.has(p.motorista_id)).map((p: any) => p.motorista_id))].map(mid => {
            const nome = pedidos.find((p: any) => p.motorista_id === mid)?.motoristas?.nome || "—";
            return <option key={mid} value={mid}>{nome}</option>;
          })}
        </select>
        <select
          value={filterPagamento}
          onChange={e => setFilterPagamento(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos pagamentos</option>
           <option value="pendente">Pendente</option>
           <option value="avista">À vista</option>
           <option value="aprazo">A prazo</option>
           <option value="parcial">Parcial</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filterCliente}
            onChange={e => setFilterCliente(e.target.value)}
            placeholder="Buscar cliente..."
            className="h-9 pl-8 w-44 text-sm"
          />
        </div>
        {(filterDate || filterMotorista || filterCliente || filterPagamento) && (
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setFilterDate(""); setFilterMotorista(""); setFilterCliente(""); setFilterPagamento(""); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
        {(() => {
          const filtered = pedidos
            .filter((p: any) => !isFinanceiro || !terceirizadoIds.has(p.motorista_id))
            .filter((p: any) => !filterDate || (isFinanceiro ? p.data <= filterDate : p.data === filterDate))
            .filter((p: any) => !filterMotorista || p.motorista_id === filterMotorista)
            .filter((p: any) => !filterCliente || (p.clientes?.nome || "").toLowerCase().includes(filterCliente.toLowerCase()))
            .filter((p: any) => !filterPagamento || (p.tipo_pagamento || "pendente") === filterPagamento);
          return (filterDate || filterMotorista || filterCliente || filterPagamento) ? (
            <span className="text-sm text-muted-foreground font-medium">{filtered.length} pedido{filtered.length !== 1 ? "s" : ""}</span>
          ) : null;
        })()}
      </div>

      {isLoading ? <p>Carregando...</p> : (() => {
        const filteredPedidos = pedidos
          .filter((p: any) => !isFinanceiro || !terceirizadoIds.has(p.motorista_id))
          .filter((p: any) => !filterDate || (isFinanceiro ? p.data <= filterDate : p.data === filterDate))
          .filter((p: any) => !filterMotorista || p.motorista_id === filterMotorista)
          .filter((p: any) => !filterCliente || (p.clientes?.nome || "").toLowerCase().includes(filterCliente.toLowerCase()))
          .filter((p: any) => !filterPagamento || (p.tipo_pagamento || "pendente") === filterPagamento);
        return (
          <SaidasListBody
            filteredPedidos={filteredPedidos}
            filterDate={filterDate}
            filterMotorista={filterMotorista}
            filterCliente={filterCliente}
            filterPagamento={filterPagamento}
            multiDateCostPrices={multiDateCostPrices}
            startEdit={startEdit}
            setPrintTarget={setPrintTarget}
            setConfirmAction={setConfirmAction}
            setFaturarValorPago={setFaturarValorPago}
          />
        );
      })()}

      {/* Confirm action dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => { if (!v) { setConfirmAction(null); setFaturarValorPago(""); setFaturarObs(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.type === "faturar" ? "Faturar Pedido" : "Excluir Pedido"}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!confirmAction) return "";
                const p = confirmAction.pedido;
                const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
                const orderDesconto = Number(p.desconto) || 0;
                const total = orderDesconto > 0 ? subtotal * (1 - orderDesconto / 100) : subtotal;
                const dataFmt = p.data.split("-").reverse().join("/");
                const cliente = p.clientes?.nome || "—";
                const motorista = p.motoristas?.nome || "—";
                const tp = p.tipo_pagamento || "pendente";
                const tpLabel = tp === "avista" ? "À vista" : tp === "aprazo" ? "A prazo" : tp === "parcial" ? "Parcial" : tp;
                if (confirmAction.type === "faturar") {
                  return `Faturar pedido do cliente ${cliente} (motorista ${motorista}), data ${dataFmt}, valor R$ ${total.toFixed(2)} como "${tpLabel}"? O pedido será enviado para o Financeiro.`;
                }
                return `Deseja realmente excluir o pedido do cliente ${cliente} (motorista ${motorista}), com data ${dataFmt}, no valor de R$ ${total.toFixed(2)}?`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmAction?.type === "faturar" && confirmAction.pedido.tipo_pagamento === "parcial" && (
            <div className="px-1 pb-2">
              <Label className="text-sm">Valor já pago (R$)</Label>
              <Input type="number" value={faturarValorPago} onChange={e => setFaturarValorPago(e.target.value)} placeholder="0.00" min={0} step={0.01} />
            </div>
          )}
          {confirmAction?.type === "faturar" && (
            <div className="px-1 pb-2">
              <Label className="text-sm">Observação (opcional)</Label>
              <Input value={faturarObs} onChange={e => setFaturarObs(e.target.value)} placeholder="Obs do faturamento..." />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!confirmAction) return;
              const p = confirmAction.pedido;
              if (confirmAction.type === "faturar") {
                const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
                const orderDesconto = Number(p.desconto) || 0;
                const total = orderDesconto > 0 ? subtotal * (1 - orderDesconto / 100) : subtotal;
                const tp = p.tipo_pagamento || "aprazo";
                let valorPago = 0;
                if (tp === "avista") {
                  valorPago = total;
                } else if (tp === "parcial") {
                  valorPago = Number(faturarValorPago) || 0;
                  if (valorPago <= 0 || valorPago >= total) {
                    toast({ title: "Informe um valor parcial válido (entre 0 e o total)", variant: "destructive" });
                    return;
                  }
                }
                const status = tp === "avista" ? "pago" : valorPago > 0 ? "parcial" : "aberto";

                await supabase.from("pedidos_saida").update({ archived: true } as any).eq("id", p.id);
                const { data: existing } = await supabase.from("financeiro_receber").select("id").eq("pedido_saida_id", p.id).maybeSingle();
                let finId: string | null = existing?.id || null;
                if (!existing) {
                  const { data: novoRec } = await supabase.from("financeiro_receber").insert({
                    pedido_saida_id: p.id,
                    cliente_id: p.cliente_id,
                    motorista_id: p.motorista_id,
                    data_venda: p.data,
                    valor_total: total,
                    valor_pago: valorPago,
                    status,
                    tipo_pagamento: tp,
                    observacao: faturarObs.trim() || "",
                  } as any).select("id").single();
                  finId = novoRec?.id || null;
                }
                if (finId && (tp === "avista" || tp === "parcial") && valorPago > 0) {
                  await registrarPagamentoFaturamento({
                    financeiroId: finId,
                    clienteId: p.cliente_id,
                    motoristaId: p.motorista_id,
                    valorPago,
                    dataPagamento: p.data,
                    tipoPagamento: tp as "avista" | "parcial",
                    userId: user?.id,
                    observacaoExtra: faturarObs.trim() || undefined,
                  });
                }
                // Cochos: sempre somar ao saldo do cliente (controle manual via cobrança)
                const cocho = parseCochoFromObs(p.observacao);
                if (cochoHasValues(cocho)) {
                  await mergeCochoIntoCliente(p.cliente_id, cocho);
                }
                qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
                qc.invalidateQueries({ queryKey: ["financeiro_receber"] });
                qc.invalidateQueries({ queryKey: ["pagamentos"] });
                qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
                qc.invalidateQueries({ queryKey: ["cochos_cliente"] });
                toast({ title: "Pedido faturado!" });
                setFaturarValorPago("");
                setFaturarObs("");
              } else {
                remove(p.id);
              }
              setConfirmAction(null);
            }}>{confirmAction?.type === "faturar" ? "Faturar" : "Excluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Print choice dialog */}
      <AlertDialog open={!!printTarget} onOpenChange={(v) => { if (!v) setPrintTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Imprimir Pedido</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => { const sub = (printTarget?.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0); const d = Number(printTarget?.desconto) || 0; return `${printTarget?.clientes?.nome || ""} — R$ ${(d > 0 ? sub * (1 - d / 100) : sub).toFixed(2)}${d > 0 ? ` (${d}% desc.)` : ""}`; })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            {isBluetoothSupported() && (
              <Button className="w-full" variant="default" onClick={async () => {
                try {
                  const { data: full } = await supabase.from("pedidos_saida")
                    .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
                    .eq("id", printTarget.id).single();
                  if (full) await btPrintSaida(full, Number(full.desconto) || 0);
                  toast({ title: "Impresso via Bluetooth!" });
                } catch (e: any) {
                  toast({ title: "Erro Bluetooth", description: e.message, variant: "destructive" });
                }
                setPrintTarget(null);
              }}>
                <Bluetooth className="mr-2 h-4 w-4" />Bluetooth 80mm
              </Button>
            )}
            <div className="flex gap-3">
              <Button className="flex-1" variant="secondary" onClick={async () => {
                const { data: full } = await supabase.from("pedidos_saida")
                  .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
                  .eq("id", printTarget.id).single();
                if (full) printSaida80mm(full, Number(full.desconto) || 0);
                setPrintTarget(null);
              }}>
                <Printer className="mr-2 h-4 w-4" />80mm PDF
              </Button>
              <Button className="flex-1" variant="secondary" onClick={async () => {
                const { data: full } = await supabase.from("pedidos_saida")
                  .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
                  .eq("id", printTarget.id).single();
                if (full) printSaidaA4(full, Number(full.desconto) || 0, full.observacao || "");
                setPrintTarget(null);
              }}>
                <Printer className="mr-2 h-4 w-4" />A4
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline print choice (inside order dialog) */}
      <AlertDialog open={inlinePrintChoice} onOpenChange={(v) => { if (!v) setInlinePrintChoice(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Imprimir 80mm</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <Button className="w-full" variant="default" onClick={handleInlineBtPrint}>
              <Bluetooth className="mr-2 h-4 w-4" />Bluetooth 80mm
            </Button>
            <Button className="w-full" variant="secondary" onClick={handleInlinePdfPrint}>
              <Printer className="mr-2 h-4 w-4" />80mm PDF
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pastDateDialog}

      {/* Dialog valor parcial */}
      <Dialog open={!!parcialDialog} onOpenChange={(o) => { if (!o) setParcialDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Valor pago (parcial)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Valor recebido (R$)</Label>
            <Input type="number" min="0" step="0.01" value={parcialValor} onChange={e => setParcialValor(e.target.value)} placeholder="0.00" autoFocus />
            <Button className="w-full" onClick={async () => {
              const valor = Number(parcialValor);
              if (valor <= 0) { toast({ title: "Informe um valor maior que zero", variant: "destructive" }); return; }
              setTipoPagamento("parcial");
              setValorPagoParcial(valor.toFixed(2));
              const oid = parcialDialog?.orderId;
              if (oid) {
                await supabase.from("pedidos_saida").update({ tipo_pagamento: "parcial", observacao: upsertPartialPaymentObservation(observacaoRef.current, valor) } as any).eq("id", oid);
                qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
              }
              setParcialDialog(null);
              toast({ title: `Parcial: R$ ${valor.toFixed(2)} registrado` });
            }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!confirmImportTpl} onOpenChange={(o) => !o && setConfirmImportTpl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente puxar os {(confirmImportTpl?.itens_cliente_template || []).length} itens do pedido fixo "{confirmImportTpl?.nome}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmImportTpl) importCliTemplate(confirmImportTpl.id); setConfirmImportTpl(null); }}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
