
ALTER TABLE public.orcamentos
  ADD COLUMN cliente_id uuid REFERENCES public.clientes(id),
  ADD COLUMN observacao text DEFAULT '';
