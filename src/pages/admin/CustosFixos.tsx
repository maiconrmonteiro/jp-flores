import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DatePicker } from "@/components/DatePicker";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Search, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PaginatedList } from "@/components/PaginatedList";

function parseDecimal(v: string): number {
  return Number(v.replace(",", "."));
}

export default function CustosFixos() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProduto, setSelectedProduto] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [precoCusto, setPrecoCusto] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: () => fetchProdutosUpTo(5000),
    staleTime: 5 * 60_000,
  });

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["custo-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custo_overrides")
        .select("*")
        .order("data", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const produtoOptions = useMemo(
    () => produtos.map((p: any) => ({ value: p.id, label: `${p.descricao} (${p.unidade})` })),
    [produtos]
  );

  const produtoMap = useMemo(() => {
    const m: Record<string, any> = {};
    produtos.forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [produtos]);

  const filtered = useMemo(() => {
    if (!search) return overrides;
    const s = search.toLowerCase();
    return overrides.filter((o: any) => {
      const prod = produtoMap[o.produto_id];
      return prod?.descricao?.toLowerCase().includes(s);
    });
  }, [overrides, search, produtoMap]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedProduto || !selectedDate || !precoCusto) throw new Error("Preencha todos os campos");
      const preco = parseDecimal(precoCusto);
      if (isNaN(preco) || preco <= 0) throw new Error("Preço inválido");

      const dataStr = selectedDate;

      if (editId) {
        const { error } = await supabase
          .from("custo_overrides")
          .update({ produto_id: selectedProduto, data: dataStr, preco_custo: preco })
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("custo_overrides")
          .upsert({ produto_id: selectedProduto, data: dataStr, preco_custo: preco }, { onConflict: "produto_id,data" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editId ? "Custo atualizado" : "Custo fixo salvo" });
      qc.invalidateQueries({ queryKey: ["custo-overrides"] });
      qc.invalidateQueries({ queryKey: ["latest-cost-prices"] });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custo_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Custo fixo removido" });
      qc.invalidateQueries({ queryKey: ["custo-overrides"] });
      qc.invalidateQueries({ queryKey: ["latest-cost-prices"] });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setSelectedProduto("");
    setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    setPrecoCusto("");
    setEditId(null);
    setDialogOpen(false);
  }

  function startEdit(o: any) {
    setSelectedProduto(o.produto_id);
    setSelectedDate(o.data);
    setPrecoCusto(String(o.preco_custo).replace(".", ","));
    setEditId(o.id);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6" />
          Custos Fixos
        </h1>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Custo Fixo
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Quando definido, o preço de custo fixo substitui o valor real das entradas em todo o sistema.
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum custo fixo definido.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <PaginatedList items={filtered as any[]} resetDeps={[search]}>
                {(visible) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Custo Fixo</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((o: any) => {
                        const prod = produtoMap[o.produto_id];
                        return (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => startEdit(o)}
                          >
                            <TableCell className="font-medium">
                              {prod ? `${prod.descricao} (${prod.unidade})` : o.produto_id}
                            </TableCell>
                            <TableCell>{o.data.split("-").reverse().join("/")}</TableCell>
                            <TableCell className="text-right font-mono">
                              R$ {Number(o.preco_custo).toFixed(2).replace(".", ",")}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={e => { e.stopPropagation(); setConfirmDelete(o.id); }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </PaginatedList>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Custo Fixo" : "Novo Custo Fixo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Produto</label>
              <SearchableSelect
                options={produtoOptions}
                value={selectedProduto}
                onValueChange={setSelectedProduto}
                placeholder="Selecione o produto"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <DatePicker value={selectedDate} onChange={setSelectedDate} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Preço de Custo</label>
              <Input
                placeholder="0,00"
                value={precoCusto}
                onChange={e => setPrecoCusto(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!confirmDelete} onOpenChange={v => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover custo fixo?</AlertDialogTitle>
            <AlertDialogDescription>
              O sistema voltará a usar o preço real das entradas para este produto nesta data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove.mutate(confirmDelete)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
