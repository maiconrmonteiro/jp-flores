
-- Enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'motorista', 'comprador');

-- Enum para unidades de medida
CREATE TYPE public.unidade_medida AS ENUM ('CX', 'UN', 'MC', 'VS');

-- Tabela de roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função has_role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS user_roles: apenas admins podem ler/gerenciar
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Produtos
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  unidade unidade_medida NOT NULL DEFAULT 'UN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage produtos" ON public.produtos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cep TEXT,
  cidade TEXT,
  estado TEXT,
  bairro TEXT,
  complemento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage clientes" ON public.clientes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Fornecedores
CREATE TABLE public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read fornecedores" ON public.fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage fornecedores" ON public.fornecedores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Motoristas (referencia auth.users para login)
CREATE TABLE public.motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read motoristas" ON public.motoristas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage motoristas" ON public.motoristas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Compradores (referencia auth.users para login)
CREATE TABLE public.compradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.compradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read compradores" ON public.compradores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage compradores" ON public.compradores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Pedidos de Saída
CREATE TABLE public.pedidos_saida (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID REFERENCES public.motoristas(id) NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.pedidos_saida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage pedidos_saida" ON public.pedidos_saida FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Motoristas can read own pedidos_saida" ON public.pedidos_saida FOR SELECT TO authenticated
  USING (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));
CREATE POLICY "Motoristas can insert pedidos_saida" ON public.pedidos_saida FOR INSERT TO authenticated
  WITH CHECK (motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid()));

-- Itens de Saída
CREATE TABLE public.itens_saida (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES public.pedidos_saida(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  preco NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.itens_saida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage itens_saida" ON public.itens_saida FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Motoristas can read own itens_saida" ON public.itens_saida FOR SELECT TO authenticated
  USING (pedido_id IN (SELECT id FROM public.pedidos_saida WHERE motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid())));
CREATE POLICY "Motoristas can insert itens_saida" ON public.itens_saida FOR INSERT TO authenticated
  WITH CHECK (pedido_id IN (SELECT id FROM public.pedidos_saida WHERE motorista_id IN (SELECT id FROM public.motoristas WHERE user_id = auth.uid())));

-- Pedidos de Entrada
CREATE TABLE public.pedidos_entrada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID REFERENCES public.fornecedores(id) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.pedidos_entrada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage pedidos_entrada" ON public.pedidos_entrada FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Compradores can read pedidos_entrada" ON public.pedidos_entrada FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'comprador'));
CREATE POLICY "Compradores can insert pedidos_entrada" ON public.pedidos_entrada FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'comprador'));

-- Itens de Entrada
CREATE TABLE public.itens_entrada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES public.pedidos_entrada(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  preco_custo NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.itens_entrada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage itens_entrada" ON public.itens_entrada FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Compradores can read itens_entrada" ON public.itens_entrada FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'comprador'));
CREATE POLICY "Compradores can insert itens_entrada" ON public.itens_entrada FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'comprador'));

-- Storage bucket para logo da empresa
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', true);
CREATE POLICY "Anyone can read company assets" ON storage.objects FOR SELECT USING (bucket_id = 'company-assets');
CREATE POLICY "Admins can upload company assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));
