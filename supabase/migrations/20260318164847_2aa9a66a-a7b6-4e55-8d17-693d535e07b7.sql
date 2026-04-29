-- RLS policies for financeiro role

-- pedidos_saida: read all, update all
CREATE POLICY "Financeiro can read pedidos_saida" ON public.pedidos_saida FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can update pedidos_saida" ON public.pedidos_saida FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can insert pedidos_saida" ON public.pedidos_saida FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can delete pedidos_saida" ON public.pedidos_saida FOR DELETE TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- itens_saida: full access
CREATE POLICY "Financeiro can read itens_saida" ON public.itens_saida FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can insert itens_saida" ON public.itens_saida FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can update itens_saida" ON public.itens_saida FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can delete itens_saida" ON public.itens_saida FOR DELETE TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- financeiro_receber: full access
CREATE POLICY "Financeiro can manage financeiro_receber" ON public.financeiro_receber FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- pagamentos: full access
CREATE POLICY "Financeiro can manage pagamentos" ON public.pagamentos FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- pagamento_alocacoes: full access
CREATE POLICY "Financeiro can manage pagamento_alocacoes" ON public.pagamento_alocacoes FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- Read-only on reference tables
CREATE POLICY "Financeiro can read clientes" ON public.clientes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can read motoristas" ON public.motoristas FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can read produtos" ON public.produtos FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- user_roles: read own
CREATE POLICY "Financeiro can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- custo_overrides: read for pricing
CREATE POLICY "Financeiro can read custo_overrides" ON public.custo_overrides FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- audit table
CREATE POLICY "Financeiro can read audit" ON public.audit_itens_saida FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can insert audit" ON public.audit_itens_saida FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'financeiro'::app_role));

-- ambulantes read (needed for saidas baixa ambulante)
CREATE POLICY "Financeiro can read ambulantes" ON public.ambulantes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can read itens_ambulante" ON public.itens_ambulante FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- fornecedores read
CREATE POLICY "Financeiro can read fornecedores" ON public.fornecedores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- cooperflora variantes read
CREATE POLICY "Financeiro can read cooperflora_variantes" ON public.cooperflora_variantes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));

-- notas_motorista read
CREATE POLICY "Financeiro can read notas_motorista" ON public.notas_motorista FOR SELECT TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Financeiro can manage notas_motorista" ON public.notas_motorista FOR ALL TO authenticated USING (has_role(auth.uid(), 'financeiro'::app_role));
