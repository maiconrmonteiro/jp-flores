import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PaginatedList } from "@/components/PaginatedList";

interface VarianteRow {
  nome: string;
  fator: string;
}

interface Variante {
  id: string;
  produto_id: string;
  nome_cooperflora: string;
  fator_conversao: number;
  created_at: string;
  produtos?: { descricao: string };
}

export default function Cooperflora() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Variante | null>(null);

  const [produtoId, setProdutoId] = useState("");
  // For creating new (multiple rows)
  const [newRows, setNewRows] = useState<VarianteRow[]>([{ nome: "", fator: "10" }]);
  // For editing (single)
  const [nomeCooperflora, setNomeCooperflora] = useState("");
  const [fatorConversao, setFatorConversao] = useState("10");

  const { data: variantes = [], isLoading } = useQuery({
    queryKey: ["cooperflora-variantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cooperflora_variantes")
        .select("*, produtos(descricao)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Variante[];
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: () => fetchProdutosUpTo(5000),
  });

  const produtoOptions = useMemo(
    () => produtos.map((p: any) => ({ value: p.id, label: `${p.descricao} (${p.unidade})` })),
    [produtos]
  );

  const filtered = useMemo(() => {
    if (!search) return variantes;
    const s = search.toLowerCase();
    return variantes.filter(
      (v) =>
        v.nome_cooperflora.toLowerCase().includes(s) ||
        v.produtos?.descricao?.toLowerCase().includes(s)
    );
  }, [variantes, search]);

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase
          .from("cooperflora_variantes")
          .update({
            produto_id: produtoId,
            nome_cooperflora: nomeCooperflora.trim(),
            fator_conversao: Number(fatorConversao),
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const rows = newRows
          .filter((r) => r.nome.trim())
          .map((r) => ({
            produto_id: produtoId,
            nome_cooperflora: r.nome.trim(),
            fator_conversao: Number(r.fator) || 10,
          }));
        if (rows.length === 0) throw new Error("Adicione pelo menos uma variante");
        const { error } = await supabase
          .from("cooperflora_variantes")
          .insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cooperflora-variantes"] });
      toast.success(editing ? "Variante atualizada" : `${newRows.filter(r => r.nome.trim()).length} variante(s) criada(s)`);
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cooperflora_variantes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cooperflora-variantes"] });
      toast.success("Variante removida");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setProdutoId("");
    setNewRows([{ nome: "", fator: "10" }]);
    setDialogOpen(true);
  }

  function addRow() {
    setNewRows((prev) => [...prev, { nome: "", fator: "10" }]);
  }

  function removeRow(idx: number) {
    setNewRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: keyof VarianteRow, value: string) {
    setNewRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function openEdit(v: Variante) {
    setEditing(v);
    setProdutoId(v.produto_id);
    setNomeCooperflora(v.nome_cooperflora);
    setFatorConversao(String(v.fator_conversao));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  const canSave = editing
    ? produtoId && nomeCooperflora.trim() && Number(fatorConversao) > 0
    : produtoId && newRows.some((r) => r.nome.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Cooperflora – Variantes</h1>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Nova Variante
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto ou variante..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma variante cadastrada.</p>
      ) : (
        <div className="border rounded-lg">
          <PaginatedList items={filtered as any[]}>
            {(visible) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto (nosso)</TableHead>
                    <TableHead>Variante Cooperflora</TableHead>
                    <TableHead className="text-center">Fator Conversão</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((v: any) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        {v.produtos?.descricao ?? "—"}
                      </TableCell>
                      <TableCell>{v.nome_cooperflora}</TableCell>
                      <TableCell className="text-center">{v.fator_conversao}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(v.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PaginatedList>
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Variante" : "Novas Variantes"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produto do sistema</Label>
              <SearchableSelect
                options={produtoOptions}
                value={produtoId}
                onValueChange={setProdutoId}
                placeholder="Selecione um produto..."
              />
            </div>

            {editing ? (
              <>
                <div className="space-y-2">
                  <Label>Nome na Cooperflora</Label>
                  <Input
                    placeholder="Ex: AKM 0,70"
                    value={nomeCooperflora}
                    onChange={(e) => setNomeCooperflora(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fator de conversão (unidades por maço)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={fatorConversao}
                    onChange={(e) => setFatorConversao(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Label>Variantes na Cooperflora</Label>
                {newRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Nome (ex: Avalanche 0,60)"
                      value={row.nome}
                      onChange={(e) => updateRow(idx, "nome", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Fator"
                      value={row.fator}
                      onChange={(e) => updateRow(idx, "fator", e.target.value)}
                      className="w-20"
                    />
                    {newRows.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => removeRow(idx)}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addRow} className="w-full">
                  <Plus className="mr-2 h-3 w-3" /> Adicionar variante
                </Button>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!canSave || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir variante?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
