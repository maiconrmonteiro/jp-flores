CREATE POLICY "Entradas can upload notas-fornecedor"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'notas-fornecedor' AND has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can update notas-fornecedor"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'notas-fornecedor' AND has_role(auth.uid(), 'entradas'::app_role));