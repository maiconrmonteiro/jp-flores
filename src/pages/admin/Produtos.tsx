import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Upload, Search, Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { PaginatedList } from "@/components/PaginatedList";

type UnidadeMedida = Database["public"]["Enums"]["unidade_medida"];
const UNIDADES: UnidadeMedida[] = ["CX", "UN", "MC", "VS"];
const FETCH_BATCH_SIZE = 1000;
const MAX_PRODUCTS = 5000;

export default function Produtos() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState<UnidadeMedida>("UN");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  // Import state
  const [importText, setImportText] = useState("");
  const [importUnit, setImportUnit] = useState<UnidadeMedida>("UN");
  const [importing, setImporting] = useState(false);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const allProducts: any[] = [];

      for (let from = 0; from < MAX_PRODUCTS; from += FETCH_BATCH_SIZE) {
        const to = Math.min(from + FETCH_BATCH_SIZE - 1, MAX_PRODUCTS - 1);
        const { data, error } = await supabase.from("produtos").select("*").order("descricao").range(from, to);
        if (error) throw error;

        if (!data || data.length === 0) break;
        allProducts.push(...data);
        if (data.length < FETCH_BATCH_SIZE) break;
      }

      const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
      return allProducts.sort((a, b) => {
        const ua = UNIT_ORDER[a.unidade] ?? 99;
        const ub = UNIT_ORDER[b.unidade] ?? 99;
        if (ua !== ub) return ua - ub;
        return a.descricao.localeCompare(b.descricao, "pt-BR");
      });
    },
  });

  // Filtered + paginated
  const filtered = useMemo(() => {
    if (!search.trim()) return produtos;
    const s = search.toLowerCase();
    return produtos.filter(p => p.descricao.toLowerCase().includes(s));
  }, [produtos, search]);

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("produtos").update({ descricao, unidade }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("produtos").insert({ descricao, unidade });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      setOpen(false);
      resetForm();
      toast({ title: editId ? "Produto atualizado" : "Produto criado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast({ title: "Produto excluído" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => { setEditId(null); setDescricao(""); setUnidade("UN"); };
  const openEdit = (p: typeof produtos[0]) => { setEditId(p.id); setDescricao(p.descricao); setUnidade(p.unidade); setOpen(true); };

  const handleImport = async () => {
    const lines = importText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      toast({ title: "Nenhum produto encontrado", description: "Cole os nomes dos produtos, um por linha.", variant: "destructive" });
      return;
    }

    // Deduplicate against existing products (case-insensitive)
    const existingNames = new Set(produtos.map(p => p.descricao.toLowerCase()));
    const newProducts = lines.filter(l => !existingNames.has(l.toLowerCase()));
    const skipped = lines.length - newProducts.length;

    if (newProducts.length === 0) {
      toast({ title: "Todos já cadastrados", description: `${skipped} produto(s) já existem no sistema.` });
      return;
    }

    setImporting(true);
    try {
      // Insert in batches of 50
      for (let i = 0; i < newProducts.length; i += 50) {
        const batch = newProducts.slice(i, i + 50).map(desc => ({ descricao: desc, unidade: importUnit }));
        const { error } = await supabase.from("produtos").insert(batch);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast({
        title: "Importação concluída!",
        description: `${newProducts.length} produto(s) importado(s)${skipped > 0 ? `, ${skipped} já existiam` : ""}.`,
      });
      setImportText("");
      setImportOpen(false);
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    }
    setImporting(false);
  };

  // Preview count for import
  const importLines = importText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Produtos</h1>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="mr-2 h-4 w-4" />Importar</Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg">
              <DialogHeader><DialogTitle>Importar Produtos em Massa</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Unidade padrão para todos</Label>
                  <Select value={importUnit} onValueChange={v => setImportUnit(v as UnidadeMedida)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Cole os nomes dos produtos (um por linha)</Label>
                  <Textarea
                    rows={12}
                    placeholder={"Acácia\nAlface Crespa\nBanana Prata\nCenoura\n..."}
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    className="font-mono text-sm"
                  />
                  {importLines.length > 0 && (
                    <p className="text-xs text-muted-foreground">{importLines.length} produto(s) detectado(s)</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Dica: No seu sistema atual, selecione a lista de produtos com o mouse, copie (Ctrl+C) e cole aqui (Ctrl+V). 
                  Produtos que já existem serão ignorados automaticamente.
                </p>
                <Button onClick={handleImport} disabled={importing || importLines.length === 0} className="w-full">
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Importar {importLines.length > 0 ? `${importLines.length} produto(s)` : ""}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); setOpen(v); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo Produto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} Produto</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={e => setDescricao(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select value={unidade} onValueChange={v => setUnidade(v as UnidadeMedida)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? <p>Carregando...</p> : (
        <PaginatedList items={filtered} resetDeps={[search]}>
          {(visible) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-24">Unidade</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.descricao}</TableCell>
                    <TableCell>{p.unidade}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      {search ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </PaginatedList>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir o produto "{confirmDelete?.descricao}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
