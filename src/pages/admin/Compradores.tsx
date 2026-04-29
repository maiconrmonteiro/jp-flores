import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PaginatedList } from "@/components/PaginatedList";

function sanitizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
}

export default function Compradores() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const { data: compradores = [], isLoading } = useQuery({
    queryKey: ["compradores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compradores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("compradores").update({ nome }).eq("id", editId);
        if (error) throw error;
        if (password && editUserId) {
          const res = await supabase.functions.invoke("admin-update-user", {
            body: { action: "update-password", user_id: editUserId, password },
          });
          if (res.error) throw new Error(res.error.message || "Erro ao atualizar senha");
          const resData = res.data as any;
          if (resData?.error) throw new Error(resData.error);
        }
      } else {
        if (!password) throw new Error("Senha é obrigatória");
        const internalEmail = `${sanitizeName(nome)}@interno.app`;
        const res = await supabase.functions.invoke("admin-update-user", {
          body: { action: "create-user", email: internalEmail, password, nome, role: "comprador", table: "compradores" },
        });
        if (res.error) throw new Error(res.error.message || "Erro ao criar comprador");
        const resData = res.data as any;
        if (resData?.error) throw new Error(resData.error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compradores"] });
      setOpen(false);
      resetForm();
      toast({ title: editId ? "Atualizado!" : "Comprador criado!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("compradores").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compradores"] }); toast({ title: "Excluído!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => { setEditId(null); setEditUserId(null); setNome(""); setPassword(""); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Compradores</h1>
        <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Comprador</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} Comprador</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label>Senha {editId ? "(deixe vazio para manter)" : ""}</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} {...(!editId ? { required: true } : {})} minLength={6} placeholder={editId ? "Nova senha (opcional)" : "Senha"} />
              </div>
              <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <p>Carregando...</p> : (
        <PaginatedList items={compradores}>
          {(visible) => (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="w-24">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {visible.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditId(c.id); setEditUserId(c.user_id); setNome(c.nome); setPassword(""); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
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
            <AlertDialogTitle>Excluir Comprador</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir o comprador "{confirmDelete?.nome}"?</AlertDialogDescription>
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
