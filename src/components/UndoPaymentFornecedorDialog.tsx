import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Undo2, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UndoPaymentFornecedorDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmPg, setConfirmPg] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { data: recentPagamentos = [], isLoading } = useQuery({
    queryKey: ["recent-pagamentos-fornecedor-undo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos_fornecedor")
        .select("*, fornecedores(nome), pagamento_alocacoes_fornecedor(id, financeiro_pagar_id, valor_alocado)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const cancelarPagamento = async (pg: any) => {
    setLoading(true);
    try {
      const alocacoes = pg.pagamento_alocacoes_fornecedor || [];
      const obs = pg.observacao || "";

      // Parse discount info from observacao (format: "... | nota:<id> | desconto:<value>")
      const descontoMatch = obs.match(/desconto:([\d.]+)/);
      const descontoValor = descontoMatch ? parseFloat(descontoMatch[1]) : 0;
      const notaMatch = obs.match(/nota:([a-f0-9-]+)/);
      const notaId = notaMatch ? notaMatch[1] : null;

      // Reverse each allocation
      for (const aloc of alocacoes) {
        const { data: fin } = await supabase
          .from("financeiro_pagar")
          .select("valor_pago, valor_total")
          .eq("id", aloc.financeiro_pagar_id)
          .single();

        if (fin) {
          const novoValorPago = Math.max(0, Number(fin.valor_pago) - Number(aloc.valor_alocado));
          // Restore discount if this is the nota that had the discount
          const restaurarDesconto = descontoValor > 0 && aloc.financeiro_pagar_id === notaId;
          const novoValorTotal = restaurarDesconto ? Number(fin.valor_total) + descontoValor : Number(fin.valor_total);
          const novoStatus = novoValorPago >= novoValorTotal - 0.005 ? "pago" : novoValorPago > 0 ? "parcial" : "aberto";
          await supabase.from("financeiro_pagar").update({
            valor_pago: novoValorPago,
            valor_total: novoValorTotal,
            status: novoStatus,
          }).eq("id", aloc.financeiro_pagar_id);
        }
      }

      // If discount was applied but no allocation existed (valor=0 payment), restore valor_total on the nota
      if (descontoValor > 0 && notaId && alocacoes.length === 0) {
        const { data: fin } = await supabase
          .from("financeiro_pagar")
          .select("valor_pago, valor_total")
          .eq("id", notaId)
          .single();
        if (fin) {
          const novoValorTotal = Number(fin.valor_total) + descontoValor;
          const novoStatus = Number(fin.valor_pago) >= novoValorTotal - 0.005 ? "pago" : Number(fin.valor_pago) > 0 ? "parcial" : "aberto";
          await supabase.from("financeiro_pagar").update({
            valor_total: novoValorTotal,
            status: novoStatus,
          }).eq("id", notaId);
        }
      }

      // Delete allocations
      if (alocacoes.length > 0) {
        await supabase.from("pagamento_alocacoes_fornecedor").delete().eq("pagamento_id", pg.id);
      }

      // Delete payment
      await supabase.from("pagamentos_fornecedor").delete().eq("id", pg.id);

      toast({ title: `Pagamento de R$ ${Number(pg.valor).toFixed(2)} cancelado!` });
      setConfirmPg(null);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["financeiro_pagar"] }),
        qc.invalidateQueries({ queryKey: ["pagamentos_fornecedor"] }),
        qc.invalidateQueries({ queryKey: ["pagamento_alocacoes_fornecedor"] }),
        qc.invalidateQueries({ queryKey: ["recent-pagamentos-fornecedor-undo"] }),
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
              Desfazer Pagamento (Fornecedor)
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione o pagamento que deseja cancelar. As notas vinculadas serão reabertas.</p>
          <div className="flex-1 overflow-y-auto space-y-2 mt-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentPagamentos.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum pagamento encontrado</p>
            ) : (
              recentPagamentos.map((pg: any) => {
                const numAlocacoes = (pg.pagamento_alocacoes_fornecedor || []).length;
                const obsText = pg.observacao || "";
                const descontoMatch = obsText.match(/desconto:([\d.]+)/);
                const temDesconto = !!descontoMatch;
                const descontoVal = descontoMatch ? parseFloat(descontoMatch[1]) : 0;
                // Clean observacao for display
                const obsDisplay = obsText.replace(/\s*\|\s*nota:[a-f0-9-]+/g, "").replace(/\s*\|\s*desconto:[\d.]+/g, "").trim();
                return (
                  <div
                    key={pg.id}
                    className="rounded-lg border p-3 cursor-pointer hover:bg-accent/50 active:scale-[0.98] transition-all"
                    onClick={() => setConfirmPg(pg)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{pg.fornecedores?.nome || "—"}</span>
                      <div className="text-right">
                        <span className="font-bold text-sm">R$ {Number(pg.valor).toFixed(2)}</span>
                        {temDesconto && <span className="block text-xs text-orange-600">Desc: R$ {descontoVal.toFixed(2)}</span>}
                      </div>
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
              Deseja cancelar o pagamento de <strong>R$ {confirmPg ? Number(confirmPg.valor).toFixed(2) : ""}</strong> do fornecedor <strong>{confirmPg?.fornecedores?.nome || "—"}</strong> em {confirmPg?.data_pagamento?.split("-").reverse().join("/")}?
              {(confirmPg?.pagamento_alocacoes_fornecedor || []).length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  {(confirmPg?.pagamento_alocacoes_fornecedor || []).length} nota(s) vinculada(s) serão reabertas.
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
