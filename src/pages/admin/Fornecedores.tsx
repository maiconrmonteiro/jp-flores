import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Upload, Search, Loader2 } from "lucide-react";
import { PaginatedList } from "@/components/PaginatedList";

export default function Fornecedores() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  // Import state
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: fornecedores = [], isLoading } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Filtered + paginated
  const filtered = useMemo(() => {
    if (!search.trim()) return fornecedores;
    const s = search.toLowerCase();
    return fornecedores.filter(f => f.nome.toLowerCase().includes(s));
  }, [fornecedores, search]);

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("fornecedores").update({ nome }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fornecedores").insert({ nome });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fornecedores"] }); setOpen(false); setEditId(null); setNome(""); toast({ title: "Salvo!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("fornecedores").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fornecedores"] }); toast({ title: "Excluído!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleImport = async () => {
    const lines = importText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      toast({ title: "Nenhum fornecedor encontrado", description: "Cole os nomes, um por linha.", variant: "destructive" });
      return;
    }

    const existingNames = new Set(fornecedores.map(f => f.nome.toLowerCase()));
    const newItems = lines.filter(l => !existingNames.has(l.toLowerCase()));
    const skipped = lines.length - newItems.length;

    if (newItems.length === 0) {
      toast({ title: "Todos já cadastrados", description: `${skipped} fornecedor(es) já existem.` });
      return;
    }

    setImporting(true);
    try {
      for (let i = 0; i < newItems.length; i += 50) {
        const batch = newItems.slice(i, i + 50).map(n => ({ nome: n }));
        const { error } = await supabase.from("fornecedores").insert(batch);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      toast({ title: "Importação concluída!", description: `${newItems.length} fornecedor(es) importado(s)${skipped > 0 ? `, ${skipped} já existiam` : ""}.` });
      setImportText("");
      setImportOpen(false);
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    }
    setImporting(false);
  };

  const importLines = importText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Fornecedores</h1>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="mr-2 h-4 w-4" />Importar</Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg">
              <DialogHeader><DialogTitle>Importar Fornecedores em Massa</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Cole os nomes dos fornecedores (um por linha)</Label>
                  <Textarea
                    rows={12}
                    placeholder={"Fornecedor A\nFornecedor B\nFornecedor C\n..."}
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    className="font-mono text-sm"
                  />
                  {importLines.length > 0 && (
                    <p className="text-xs text-muted-foreground">{importLines.length} fornecedor(es) detectado(s)</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Dica: No seu sistema atual, selecione a lista de fornecedores com o mouse, copie (Ctrl+C) e cole aqui (Ctrl+V).
                  Fornecedores que já existem serão ignorados automaticamente.
                </p>
                <Button onClick={handleImport} disabled={importing || importLines.length === 0} className="w-full">
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Importar {importLines.length > 0 ? `${importLines.length} fornecedor(es)` : ""}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={v => { if (!v) { setEditId(null); setNome(""); } setOpen(v); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Fornecedor</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} Fornecedor</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} required /></div>
                <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? <p>Carregando...</p> : (
        <PaginatedList items={filtered} resetDeps={[search]}>
          {(visible) => (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="w-24">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {visible.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>{f.nome}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditId(f.id); setNome(f.nome); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(f)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">{search ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </PaginatedList>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fornecedor</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir o fornecedor "{confirmDelete?.nome}"?</AlertDialogDescription>
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
