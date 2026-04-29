CREATE POLICY "Compradores can update itens_entrada"
ON public.itens_entrada
FOR UPDATE
USING (has_role(auth.uid(), 'comprador'::app_role))
WITH CHECK (has_role(auth.uid(), 'comprador'::app_role));