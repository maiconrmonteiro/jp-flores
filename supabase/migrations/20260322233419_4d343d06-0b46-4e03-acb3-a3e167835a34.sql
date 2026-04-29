CREATE POLICY "Motoristas can insert own financeiro_receber"
ON public.financeiro_receber
FOR INSERT
TO authenticated
WITH CHECK (
  motorista_id IN (
    SELECT motoristas.id FROM motoristas WHERE motoristas.user_id = auth.uid()
  )
);