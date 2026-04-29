import { useState, useCallback } from "react";
import { localToday } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Printer, Percent, ClipboardList } from "lucide-react";

import { SearchableSelect } from "@/components/SearchableSelect";
import { useMarkup, MARKUP_PRESETS, fetchCostPricesForDate } from "@/hooks/use-markup";
import { printAmbulanteA4 } from "@/lib/print";
import { exportToExcel } from "@/lib/excel";
import OrderItemsEditor from "@/components/OrderItemsEditor";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { PaginatedList } from "@/components/PaginatedList";

interface ItemAmb { _key?: string; id?: string; produto_id: string; quantidade: number; }

export default function Ambulantes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [autoOrderId, setAutoOrderId] = useState<string | null>(null);
  const [motoristaId, setMotoristaId] = useState("");
  const [data, setData] = useState(localToday());
  const [itens, setItens] = useState<ItemAmb[]>([]);
  const [alsoExcel, setAlsoExcel] = useState(false);
  const [confirmDeleteAmb, setConfirmDeleteAmb] = useState<any>(null);
  const [confirmImportTpl, setConfirmImportTpl] = useState<any>(null);

  const orderId = editId || autoOrderId;

  const { markup, customMarkup, isCustomMarkup, handleMarkupChange, handleCustomMarkupChange, setCustomActive } = useMarkup("admin");
  const { data: ambulantes = [], isLoading } = useQuery({
    queryKey: ["ambulantes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ambulantes")
        .select("*, motoristas(nome), itens_ambulante(*, produtos(descricao, unidade))")
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: motoristas = [] } = useQuery({ queryKey: ["motoristas"], queryFn: async () => { const { data } = await supabase.from("motoristas").select("*").order("nome"); return data || []; } });
  const { data: produtos = [] } = useQuery({ queryKey: ["produtos"], queryFn: async () => await fetchProdutosUpTo(5000) });

  const { data: templates = [] } = useQuery({
    queryKey: ["ambulante-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ambulante_templates")
        .select("*, motoristas(nome), itens_ambulante_template(*, produtos(descricao, unidade))")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const templatesForMotorista = templates.filter((t: any) => t.motorista_id === motoristaId);

  const importTemplate = async (templateId: string) => {
    const template = templates.find((t: any) => t.id === templateId);
    if (!template) return;
    try {
      const oid = await ensureOrder();
      const templateItems = template.itens_ambulante_template || [];
      for (const ti of templateItems) {
        if (itens.some(i => i.produto_id === ti.produto_id)) continue;
        const { data: saved, error } = await supabase.from("itens_ambulante")
          .insert({ ambulante_id: oid, produto_id: ti.produto_id, quantidade: ti.quantidade, preco: 0 })
          .select().single();
        if (error) throw error;
        setItens(prev => [...prev, { _key: `t_${saved.id}`, id: saved.id, produto_id: ti.produto_id, quantidade: Number(ti.quantidade) }]);
      }
      qc.invalidateQueries({ queryKey: ["ambulantes"] });
      toast({ title: `Itens do "${template.nome}" importados!` });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }
  };

  const { data: latestCostPrices = {} } = useQuery({
    queryKey: ["latest-cost-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itens_entrada")
        .select("produto_id, preco_custo, pedidos_entrada!inner(data)")
        .order("data", { ascending: false, referencedTable: "pedidos_entrada" });
      if (error) throw error;
      const priceMap: Record<string, number> = {};
      const latestDateMap: Record<string, string> = {};
      (data || []).forEach((item: any) => {
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
      return priceMap;
    },
  });

  const remove = async (id: string) => {
    // Find the ambulante to get motorista_id and data
    const { data: amb } = await supabase.from("ambulantes").select("motorista_id, data").eq("id", id).single();
    if (amb) {
      // Find all pedidos_saida for same motorista and date
      const { data: pedidos } = await supabase.from("pedidos_saida")
        .select("id")
        .eq("motorista_id", amb.motorista_id)
        .eq("data", amb.data);
      if (pedidos && pedidos.length > 0) {
        const pedidoIds = pedidos.map(p => p.id);
        // Convert baixa_ambulante items to regular sales so they remain in totalizador
        await supabase.from("itens_saida")
          .update({ is_baixa_ambulante: false })
          .in("pedido_id", pedidoIds)
          .eq("is_baixa_ambulante", true);
      }
    }
    const { error } = await supabase.from("ambulantes").delete().eq("id", id);
    if (!error) {
      qc.invalidateQueries({ queryKey: ["ambulantes"] });
      qc.invalidateQueries({ queryKey: ["pedidos-saida"] });
      toast({ title: "Excluído!" });
    }
  };

  const resetForm = () => { setEditId(null); setAutoOrderId(null); setMotoristaId(""); setData(localToday()); setItens([]); };

  const startEdit = (p: any) => {
    setEditId(p.id);
    setMotoristaId(p.motorista_id);
    setData(p.data);
    setItens((p.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0).filter((i: any) => Number(i.quantidade) > 0).map((i: any) => ({ _key: `a_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: i.quantidade })));
    setOpen(true);
  };

  const handleDialogClose = async () => {
    if (autoOrderId && itens.length === 0) {
      await supabase.from("ambulantes").delete().eq("id", autoOrderId);
    }
    resetForm();
    qc.invalidateQueries({ queryKey: ["ambulantes"] });
  };

  const ensureOrder = async (): Promise<string> => {
    if (orderId) {
      await supabase.from("ambulantes").update({ motorista_id: motoristaId, data }).eq("id", orderId);
      return orderId;
    }
    if (!motoristaId) throw new Error("Selecione o motorista");
    const { data: amb, error } = await supabase.from("ambulantes")
      .insert({ motorista_id: motoristaId, data, created_by: user?.id })
      .select().single();
    if (error) throw error;
    setAutoOrderId(amb.id);
    return amb.id;
  };

  const handleAddItem = useCallback(async (item: any) => {
    try {
      const oid = await ensureOrder();
      const { data: saved, error } = await supabase.from("itens_ambulante")
        .insert({ ambulante_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: 0 })
        .select().single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["ambulantes"] });
      return { id: saved.id };
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      throw e;
    }
  }, [orderId, motoristaId, data, user?.id]);

  const handleEditItem = useCallback(async (item: any) => {
    if (!item.id) return;
    await supabase.from("itens_ambulante").update({ quantidade: item.quantidade }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["ambulantes"] });
  }, []);

  const handleRemoveItem = useCallback(async (item: any) => {
    if (!item.id) return;
    await supabase.from("itens_ambulante").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["ambulantes"] });
  }, []);

  const motoristaOptions = motoristas.map(m => ({ value: m.id, label: m.nome }));
  const produtoOptions = produtos.map(p => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Ambulantes</h1>
        <Dialog open={open} onOpenChange={v => { if (!v) handleDialogClose(); setOpen(v); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Ambulante</Button></DialogTrigger>
          <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
              <h3 className="text-sm font-semibold text-center">{editId ? "Editar" : "Novo"} Ambulante</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Motorista</Label>
                  <SearchableSelect options={motoristaOptions} value={motoristaId} onValueChange={setMotoristaId} placeholder="Selecione motorista" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data</Label>
                  <DatePicker value={data} onChange={setData} />
                </div>
              </div>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto pr-1">

              {motoristaId && templatesForMotorista.length > 0 && (
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <Select onValueChange={(id) => {
                    const tpl = templatesForMotorista.find((t: any) => t.id === id);
                    if (tpl) setConfirmImportTpl(tpl);
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Importar pedido fixo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesForMotorista.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome} ({(t.itens_ambulante_template || []).length} itens)
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
                onAddItem={handleAddItem}
                onEditItem={handleEditItem}
                onRemoveItem={handleRemoveItem}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>


      <div className="flex items-center gap-2 mb-4">
        <Checkbox id="amb-excel" checked={alsoExcel} onCheckedChange={v => setAlsoExcel(!!v)} />
        <label htmlFor="amb-excel" className="text-sm cursor-pointer">Também gerar Excel ao imprimir</label>
      </div>

      {isLoading ? <p>Carregando...</p> : (
        <PaginatedList items={ambulantes as any[]}>
          {(visible) => (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Motorista</TableHead><TableHead>Itens</TableHead><TableHead className="w-36">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visible.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.data.split("-").reverse().join("/")}</TableCell>
                    <TableCell>{a.motoristas?.nome}</TableCell>
                    <TableCell>{(a.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0).length}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={async () => {
                          const saldoItens = (a.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0);
                          const saldoAmb = { ...a, itens_ambulante: saldoItens };
                          const dateCosts = await fetchCostPricesForDate(a.data);
                          printAmbulanteA4(saldoAmb, a.motoristas?.nome || "", dateCosts, markup);
                          if (alsoExcel) {
                            const items = saldoItens.map((i: any) => {
                              const cost = dateCosts[i.produto_id] || 0;
                              const precoVenda = Math.round(cost * (1 + markup / 100) * 100) / 100;
                              return { produto: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", quantidade: Number(i.quantidade), preco: precoVenda, total: (Number(i.quantidade) * precoVenda) };
                            });
                            const grandTotal = items.reduce((s: number, it: any) => s + it.total, 0);
                            exportToExcel({
                              filename: `ambulante_saldo_${a.data}`, sheetName: "Saldo Ambulante", title: "Saldo Ambulante",
                              info: [`Motorista: ${a.motoristas?.nome || ""}`, `Data: ${a.data.split("-").reverse().join("/")}`, `Margem de venda: ${markup}%`],
                              columns: [
                                { header: "Produto", key: "produto", width: 30 },
                                { header: "UN", key: "unidade", width: 8, align: "center" },
                                { header: "Qtd", key: "quantidade", width: 8, align: "center" },
                                { header: "Preço", key: "preco", width: 12, format: "currency", align: "right" },
                                { header: "Total", key: "total", width: 14, format: "currency", align: "right" },
                              ],
                              rows: items,
                              totalRow: { label: "Total:", value: grandTotal, colSpan: 4 },
                            });
                          }
                        }}><Printer className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => startEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteAmb(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PaginatedList>
      )}

      <AlertDialog open={!!confirmDeleteAmb} onOpenChange={(v) => { if (!v) setConfirmDeleteAmb(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Ambulante</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir o ambulante do motorista {confirmDeleteAmb?.motoristas?.nome}, data {confirmDeleteAmb?.data?.split("-").reverse().join("/")}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDeleteAmb) remove(confirmDeleteAmb.id); setConfirmDeleteAmb(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!confirmImportTpl} onOpenChange={(o) => !o && setConfirmImportTpl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente puxar os {(confirmImportTpl?.itens_ambulante_template || []).length} itens do pedido fixo "{confirmImportTpl?.nome}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmImportTpl) importTemplate(confirmImportTpl.id); setConfirmImportTpl(null); }}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
