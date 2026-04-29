-- Indexes on date columns for better query performance
CREATE INDEX IF NOT EXISTS idx_pedidos_entrada_data ON public.pedidos_entrada (data DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_saida_data ON public.pedidos_saida (data DESC);
CREATE INDEX IF NOT EXISTS idx_ambulantes_data ON public.ambulantes (data DESC);