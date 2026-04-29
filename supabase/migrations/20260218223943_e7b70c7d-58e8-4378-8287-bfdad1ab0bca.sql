
-- Create orcamentos table
CREATE TABLE public.orcamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_id UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

-- Create itens_orcamento table
CREATE TABLE public.itens_orcamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  quantidade NUMERIC NOT NULL DEFAULT 0,
  preco NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.itens_orcamento ENABLE ROW LEVEL SECURITY;

-- RLS for orcamentos
CREATE POLICY "Admins can manage orcamentos"
  ON public.orcamentos FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read own orcamentos"
  ON public.orcamentos FOR SELECT
  USING (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can insert own orcamentos"
  ON public.orcamentos FOR INSERT
  WITH CHECK (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can update own orcamentos"
  ON public.orcamentos FOR UPDATE
  USING (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

CREATE POLICY "Motoristas can delete own orcamentos"
  ON public.orcamentos FOR DELETE
  USING (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

-- RLS for itens_orcamento
CREATE POLICY "Admins can manage itens_orcamento"
  ON public.itens_orcamento FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read own itens_orcamento"
  ON public.itens_orcamento FOR SELECT
  USING (orcamento_id IN (
    SELECT o.id FROM public.orcamentos o
    JOIN public.motoristas m ON m.id = o.motorista_id
    WHERE m.user_id = auth.uid()
  ));

CREATE POLICY "Motoristas can insert own itens_orcamento"
  ON public.itens_orcamento FOR INSERT
  WITH CHECK (orcamento_id IN (
    SELECT o.id FROM public.orcamentos o
    JOIN public.motoristas m ON m.id = o.motorista_id
    WHERE m.user_id = auth.uid()
  ));

CREATE POLICY "Motoristas can update own itens_orcamento"
  ON public.itens_orcamento FOR UPDATE
  USING (orcamento_id IN (
    SELECT o.id FROM public.orcamentos o
    JOIN public.motoristas m ON m.id = o.motorista_id
    WHERE m.user_id = auth.uid()
  ));

CREATE POLICY "Motoristas can delete own itens_orcamento"
  ON public.itens_orcamento FOR DELETE
  USING (orcamento_id IN (
    SELECT o.id FROM public.orcamentos o
    JOIN public.motoristas m ON m.id = o.motorista_id
    WHERE m.user_id = auth.uid()
  ));

-- Trigger to update updated_at
CREATE TRIGGER update_orcamentos_updated_at
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
