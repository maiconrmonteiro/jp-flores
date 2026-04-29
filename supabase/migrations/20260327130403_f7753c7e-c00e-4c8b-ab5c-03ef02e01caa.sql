DROP POLICY IF EXISTS "Financeiro can read pedidos_entrada" ON public.pedidos_entrada;
CREATE POLICY "Financeiro can read pedidos_entrada"
ON public.pedidos_entrada
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

DROP POLICY IF EXISTS "Financeiro can read itens_entrada" ON public.itens_entrada;
CREATE POLICY "Financeiro can read itens_entrada"
ON public.itens_entrada
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));