CREATE POLICY "Motoristas can delete own pedidos_saida"
ON public.pedidos_saida
FOR DELETE
USING (motorista_id IN (
  SELECT motoristas.id FROM motoristas WHERE motoristas.user_id = auth.uid()
));