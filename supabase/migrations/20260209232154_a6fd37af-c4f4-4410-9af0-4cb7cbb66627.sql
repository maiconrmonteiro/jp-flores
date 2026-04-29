
CREATE TABLE public.ambulantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES motoristas(id),
  data date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.itens_ambulante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambulante_id uuid NOT NULL REFERENCES ambulantes(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES produtos(id),
  quantidade numeric NOT NULL DEFAULT 0,
  preco numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.itens_saida ADD COLUMN is_baixa_ambulante boolean NOT NULL DEFAULT false;

-- RLS ambulantes
ALTER TABLE public.ambulantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ambulantes"
ON public.ambulantes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read own ambulantes"
ON public.ambulantes FOR SELECT
USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can insert own ambulantes"
ON public.ambulantes FOR INSERT
WITH CHECK (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can update own ambulantes"
ON public.ambulantes FOR UPDATE
USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can delete own ambulantes"
ON public.ambulantes FOR DELETE
USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

-- RLS itens_ambulante
ALTER TABLE public.itens_ambulante ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage itens_ambulante"
ON public.itens_ambulante FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read own itens_ambulante"
ON public.itens_ambulante FOR SELECT
USING (ambulante_id IN (
  SELECT a.id FROM ambulantes a
  JOIN motoristas m ON m.id = a.motorista_id
  WHERE m.user_id = auth.uid()
));

CREATE POLICY "Motoristas can insert own itens_ambulante"
ON public.itens_ambulante FOR INSERT
WITH CHECK (ambulante_id IN (
  SELECT a.id FROM ambulantes a
  JOIN motoristas m ON m.id = a.motorista_id
  WHERE m.user_id = auth.uid()
));

CREATE POLICY "Motoristas can update own itens_ambulante"
ON public.itens_ambulante FOR UPDATE
USING (ambulante_id IN (
  SELECT a.id FROM ambulantes a
  JOIN motoristas m ON m.id = a.motorista_id
  WHERE m.user_id = auth.uid()
));

CREATE POLICY "Motoristas can delete own itens_ambulante"
ON public.itens_ambulante FOR DELETE
USING (ambulante_id IN (
  SELECT a.id FROM ambulantes a
  JOIN motoristas m ON m.id = a.motorista_id
  WHERE m.user_id = auth.uid()
));
