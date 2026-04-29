
-- Desfaz arquivamento dos pedidos COZO E-106 (58526) e BOX C-052 (80187) arquivados por engano em 23/04/2026

-- 1. Remover alocações de pagamento dos financeiros_pagar
DELETE FROM public.pagamento_alocacoes_fornecedor
WHERE financeiro_pagar_id IN (
  '39761995-d87d-4957-902d-526732b30cd5',
  'f48574bc-d622-4be6-a9f7-da5d7aa01208'
);

-- 2. Remover pagamentos correspondentes
DELETE FROM public.pagamentos_fornecedor
WHERE id IN (
  'fbc7cbcb-dfed-41f1-b680-1fdb17402bbb',
  '3129ee34-a331-4a57-ac21-76c7ef892bfd'
);

-- 3. Remover registros financeiro_pagar
DELETE FROM public.financeiro_pagar
WHERE id IN (
  '39761995-d87d-4957-902d-526732b30cd5',
  'f48574bc-d622-4be6-a9f7-da5d7aa01208'
);

-- 4. Desarquivar pedidos
UPDATE public.pedidos_entrada
SET archived = false
WHERE id IN (
  'efde0974-40eb-4d75-bd40-f7d7efc00279',
  '1e0f47b3-fd5e-42ad-b265-30c7ea1fd84e'
);
