
-- Templates de pedidos fixos de clientes
CREATE TABLE public.cliente_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cliente_templates"
ON public.cliente_templates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read cliente_templates"
ON public.cliente_templates FOR SELECT
USING (has_role(auth.uid(), 'motorista'::app_role));

-- Itens dos templates de clientes
CREATE TABLE public.itens_cliente_template (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.cliente_templates(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  preco NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.itens_cliente_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage itens_cliente_template"
ON public.itens_cliente_template FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read itens_cliente_template"
ON public.itens_cliente_template FOR SELECT
USING (has_role(auth.uid(), 'motorista'::app_role));
