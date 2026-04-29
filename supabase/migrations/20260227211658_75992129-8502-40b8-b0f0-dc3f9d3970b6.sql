
-- Motoristas can INSERT their own ambulante_templates
CREATE POLICY "Motoristas can insert own ambulante_templates"
ON public.ambulante_templates
FOR INSERT
TO authenticated
WITH CHECK (
  motorista_id IN (
    SELECT id FROM public.motoristas WHERE user_id = auth.uid()
  )
);

-- Motoristas can UPDATE their own ambulante_templates
CREATE POLICY "Motoristas can update own ambulante_templates"
ON public.ambulante_templates
FOR UPDATE
TO authenticated
USING (
  motorista_id IN (
    SELECT id FROM public.motoristas WHERE user_id = auth.uid()
  )
);

-- Motoristas can DELETE their own ambulante_templates
CREATE POLICY "Motoristas can delete own ambulante_templates"
ON public.ambulante_templates
FOR DELETE
TO authenticated
USING (
  motorista_id IN (
    SELECT id FROM public.motoristas WHERE user_id = auth.uid()
  )
);

-- Motoristas can INSERT items on their own templates
CREATE POLICY "Motoristas can insert own template items"
ON public.itens_ambulante_template
FOR INSERT
TO authenticated
WITH CHECK (
  template_id IN (
    SELECT t.id FROM public.ambulante_templates t
    JOIN public.motoristas m ON m.id = t.motorista_id
    WHERE m.user_id = auth.uid()
  )
);

-- Motoristas can UPDATE items on their own templates
CREATE POLICY "Motoristas can update own template items"
ON public.itens_ambulante_template
FOR UPDATE
TO authenticated
USING (
  template_id IN (
    SELECT t.id FROM public.ambulante_templates t
    JOIN public.motoristas m ON m.id = t.motorista_id
    WHERE m.user_id = auth.uid()
  )
);

-- Motoristas can DELETE items on their own templates
CREATE POLICY "Motoristas can delete own template items"
ON public.itens_ambulante_template
FOR DELETE
TO authenticated
USING (
  template_id IN (
    SELECT t.id FROM public.ambulante_templates t
    JOIN public.motoristas m ON m.id = t.motorista_id
    WHERE m.user_id = auth.uid()
  )
);
