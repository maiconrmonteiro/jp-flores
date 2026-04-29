import { useState, useCallback, useMemo } from "react";
import { getNextOperationDate, localToday, localDateStr } from "@/lib/utils";
import { useCompanySaldo } from "@/hooks/use-company-saldo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Printer, Trash2, History, Archive, ArrowLeft, Search, X, Image, Camera, FileImage, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { printEntrada80mm, printEntradaA4, printAllEntradasA4 } from "@/lib/print";
import { usePastDateGuard } from "@/components/PastDateGuard";
import { SearchableSelect } from "@/components/SearchableSelect";
import OrderItemsEditor from "@/components/OrderItemsEditor";
import PriceHistoryButton from "@/components/PriceHistoryButton";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { copyOrderImageToClipboard } from "@/lib/order-image";
import { uploadNotaFornecedor } from "@/lib/upload-nota";
import WebcamCaptureDialog from "@/components/WebcamCaptureDialog";
import { useTimeWindow } from "@/hooks/use-time-window";
import { TimeWindowControl } from "@/components/TimeWindowControl";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";

const BITO_COMPRADOR_ID = "1eedb8f5-5e0a-44fe-8a93-972ff48ab420";

interface ItemEntrada { _key?: string; id?: string; produto_id: string; quantidade: number; preco_custo: number; }

