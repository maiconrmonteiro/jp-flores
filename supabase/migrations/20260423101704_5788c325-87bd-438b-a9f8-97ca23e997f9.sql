
ALTER TABLE public.pedidos_entrada
ADD COLUMN IF NOT EXISTS nota_foto_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-fornecedor', 'notas-fornecedor', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can upload notas-fornecedor" ON storage.objects;
CREATE POLICY "Admins can upload notas-fornecedor"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'notas-fornecedor'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
);

DROP POLICY IF EXISTS "Anyone can read notas-fornecedor" ON storage.objects;
CREATE POLICY "Anyone can read notas-fornecedor"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'notas-fornecedor');

DROP POLICY IF EXISTS "Admins can delete notas-fornecedor" ON storage.objects;
CREATE POLICY "Admins can delete notas-fornecedor"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'notas-fornecedor'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
);
