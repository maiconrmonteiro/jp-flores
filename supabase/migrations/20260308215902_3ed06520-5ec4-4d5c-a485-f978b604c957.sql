
-- Add comprador_id column to pedidos_entrada
ALTER TABLE public.pedidos_entrada 
ADD COLUMN comprador_id uuid REFERENCES public.compradores(id);

-- Set all existing entries to Bito
UPDATE public.pedidos_entrada 
SET comprador_id = '1eedb8f5-5e0a-44fe-8a93-972ff48ab420';

-- Make it NOT NULL after backfill
ALTER TABLE public.pedidos_entrada 
ALTER COLUMN comprador_id SET NOT NULL;

-- Set default to Bito
ALTER TABLE public.pedidos_entrada 
ALTER COLUMN comprador_id SET DEFAULT '1eedb8f5-5e0a-44fe-8a93-972ff48ab420';
