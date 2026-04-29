
CREATE TABLE public.notas_motorista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  valor numeric NOT NULL DEFAULT 0,
  data_lancamento date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date NOT NULL DEFAULT (CURRENT_DATE + interval '14 days'),
  status text NOT NULL DEFAULT 'pendente',
  observacao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notas_motorista ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notas_motorista"
  ON public.notas_motorista FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Motoristas can read own notas"
  ON public.notas_motorista FOR SELECT TO authenticated
  USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can insert own notas"
  ON public.notas_motorista FOR INSERT TO authenticated
  WITH CHECK (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can update own notas"
  ON public.notas_motorista FOR UPDATE TO authenticated
  USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));
