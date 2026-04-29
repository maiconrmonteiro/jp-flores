
-- Add motorista_id to cliente_templates so motoristas can own their templates
ALTER TABLE public.cliente_templates ADD COLUMN motorista_id uuid REFERENCES public.motoristas(id);

-- Motoristas can INSERT their own cliente_templates
CREATE POLICY "Motoristas can insert own cliente_templates"
ON public.cliente_templates
FOR INSERT
TO authenticated
WITH CHECK (
  motorista_id IN (
    SELECT id FROM public.motoristas WHERE user_id = auth.uid()
  )
);

-- Motoristas can UPDATE their own cliente_templates
CREATE POLICY "Motoristas can update own cliente_templates"
ON public.cliente_templates
FOR UPDATE
TO authenticated
USING (
  motorista_id IN (
    SELECT id FROM public.motoristas WHERE user_id = auth.uid()
  )
);

-- Motoristas can DELETE their own cliente_templates
CREATE POLICY "Motoristas can delete own cliente_templates"
ON public.cliente_templates
FOR DELETE
TO authenticated
USING (
  motorista_id IN (
    SELECT id FROM public.motoristas WHERE user_id = auth.uid()
  )
);

-- Motoristas can INSERT items on their own cliente templates
CREATE POLICY "Motoristas can insert own cli template items"
ON public.itens_cliente_template
FOR INSERT
TO authenticated
WITH CHECK (
  template_id IN (
    SELECT t.id FROM public.cliente_templates t
    JOIN public.motoristas m ON m.id = t.motorista_id
    WHERE m.user_id = auth.uid()
  )
);

-- Motoristas can UPDATE items on their own cliente templates
CREATE POLICY "Motoristas can update own cli template items"
ON public.itens_cliente_template
FOR UPDATE
TO authenticated
USING (
  template_id IN (
    SELECT t.id FROM public.cliente_templates t
    JOIN public.motoristas m ON m.id = t.motorista_id
    WHERE m.user_id = auth.uid()
  )
);

-- Motoristas can DELETE items on their own cliente templates
CREATE POLICY "Motoristas can delete own cli template items"
ON public.itens_cliente_template
FOR DELETE
TO authenticated
USING (
  template_id IN (
    SELECT t.id FROM public.cliente_templates t
    JOIN public.motoristas m ON m.id = t.motorista_id
    WHERE m.user_id = auth.uid()
  )
);