function EntradasList({ pedidos, filterDate, filterFornecedor, filterPagamento, isRestrito, startEdit, setPreviewImage, setPrintChoicePedido, setViewFotoUrl, setConfirmAction, toast }: any) {
  const filteredPedidos = useMemo(() => pedidos
    .filter((p: any) => !filterDate || p.data === filterDate)
    .filter((p: any) => !filterFornecedor || (p.fornecedores?.nome || "").toLowerCase().includes(filterFornecedor.toLowerCase()))
    .filter((p: any) => !filterPagamento || (p.tipo_pagamento || "pendente") === filterPagamento), [pedidos, filterDate, filterFornecedor, filterPagamento]);

  const { visibleItems, sentinelRef, hasMore, total, visibleCount } = useInfiniteScroll(filteredPedidos, [filterDate, filterFornecedor, filterPagamento]);

  return (
    <>
      {/* Mobile list */}
      <div className="md:hidden space-y-1">
        {visibleItems.map((p: any) => {
          const subtotal = (p.itens_entrada || []).reduce((s: number, i: any) => s + i.quantidade * i.preco_custo, 0);
          const pDesconto = Number(p.desconto) || 0;
          const total = Math.max(0, subtotal - pDesconto);
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
                  <span className="text-sm font-semibold">R$ {total.toFixed(2)}</span>
                  {pDesconto > 0 && <span className="text-xs text-muted-foreground line-through">R$ {subtotal.toFixed(2)}</span>}
                  <span className={`text-xs font-medium ${pagColor}`}>{pagLabel}</span>
                  {p.compradores?.nome && <span className="text-xs text-muted-foreground">({p.compradores.nome})</span>}
                </div>
                <div className="flex gap-0 items-center" onClick={e => e.stopPropagation()}>
                  {!isRestrito && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar imagem" onClick={async () => {
                        try {
                          const dataUrl = await copyOrderImageToClipboard(p);
                          setPreviewImage(dataUrl);
                          toast({ title: "Imagem copiada!", description: "Cole no WhatsApp com Ctrl+V" });
                        } catch (e: any) {
                          toast({ title: "Erro ao copiar", description: e.message, variant: "destructive" });
                        }
                      }}><Image className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPrintChoicePedido(p)}><Printer className="h-4 w-4" /></Button>
                      {(p as any).nota_foto_url && <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver foto da nota" onClick={() => setViewFotoUrl((p as any).nota_foto_url)}><FileImage className="h-4 w-4 text-primary" /></Button>}
                    </>
                  )}
                  {!(p as any).archived && (
                    isRestrito ? (
                      <Button variant="default" size="sm" className="h-9 px-3 gap-1.5" onClick={() => {
                        if (!p.tipo_pagamento || p.tipo_pagamento === "pendente") {
                          toast({ title: "Selecione o tipo de pagamento", description: "Defina se é À Vista ou A Prazo antes de arquivar.", variant: "destructive" });
                          return;
                        }
                        setConfirmAction({ type: "archive", pedido: p });
                      }}><Archive className="h-4 w-4" />ARQUIVAR</Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        if (!p.tipo_pagamento || p.tipo_pagamento === "pendente") {
                          toast({ title: "Selecione o tipo de pagamento", description: "Defina se é À Vista ou A Prazo antes de arquivar.", variant: "destructive" });
                          return;
                        }
                        setConfirmAction({ type: "archive", pedido: p });
                      }}><Archive className="h-4 w-4" /></Button>
                    )
                  )}
                  {!isRestrito && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmAction({ type: "delete", pedido: p })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <Table className="hidden md:table">
        <TableHeader><TableRow>
          <TableHead className="w-[12%]">Data</TableHead><TableHead>Fornecedor</TableHead><TableHead className="w-[10%]">Comprador</TableHead><TableHead className="w-[12%]">Pagamento</TableHead><TableHead className="w-[12%]">Total</TableHead><TableHead className="w-28">Ações</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {visibleItems.map((p: any) => {
            const subtotal = (p.itens_entrada || []).reduce((s: number, i: any) => s + i.quantidade * i.preco_custo, 0);
            const pDesconto = Number(p.desconto) || 0;
            const total = Math.max(0, subtotal - pDesconto);
            const pagStatus = p.tipo_pagamento || "pendente";
            const pagLabel = pagStatus === "avista" ? "À vista" : pagStatus === "aprazo" ? "A prazo" : pagStatus === "apcasa" ? "AP Casa" : "Pendente";
            const pagColor = pagStatus === "avista" ? "text-green-600" : pagStatus === "aprazo" ? "text-orange-500" : pagStatus === "apcasa" ? "text-purple-600" : "text-muted-foreground";
            return (
              <TableRow key={p.id} className="cursor-pointer h-9" onClick={() => startEdit(p)}>
                <TableCell>{p.data.split("-").reverse().join("/")}</TableCell>
                <TableCell>{p.fornecedores?.nome}</TableCell>
                <TableCell className="text-sm">{p.compradores?.nome || "—"}</TableCell>
                <TableCell><span className={`text-sm font-medium ${pagColor}`}>{pagLabel}</span></TableCell>
                <TableCell>
                  R$ {total.toFixed(2)}
                  {pDesconto > 0 && <span className="text-xs text-muted-foreground line-through ml-1">R$ {subtotal.toFixed(2)}</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                    {!isRestrito && (
                      <>
                        <Button variant="ghost" size="icon" title="Copiar imagem do pedido" onClick={async () => {
                          try {
                            const dataUrl = await copyOrderImageToClipboard(p);
                            setPreviewImage(dataUrl);
                            toast({ title: "Imagem copiada!", description: "Cole no WhatsApp com Ctrl+V" });
                          } catch (e: any) {
                            toast({ title: "Erro ao copiar", description: e.message, variant: "destructive" });
                          }
                        }}><Image className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setPrintChoicePedido(p)}><Printer className="h-4 w-4" /></Button>
                        {(p as any).nota_foto_url && <Button variant="ghost" size="icon" title="Ver foto da nota" onClick={() => setViewFotoUrl((p as any).nota_foto_url)}><FileImage className="h-4 w-4 text-primary" /></Button>}
                      </>
                    )}
                    {!(p as any).archived && (
                      isRestrito ? (
                        <Button variant="default" size="default" className="gap-2 font-semibold" onClick={() => {
                          if (!p.tipo_pagamento || p.tipo_pagamento === "pendente") {
                            toast({ title: "Selecione o tipo de pagamento", description: "Defina se é À Vista ou A Prazo antes de arquivar.", variant: "destructive" });
                            return;
                          }
                          setConfirmAction({ type: "archive", pedido: p });
                        }}><Archive className="h-5 w-5" />ARQUIVAR</Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (!p.tipo_pagamento || p.tipo_pagamento === "pendente") {
                            toast({ title: "Selecione o tipo de pagamento", description: "Defina se é À Vista ou A Prazo antes de arquivar.", variant: "destructive" });
                            return;
                          }
                          setConfirmAction({ type: "archive", pedido: p });
                        }} title="Arquivar"><Archive className="h-4 w-4" /></Button>
                      )
                    )}
                    {!isRestrito && (
                      <Button variant="ghost" size="icon" onClick={() => setConfirmAction({ type: "delete", pedido: p })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
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


export default function Entradas() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, role } = useAuth();
  const isRestrito = role === "entradas";
  const [open, setOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [printChoicePedido, setPrintChoicePedido] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [autoOrderId, setAutoOrderId] = useState<string | null>(null);
  const [fornecedorId, setFornecedorId] = useState("");
  const [data, setData] = useState(() => getNextOperationDate());
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [cooperfloraStage, setCooperfloraStage] = useState<0 | 1 | 2>(0);
  const { data: companySaldo, isLoading: companySaldoLoading } = useCompanySaldo(data, cooperfloraStage >= 1);
  const [anteriorItems, setAnteriorItems] = useState<any[] | null>(null);
  const handleDateChange = async (v: string) => {
    setData(v);
    if (orderId) {
      await supabase.from("pedidos_entrada").update({ data: v }).eq("id", orderId);
      qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
    }
  };
  const { guardedOnChange: guardedDateChange, dialog: pastDateDialog } = usePastDateGuard(handleDateChange);
  const [anteriorLoading, setAnteriorLoading] = useState(false);
  const [tipoPagamento, setTipoPagamento] = useState("pendente");
  const [showArchived, setShowArchived] = useState(false);
  const timeWindow = useTimeWindow("30d");
  const [filterPagamento, setFilterPagamento] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterFornecedor, setFilterFornecedor] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ type: "delete" | "archive"; pedido: any } | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoToAttach, setFotoToAttach] = useState<string | null>(null);
  const [viewFotoUrl, setViewFotoUrl] = useState<string | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [compradorId, setCompradorId] = useState(BITO_COMPRADOR_ID);
  const [desconto, setDesconto] = useState(0);

  const orderId = editId || autoOrderId;

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["pedidos_entrada", showArchived, timeWindow.since],
    queryFn: async () => {
      // Paginated to bypass 1000-row default limit
      const allRows: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query: any = supabase.from("pedidos_entrada")
          .select("*, fornecedores(nome), compradores(nome), itens_entrada(*, produtos(descricao, unidade))")
          .order("data", { ascending: false })
          .range(from, from + pageSize - 1);
        if (!showArchived) query = query.eq("archived", false);
        if (timeWindow.since) query = query.gte("data", timeWindow.since);
        const { data, error } = await query;
        if (error) throw error;
        const rows = data || [];
        allRows.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return allRows.sort((a: any, b: any) => {
        if (b.data !== a.data) return b.data.localeCompare(a.data);
        return (a.fornecedores?.nome || "").localeCompare(b.fornecedores?.nome || "", "pt-BR");
      });
    },
  });

  const { data: fornecedores = [] } = useQuery({ queryKey: ["fornecedores"], queryFn: async () => { const { data } = await supabase.from("fornecedores").select("*").order("nome"); return data || []; } });
  const { data: produtos = [] } = useQuery({ queryKey: ["produtos"], queryFn: async () => await fetchProdutosUpTo(5000) });
  const { data: compradores = [] } = useQuery({ queryKey: ["compradores"], queryFn: async () => { const { data } = await supabase.from("compradores").select("*").order("nome"); return data || []; } });

  const remove = async (id: string) => {
    const { error } = await supabase.from("pedidos_entrada").delete().eq("id", id);
    if (!error) { qc.invalidateQueries({ queryKey: ["pedidos_entrada"] }); toast({ title: "Excluído!" }); }
  };

  const archiveOrder = async (id: string, fotoUrl?: string | null) => {
    const updatePayload: any = { archived: true };
    if (fotoUrl) updatePayload.nota_foto_url = fotoUrl;
    const { error } = await supabase.from("pedidos_entrada").update(updatePayload).eq("id", id);
    if (error) { toast({ title: "Erro ao arquivar", description: error.message, variant: "destructive" }); return; }

    // Create financeiro_pagar record
    const pedido = pedidos.find((p: any) => p.id === id);
    if (pedido) {
      // Skip financial record for excluded suppliers (e.g. Z Loja)
      const fornecedorNome = fornecedores?.find((f: any) => f.id === pedido.fornecedor_id)?.nome || "";
      const isExcludedFromFinanceiro = fornecedorNome.toUpperCase() === "Z LOJA";

      const subtotalEntrada = (pedido.itens_entrada || []).reduce((s: number, i: any) => s + Number(i.preco_custo) * Number(i.quantidade), 0);
      const totalEntrada = Math.max(0, subtotalEntrada - (Number(pedido.desconto) || 0));
      if (!isExcludedFromFinanceiro && (totalEntrada > 0 || subtotalEntrada > 0)) {
        const isVista = pedido.tipo_pagamento === "avista";
        const { data: contaCriada, error: contaError } = await supabase.from("financeiro_pagar").insert({
          fornecedor_id: pedido.fornecedor_id,
          pedido_entrada_id: id,
          data_compra: pedido.data,
          valor_total: totalEntrada,
          valor_pago: isVista ? totalEntrada : 0,
          status: isVista ? "pago" : "aberto",
          observacao: isVista ? "À vista" : "A prazo",
        } as any).select().single();

        if (contaError) {
          toast({ title: "Erro ao lançar conta", description: contaError.message, variant: "destructive" });
          return;
        }

        if (isVista && contaCriada) {
          const { data: pagamentoCriado, error: pagamentoError } = await supabase.from("pagamentos_fornecedor").insert({
            fornecedor_id: pedido.fornecedor_id,
            valor: totalEntrada,
            data_pagamento: pedido.data,
            created_by: user?.id,
            observacao: "Pagamento automático - compra à vista",
          } as any).select().single();

          if (pagamentoError) {
            toast({ title: "Erro ao registrar pagamento", description: pagamentoError.message, variant: "destructive" });
            return;
          }

          const { error: alocacaoError } = await supabase.from("pagamento_alocacoes_fornecedor").insert({
            pagamento_id: pagamentoCriado.id,
            financeiro_pagar_id: contaCriada.id,
            valor_alocado: totalEntrada,
          } as any);

          if (alocacaoError) {
            toast({ title: "Erro ao alocar pagamento", description: alocacaoError.message, variant: "destructive" });
            return;
          }
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
    qc.invalidateQueries({ queryKey: ["financeiro_pagar"] });
    toast({ title: "Pedido arquivado!" });
  };

  const handleFotoSelect = async (file: File | null, pedidoId: string) => {
    if (!file) return;
    setUploadingFoto(true);
    try {
      const url = await uploadNotaFornecedor(file, pedidoId);
      setFotoToAttach(url);
      toast({ title: "Foto anexada!", description: "Confirme o arquivamento para salvar." });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploadingFoto(false);
    }
  };

  const resetForm = () => { setEditId(null); setAutoOrderId(null); setFornecedorId(""); setData(localToday()); setItens([]); setAnteriorItems(null); setTipoPagamento("pendente"); setCompradorId(BITO_COMPRADOR_ID); setDesconto(0); };

  const fetchAnterior = async () => {
    if (!fornecedorId) { toast({ title: "Selecione um fornecedor primeiro", variant: "destructive" }); return; }
    setAnteriorLoading(true);
    try {
      // Determine the day of week of the current order date (0=Sun..6=Sat)
      const [y, m, d] = data.split("-").map(Number);
      const targetDow = new Date(y, m - 1, d).getDay();

      // Fetch recent orders for this supplier (up to 30 to find a match)
      let query = supabase
        .from("pedidos_entrada")
        .select("id, data, itens_entrada(*, produtos(descricao, unidade))")
        .eq("fornecedor_id", fornecedorId);
      if (orderId) query = query.neq("id", orderId);
      const { data: lastOrders, error } = await query
        .order("data", { ascending: false })
        .limit(30);
      if (error) throw error;

      // Filter to same day of week, with items
      const withItems = (lastOrders || []).filter(o => {
        if (!o.itens_entrada || o.itens_entrada.length === 0) return false;
        const [oy, om, od] = o.data.split("-").map(Number);
        return new Date(oy, om - 1, od).getDay() === targetDow;
      });

      if (withItems.length === 0) {
        const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
        toast({ title: `Nenhum pedido anterior de ${dias[targetDow]} encontrado para este fornecedor` });
        setAnteriorLoading(false);
        return;
      }
      setAnteriorItems(withItems[0].itens_entrada);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setAnteriorLoading(false);
  };

  const confirmAnterior = async () => {
    if (!anteriorItems) return;
    try {
      // Ensure order exists once before inserting all items
      const oid = await ensureOrder();
      const inserts = anteriorItems.map(item => ({
        pedido_id: oid,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_custo: Number(item.preco_custo) || 0,
        qty_pedida: item.quantidade,
      }));
      const { error } = await supabase.from("itens_entrada").insert(inserts);
      if (error) throw error;
      // Refresh items list
      const { data: refreshed } = await supabase.from("itens_entrada").select("*").eq("pedido_id", oid);
      if (refreshed) {
        setItens(refreshed.map((i: any) => ({ _key: `e_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: i.quantidade, preco_custo: i.preco_custo, qty_pedida: i.qty_pedida })));
      }
      qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
      toast({ title: "Itens importados com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }
    setAnteriorItems(null);
  };

  const startEdit = (p: any) => {
    setEditId(p.id);
    setFornecedorId(p.fornecedor_id);
    setData(p.data);
    setTipoPagamento(p.tipo_pagamento || "pendente");
    setCompradorId(p.comprador_id || BITO_COMPRADOR_ID);
    setDesconto(Number(p.desconto) || 0);
    setItens((p.itens_entrada || []).map((i: any) => ({ _key: `e_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: i.quantidade, preco_custo: i.preco_custo, qty_pedida: i.qty_pedida })));
    setOpen(true);
  };

  const handleDialogClose = async () => {
    if (autoOrderId && itens.length === 0) {
      await supabase.from("pedidos_entrada").delete().eq("id", autoOrderId);
    }
    resetForm();
    qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
  };

  const ensureOrder = async (): Promise<string> => {
    if (orderId) {
      await supabase.from("pedidos_entrada").update({ fornecedor_id: fornecedorId, data, tipo_pagamento: tipoPagamento, comprador_id: compradorId, desconto } as any).eq("id", orderId);
      return orderId;
    }
    if (!fornecedorId) throw new Error("Selecione o fornecedor antes de adicionar itens");
    const { data: pedido, error } = await supabase.from("pedidos_entrada")
      .insert({ fornecedor_id: fornecedorId, data, created_by: user?.id, tipo_pagamento: tipoPagamento, comprador_id: compradorId, desconto } as any)
      .select().single();
    if (error) throw error;
    setAutoOrderId(pedido.id);
    return pedido.id;
  };

  const handleAddItem = useCallback(async (item: any, _isBaixa: boolean) => {
    try {
      const oid = await ensureOrder();
      const { data: saved, error } = await supabase.from("itens_entrada")
        .insert({ pedido_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco_custo: item.preco_custo || 0, qty_pedida: item.quantidade })
        .select().single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
      return { id: saved.id };
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      throw e;
    }
  }, [orderId, fornecedorId, data, user?.id]);

  const handleEditItem = useCallback(async (item: any) => {
    if (!item.id) return;
    const { error } = await supabase.from("itens_entrada").update({ quantidade: item.quantidade, preco_custo: item.preco_custo, qty_pedida: item.quantidade }).eq("id", item.id);
    if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
  }, []);

  const handleRemoveItem = useCallback(async (item: any) => {
    if (!item.id) return;
    const { error } = await supabase.from("itens_entrada").delete().eq("id", item.id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
  }, []);

  const handlePrint = async () => {
    const oid = orderId;
    if (!oid) return;
    const { data: fullOrder } = await supabase.from("pedidos_entrada")
      .select("*, fornecedores(nome), itens_entrada(*, produtos(descricao, unidade))")
      .eq("id", oid).single();
    if (fullOrder) printEntrada80mm(fullOrder);
  };

  const handlePrintA4 = async () => {
    const oid = orderId;
    if (!oid) return;
    const { data: fullOrder } = await supabase.from("pedidos_entrada")
      .select("*, fornecedores(nome), itens_entrada(*, produtos(descricao, unidade))")
      .eq("id", oid).single();
    if (fullOrder) printEntradaA4(fullOrder);
  };

  const fornecedorOptions = fornecedores.map(f => ({ value: f.id, label: f.nome }));
  const produtoOptions = produtos.map(p => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  // Build a map of latest cost price per product from loaded orders (sorted by date desc)
  const lastPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pedidos) {
      for (const item of (p.itens_entrada || [])) {
        if (!map.has(item.produto_id)) {
          map.set(item.produto_id, Number(item.preco_custo) || 0);
        }
      }
    }
    return map;
  }, [pedidos]);

  const getSuggestedPrice = useCallback((produtoId: string) => {
    return lastPriceMap.get(produtoId) || 0;
  }, [lastPriceMap]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Pedidos de Entrada</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Checkbox id="show-archived-entradas" checked={showArchived} onCheckedChange={v => { setShowArchived(!!v); if (!v) timeWindow.reset(); }} />
              <label htmlFor="show-archived-entradas" className="text-sm cursor-pointer text-muted-foreground">Incluir arquivados</label>
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
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova Entrada</Button></DialogTrigger>
           <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
            <div className="rounded-lg border bg-muted/40 px-2 py-1.5 space-y-1.5">
              <Button variant="ghost" className="w-full justify-center gap-1.5 h-7 text-xs font-semibold" onClick={() => { handleDialogClose(); setOpen(false); }}>
                <ArrowLeft className="h-3.5 w-3.5" />
                {editId ? "Editar" : "Nova"} Entrada — Voltar
              </Button>
              <div className="grid grid-cols-3 gap-1.5">
                <SearchableSelect options={fornecedorOptions} value={fornecedorId} onValueChange={setFornecedorId} placeholder="Fornecedor" />
                <select
                  value={compradorId}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setCompradorId(val);
                    if (orderId) {
                      await supabase.from("pedidos_entrada").update({ comprador_id: val }).eq("id", orderId);
                      qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
                    }
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {compradores.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <DatePicker value={data} onChange={guardedDateChange} className="flex-1" />
                  <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={fetchAnterior} disabled={!fornecedorId || anteriorLoading}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto pr-1">

              <OrderItemsEditor
                items={itens}
                setItems={setItens}
                produtoOptions={produtoOptions}
                priceField="preco_custo"
                getSuggestedPrice={getSuggestedPrice}
                onAddItem={handleAddItem}
                onEditItem={handleEditItem}
                onRemoveItem={handleRemoveItem}
                renderExtraButtons={(produtoId) => (
                  <PriceHistoryButton produtoId={produtoId} produtoOptions={produtoOptions} dataAtual={data} />
                )}
                showCooperfloraButton
                companySaldo={companySaldo}
                companySaldoLoading={companySaldoLoading}
                cooperfloraStage={cooperfloraStage}
                onCooperfloraStageChange={setCooperfloraStage}
              />

              {/* Totais e desconto */}
              {(() => {
                const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_custo, 0);
                const totalFinal = Math.max(0, subtotal - desconto);
                return (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>Subtotal:</span>
                      <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Desconto (R$):</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={desconto || ""}
                        onChange={async (e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setDesconto(val);
                          if (orderId) {
                            await supabase.from("pedidos_entrada").update({ desconto: val } as any).eq("id", orderId);
                            qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
                          }
                        }}
                        className="w-28 h-7 text-right text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    {desconto > 0 && (
                      <div className="flex items-center justify-between text-sm font-bold text-primary">
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
                        await supabase.from("pedidos_entrada").update({ tipo_pagamento: val }).eq("id", orderId);
                        qc.invalidateQueries({ queryKey: ["pedidos_entrada"] });
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
                  <>
                    <Button type="button" variant="secondary" size="sm" onClick={handlePrint}>
                      <Printer className="mr-1 h-4 w-4" />80mm
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={handlePrintA4}>
                      <Printer className="mr-1 h-4 w-4" />A4
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
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
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filterFornecedor}
            onChange={e => setFilterFornecedor(e.target.value)}
            placeholder="Buscar fornecedor..."
            className="h-9 pl-8 w-44 text-sm"
          />
        </div>
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
        {(filterDate || filterFornecedor || filterPagamento) && (
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setFilterDate(""); setFilterFornecedor(""); setFilterPagamento(""); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
        {(() => {
          const filtered = pedidos
            .filter((p: any) => !filterDate || p.data === filterDate)
            .filter((p: any) => !filterFornecedor || (p.fornecedores?.nome || "").toLowerCase().includes(filterFornecedor.toLowerCase()))
            .filter((p: any) => !filterPagamento || (p.tipo_pagamento || "pendente") === filterPagamento);
          return (filterDate || filterFornecedor || filterPagamento) ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">{filtered.length} pedido{filtered.length !== 1 ? "s" : ""}</span>
              {filtered.length > 0 && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => printAllEntradasA4(filtered)}>
                  <Printer className="mr-1 h-3.5 w-3.5" />Imprimir Filtrados (A4)
                </Button>
              )}
            </div>
          ) : null;
        })()}
      </div>

      {isLoading ? <p>Carregando...</p> : <EntradasList
        pedidos={pedidos}
        filterDate={filterDate}
        filterFornecedor={filterFornecedor}
        filterPagamento={filterPagamento}
        isRestrito={isRestrito}
        startEdit={startEdit}
        setPreviewImage={setPreviewImage}
        setPrintChoicePedido={setPrintChoicePedido}
        setViewFotoUrl={setViewFotoUrl}
        setConfirmAction={setConfirmAction}
        toast={toast}
      />}

      {/* Confirm delete/archive dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => { if (!v) { setConfirmAction(null); setFotoToAttach(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.type === "delete" ? "Excluir Pedido" : "Arquivar Pedido"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {(() => {
                    if (!confirmAction) return "";
                    const p = confirmAction.pedido;
                    const subtotal = (p.itens_entrada || []).reduce((s: number, i: any) => s + i.quantidade * i.preco_custo, 0);
                    const total = Math.max(0, subtotal - (Number(p.desconto) || 0));
                    const dataFmt = p.data.split("-").reverse().join("/");
                    const fornecedor = p.fornecedores?.nome || "—";
                    return confirmAction.type === "delete"
                      ? `Deseja realmente excluir o pedido do fornecedor ${fornecedor}, com data ${dataFmt}, no valor de R$ ${total.toFixed(2)}?`
                      : `Deseja realmente arquivar o pedido do fornecedor ${fornecedor}, com data ${dataFmt}, no valor de R$ ${total.toFixed(2)}?`;
                  })()}
                </p>
                {confirmAction?.type === "archive" && confirmAction.pedido.tipo_pagamento === "avista" && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      📸 Pagamento à vista — anexar foto da nota assinada (opcional)
                    </p>
                    {fotoToAttach ? (
                      <div className="flex items-center gap-2">
                        <img src={fotoToAttach} alt="Nota anexada" className="h-16 w-16 object-cover rounded border" />
                        <span className="text-xs text-muted-foreground flex-1">Foto pronta para arquivar</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFotoToAttach(null)}>Remover</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={uploadingFoto}
                          onClick={() => setWebcamOpen(true)}
                          className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-md border border-input bg-background hover:bg-accent text-sm font-medium cursor-pointer disabled:opacity-50"
                        >
                          {uploadingFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                          Tirar Foto
                        </button>
                        <label className="flex-1">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingFoto}
                            onChange={(e) => handleFotoSelect(e.target.files?.[0] || null, confirmAction.pedido.id)}
                          />
                          <span className="inline-flex items-center justify-center gap-2 w-full h-9 rounded-md border border-input bg-background hover:bg-accent text-sm font-medium cursor-pointer">
                            <FileImage className="h-4 w-4" />
                            Galeria
                          </span>
                        </label>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">A imagem é comprimida automaticamente para não pesar.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={uploadingFoto}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "delete") remove(confirmAction.pedido.id);
                else archiveOrder(confirmAction.pedido.id, fotoToAttach);
                setConfirmAction(null);
                setFotoToAttach(null);
              }}
            >
              {confirmAction?.type === "delete" ? "Excluir" : "Arquivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Visualizar foto da nota */}
      <Dialog open={!!viewFotoUrl} onOpenChange={(v) => { if (!v) setViewFotoUrl(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Foto da Nota</DialogTitle>
          </DialogHeader>
          {viewFotoUrl && (
            <div className="space-y-2">
              <img src={viewFotoUrl} alt="Nota do fornecedor" className="w-full h-auto max-h-[75vh] object-contain rounded border" />
              <a href={viewFotoUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Abrir em nova aba</a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Anterior confirmation dialog */}
      <AlertDialog open={!!anteriorItems} onOpenChange={(v) => { if (!v) setAnteriorItems(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Importar Pedido Anterior</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Os seguintes itens serão adicionados:</p>
                <div className="max-h-60 overflow-y-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Produto</TableHead>
                        <TableHead className="text-xs text-center w-16">Qtd</TableHead>
                        <TableHead className="text-xs text-right w-20">Preço</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(anteriorItems || []).map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs py-1">{item.produtos?.descricao || "—"}</TableCell>
                          <TableCell className="text-xs text-center py-1">{item.quantidade}</TableCell>
                          <TableCell className="text-xs text-right py-1">R$ {Number(item.preco_custo || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAnterior}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pastDateDialog}

      {/* Preview image dialog */}
      <Dialog open={!!previewImage} onOpenChange={(v) => { if (!v) setPreviewImage(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Imagem do Pedido (copiada para área de transferência)</DialogTitle>
          </DialogHeader>
          {previewImage && <img src={previewImage} alt="Pedido" className="w-full rounded" />}
        </DialogContent>
      </Dialog>

      {/* Print choice dialog */}
      <AlertDialog open={!!printChoicePedido} onOpenChange={(v) => { if (!v) setPrintChoicePedido(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Imprimir Entrada</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <Button className="w-full" variant="default" onClick={() => { printEntrada80mm(printChoicePedido); setPrintChoicePedido(null); }}>
              <Printer className="mr-2 h-4 w-4" />80mm
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => { printEntradaA4(printChoicePedido); setPrintChoicePedido(null); }}>
              <Printer className="mr-2 h-4 w-4" />A4
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Webcam capture for nota fornecedor */}
      <WebcamCaptureDialog
        open={webcamOpen}
        onOpenChange={setWebcamOpen}
        onCapture={(file) => {
          if (confirmAction?.pedido?.id) {
            handleFotoSelect(file, confirmAction.pedido.id);
          }
        }}
      />
    </div>
  );
}
