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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PaginatedList } from "@/components/PaginatedList";

function sanitizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
}

export default function Motoristas() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [terceirizado, setTerceirizado] = useState(false);
  const [apenasFinanceiro, setApenasFinanceiro] = useState(false);

  const { data: motoristas = [], isLoading } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("motoristas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("motoristas").update({ nome, terceirizado }).eq("id", editId);
        if (error) throw error;
        // Only update password if the motorista has a user_id
        if (password && editUserId) {
          const res = await supabase.functions.invoke("admin-update-user", {
            body: { action: "update-password", user_id: editUserId, password },
          });
          if (res.error) throw new Error(res.error.message || "Erro ao atualizar senha");
          const resData = res.data as any;
          if (resData?.error) throw new Error(resData.error);
        }
      } else if (apenasFinanceiro) {
        // Virtual motorista — no auth user, just insert into motoristas table
        const { error } = await supabase.from("motoristas").insert({ nome, terceirizado, user_id: null });
        if (error) throw error;
      } else {
        if (!password) throw new Error("Senha é obrigatória");
        const internalEmail = `${sanitizeName(nome)}@interno.app`;
        const res = await supabase.functions.invoke("admin-update-user", {
          body: { action: "create-user", email: internalEmail, password, nome, role: "motorista", table: "motoristas" },
        });
        if (res.error) throw new Error(res.error.message || "Erro ao criar motorista");
        const resData = res.data as any;
        if (resData?.error) throw new Error(resData.error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["motoristas"] });
      setOpen(false);
      resetForm();
      toast({ title: editId ? "Atualizado!" : "Motorista criado!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("motoristas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["motoristas"] }); toast({ title: "Excluído!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => { setEditId(null); setEditUserId(null); setNome(""); setPassword(""); setTerceirizado(false); setApenasFinanceiro(false); };

  const isEditingVirtual = editId && !editUserId;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Motoristas</h1>
        <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Motorista</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} Motorista</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} required /></div>
              {!apenasFinanceiro && !isEditingVirtual && (
                <div className="space-y-2">
                  <Label>Senha {editId ? "(deixe vazio para manter)" : ""}</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} {...(!editId ? { required: true } : {})} minLength={6} placeholder={editId ? "Nova senha (opcional)" : "Senha"} />
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox id="terceirizado" checked={terceirizado} onCheckedChange={(v) => setTerceirizado(!!v)} />
                <Label htmlFor="terceirizado">Motorista terceirizado</Label>
              </div>
              {!editId && (
                <div className="flex items-center space-x-2">
                  <Checkbox id="apenas-financeiro" checked={apenasFinanceiro} onCheckedChange={(v) => setApenasFinanceiro(!!v)} />
                  <Label htmlFor="apenas-financeiro">Apenas financeiro (sem acesso ao sistema)</Label>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <p>Carregando...</p> : (
        <PaginatedList items={motoristas}>
          {(visible) => (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead className="w-24">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {visible.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{m.nome}</TableCell>
                    <TableCell className="flex gap-1">
                      {(m as any).terceirizado && <Badge variant="secondary">Terceirizado</Badge>}
                      {!m.user_id && <Badge variant="outline">Apenas Financeiro</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditId(m.id); setEditUserId(m.user_id); setNome(m.nome); setPassword(""); setTerceirizado(!!(m as any).terceirizado); setApenasFinanceiro(!m.user_id); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <AlertDialogTitle>Excluir Motorista</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir o motorista "{confirmDelete?.nome}"?</AlertDialogDescription>
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
