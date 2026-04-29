
-- Add dia_semana to cliente_templates
ALTER TABLE public.cliente_templates 
  ADD COLUMN dia_semana text NOT NULL DEFAULT 'terca';

-- Table to log auto-created orders so motorista sees popup
CREATE TABLE public.auto_pedidos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  pedido_saida_id uuid NOT NULL REFERENCES public.pedidos_saida(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.cliente_templates(id) ON DELETE CASCADE,
  cliente_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false
);

ALTER TABLE public.auto_pedidos_log ENABLE ROW LEVEL SECURITY;

-- Motoristas can read/update their own auto_pedidos_log
CREATE POLICY "Motoristas can read own auto_pedidos_log" ON public.auto_pedidos_log
  FOR SELECT TO authenticated
  USING (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can update own auto_pedidos_log" ON public.auto_pedidos_log
  FOR UPDATE TO authenticated
  USING (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

-- Admins full access
CREATE POLICY "Admins can manage auto_pedidos_log" ON public.auto_pedidos_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
