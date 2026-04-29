import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, AlertTriangle, Search } from "lucide-react";
import { PaginatedList } from "@/components/PaginatedList";

interface ClienteForm {
  nome: string; cep: string; cidade: string; estado: string; bairro: string; complemento: string; telefone: string;
}
const empty: ClienteForm = { nome: "", cep: "", cidade: "", estado: "", bairro: "", complemento: "", telefone: "" };

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function findSimilar(nome: string, clientes: { id: string; nome: string; cidade: string | null }[], editId: string | null) {
  if (nome.trim().length < 3) return [];
  const norm = normalize(nome);
  return clientes
    .filter(c => c.id !== editId)
    .filter(c => {
      const cn = normalize(c.nome);
      // Check if one contains the other, or if words overlap significantly
      if (cn.includes(norm) || norm.includes(cn)) return true;
      const wordsA = norm.split(/\s*/).filter(Boolean);
      const wordsB = cn.split(/\s*/).filter(Boolean);
      // Use actual word splitting
      const setA = new Set(normalize(nome).split(""));
      const setB = new Set(normalize(c.nome).split(""));
      // Check word-level similarity
      const nameWordsA = nome.trim().toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const nameWordsB = c.nome.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      if (nameWordsA.length === 0 || nameWordsB.length === 0) return false;
      const matching = nameWordsA.filter(w => nameWordsB.some(wb => wb.includes(w) || w.includes(wb)));
      return matching.length >= Math.min(2, nameWordsA.length);
    })
    .slice(0, 5);
}

export default function Clientes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClienteForm>(empty);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clientes;
    const s = normalize(search);
    return clientes.filter(c =>
      normalize(c.nome).includes(s) ||
      normalize(c.cidade || "").includes(s) ||
      normalize((c as any).telefone || "").includes(s)
    );
  }, [clientes, search]);

  const similarClientes = useMemo(() => {
    if (editId) return []; // Don't check when editing
    return findSimilar(form.nome, clientes, editId);
  }, [form.nome, clientes, editId]);

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("clientes").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clientes").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); setOpen(false); setEditId(null); setForm(empty); toast({ title: "Salvo!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("clientes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); toast({ title: "Excluído!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openEdit = (c: typeof clientes[0]) => {
    setEditId(c.id);
    setForm({ nome: c.nome, cep: c.cep || "", cidade: c.cidade || "", estado: c.estado || "", bairro: c.bairro || "", complemento: c.complemento || "", telefone: (c as any).telefone || "" });
    setOpen(true);
  };

  const set = (k: keyof ClienteForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 w-48"
            />
          </div>
          <Dialog open={open} onOpenChange={v => { if (!v) { setEditId(null); setForm(empty); } setOpen(v); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Cliente</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} Cliente</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Nome</Label><Input value={form.nome} onChange={e => set("nome", e.target.value)} required /></div>

                {similarClientes.length > 0 && (
                  <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-foreground">
                    <AlertTriangle className="h-4 w-4 !text-amber-600" />
                    <AlertDescription>
                      <p className="font-semibold text-sm mb-1">Possível cadastro duplicado:</p>
                      <ul className="text-sm space-y-0.5">
                        {similarClientes.map(c => (
                          <li key={c.id}>• <strong>{c.nome}</strong>{c.cidade ? ` — ${c.cidade}` : ""}</li>
                        ))}
                      </ul>
                      <p className="text-xs mt-1 text-muted-foreground">Verifique se o cliente já existe antes de salvar.</p>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>CEP</Label><Input value={form.cep} onChange={e => set("cep", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={form.cidade} onChange={e => set("cidade", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Estado</Label><Input value={form.estado} onChange={e => set("estado", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={form.bairro} onChange={e => set("bairro", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Complemento</Label><Input value={form.complemento} onChange={e => set("complemento", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={form.telefone} onChange={e => set("telefone", e.target.value)} placeholder="(11) 99999-9999" /></div>
                </div>
                <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-2">{filtered.length} cliente(s)</p>

      {isLoading ? <p>Carregando...</p> : (
        <PaginatedList items={filtered} resetDeps={[search]}>
          {(visible) => (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Cidade</TableHead><TableHead>Estado</TableHead><TableHead className="w-24">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visible.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell>{(c as any).telefone || "—"}</TableCell>
                    <TableCell>{c.cidade}</TableCell>
                    <TableCell>{c.estado}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PaginatedList>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir o cliente "{confirmDelete?.nome}"?</AlertDialogDescription>
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
