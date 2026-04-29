
-- Templates de pedidos fixos de ambulante
CREATE TABLE public.ambulante_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  motorista_id UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ambulante_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ambulante_templates"
ON public.ambulante_templates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read own templates"
ON public.ambulante_templates FOR SELECT
USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));

-- Itens dos templates
CREATE TABLE public.itens_ambulante_template (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.ambulante_templates(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.itens_ambulante_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage itens_ambulante_template"
ON public.itens_ambulante_template FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can read own template items"
ON public.itens_ambulante_template FOR SELECT
USING (template_id IN (
  SELECT t.id FROM ambulante_templates t
  JOIN motoristas m ON m.id = t.motorista_id
  WHERE m.user_id = auth.uid()
));
