ALTER TABLE public.fechamento_semanal
  ADD COLUMN venda_manual numeric DEFAULT NULL,
  ADD COLUMN compra_manual numeric DEFAULT NULL;