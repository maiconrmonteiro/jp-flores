CREATE POLICY "Motoristas can update own itens_saida"
ON public.itens_saida
FOR UPDATE
USING (
  pedido_id IN (
    SELECT pedidos_saida.id
    FROM pedidos_saida
    WHERE pedidos_saida.motorista_id IN (
      SELECT motoristas.id
      FROM motoristas
      WHERE motoristas.user_id = auth.uid()
    )
  )
);