
CREATE TABLE public.cooperflora_variantes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome_cooperflora text NOT NULL,
  fator_conversao numeric NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cooperflora_variantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cooperflora_variantes"
ON public.cooperflora_variantes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read cooperflora_variantes"
ON public.cooperflora_variantes
FOR SELECT
TO authenticated
USING (true);
