
ALTER TABLE public.acertos_motorista 
  ADD COLUMN desconto_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN desconto_obs text NOT NULL DEFAULT '';
