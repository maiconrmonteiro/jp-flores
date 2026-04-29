ALTER TABLE public.orcamentos ADD COLUMN desconto_tipo text NOT NULL DEFAULT 'percent';
ALTER TABLE public.orcamentos ADD COLUMN desconto_valor numeric NOT NULL DEFAULT 0;