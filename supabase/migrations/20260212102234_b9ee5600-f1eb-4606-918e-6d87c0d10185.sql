
-- Add qty_pedida column to store original admin quantity
ALTER TABLE public.itens_entrada ADD COLUMN qty_pedida numeric NOT NULL DEFAULT 0;

-- Populate existing rows: set qty_pedida = quantidade (original value)
UPDATE public.itens_entrada SET qty_pedida = quantidade;
