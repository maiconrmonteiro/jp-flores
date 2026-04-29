CREATE TABLE public.motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE public.fechamento_semanal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  semana_inicio DATE NOT NULL,
  diesel NUMERIC DEFAULT 0,
  despesas NUMERIC DEFAULT 0,
  venda_manual NUMERIC DEFAULT 0,
  compra_manual NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);