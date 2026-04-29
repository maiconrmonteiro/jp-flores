
CREATE TABLE public.fechamento_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  diesel numeric NOT NULL DEFAULT 0,
  despesas numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(motorista_id, semana_inicio)
);

ALTER TABLE public.fechamento_semanal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fechamento_semanal" ON public.fechamento_semanal
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Motoristas can read own fechamento" ON public.fechamento_semanal
  FOR SELECT TO authenticated
  USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can insert own fechamento" ON public.fechamento_semanal
  FOR INSERT TO authenticated
  WITH CHECK (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can update own fechamento" ON public.fechamento_semanal
  FOR UPDATE TO authenticated
  USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Financeiro can manage fechamento_semanal" ON public.fechamento_semanal
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'));
