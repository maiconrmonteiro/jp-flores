
CREATE TABLE public.cochos_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  preto integer NOT NULL DEFAULT 0,
  velling integer NOT NULL DEFAULT 0,
  quebrado integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(cliente_id)
);

ALTER TABLE public.cochos_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cochos_cliente" ON public.cochos_cliente FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Financeiro can manage cochos_cliente" ON public.cochos_cliente FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Motoristas can read cochos_cliente" ON public.cochos_cliente FOR SELECT TO authenticated USING (has_role(auth.uid(), 'motorista'::app_role));
CREATE POLICY "Motoristas can update cochos_cliente" ON public.cochos_cliente FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'motorista'::app_role));
CREATE POLICY "Motoristas can insert cochos_cliente" ON public.cochos_cliente FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'motorista'::app_role));
