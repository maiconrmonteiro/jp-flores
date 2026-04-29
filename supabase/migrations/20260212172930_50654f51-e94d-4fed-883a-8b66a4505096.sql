
CREATE POLICY "Motoristas can insert clientes"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'motorista'::app_role));
