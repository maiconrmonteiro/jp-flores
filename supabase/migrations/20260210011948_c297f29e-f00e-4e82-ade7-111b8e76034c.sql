
-- Add orcamento_num column to pedidos_saida with random 5-digit default
ALTER TABLE public.pedidos_saida 
ADD COLUMN orcamento_num integer NOT NULL DEFAULT floor(10000 + random() * 90000)::integer;

-- Add orcamento_num column to pedidos_entrada with random 5-digit default
ALTER TABLE public.pedidos_entrada 
ADD COLUMN orcamento_num integer NOT NULL DEFAULT floor(10000 + random() * 90000)::integer;
