
-- Drop existing triggers and function
DROP TRIGGER IF EXISTS audit_itens_saida_trigger ON public.itens_saida;
DROP TRIGGER IF EXISTS audit_itens_ambulante_trigger ON public.itens_ambulante;
DROP FUNCTION IF EXISTS public.fn_audit_itens_saida();

-- Function for itens_saida
CREATE OR REPLACE FUNCTION public.fn_audit_itens_saida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_produto_id uuid;
  v_pedido_id uuid;
  v_qty_antes numeric;
  v_qty_depois numeric;
  v_preco_antes numeric;
  v_preco_depois numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
    VALUES ('itens_saida', NEW.id, NEW.produto_id, NEW.pedido_id, 'INSERT', NULL, NEW.quantidade, NULL, NEW.preco, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.quantidade = NEW.quantidade AND OLD.preco = NEW.preco THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
    VALUES ('itens_saida', NEW.id, NEW.produto_id, NEW.pedido_id, 'UPDATE', OLD.quantidade, NEW.quantidade, OLD.preco, NEW.preco, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
    VALUES ('itens_saida', OLD.id, OLD.produto_id, OLD.pedido_id, 'DELETE', OLD.quantidade, NULL, OLD.preco, NULL, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Function for itens_ambulante
CREATE OR REPLACE FUNCTION public.fn_audit_itens_ambulante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
    VALUES ('itens_ambulante', NEW.id, NEW.produto_id, NEW.ambulante_id, 'INSERT', NULL, NEW.quantidade, NULL, NEW.preco, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.quantidade = NEW.quantidade AND OLD.preco = NEW.preco THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
    VALUES ('itens_ambulante', NEW.id, NEW.produto_id, NEW.ambulante_id, 'UPDATE', OLD.quantidade, NEW.quantidade, OLD.preco, NEW.preco, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_itens_saida (tabela, item_id, produto_id, pedido_id, operacao, qty_antes, qty_depois, preco_antes, preco_depois, user_id)
    VALUES ('itens_ambulante', OLD.id, OLD.produto_id, OLD.ambulante_id, 'DELETE', OLD.quantidade, NULL, OLD.preco, NULL, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Recreate triggers
CREATE TRIGGER audit_itens_saida_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.itens_saida
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_itens_saida();

CREATE TRIGGER audit_itens_ambulante_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.itens_ambulante
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_itens_ambulante();
