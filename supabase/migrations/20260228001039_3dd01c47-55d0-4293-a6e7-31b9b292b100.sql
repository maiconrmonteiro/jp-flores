
-- Tabela de auditoria para itens_saida e itens_ambulante
CREATE TABLE public.audit_itens_saida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  item_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  operacao text NOT NULL,
  qty_antes numeric,
  qty_depois numeric,
  preco_antes numeric,
  preco_depois numeric,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX idx_audit_itens_produto ON public.audit_itens_saida(produto_id);
CREATE INDEX idx_audit_itens_created ON public.audit_itens_saida(created_at DESC);
CREATE INDEX idx_audit_itens_pedido ON public.audit_itens_saida(pedido_id);

-- RLS: apenas admins
ALTER TABLE public.audit_itens_saida ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit_itens_saida"
ON public.audit_itens_saida
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Função do trigger
CREATE OR REPLACE FUNCTION public.fn_audit_itens_saida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto_id uuid;
  v_pedido_id uuid;
  v_item_id uuid;
  v_qty_antes numeric;
  v_qty_depois numeric;
  v_preco_antes numeric;
  v_preco_depois numeric;
  v_tabela text;
  v_pedido_col text;
BEGIN
  v_tabela := TG_TABLE_NAME;
  
  IF v_tabela = 'itens_saida' THEN
    v_pedido_col := 'pedido_id';
  ELSE
    v_pedido_col := 'ambulante_id';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_item_id := NEW.id;
    v_produto_id := NEW.produto_id;
    v_pedido_id := CASE WHEN v_tabela = 'itens_saida' THEN NEW.pedido_id ELSE NEW.ambulante_id END;
    v_qty_antes := NULL;
    v_qty_depois := NEW.quantidade;
    v_preco_antes := NULL;
    v_preco_depois := NEW.preco;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Só registra se houve mudança real em quantidade ou preço
    IF OLD.quantidade = NEW.quantidade AND OLD.preco = NEW.preco THEN
      RETURN NEW;
    END IF;
    v_item_id := NEW.id;
    v_produto_id := NEW.produto_id;
    v_pedido_id := CASE WHEN v_tabela = 'itens_saida' THEN NEW.pedido_id ELSE NEW.ambulante_id END;
    v_qty_antes := OLD.quantidade;
    v_qty_depois := NEW.quantidade;
    v_preco_antes := OLD.preco;
    v_preco_depois := NEW.preco;
  ELSIF TG_OP = 'DELETE' THEN
    v_item_id := OLD.id;
    v_produto_id := OLD.produto_id;
    v_pedido_id := CASE WHEN v_tabela = 'itens_saida' THEN OLD.pedido_id ELSE OLD.ambulante_id END;
    v_qty_antes := OLD.quantidade;
    v_qty_depois := NULL;
    v_preco_antes := OLD.preco;
    v_preco_depois := NULL;
  END IF;

  INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
  VALUES (v_tabela, v_item_id, v_produto_id, v_pedido_id, TG_OP, v_qty_antes, v_qty_depois, v_preco_antes, v_preco_depois, auth.uid());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers em itens_saida
CREATE TRIGGER audit_itens_saida_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.itens_saida
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_itens_saida();

-- Triggers em itens_ambulante
CREATE TRIGGER audit_itens_ambulante_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.itens_ambulante
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_itens_saida();
