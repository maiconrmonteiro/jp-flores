
CREATE TABLE public.custo_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  data date NOT NULL,
  preco_custo numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(produto_id, data)
);

ALTER TABLE public.custo_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custo_overrides" ON public.custo_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can read custo_overrides" ON public.custo_overrides
  FOR SELECT TO authenticated
  USING (true);
