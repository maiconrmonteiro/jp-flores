CREATE POLICY "Motoristas can delete own notas"
ON public.notas_motorista
FOR DELETE
TO authenticated
USING (motorista_id IN (
  SELECT motoristas.id FROM motoristas WHERE motoristas.user_id = auth.uid()
));