
-- Contas a Pagar (espelho do financeiro_receber)
CREATE TABLE public.financeiro_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  pedido_entrada_id uuid REFERENCES public.pedidos_entrada(id),
  data_compra date NOT NULL,
  valor_total numeric NOT NULL DEFAULT 0,
  valor_pago numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto',
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage financeiro_pagar" ON public.financeiro_pagar FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Financeiro can manage financeiro_pagar" ON public.financeiro_pagar FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'));

-- Pagamentos a fornecedores
CREATE TABLE public.pagamentos_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  valor numeric NOT NULL,
  data_pagamento date NOT NULL DEFAULT CURRENT_DATE,
  observacao text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pagamentos_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pagamentos_fornecedor" ON public.pagamentos_fornecedor FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Financeiro can manage pagamentos_fornecedor" ON public.pagamentos_fornecedor FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'));

-- Alocações de pagamentos a contas
CREATE TABLE public.pagamento_alocacoes_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid NOT NULL REFERENCES public.pagamentos_fornecedor(id),
  financeiro_pagar_id uuid NOT NULL REFERENCES public.financeiro_pagar(id),
  valor_alocado numeric NOT NULL
);

ALTER TABLE public.pagamento_alocacoes_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pagamento_alocacoes_fornecedor" ON public.pagamento_alocacoes_fornecedor FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Financeiro can manage pagamento_alocacoes_fornecedor" ON public.pagamento_alocacoes_fornecedor FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'));
