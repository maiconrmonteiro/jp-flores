
-- Motoristas can read ALL itens_saida (for company balance view)
CREATE POLICY "Motoristas can read all itens_saida"
ON public.itens_saida
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'motorista'::app_role));

-- Motoristas can read ALL pedidos_saida (for company balance view)
CREATE POLICY "Motoristas can read all pedidos_saida"
ON public.pedidos_saida
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'motorista'::app_role));

-- Motoristas can read ALL itens_ambulante (for company balance view)
CREATE POLICY "Motoristas can read all itens_ambulante"
ON public.itens_ambulante
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'motorista'::app_role));

-- Motoristas can read ALL ambulantes (for company balance view)
CREATE POLICY "Motoristas can read all ambulantes"
ON public.ambulantes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'motorista'::app_role));
