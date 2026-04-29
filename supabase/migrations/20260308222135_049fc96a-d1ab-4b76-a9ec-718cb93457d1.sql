
-- Financeiro: contas a receber
CREATE TABLE public.financeiro_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_saida_id uuid REFERENCES public.pedidos_saida(id) ON DELETE CASCADE UNIQUE NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id) NOT NULL,
  motorista_id uuid REFERENCES public.motoristas(id) NOT NULL,
  data_venda date NOT NULL,
  valor_total numeric NOT NULL DEFAULT 0,
  valor_pago numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto',
  tipo_pagamento text NOT NULL DEFAULT 'aprazo',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_receber ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage financeiro_receber" ON public.financeiro_receber FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Motoristas can read financeiro_receber" ON public.financeiro_receber FOR SELECT TO authenticated USING (has_role(auth.uid(), 'motorista'::app_role));

-- Pagamentos
CREATE TABLE public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) NOT NULL,
  valor numeric NOT NULL,
  data_pagamento date NOT NULL DEFAULT CURRENT_DATE,
  observacao text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pagamentos" ON public.pagamentos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Alocações de pagamento (FIFO)
CREATE TABLE public.pagamento_alocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE CASCADE NOT NULL,
  financeiro_id uuid REFERENCES public.financeiro_receber(id) ON DELETE CASCADE NOT NULL,
  valor_alocado numeric NOT NULL
);

ALTER TABLE public.pagamento_alocacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pagamento_alocacoes" ON public.pagamento_alocacoes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
