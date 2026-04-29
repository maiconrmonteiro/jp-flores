import { useState, useRef } from "react";
import { localToday, localDateStr } from "@/lib/utils";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Percent, FileCheck, Eye, FileDown, ImageDown, MessageSquare, ArrowLeft, DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMarkup, useSuggestedPrice, MARKUP_PRESETS } from "@/hooks/use-markup";
import OrderItemsEditor, { OrderItemsEditorHandle } from "@/components/OrderItemsEditor";
import { MarkupPopover } from "@/components/MarkupPopover";
import { CochoButton, stripCochoFromObs } from "@/components/CochoButton";
import { Input } from "@/components/ui/input";
import { openOrcamentoPdf, exportOrcamentoImage } from "@/lib/print";
import { PaginatedList } from "@/components/PaginatedList";


interface ItemOrc { _key?: string; id?: string; produto_id: string; quantidade: number; preco: number; }

export default function Orcamentos() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, role } = useAuth();
  const editorRef = useRef<OrderItemsEditorHandle>(null);

  // Dialog state
  const [open, setOpen] = useState(false);
  const [editOrcId, setEditOrcId] = useState<string | null>(null);
  const [autoOrcId, setAutoOrcId] = useState<string | null>(null);
  const [motoristaId, setMotoristaId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState<ItemOrc[]>([]);
  const [observacao, setObservacao] = useState("");
  const [descontoTipo, setDescontoTipo] = useState<"percent" | "reais">("percent");
  const [descontoValor, setDescontoValor] = useState(0);
  const [orcData, setOrcData] = useState("");

  // Convert to pedido dialog
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertOrcamento, setConvertOrcamento] = useState<any>(null);
  const [convertData, setConvertData] = useState(localToday());
  const [convertClienteId, setConvertClienteId] = useState("");
  const [converting, setConverting] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Visualizar dialog
  const [viewTarget, setViewTarget] = useState<any>(null);

  // Markup
  const { markup, customMarkup, isCustomMarkup, handleMarkupChange, handleCustomMarkupChange, setCustomActive } = useMarkup("orcamentos");
  const { getSuggestedPrice } = useSuggestedPrice(markup);

  const orcId = editOrcId || autoOrcId;

  // Fetch motorista for motorista role
  const { data: myMotorista } = useQuery({
    queryKey: ["my-motorista", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user && role === "motorista",
  });

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => { const { data } = await supabase.from("motoristas").select("*").order("nome"); return data || []; },
    enabled: role === "admin",
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => { const { data } = await supabase.from("clientes").select("*").order("nome"); return data || []; },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => await fetchProdutosUpTo(5000),
  });

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ["orcamentos", myMotorista?.id],
    queryFn: async () => {
      let query = supabase.from("orcamentos")
        .select("*, motoristas(nome), clientes(nome), itens_orcamento(*, produtos(descricao, unidade))")
        .order("created_at", { ascending: false });
      if (role === "motorista" && myMotorista?.id) {
        query = query.eq("motorista_id", myMotorista.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).sort((a: any, b: any) =>
        (a.motoristas?.nome || "").localeCompare(b.motoristas?.nome || "", "pt-BR")
      );
    },
    enabled: role === "admin" || !!myMotorista,
  });

  // Data de referência para priorização (hoje)
  const dataRef = localToday();

  // Produtos com entrada nos últimos 15 dias
  const { data: entradasRecentes = [] } = useQuery({
    queryKey: ["entradas-recentes-produtos-orc", dataRef],
    queryFn: async () => {
      const refDate = new Date(dataRef + "T00:00:00");
      refDate.setDate(refDate.getDate() - 15);
      const startDate = localDateStr(refDate);
      const { data: items } = await supabase
        .from("itens_entrada")
        .select("produto_id, pedidos_entrada!inner(data)")
        .gte("pedidos_entrada.data", startDate)
        .lte("pedidos_entrada.data", dataRef);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });

  // Produtos já digitados em saídas na mesma data
  const { data: saidasDoDia = [] } = useQuery({
    queryKey: ["saidas-do-dia-produtos-orc", dataRef],
    queryFn: async () => {
      const { data: items } = await supabase
        .from("itens_saida")
        .select("produto_id, pedidos_saida!inner(data)")
        .eq("pedidos_saida.data", dataRef);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });

  const produtosPrioritarios = new Set([...entradasRecentes, ...saidasDoDia]);

  const produtoOptions = produtos.map((p: any) => ({
    value: p.id,
    label: `${p.descricao} (${p.unidade})`,
  }));

  const motoristaOptions = motoristas.map((m: any) => ({ value: m.id, label: m.nome }));
  const clienteOptions = clientes.map((c: any) => ({ value: c.id, label: c.nome }));

  // Build payload for printing from a saved orcamento object
  const buildOrcPayload = (orc: any) => ({
    motoristaNome: orc.motoristas?.nome || motoristas.find((m: any) => m.id === orc.motorista_id)?.nome || myMotorista?.nome || "",
    clienteNome: orc.clientes?.nome || clientes.find((c: any) => c.id === orc.cliente_id)?.nome || "",
    observacao: orc.observacao || "",
    itens: (orc.itens_orcamento || []).map((i: any) => {
      const prod = produtos.find((p: any) => p.id === i.produto_id);
      return {
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade),
        preco: Number(i.preco),
        descricao: prod?.descricao || i.produtos?.descricao || "",
        unidade: prod?.unidade || i.produtos?.unidade || "",
      };
    }),
  });

  // Build payload from current editor state (while editing)
  const buildCurrentPayload = () => ({
    motoristaNome: motoristas.find((m: any) => m.id === motoristaId)?.nome || myMotorista?.nome || "",
    observacao,
    descontoTipo,
    descontoValor,
    itens: itens.map(i => {
      const prod = produtos.find((p: any) => p.id === i.produto_id);
      return {
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        preco: i.preco,
        descricao: prod?.descricao || "",
        unidade: prod?.unidade || "",
      };
    }),
  });

  const resetForm = () => {
    setEditOrcId(null);
    setAutoOrcId(null);
    setMotoristaId("");
    setClienteId("");
    setItens([]);
    setObservacao("");
    setDescontoTipo("percent");
    setDescontoValor(0);
    setOrcData("");
  };

  const handleOpenNew = () => {
    resetForm();
    if (role === "motorista" && myMotorista) {
      setMotoristaId(myMotorista.id);
    }
    setOpen(true);
  };

  const handleOpenEdit = (orc: any) => {
    setEditOrcId(orc.id);
    setAutoOrcId(null);
    setMotoristaId(orc.motorista_id);
    setClienteId(orc.cliente_id || "");
    const items = (orc.itens_orcamento || []).map((i: any) => ({
      id: i.id,
      produto_id: i.produto_id,
      quantidade: Number(i.quantidade),
      preco: Number(i.preco),
      _key: i.id,
    }));
    setItens(items);
    setObservacao(orc.observacao || "");
    setOrcData(orc.data || "");
    setDescontoTipo(orc.desconto_tipo || "percent");
    setDescontoValor(Number(orc.desconto_valor) || 0);
    setOpen(true);
  };

  const handleDialogClose = async () => {
    editorRef.current?.flushEdit();
    await new Promise(r => setTimeout(r, 80));
    // If empty orcamento was auto-created, delete it
    if (autoOrcId && itens.length === 0) {
      await supabase.from("orcamentos").delete().eq("id", autoOrcId);
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
    } else if (orcId) {
      // Save cliente_id, observacao and data
      await supabase.from("orcamentos").update({
        cliente_id: clienteId || null,
        observacao: observacao.trim() || "",
        data: orcData || null,
        desconto_tipo: descontoTipo,
        desconto_valor: descontoValor,
      } as any).eq("id", orcId);
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
    }
    setOpen(false);
    resetForm();
  };

  const ensureOrcamento = async (): Promise<string> => {
    if (orcId) {
      // Always sync cliente_id and observacao on existing orcamento
      await supabase.from("orcamentos").update({
        cliente_id: clienteId || null,
        observacao: observacao.trim() || "",
        data: orcData || null,
        desconto_tipo: descontoTipo,
        desconto_valor: descontoValor,
      } as any).eq("id", orcId);
      return orcId;
    }
    const mid = role === "motorista" ? myMotorista?.id : motoristaId;
    if (!mid) throw new Error("Selecione o motorista primeiro");
    const insertPayload: any = { motorista_id: mid, created_by: user?.id };
    if (clienteId) insertPayload.cliente_id = clienteId;
    if (observacao.trim()) insertPayload.observacao = observacao.trim();
    if (orcData) insertPayload.data = orcData;
    insertPayload.desconto_tipo = descontoTipo;
    insertPayload.desconto_valor = descontoValor;
    const { data, error } = await supabase.from("orcamentos")
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    setAutoOrcId(data.id);
    qc.invalidateQueries({ queryKey: ["orcamentos"] });
    return data.id;
  };

  const saveDesconto = (tipo: "percent" | "reais", valor: number) => {
    const oid = editOrcId || autoOrcId;
    if (oid) {
      supabase.from("orcamentos").update({ desconto_tipo: tipo, desconto_valor: valor } as any).eq("id", oid).then(() => qc.invalidateQueries({ queryKey: ["orcamentos"] }));
    }
  };

  const handleAddItem = async (item: any, _isBaixa: boolean): Promise<{ id: string }> => {
    try {
      const oid = await ensureOrcamento();
      const { data, error } = await supabase.from("itens_orcamento")
        .insert({ orcamento_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: item.preco ?? 0 })
        .select().single();
      if (error) throw error;
      // NOTE: setItens is NOT called here — OrderItemsEditor already updates the items list via setItems prop
      return { id: data.id };
    } catch (e: any) {
      toast({ title: "Erro ao adicionar item", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const handleEditItem = async (item: any): Promise<void> => {
    if (!item.id) return;
    const { error } = await supabase.from("itens_orcamento").update({
      quantidade: item.quantidade,
      preco: item.preco,
    }).eq("id", item.id);
    if (error) { toast({ title: "Erro ao editar item", description: error.message, variant: "destructive" }); }
    // NOTE: setItens is NOT called here — OrderItemsEditor already updates via setItems prop
  };

  const handleRemoveItem = async (item: any): Promise<void> => {
    if (!item.id) return;
    const { error } = await supabase.from("itens_orcamento").delete().eq("id", item.id);
    if (error) { toast({ title: "Erro ao remover item", description: error.message, variant: "destructive" }); }
    // NOTE: setItens is NOT called here — OrderItemsEditor already updates via setItems prop
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("orcamentos").delete().eq("id", deleteTarget.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Orçamento excluído" });
    qc.invalidateQueries({ queryKey: ["orcamentos"] });
    setDeleteTarget(null);
  };

  const openConvert = (orc: any) => {
    setConvertOrcamento(orc);
    setConvertData(localToday());
    setConvertClienteId(orc.cliente_id || "");
    setConvertOpen(true);
  };

  const handleConvert = async () => {
    if (!convertOrcamento) return;
    if (!convertClienteId) { toast({ title: "Selecione o cliente", variant: "destructive" }); return; }
    if (!convertData) { toast({ title: "Selecione a data", variant: "destructive" }); return; }
    const itensOrc = convertOrcamento.itens_orcamento || [];
    if (itensOrc.length === 0) { toast({ title: "Orçamento sem itens", variant: "destructive" }); return; }

    setConverting(true);
    try {
      // Calculate discount as percentage
      const orcItens = convertOrcamento.itens_orcamento || [];
      const orcSubtotal = orcItens.reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.preco), 0);
      const dTipo = convertOrcamento._descontoTipo || "percent";
      const dValor = convertOrcamento._descontoValor || 0;
      let descontoPercent = 0;
      if (dValor > 0 && orcSubtotal > 0) {
        descontoPercent = dTipo === "percent" ? dValor : (dValor / orcSubtotal) * 100;
      }
      // Round to 2 decimals
      descontoPercent = Math.round(descontoPercent * 100) / 100;

      const { data: pedido, error: pedidoErr } = await supabase.from("pedidos_saida")
        .insert({ motorista_id: convertOrcamento.motorista_id, cliente_id: convertClienteId, data: convertData, created_by: user?.id, observacao: convertOrcamento.observacao || "", desconto: descontoPercent })
        .select().single();
      if (pedidoErr) throw pedidoErr;

      const itensInsert = itensOrc.map((i: any) => ({
        pedido_id: pedido.id, produto_id: i.produto_id,
        quantidade: Number(i.quantidade), preco: Number(i.preco), is_baixa_ambulante: false,
      }));
      const { error: itensErr } = await supabase.from("itens_saida").insert(itensInsert);
      if (itensErr) throw itensErr;

      toast({ title: "Pedido criado!", description: `Pedido #${pedido.orcamento_num} gerado para ${new Date(convertData + "T12:00:00").toLocaleDateString("pt-BR")}.` });
      qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
      qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
      setConvertOpen(false);
      setConvertOrcamento(null);
    } catch (e: any) {
      toast({ title: "Erro ao converter", description: e.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const subtotalOrc = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
  const descontoCalculado = descontoTipo === "percent" ? subtotalOrc * descontoValor / 100 : descontoValor;
  const totalOrc = Math.max(0, subtotalOrc - descontoCalculado);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orçamentos</h1>
        <Button onClick={handleOpenNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo Orçamento
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : orcamentos.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Nenhum orçamento encontrado.</p>
      ) : (
        <PaginatedList items={orcamentos as any[]}>
          {(visible) => (
            <Table>
              <TableHeader>
                <TableRow>
                  {role === "admin" && <TableHead>Motorista</TableHead>}
                  <TableHead>Cliente</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="w-14">Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((orc: any) => {
                  const subtotal = (orc.itens_orcamento || []).reduce(
                    (s: number, i: any) => s + Number(i.quantidade) * Number(i.preco), 0
                  );
                  const dTipo = orc.desconto_tipo || "percent";
                  const dVal = Number(orc.desconto_valor) || 0;
                  const descCalc = dTipo === "percent" ? subtotal * dVal / 100 : dVal;
                  const total = Math.max(0, subtotal - descCalc);
                  return (
                     <TableRow key={orc.id}>
                      {role === "admin" && <TableCell className="font-medium">{orc.motoristas?.nome || "—"}</TableCell>}
                      <TableCell>{orc.clientes?.nome || "—"}</TableCell>
                      <TableCell>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                      <TableCell className="w-14 text-xs">{orc.data ? new Date(orc.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : new Date(orc.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</TableCell>
                       <TableCell className="text-right">
                        {orc.observacao && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={orc.observacao}>
                            {orc.observacao}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-0">
                          <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setViewTarget(buildOrcPayload(orc))} title="Visualizar / Imprimir">
                            <Eye className="h-5 w-5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => handleOpenEdit(orc)} title="Editar">
                            <Pencil className="h-5 w-5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-10 w-10 text-primary hover:text-primary/80" onClick={() => openConvert(orc)} title="Transformar em pedido">
                            <FileCheck className="h-5 w-5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive hover:text-destructive/80" onClick={() => setDeleteTarget(orc)} title="Excluir">
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                       </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </PaginatedList>
            )}

      {/* Editor Dialog */}
      <Dialog open={open} onOpenChange={v => { if (!v) handleDialogClose(); }}>
        <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
            <Button variant="ghost" className="w-full justify-center gap-2 h-9 text-sm font-semibold" onClick={() => handleDialogClose()}>
              <ArrowLeft className="h-4 w-4" />
              {editOrcId ? "Editar Orçamento" : "Novo Orçamento"} — Voltar
            </Button>
            <div className={`grid ${role === "admin" ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
              {role === "admin" && (
                <SearchableSelect
                  options={motoristaOptions}
                  value={motoristaId}
                  onValueChange={v => { if (!orcId) setMotoristaId(v); }}
                  placeholder="Selecione motorista"
                />
              )}
              <SearchableSelect
                options={clienteOptions}
                value={clienteId}
                onValueChange={(v) => { setClienteId(v); const oid = editOrcId || autoOrcId; if (oid) { supabase.from("orcamentos").update({ cliente_id: v || null } as any).eq("id", oid).then(() => qc.invalidateQueries({ queryKey: ["orcamentos"] })); } }}
                placeholder="Selecione cliente (opcional)"
              />
              <DatePicker value={orcData} onChange={setOrcData} />
            </div>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            {/* Items editor */}
            <OrderItemsEditor
              ref={editorRef}
              items={itens}
              setItems={setItens}
              produtoOptions={produtoOptions}
              priorityProductIds={produtosPrioritarios}
              priceField="preco"
              onAddItem={handleAddItem}
              onEditItem={handleEditItem}
              onRemoveItem={handleRemoveItem}
              getSuggestedPrice={getSuggestedPrice}
            />
            {/* Margem + Observação + Ações inline */}
            <div className="flex items-center gap-1">
              <MarkupPopover
                markup={markup}
                customMarkup={customMarkup}
                isCustomMarkup={isCustomMarkup}
                presets={MARKUP_PRESETS}
                onPresetChange={handleMarkupChange}
                onCustomChange={handleCustomMarkupChange}
                onCustomActivate={setCustomActive}
              />

              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button type="button" size="sm" variant={observacao.trim() ? "default" : "outline"} className="h-8 w-8 p-0">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Observação</Label>
                    <Textarea
                      value={stripCochoFromObs(observacao)}
                      onChange={e => {
                        const cochoMatch = observacao.match(/\[COCHO:preto=\d+,velling=\d+,quebrado=\d+\]/);
                        const newText = e.target.value + (cochoMatch ? ` ${cochoMatch[0]}` : "");
                        setObservacao(newText);
                      }}
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

              {/* Desconto % */}
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button type="button" size="sm" variant={descontoTipo === "percent" && descontoValor > 0 ? "default" : "outline"} className="h-8 px-2 gap-1 text-xs">
                    <Percent className="h-3.5 w-3.5" />Desc %
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Desconto %</Label>
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={descontoTipo === "percent" ? descontoValor || "" : ""}
                      onChange={e => { const v = Number(e.target.value) || 0; setDescontoTipo("percent"); setDescontoValor(v); saveDesconto("percent", v); }}
                      placeholder="0" className="h-8 text-sm"
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Desconto R$ */}
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button type="button" size="sm" variant={descontoTipo === "reais" && descontoValor > 0 ? "default" : "outline"} className="h-8 px-2 gap-1 text-xs">
                    <DollarSign className="h-3.5 w-3.5" />Desc R$
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Desconto R$</Label>
                    <Input
                      type="number" min={0} step={0.01}
                      value={descontoTipo === "reais" ? descontoValor || "" : ""}
                      onChange={e => { const v = Number(e.target.value) || 0; setDescontoTipo("reais"); setDescontoValor(v); saveDesconto("reais", v); }}
                      placeholder="0,00" className="h-8 text-sm"
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {orcId && itens.length > 0 && (
                <>
                  <Button type="button" size="sm" variant="secondary" className="h-8 px-2 gap-1 text-xs" onClick={() => setViewTarget(buildCurrentPayload())}>
                    <Eye className="h-3.5 w-3.5" />Visualizar
                  </Button>
                  <Button
                    type="button" size="sm" variant="default" className="h-8 px-2 gap-1 text-xs"
                    onClick={async () => {
                      editorRef.current?.flushEdit();
                      await new Promise(r => setTimeout(r, 80));
                      openConvert({
                        id: orcId,
                        motorista_id: motoristaId || myMotorista?.id || "",
                        motoristas: { nome: motoristas.find((m: any) => m.id === motoristaId)?.nome || myMotorista?.nome || "" },
                        itens_orcamento: itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco: i.preco })),
                        observacao,
                        _descontoTipo: descontoTipo,
                        _descontoValor: descontoValor,
                      });
                      setOpen(false);
                    }}
                  >
                    <FileCheck className="h-3.5 w-3.5" />Pedido
                  </Button>
                </>
              )}
            </div>

            {/* Resumo com desconto */}
            {itens.length > 0 && descontoValor > 0 && (
              <div className="rounded-md border bg-muted/40 p-2 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{subtotalOrc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Desconto {descontoTipo === "percent" ? `(${descontoValor}%)` : ""}</span>
                  <span>-{descontoCalculado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>Total</span>
                  <span>{totalOrc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to pedido dialog */}
      <Dialog open={convertOpen} onOpenChange={v => { if (!v) { setConvertOpen(false); setConvertOrcamento(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transformar em Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Selecione a data e o cliente para gerar o pedido de saída automaticamente.
            </p>

            <div className="space-y-1">
              <Label>Data do pedido</Label>
              <DatePicker value={convertData} onChange={setConvertData} />
            </div>

            <div className="space-y-1">
              <Label>Cliente</Label>
              <SearchableSelect
                options={clienteOptions}
                value={convertClienteId}
                onValueChange={setConvertClienteId}
                placeholder="Selecione o cliente"
              />
            </div>

            {convertOrcamento?.observacao && (
              <div className="rounded-md p-3 text-sm border bg-muted">
                <p className="font-semibold">⚠ Observação:</p>
                <p className="text-muted-foreground mt-1">{convertOrcamento.observacao}</p>
              </div>
            )}

            <div className="bg-muted rounded-md p-3 text-sm space-y-1">
              <p className="font-medium">Itens do orçamento ({(convertOrcamento?.itens_orcamento || []).length}):</p>
              {(convertOrcamento?.itens_orcamento || []).map((i: any, idx: number) => {
                const prod = produtos.find((p: any) => p.id === i.produto_id);
                return (
                  <p key={idx} className="text-muted-foreground">
                    {prod?.descricao || "—"}: {Number(i.quantidade)} × {Number(i.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setConvertOpen(false); setConvertOrcamento(null); }}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleConvert} disabled={converting}>
                {converting ? "Gerando..." : "Gerar Pedido"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visualizar / Imprimir dialog */}
      <Dialog open={!!viewTarget} onOpenChange={v => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Visualizar Orçamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Escolha o formato para compartilhar com o cliente:</p>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              onClick={async () => {
                if (viewTarget) await openOrcamentoPdf(viewTarget);
                setViewTarget(null);
              }}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Abrir PDF
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                if (viewTarget) await exportOrcamentoImage(viewTarget);
                setViewTarget(null);
              }}
            >
              <ImageDown className="mr-2 h-4 w-4" />
              Salvar em Imagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}

      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O orçamento do motorista <strong>{deleteTarget?.motoristas?.nome}</strong> será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
