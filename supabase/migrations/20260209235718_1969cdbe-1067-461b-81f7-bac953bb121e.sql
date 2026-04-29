
-- Allow motoristas to read pedidos_entrada (to get dates)
CREATE POLICY "Motoristas can read pedidos_entrada"
ON public.pedidos_entrada
FOR SELECT
USING (has_role(auth.uid(), 'motorista'::app_role));

-- Allow motoristas to read itens_entrada (to get cost prices)
CREATE POLICY "Motoristas can read itens_entrada"
ON public.itens_entrada
FOR SELECT
USING (has_role(auth.uid(), 'motorista'::app_role));
