CREATE POLICY "Motoristas can update own markup"
ON public.motoristas
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());