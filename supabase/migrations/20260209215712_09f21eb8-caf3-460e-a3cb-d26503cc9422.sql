
-- Allow compradores to delete itens_entrada (needed for editing orders)
CREATE POLICY "Compradores can delete itens_entrada"
ON public.itens_entrada
FOR DELETE
USING (has_role(auth.uid(), 'comprador'::app_role));

-- Allow compradores to update pedidos_entrada
CREATE POLICY "Compradores can update pedidos_entrada"
ON public.pedidos_entrada
FOR UPDATE
USING (has_role(auth.uid(), 'comprador'::app_role));

-- Allow motoristas to delete itens_saida (needed for editing orders)
CREATE POLICY "Motoristas can delete own itens_saida"
ON public.itens_saida
FOR DELETE
USING (pedido_id IN (
  SELECT pedidos_saida.id FROM pedidos_saida
  WHERE pedidos_saida.motorista_id IN (
    SELECT motoristas.id FROM motoristas WHERE motoristas.user_id = auth.uid()
  )
));

-- Allow motoristas to update their own pedidos_saida
CREATE POLICY "Motoristas can update own pedidos_saida"
ON public.pedidos_saida
FOR UPDATE
USING (motorista_id IN (
  SELECT motoristas.id FROM motoristas WHERE motoristas.user_id = auth.uid()
));
