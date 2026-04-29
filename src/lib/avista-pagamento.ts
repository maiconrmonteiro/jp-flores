import { supabase } from "@/integrations/supabase/client";

interface RegistrarPagamentoFaturamentoParams {
  financeiroId: string;
  clienteId: string;
  motoristaId: string | null;
  valorPago: number;
  dataPagamento: string; // YYYY-MM-DD
  tipoPagamento: "avista" | "parcial" | "aprazo";
  userId?: string | null;
  observacaoExtra?: string;
}

/**
 * Cria um registro em `pagamentos` + `pagamento_alocacoes` ao faturar uma nota
 * À vista (ou Parcial com valor pago > 0). Isso garante que o pagamento
 * apareça no diálogo "Desfazer Pagamento" e possa ser revertido pela edge
 * function `undo-payment` (que reabrirá o pedido e zerará o valor_pago).
 */
export async function registrarPagamentoFaturamento(
  params: RegistrarPagamentoFaturamentoParams
): Promise<void> {
  const {
    financeiroId,
    clienteId,
    motoristaId,
    valorPago,
    dataPagamento,
    tipoPagamento,
    userId,
    observacaoExtra,
  } = params;

  if (!financeiroId || !clienteId || valorPago <= 0) return;

  const observacao =
    (tipoPagamento === "avista"
      ? "Faturamento à vista"
      : tipoPagamento === "parcial"
      ? "Faturamento parcial"
      : "Faturamento a prazo") +
    (observacaoExtra ? ` · ${observacaoExtra}` : "");

  const { data: pagamento, error: pgErr } = await supabase
    .from("pagamentos")
    .insert({
      cliente_id: clienteId,
      motorista_id: motoristaId,
      valor: valorPago,
      data_pagamento: dataPagamento,
      created_by: userId || null,
      observacao,
    } as any)
    .select("id")
    .single();

  if (pgErr || !pagamento) return;

  await supabase.from("pagamento_alocacoes").insert({
    pagamento_id: pagamento.id,
    financeiro_id: financeiroId,
    valor_alocado: valorPago,
  } as any);
}
