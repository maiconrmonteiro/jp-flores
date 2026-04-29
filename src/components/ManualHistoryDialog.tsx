import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  motoristaId?: string;
}

export default function ManualHistoryDialog({ open, onOpenChange, motoristaId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Manual entries = archived pedido with zero itens_saida (no real items)
  const { data: manuais = [], isLoading } = useQuery({
    queryKey: ["manual-history", motoristaId || "all", open],
    queryFn: async () => {
      // Fetch last 200 archived pedidos (with linked financeiro_receber)
      let q = supabase
        .from("pedidos_saida")
        .select(`
          id, data, observacao, created_at, motorista_id, cliente_id,
          clientes(nome),
          motoristas(nome),
          financeiro_receber!inner(id, valor_total, valor_pago, status, tipo_pagamento)
        `)
        .eq("archived", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (motoristaId) q = q.eq("motorista_id", motoristaId);
      const { data, error } = await q;
      if (error) throw error;

      const ids = (data || []).map((p: any) => p.id);
      if (ids.length === 0) return [];

      // Get item counts per pedido (paginated)
      const itemRows = await fetchAll<any>(
        "itens_saida",
        "pedido_id",
        "pedido_id",
        true
      );
      const counts = new Map<string, number>();
      for (const r of itemRows) {
        if (ids.includes(r.pedido_id)) {
          counts.set(r.pedido_id, (counts.get(r.pedido_id) || 0) + 1);
        }
      }

      // Manual = 0 items in itens_saida
      return (data || []).filter((p: any) => (counts.get(p.id) || 0) === 0).slice(0, 50);
    },
    enabled: open,
  });

  const desfazer = async (m: any) => {
    setLoading(true);
    try {
      const fr = m.financeiro_receber?.[0] || m.financeiro_receber;
      const frId = fr?.id;

      // Check for payment allocations
      if (frId) {
        const { data: alocs } = await supabase
          .from("pagamento_alocacoes")
          .select("id")
          .eq("financeiro_id", frId)
          .limit(1);
        if (alocs && alocs.length > 0) {
          toast({
            title: "Pagamento vinculado",
            description: "Esta conta tem pagamentos. Desfaça o pagamento antes (botão Desfazer Pgto).",
            variant: "destructive",
          });
          setLoading(false);
          setConfirm(null);
          return;
        }
        await supabase.from("financeiro_receber").delete().eq("id", frId);
      }
      await supabase.from("pedidos_saida").delete().eq("id", m.id);

      toast({ title: "Conta manual removida!" });
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["manual-history"] });
      qc.invalidateQueries({ queryKey: ["motorista-financeiro"] });
      qc.invalidateQueries({ queryKey: ["financeiro-receber"] });
      qc.invalidateQueries({ queryKey: ["recebiveis"] });
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fmtMoney = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Contas Manuais</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : manuais.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma conta manual encontrada.</div>
          ) : (
            <div className="space-y-2">
              {manuais.map((m: any) => {
                const fr = Array.isArray(m.financeiro_receber) ? m.financeiro_receber[0] : m.financeiro_receber;
                const valor = Number(fr?.valor_total || 0);
                const pago = Number(fr?.valor_pago || 0);
                const status = fr?.status || "aberto";
                return (
                  <div
                    key={m.id}
                    className="border rounded-lg p-3 hover:bg-accent cursor-pointer flex items-start justify-between gap-3"
                    onClick={() => setConfirm(m)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{m.clientes?.nome || "—"}</span>
                        {!motoristaId && (
                          <Badge variant="outline" className="text-xs">{m.motoristas?.nome || "—"}</Badge>
                        )}
                        <Badge
                          variant={status === "pago" ? "default" : status === "parcial" ? "secondary" : "outline"}
                          className="text-xs"
                        >
                          {status === "pago" ? "Pago" : status === "parcial" ? "Parcial" : "Aberto"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Venda: {format(new Date(m.data + "T00:00:00"), "dd/MM/yyyy")} •
                        Lançado: {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                      </div>
                      {m.observacao && (
                        <div className="text-xs italic text-muted-foreground mt-1 truncate">"{m.observacao}"</div>
                      )}
                      <div className="text-sm font-medium mt-1">
                        {fmtMoney(valor)}
                        {pago > 0 && <span className="text-muted-foreground ml-2 text-xs">(pago {fmtMoney(pago)})</span>}
                      </div>
                    </div>
                    <Trash2 className="h-4 w-4 text-destructive shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Desfazer conta manual?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  <strong>{confirm?.clientes?.nome}</strong> — {fmtMoney(Number((Array.isArray(confirm?.financeiro_receber) ? confirm?.financeiro_receber[0] : confirm?.financeiro_receber)?.valor_total || 0))}
                </div>
                <div className="text-xs">
                  Esta ação removerá permanentemente a conta a receber. Se houver pagamentos vinculados, desfaça-os primeiro.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirm) desfazer(confirm); }}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Removendo..." : "Sim, desfazer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
