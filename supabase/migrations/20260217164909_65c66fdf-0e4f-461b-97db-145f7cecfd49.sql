
-- Table to store finalized driver settlements (acertos)
CREATE TABLE public.acertos_motorista (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_id UUID NOT NULL REFERENCES public.motoristas(id),
  data DATE NOT NULL,
  custo_total NUMERIC NOT NULL DEFAULT 0,
  margem_percent NUMERIC NOT NULL DEFAULT 32,
  total_cobrar NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Items within each acerto
CREATE TABLE public.itens_acerto_motorista (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acerto_id UUID NOT NULL REFERENCES public.acertos_motorista(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  quantidade NUMERIC NOT NULL DEFAULT 0,
  custo_ativo NUMERIC NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.acertos_motorista ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_acerto_motorista ENABLE ROW LEVEL SECURITY;

-- Only admins can manage acertos
CREATE POLICY "Admins can manage acertos_motorista"
ON public.acertos_motorista FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage itens_acerto_motorista"
ON public.itens_acerto_motorista FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for updated_at
CREATE TRIGGER update_acertos_motorista_updated_at
BEFORE UPDATE ON public.acertos_motorista
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
