import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Undo2, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: filter pagamentos by motorista's clients */
  motoristaId?: string;
  /** Optional: filter pagamentos by data_pagamento range (YYYY-MM-DD) */
  dateFrom?: string;
  dateTo?: string;
}

export default function UndoPaymentDialog({ open, onOpenChange, motoristaId, dateFrom, dateTo }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmPg, setConfirmPg] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { data: recentPagamentos = [], isLoading } = useQuery({
    queryKey: ["recent-pagamentos-undo", motoristaId, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("pagamentos")
        .select("*, clientes(nome), pagamento_alocacoes(id, financeiro_id, valor_alocado)")
        .order("data_pagamento", { ascending: false })
        .order("created_at", { ascending: false });

      if (dateFrom) query = query.gte("data_pagamento", dateFrom);
      if (dateTo) query = query.lte("data_pagamento", dateTo);

      const { data, error } = await query.limit(5000);
      if (error) throw error;

      let results = data || [];

      // If motoristaId, filter to only clients that have recebiveis for this motorista
      if (motoristaId) {
        const { data: recClientes } = await supabase
          .from("financeiro_receber")
          .select("cliente_id")
          .eq("motorista_id", motoristaId);
        const clienteIds = new Set((recClientes || []).map((r: any) => r.cliente_id));
        results = results.filter((p: any) => clienteIds.has(p.cliente_id));
      }

      return results;
    },
    enabled: open,
  });

  const cancelarPagamento = async (pg: any) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("undo-payment", {
        body: { pagamento_id: pg.id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      const alocacaoIds = new Set<string>(result?.deleted_allocation_ids || []);
      const recebiveisAtualizados = new Map<string, { valor_pago: number; status: string }>(
        (result?.updated_receivables || []).map((rec: any) => [
          rec.id,
          {
            valor_pago: Number(rec.valor_pago || 0),
            status: rec.status,
          },
        ])
      );

      qc.setQueryData(["pagamentos"], (old: any[] | undefined) =>
        (old || []).filter((item: any) => item.id !== pg.id)
      );

      qc.setQueryData(["pagamento_alocacoes"], (old: any[] | undefined) =>
        (old || []).filter((item: any) => item.pagamento_id !== pg.id && !alocacaoIds.has(item.id))
      );

      qc.setQueriesData({ queryKey: ["recent-pagamentos-undo"] }, (old: any[] | undefined) =>
        (old || []).filter((item: any) => item.id !== pg.id)
      );

      const applyRecebiveisPatch = (old: any[] | undefined) =>
        (old || []).map((item: any) => {
          const updated = recebiveisAtualizados.get(item.id);
          return updated ? { ...item, ...updated } : item;
        });

      qc.setQueryData(["financeiro_receber"], applyRecebiveisPatch);
      qc.setQueriesData({ queryKey: ["motorista-financeiro"] }, applyRecebiveisPatch);

      toast({ title: `Pagamento de R$ ${Number(pg.valor).toFixed(2)} cancelado!` });
      setConfirmPg(null);

      await Promise.all([
        qc.refetchQueries({ queryKey: ["financeiro_receber"], type: "active" }),
        qc.refetchQueries({ queryKey: ["motorista-financeiro"], type: "active" }),
        qc.refetchQueries({ queryKey: ["pagamentos"], type: "active" }),
        qc.refetchQueries({ queryKey: ["pagamento_alocacoes"], type: "active" }),
        qc.refetchQueries({ queryKey: ["recent-pagamentos-undo"], type: "active" }),
        qc.invalidateQueries({ queryKey: ["pedidos_saida"] }),
      ]);
    } catch (e: any) {
      toast({ title: "Erro ao cancelar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              Desfazer Pagamento
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" id="undo-payment-description">Selecione o pagamento que deseja cancelar. As notas vinculadas serão reabertas.</p>
          <div className="flex-1 overflow-y-auto space-y-2 mt-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentPagamentos.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum pagamento encontrado</p>
            ) : (
              recentPagamentos.map((pg: any) => {
                const numAlocacoes = (pg.pagamento_alocacoes || []).length;
                return (
                  <div
                    key={pg.id}
                    className="rounded-lg border p-3 cursor-pointer hover:bg-accent/50 active:scale-[0.98] transition-all"
                    onClick={() => setConfirmPg(pg)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{pg.clientes?.nome || "—"}</span>
                      <span className="font-bold text-sm">R$ {Number(pg.valor).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {pg.data_pagamento?.split("-").reverse().join("/")}
                        {pg.observacao ? ` · ${pg.observacao.substring(0, 40)}${pg.observacao.length > 40 ? "…" : ""}` : ""}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {numAlocacoes} nota{numAlocacoes !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmPg} onOpenChange={v => { if (!v) setConfirmPg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Cancelamento</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja cancelar o pagamento de <strong>R$ {confirmPg ? Number(confirmPg.valor).toFixed(2) : ""}</strong> do cliente <strong>{confirmPg?.clientes?.nome || "—"}</strong> em {confirmPg?.data_pagamento?.split("-").reverse().join("/")}?
              {(confirmPg?.pagamento_alocacoes || []).length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  {(confirmPg?.pagamento_alocacoes || []).length} nota(s) vinculada(s) serão reabertas.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmPg && cancelarPagamento(confirmPg)}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancelar Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}