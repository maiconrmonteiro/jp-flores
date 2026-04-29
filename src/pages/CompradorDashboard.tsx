import { useState, useCallback } from "react";
import { getNextOperationDate } from "@/lib/utils";
import { useCompanySaldo } from "@/hooks/use-company-saldo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Printer, LogOut, CalendarIcon, X, ArrowLeft, Search, KeyRound } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { printEntrada80mm } from "@/lib/print";
import { usePastDateGuard } from "@/components/PastDateGuard";
import { SearchableSelect } from "@/components/SearchableSelect";
import OrderItemsEditor from "@/components/OrderItemsEditor";
import OfflineIndicator from "@/components/OfflineIndicator";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { enqueue } from "@/lib/offline-queue";
import { getCachedData, setCachedData } from "@/lib/offline-cache";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";

interface ItemEntrada { _key?: string; id?: string; produto_id: string; quantidade: number; preco_custo: number; }

function CompradorPedidosList({ filteredPedidos, filterDate, filterFornecedor, filterPagamento, startEdit }: any) {
  const { visibleItems, sentinelRef, hasMore, total, visibleCount } = useInfiniteScroll(
    filteredPedidos,
    [filterDate, filterFornecedor, filterPagamento],
  );
  return (
    <>
      {/* Mobile list */}
      <div className="md:hidden space-y-1">
        {visibleItems.map((p: any) => {
          const subtotal = (p.itens_entrada || []).reduce((s: number, i: any) => s + i.quantidade * i.preco_custo, 0);
          const desc = p.desconto || 0;
          const total = Math.max(0, subtotal - desc);
          const pagStatus = p.tipo_pagamento || "pendente";
          const pagLabel = pagStatus === "avista" ? "À vista" : pagStatus === "aprazo" ? "A prazo" : pagStatus === "apcasa" ? "AP Casa" : "Pendente";
          const pagColor = pagStatus === "avista" ? "text-green-600" : pagStatus === "aprazo" ? "text-orange-500" : pagStatus === "apcasa" ? "text-purple-600" : "text-muted-foreground";
          return (
            <div key={p.id} className="border rounded-lg p-2 cursor-pointer active:bg-accent/50" onClick={() => startEdit(p)}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{p.data.split("-").reverse().join("/")}</span>
                <span className="font-medium text-sm truncate flex-1 ml-2">{p.fornecedores?.nome}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  {desc > 0 && <span className="text-xs text-muted-foreground line-through">R$ {subtotal.toFixed(2)}</span>}
                  <span className="text-sm font-semibold">R$ {total.toFixed(2)}</span>
                  <span className={`text-xs font-medium ${pagColor}`}>{pagLabel}</span>
                </div>
                <div className="flex gap-0" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => printEntrada80mm(p)}><Printer className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <Table className="hidden md:table">
        <TableHeader><TableRow>
          <TableHead className="w-[12%]">Data</TableHead><TableHead>Fornecedor</TableHead><TableHead className="w-[12%]">Pagamento</TableHead><TableHead className="w-[12%]">Total</TableHead><TableHead className="w-24">Ações</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {visibleItems.map((p: any) => {
            const subtotal = (p.itens_entrada || []).reduce((s: number, i: any) => s + i.quantidade * i.preco_custo, 0);
            const desc = p.desconto || 0;
            const total = Math.max(0, subtotal - desc);
            const pagStatus = p.tipo_pagamento || "pendente";
            const pagLabel = pagStatus === "avista" ? "À vista" : pagStatus === "aprazo" ? "A prazo" : pagStatus === "apcasa" ? "AP Casa" : "Pendente";
            const pagColor = pagStatus === "avista" ? "text-green-600" : pagStatus === "aprazo" ? "text-orange-500" : pagStatus === "apcasa" ? "text-purple-600" : "text-muted-foreground";
            return (
              <TableRow key={p.id} className="cursor-pointer h-9" onClick={() => startEdit(p)}>
                <TableCell>{p.data.split("-").reverse().join("/")}</TableCell>
                <TableCell>{p.fornecedores?.nome}</TableCell>
                <TableCell><span className={`text-sm font-medium ${pagColor}`}>{pagLabel}</span></TableCell>
                <TableCell>
                  {desc > 0 && <span className="text-xs text-muted-foreground line-through mr-1">R$ {subtotal.toFixed(2)}</span>}
                  R$ {total.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => printEntrada80mm(p)}><Printer className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} visibleCount={visibleCount} total={total} />
    </>
  );
}

export default function CompradorDashboard() {
  const { user, role, loading, signOut } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [autoOrderId, setAutoOrderId] = useState<string | null>(null);
  const [fornecedorId, setFornecedorId] = useState("");
  const [data, setData] = useState(() => getNextOperationDate());
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [cooperfloraStage, setCooperfloraStage] = useState<0 | 1 | 2>(0);
  const { data: companySaldo, isLoading: companySaldoLoading } = useCompanySaldo(data, cooperfloraStage >= 1);
  const [filterDate, setFilterDate] = useState("");
  const [filterFornecedor, setFilterFornecedor] = useState("");
  const [tipoPagamento, setTipoPagamento] = useState("pendente");
  const [filterPagamento, setFilterPagamento] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const { guardedOnChange: guardedDateChange, dialog: pastDateDialog } = usePastDateGuard(setData);

  const orderId = editId || autoOrderId;

  const { data: comprador } = useQuery({
    queryKey: ["my-comprador", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("compradores").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["comprador-pedidos-entrada", comprador?.id],
    queryFn: async () => {
      if (!comprador?.id) return [];
      const { data, error } = await supabase.from("pedidos_entrada")
        .select("*, fornecedores(nome), itens_entrada(*, produtos(descricao, unidade))")
        .eq("comprador_id", comprador.id)
        .order("data", { ascending: false });
      if (error) throw error;
      const sorted = (data || []).sort((a: any, b: any) => {
        if (b.data !== a.data) return b.data.localeCompare(a.data);
        return (a.fornecedores?.nome || "").localeCompare(b.fornecedores?.nome || "", "pt-BR");
      });
      setCachedData("comprador-pedidos-entrada", sorted);
      return sorted;
    },
    enabled: !!comprador?.id,
    initialData: () => getCachedData<any[]>("comprador-pedidos-entrada"),
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data } = await supabase.from("fornecedores").select("*").order("nome");
      const result = data || [];
      setCachedData("fornecedores", result);
      return result;
    },
    initialData: () => getCachedData<any[]>("fornecedores"),
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const result = await fetchProdutosUpTo(5000);
      setCachedData("produtos", result);
      return result;
    },
    initialData: () => getCachedData<any[]>("produtos"),
  });

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;
  if (role !== "comprador") return <Navigate to="/" replace />;

  const resetForm = () => { setEditId(null); setAutoOrderId(null); setFornecedorId(""); setData(getNextOperationDate()); setItens([]); setTipoPagamento("pendente"); setDesconto(0); };

  const startEdit = (p: any) => {
    setEditId(p.id);
    setFornecedorId(p.fornecedor_id);
    setData(p.data);
    setTipoPagamento(p.tipo_pagamento || "pendente");
    setDesconto(p.desconto || 0);
    setItens((p.itens_entrada || []).map((i: any) => ({ _key: `c_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: i.quantidade, preco_custo: i.preco_custo, qty_pedida: i.qty_pedida ?? i.quantidade })));
    setOpen(true);
  };

  const handleDialogClose = async () => {
    if (autoOrderId && itens.length === 0) {
      if (isOnline) {
        await supabase.from("pedidos_entrada").delete().eq("id", autoOrderId);
      } else {
        enqueue({ type: "delete", table: "pedidos_entrada", matchId: autoOrderId });
      }
    }
    resetForm();
    qc.invalidateQueries({ queryKey: ["comprador-pedidos-entrada"] });
  };

  const ensureOrder = async (): Promise<string> => {
    if (orderId) {
      if (isOnline) {
        await supabase.from("pedidos_entrada").update({ fornecedor_id: fornecedorId, data, tipo_pagamento: tipoPagamento, desconto }).eq("id", orderId);
      } else {
        enqueue({ type: "update", table: "pedidos_entrada", matchId: orderId, data: { fornecedor_id: fornecedorId, data, tipo_pagamento: tipoPagamento, desconto } });
      }
      return orderId;
    }
    if (!fornecedorId) throw new Error("Selecione o fornecedor antes de adicionar itens");
    if (!isOnline) throw new Error("É necessário estar online para criar um novo pedido");
    const { data: pedido, error } = await supabase.from("pedidos_entrada")
      .insert({ fornecedor_id: fornecedorId, data, created_by: user?.id, tipo_pagamento: tipoPagamento, comprador_id: comprador?.id })
      .select().single();
    if (error) throw error;
    setAutoOrderId(pedido.id);
    return pedido.id;
  };

  const handleAddItem = async (item: any, _isBaixa: boolean) => {
    try {
      const oid = await ensureOrder();
      if (isOnline) {
        const { data: saved, error } = await supabase.from("itens_entrada")
          .insert({ pedido_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco_custo: item.preco_custo || 0, qty_pedida: item.quantidade })
          .select().single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["comprador-pedidos-entrada"] });
        return { id: saved.id };
      } else {
        const tempId = `temp_${Date.now()}`;
        enqueue({ type: "insert", table: "itens_entrada", data: { pedido_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco_custo: item.preco_custo || 0, qty_pedida: item.quantidade } });
        return { id: tempId };
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const handleEditItem = async (item: any) => {
    if (!item.id) return;
    if (isOnline) {
      await supabase.from("itens_entrada").update({ quantidade: item.quantidade, preco_custo: item.preco_custo }).eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["comprador-pedidos-entrada"] });
    } else {
      enqueue({ type: "update", table: "itens_entrada", matchId: item.id, data: { quantidade: item.quantidade, preco_custo: item.preco_custo } });
    }
  };

  const handleRemoveItem = async (item: any) => {
    if (!item.id) return;
    if (isOnline) {
      await supabase.from("itens_entrada").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["comprador-pedidos-entrada"] });
    } else {
      enqueue({ type: "delete", table: "itens_entrada", matchId: item.id });
    }
  };

  const handlePrint = async () => {
    const oid = orderId;
    if (!oid) return;
    const { data: fullOrder } = await supabase.from("pedidos_entrada")
      .select("*, fornecedores(nome), itens_entrada(*, produtos(descricao, unidade))")
      .eq("id", oid).single();
    if (fullOrder) printEntrada80mm(fullOrder);
  };

  const fornecedorOptions = fornecedores.map(f => ({ value: f.id, label: f.nome }));
  const produtoOptions = produtos.map(p => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  return (
    <div className="max-w-4xl mx-auto p-4">
      <OfflineIndicator />
      <div className="flex items-center justify-between mb-4 rounded-lg p-3" style={{ background: "linear-gradient(135deg, hsl(142 50% 95%), hsl(142 40% 90%))" }}>
        <div className="flex items-center gap-3">
          <img src="/logo-jp-flores.png" alt="JP Flores" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">Painel do Comprador {comprador?.nome || ""}</h1>
          <ChangePasswordDialog />
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={v => { if (!v) handleDialogClose(); setOpen(v); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova Entrada</Button></DialogTrigger>
            <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
              <div className="rounded-lg border bg-muted/40 px-2 py-1.5 space-y-1.5">
                <Button variant="ghost" className="w-full justify-center gap-1.5 h-7 text-xs font-semibold" onClick={() => { handleDialogClose(); setOpen(false); }}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {editId ? "Editar" : "Nova"} Entrada — Voltar
                </Button>
                <div className="grid grid-cols-2 gap-1.5">
                  <SearchableSelect options={fornecedorOptions} value={fornecedorId} onValueChange={setFornecedorId} placeholder="Fornecedor" />
                  <DatePicker value={data} onChange={guardedDateChange} />
                </div>
              </div>
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">

                <OrderItemsEditor
                  items={itens}
                  setItems={setItens}
                  produtoOptions={produtoOptions}
                  priceField="preco_custo"
                  showQtyPedida
                  onAddItem={handleAddItem}
                  onEditItem={handleEditItem}
                  onRemoveItem={handleRemoveItem}
                  showCooperfloraButton
                  companySaldo={companySaldo}
                  companySaldoLoading={companySaldoLoading}
                  cooperfloraStage={cooperfloraStage}
                  onCooperfloraStageChange={setCooperfloraStage}
                />

                {(() => {
                  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_custo, 0);
                  const totalFinal = Math.max(0, subtotal - desconto);
                  return (
                    <div className="rounded-lg border bg-muted/40 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span>Subtotal:</span>
                        <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <Label className="text-sm">Desconto (R$):</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={desconto || ""}
                          onChange={async (e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setDesconto(val);
                            if (orderId) {
                              if (isOnline) {
                                await supabase.from("pedidos_entrada").update({ desconto: val }).eq("id", orderId);
                                qc.invalidateQueries({ queryKey: ["comprador-pedidos-entrada"] });
                              } else {
                                enqueue({ type: "update", table: "pedidos_entrada", matchId: orderId, data: { desconto: val } });
                              }
                            }
                          }}
                          className="w-28 h-8 text-right"
                        />
                      </div>
                      {desconto > 0 && (
                        <div className="flex items-center justify-between text-sm font-bold border-t pt-1.5">
                          <span>Total Final:</span>
                          <span>R$ {totalFinal.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Pagamento:</Label>
                    <select
                      value={tipoPagamento}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setTipoPagamento(val);
                        if (orderId && val) {
                          if (isOnline) {
                            await supabase.from("pedidos_entrada").update({ tipo_pagamento: val }).eq("id", orderId);
                            qc.invalidateQueries({ queryKey: ["comprador-pedidos-entrada"] });
                          } else {
                            enqueue({ type: "update", table: "pedidos_entrada", matchId: orderId, data: { tipo_pagamento: val } });
                          }
                        }
                      }}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="pendente">Pendente</option>
                      <option value="avista">À vista</option>
                      <option value="aprazo">A prazo</option>
                      <option value="apcasa">AP Casa</option>
                    </select>
                  </div>
                  {orderId && itens.length > 0 && (
                    <Button type="button" variant="secondary" onClick={handlePrint}>
                      <Printer className="mr-2 h-4 w-4" />Imprimir
                    </Button>
                  )}
                </div>

                <Button variant="outline" className="w-full" onClick={() => { handleDialogClose(); setOpen(false); }}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Voltar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <select
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todas as datas</option>
          {[...new Set(pedidos.map((p: any) => p.data))].sort().reverse().map(d => (
            <option key={d} value={d}>{d.split("-").reverse().join("/")}</option>
          ))}
        </select>
        {filterDate && (
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFilterDate("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <span className="mx-1 text-muted-foreground">|</span>
        <div className="flex items-center gap-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={filterFornecedor}
            onChange={e => setFilterFornecedor(e.target.value)}
            placeholder="Buscar fornecedor..."
            className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
          {filterFornecedor && <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFilterFornecedor("")}><X className="h-4 w-4" /></Button>}
        </div>
        <span className="mx-1 text-muted-foreground">|</span>
        <select
          value={filterPagamento}
          onChange={e => setFilterPagamento(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos pagamentos</option>
          <option value="pendente">Pendente</option>
          <option value="avista">À vista</option>
          <option value="aprazo">A prazo</option>
          <option value="apcasa">AP Casa</option>
        </select>
      </div>
      {isLoading ? <p>Carregando...</p> : (() => {
        const filteredPedidos = pedidos
          .filter((p: any) => showArchived || !p.archived)
          .filter((p: any) => !filterDate || p.data === filterDate)
          .filter((p: any) => !filterFornecedor || (p.fornecedores?.nome || "").toLowerCase().includes(filterFornecedor.toLowerCase()))
          .filter((p: any) => !filterPagamento || (p.tipo_pagamento || "pendente") === filterPagamento);
        return (
          <>
            {(filterDate || filterFornecedor || filterPagamento) && (
              <p className="text-center text-sm font-medium text-muted-foreground py-1">{filteredPedidos.length} pedido(s)</p>
            )}
            <CompradorPedidosList
              filteredPedidos={filteredPedidos}
              filterDate={filterDate}
              filterFornecedor={filterFornecedor}
              filterPagamento={filterPagamento}
              startEdit={startEdit}
            />
          </>
        );
      })()}
      {pastDateDialog}
    </div>
  );
}
