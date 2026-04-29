
ALTER TABLE public.pedidos_entrada ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.pedidos_saida ADD COLUMN archived boolean NOT NULL DEFAULT false;

CREATE INDEX idx_pedidos_entrada_archived ON public.pedidos_entrada (archived);
CREATE INDEX idx_pedidos_saida_archived ON public.pedidos_saida (archived);
