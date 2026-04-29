-- RLS policies for 'entradas' role
CREATE POLICY "Entradas can read pedidos_entrada"
ON public.pedidos_entrada FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can update pedidos_entrada"
ON public.pedidos_entrada FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can read fornecedores"
ON public.fornecedores FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can read compradores"
ON public.compradores FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can read produtos"
ON public.produtos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can read itens_entrada"
ON public.itens_entrada FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role));

-- Allow entradas role to manage financeiro_pagar (since archiving creates AP records)
CREATE POLICY "Entradas can manage financeiro_pagar"
ON public.financeiro_pagar FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can manage pagamentos_fornecedor"
ON public.pagamentos_fornecedor FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'entradas'::app_role));

CREATE POLICY "Entradas can manage pagamento_alocacoes_fornecedor"
ON public.pagamento_alocacoes_fornecedor FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'entradas'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'entradas'::app_role));

-- Create the 'entradas' user
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'entradas@interno.app',
    crypt('123456', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'entradas@interno.app'),
    'email',
    'entradas@interno.app',
    now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'entradas'::app_role);
END $$;