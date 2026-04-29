
-- Close all financeiro_receber where balance is < 0.05
UPDATE public.financeiro_receber
SET status = 'pago',
    valor_pago = valor_total
WHERE status != 'pago'
  AND ABS(valor_total - valor_pago) < 0.05;

-- Archive associated pedidos_saida for those now-paid records
UPDATE public.pedidos_saida
SET archived = true
WHERE id IN (
  SELECT pedido_saida_id FROM public.financeiro_receber
  WHERE status = 'pago' AND archived IS NOT TRUE
)
AND archived = false;
