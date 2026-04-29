import { useState } from "react";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ShoppingBag, Users } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";
import OrderItemsEditor from "@/components/OrderItemsEditor";
import { PaginatedList } from "@/components/PaginatedList";

interface TemplateItem {
  _key?: string;
  id?: string;
  produto_id: string;
  quantidade: number;
  preco?: number;
}

export default function AmbulanteTemplates() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Ambulante template state
  const [ambOpen, setAmbOpen] = useState(false);
  const [ambEditId, setAmbEditId] = useState<string | null>(null);
  const [ambNome, setAmbNome] = useState("");
  const [ambMotoristaId, setAmbMotoristaId] = useState("");
  const [ambItens, setAmbItens] = useState<TemplateItem[]>([]);
  const [ambConfirmDelete, setAmbConfirmDelete] = useState<any>(null);

  // Cliente template state
  const [cliOpen, setCliOpen] = useState(false);
  const [cliEditId, setCliEditId] = useState<string | null>(null);
  const [cliNome, setCliNome] = useState("");
  const [cliClienteId, setCliClienteId] = useState("");
  const [cliMotoristaId, setCliMotoristaId] = useState("");
  const [cliDiaSemana, setCliDiaSemana] = useState("terca");
  const [cliItens, setCliItens] = useState<TemplateItem[]>([]);
  const [cliConfirmDelete, setCliConfirmDelete] = useState<any>(null);

  // Queries
  const { data: ambTemplates = [], isLoading: ambLoading } = useQuery({
    queryKey: ["ambulante-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ambulante_templates")
        .select("*, motoristas(nome), itens_ambulante_template(*, produtos(descricao, unidade))")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: cliTemplates = [], isLoading: cliLoading } = useQuery({
    queryKey: ["cliente-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cliente_templates")
        .select("*, clientes(nome), motoristas(nome), itens_cliente_template(*, produtos(descricao, unidade))")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: motoristas = [] } = useQuery({ queryKey: ["motoristas"], queryFn: async () => { const { data } = await supabase.from("motoristas").select("*").order("nome"); return data || []; } });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: async () => { const { data } = await supabase.from("clientes").select("*").order("nome"); return data || []; } });
  const { data: produtos = [] } = useQuery({ queryKey: ["produtos"], queryFn: async () => await fetchProdutosUpTo(5000) });

  const motoristaOptions = motoristas.map((m: any) => ({ value: m.id, label: m.nome }));
  const clienteOptions = clientes.map((c: any) => ({ value: c.id, label: c.nome }));
  const produtoOptions = produtos.map((p: any) => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  // ---- Ambulante Template CRUD (auto-save) ----
  const resetAmbForm = () => { setAmbEditId(null); setAmbNome(""); setAmbMotoristaId(""); setAmbItens([]); };

  const startEditAmb = (t: any) => {
    setAmbEditId(t.id); setAmbNome(t.nome); setAmbMotoristaId(t.motorista_id);
    setAmbItens((t.itens_ambulante_template || []).map((i: any) => ({
      _key: `t_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: Number(i.quantidade),
    })));
    setAmbOpen(true);
  };

  const ensureAmb = async (): Promise<string> => {
    if (ambEditId) return ambEditId;
    if (!ambMotoristaId) throw new Error("Selecione o motorista primeiro");
    const nome = ambNome.trim() || "Novo pedido fixo";
    const { data: created, error } = await supabase.from("ambulante_templates")
      .insert({ nome, motorista_id: ambMotoristaId }).select().single();
    if (error) throw error;
    setAmbEditId(created.id);
    if (!ambNome.trim()) setAmbNome(nome);
    return created.id;
  };

  const ambAddItem = async (item: any): Promise<{ id: string }> => {
    if (!ambMotoristaId) { toast({ title: "Selecione o motorista primeiro", variant: "destructive" }); throw new Error("Motorista não selecionado"); }
    const templateId = await ensureAmb();
    const { data: saved, error } = await supabase.from("itens_ambulante_template")
      .insert({ template_id: templateId, produto_id: item.produto_id, quantidade: item.quantidade })
      .select().single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["ambulante-templates"] });
    return { id: saved.id };
  };

  const ambEditItem = async (item: any): Promise<void> => {
    if (!item.id || item.id.startsWith("tmp_")) return;
    await supabase.from("itens_ambulante_template").update({ quantidade: item.quantidade }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["ambulante-templates"] });
  };

  const ambRemoveItem = async (item: any): Promise<void> => {
    if (item.id && !item.id.startsWith("tmp_")) {
      await supabase.from("itens_ambulante_template").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["ambulante-templates"] });
    }
  };

  const handleAmbDialogClose = async () => {
    if (ambEditId && ambNome.trim()) {
      await supabase.from("ambulante_templates").update({ nome: ambNome.trim(), motorista_id: ambMotoristaId }).eq("id", ambEditId);
    }
    if (ambEditId) {
      const { data: remaining } = await supabase.from("itens_ambulante_template").select("id").eq("template_id", ambEditId);
      if (!remaining || remaining.length === 0) {
        await supabase.from("ambulante_templates").delete().eq("id", ambEditId);
      }
    }
    qc.invalidateQueries({ queryKey: ["ambulante-templates"] });
    resetAmbForm();
  };

  const deleteAmb = async (id: string) => {
    await supabase.from("ambulante_templates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["ambulante-templates"] });
    toast({ title: "Template excluído!" });
  };

  // ---- Cliente Template CRUD (auto-save) ----
  const resetCliForm = () => { setCliEditId(null); setCliNome(""); setCliClienteId(""); setCliMotoristaId(""); setCliDiaSemana("terca"); setCliItens([]); };

  const startEditCli = (t: any) => {
    setCliEditId(t.id); setCliNome(t.nome); setCliClienteId(t.cliente_id);
    setCliMotoristaId(t.motorista_id || "");
    setCliDiaSemana(t.dia_semana || "terca");
    setCliItens((t.itens_cliente_template || []).map((i: any) => ({
      _key: `t_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: Number(i.quantidade), preco: Number(i.preco || 0),
    })));
    setCliOpen(true);
  };

  const ensureCli = async (): Promise<string> => {
    if (cliEditId) return cliEditId;
    if (!cliClienteId) throw new Error("Selecione o cliente primeiro");
    const nome = cliNome.trim() || "Novo pedido fixo";
    const { data: created, error } = await supabase.from("cliente_templates")
      .insert({ nome, cliente_id: cliClienteId, dia_semana: cliDiaSemana, motorista_id: cliMotoristaId || null } as any).select().single();
    if (error) throw error;
    setCliEditId(created.id);
    if (!cliNome.trim()) setCliNome(nome);
    return created.id;
  };

  const cliAddItem = async (item: any): Promise<{ id: string }> => {
    if (!cliClienteId) { toast({ title: "Selecione o cliente primeiro", variant: "destructive" }); throw new Error("Cliente não selecionado"); }
    const templateId = await ensureCli();
    const { data: saved, error } = await supabase.from("itens_cliente_template")
      .insert({ template_id: templateId, produto_id: item.produto_id, quantidade: item.quantidade, preco: item.preco ?? 0 })
      .select().single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["cliente-templates"] });
    return { id: saved.id };
  };

  const cliEditItem = async (item: any): Promise<void> => {
    if (!item.id || item.id.startsWith("tmp_")) return;
    await supabase.from("itens_cliente_template").update({ quantidade: item.quantidade, preco: item.preco ?? 0 }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["cliente-templates"] });
  };

  const cliRemoveItem = async (item: any): Promise<void> => {
    if (item.id && !item.id.startsWith("tmp_")) {
      await supabase.from("itens_cliente_template").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["cliente-templates"] });
    }
  };

  const handleCliDialogClose = async () => {
    if (cliEditId && cliNome.trim()) {
      await supabase.from("cliente_templates").update({ nome: cliNome.trim(), cliente_id: cliClienteId, dia_semana: cliDiaSemana, motorista_id: cliMotoristaId || null } as any).eq("id", cliEditId);
    }
    if (cliEditId) {
      const { data: remaining } = await supabase.from("itens_cliente_template").select("id").eq("template_id", cliEditId);
      if (!remaining || remaining.length === 0) {
        await supabase.from("cliente_templates").delete().eq("id", cliEditId);
      }
    }
    qc.invalidateQueries({ queryKey: ["cliente-templates"] });
    resetCliForm();
  };

  const deleteCli = async (id: string) => {
    await supabase.from("cliente_templates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["cliente-templates"] });
    toast({ title: "Template excluído!" });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Pedidos Fixos</h1>

      <Tabs defaultValue="ambulante">
        <TabsList className="mb-4">
          <TabsTrigger value="ambulante"><ShoppingBag className="mr-1 h-4 w-4" />Ambulante</TabsTrigger>
          <TabsTrigger value="cliente"><Users className="mr-1 h-4 w-4" />Cliente</TabsTrigger>
        </TabsList>

        {/* ===== Ambulante Templates ===== */}
        <TabsContent value="ambulante">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pedidos Fixos — Ambulante</h2>
            <Dialog open={ambOpen} onOpenChange={(v) => { if (!v) handleAmbDialogClose(); setAmbOpen(v); }}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo</Button></DialogTrigger>
              <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader><DialogTitle>{ambEditId ? "Editar" : "Novo"} Pedido Fixo (Ambulante)</DialogTitle></DialogHeader>
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-1"><Label>Nome</Label><Input value={ambNome} onChange={e => setAmbNome(e.target.value)} placeholder="Ex: Pedido do dia a dia" /></div>
                  <div className="space-y-1"><Label>Motorista</Label><SearchableSelect options={motoristaOptions} value={ambMotoristaId} onValueChange={setAmbMotoristaId} placeholder="Selecione motorista" /></div>
                  <OrderItemsEditor
                    items={ambItens}
                    setItems={setAmbItens}
                    produtoOptions={produtoOptions}
                    onAddItem={ambAddItem}
                    onEditItem={ambEditItem}
                    onRemoveItem={ambRemoveItem}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {ambLoading ? <p>Carregando...</p> : ambTemplates.length === 0 ? <p className="text-muted-foreground">Nenhum pedido fixo de ambulante.</p> : (
            <PaginatedList items={ambTemplates as any[]}>
              {(visible) => (
                <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Motorista</TableHead><TableHead className="w-20">Itens</TableHead><TableHead className="w-24">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {visible.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.nome}</TableCell><TableCell>{t.motoristas?.nome}</TableCell><TableCell>{(t.itens_ambulante_template || []).length}</TableCell>
                        <TableCell><div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => startEditAmb(t)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setAmbConfirmDelete(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </PaginatedList>
          )}
        </TabsContent>

        {/* ===== Cliente Templates ===== */}
        <TabsContent value="cliente">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pedidos Fixos — Cliente</h2>
            <Dialog open={cliOpen} onOpenChange={(v) => { if (!v) handleCliDialogClose(); setCliOpen(v); }}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo</Button></DialogTrigger>
              <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader><DialogTitle>{cliEditId ? "Editar" : "Novo"} Pedido Fixo (Cliente)</DialogTitle></DialogHeader>
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-1"><Label>Nome</Label><Input value={cliNome} onChange={e => setCliNome(e.target.value)} placeholder="Ex: Pedido semanal" /></div>
                  <div className="space-y-1"><Label>Cliente</Label><SearchableSelect options={clienteOptions} value={cliClienteId} onValueChange={setCliClienteId} placeholder="Selecione cliente" /></div>
                  <div className="space-y-1"><Label>Motorista</Label><SearchableSelect options={motoristaOptions} value={cliMotoristaId} onValueChange={setCliMotoristaId} placeholder="Selecione motorista" /></div>
                  <div className="space-y-1">
                    <Label>Dia da semana</Label>
                    <Select value={cliDiaSemana} onValueChange={setCliDiaSemana}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="terca">Terça-feira</SelectItem>
                        <SelectItem value="quinta">Quinta-feira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">Preço 0 = calcula automático (custo + margem) na hora de usar o pedido fixo.</p>
                  <OrderItemsEditor
                    items={cliItens}
                    setItems={setCliItens}
                    produtoOptions={produtoOptions}
                    priceField="preco"
                    onAddItem={cliAddItem}
                    onEditItem={cliEditItem}
                    onRemoveItem={cliRemoveItem}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {cliLoading ? <p>Carregando...</p> : cliTemplates.length === 0 ? <p className="text-muted-foreground">Nenhum pedido fixo de cliente.</p> : (
             <PaginatedList items={cliTemplates as any[]}>
               {(visible) => (
                 <Table>
                   <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Cliente</TableHead><TableHead>Motorista</TableHead><TableHead className="w-20">Dia</TableHead><TableHead className="w-20">Itens</TableHead><TableHead className="w-24">Ações</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {visible.map((t: any) => (
                       <TableRow key={t.id}>
                         <TableCell>{t.nome}</TableCell><TableCell>{t.clientes?.nome}</TableCell><TableCell>{t.motoristas?.nome || "—"}</TableCell>
                         <TableCell>{t.dia_semana === "quinta" ? "Quinta" : "Terça"}</TableCell>
                         <TableCell>{(t.itens_cliente_template || []).length}</TableCell>
                         <TableCell><div className="flex gap-1">
                           <Button variant="ghost" size="icon" onClick={() => startEditCli(t)}><Pencil className="h-4 w-4" /></Button>
                           <Button variant="ghost" size="icon" onClick={() => setCliConfirmDelete(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                         </div></TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               )}
             </PaginatedList>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm delete ambulante */}
      <AlertDialog open={!!ambConfirmDelete} onOpenChange={(v) => { if (!v) setAmbConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir "{ambConfirmDelete?.nome}" do motorista {ambConfirmDelete?.motoristas?.nome}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (ambConfirmDelete) deleteAmb(ambConfirmDelete.id); setAmbConfirmDelete(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete cliente */}
      <AlertDialog open={!!cliConfirmDelete} onOpenChange={(v) => { if (!v) setCliConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir "{cliConfirmDelete?.nome}" do cliente {cliConfirmDelete?.clientes?.nome}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (cliConfirmDelete) deleteCli(cliConfirmDelete.id); setCliConfirmDelete(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
