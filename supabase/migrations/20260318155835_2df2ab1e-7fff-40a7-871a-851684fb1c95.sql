
-- Allow motoristas to insert pagamentos (for terceirizado financial management)
CREATE POLICY "Motoristas can insert pagamentos"
  ON public.pagamentos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'motorista'));

-- Allow motoristas to read pagamentos
CREATE POLICY "Motoristas can read pagamentos"
  ON public.pagamentos FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'motorista'));

-- Allow motoristas to manage pagamento_alocacoes for their own operations
CREATE POLICY "Motoristas can insert pagamento_alocacoes"
  ON public.pagamento_alocacoes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'motorista'));

CREATE POLICY "Motoristas can read pagamento_alocacoes"
  ON public.pagamento_alocacoes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'motorista'));

-- Allow motoristas to update financeiro_receber for their own records
CREATE POLICY "Motoristas can update own financeiro_receber"
  ON public.financeiro_receber FOR UPDATE TO authenticated
  USING (motorista_id IN (SELECT id FROM motoristas WHERE user_id = auth.uid()));
