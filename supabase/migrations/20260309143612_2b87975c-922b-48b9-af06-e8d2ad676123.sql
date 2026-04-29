
-- Function to sync itens_ambulante.quantidade when baixa items change
CREATE OR REPLACE FUNCTION public.fn_sync_ambulante_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_motorista_id uuid;
  v_data date;
  v_ambulante_id uuid;
BEGIN
  -- Get motorista_id and date from pedido_saida
  IF TG_OP = 'DELETE' THEN
    SELECT motorista_id, data INTO v_motorista_id, v_data
    FROM public.pedidos_saida WHERE id = OLD.pedido_id;
  ELSE
    SELECT motorista_id, data INTO v_motorista_id, v_data
    FROM public.pedidos_saida WHERE id = NEW.pedido_id;
  END IF;

  IF v_motorista_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Find ambulante for this motorista+date
  SELECT id INTO v_ambulante_id
  FROM public.ambulantes
  WHERE motorista_id = v_motorista_id AND data = v_data
  LIMIT 1;

  IF v_ambulante_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_baixa_ambulante = true THEN
      UPDATE public.itens_ambulante
      SET quantidade = quantidade - NEW.quantidade
      WHERE ambulante_id = v_ambulante_id AND produto_id = NEW.produto_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_baixa_ambulante = true THEN
      UPDATE public.itens_ambulante
      SET quantidade = quantidade + OLD.quantidade
      WHERE ambulante_id = v_ambulante_id AND produto_id = OLD.produto_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Undo old state if it was baixa
    IF OLD.is_baixa_ambulante = true THEN
      UPDATE public.itens_ambulante
      SET quantidade = quantidade + OLD.quantidade
      WHERE ambulante_id = v_ambulante_id AND produto_id = OLD.produto_id;
    END IF;
    -- Apply new state if it is baixa
    IF NEW.is_baixa_ambulante = true THEN
      UPDATE public.itens_ambulante
      SET quantidade = quantidade - NEW.quantidade
      WHERE ambulante_id = v_ambulante_id AND produto_id = NEW.produto_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger
CREATE TRIGGER trg_sync_ambulante_saldo
AFTER INSERT OR UPDATE OR DELETE ON public.itens_saida
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_ambulante_saldo();

-- One-time migration: update existing itens_ambulante to subtract already-sold baixas
WITH baixa_totals AS (
  SELECT
    ia.id as item_ambulante_id,
    COALESCE(SUM(isa.quantidade), 0) as total_baixado
  FROM public.itens_ambulante ia
  JOIN public.ambulantes a ON a.id = ia.ambulante_id
  JOIN public.pedidos_saida ps ON ps.motorista_id = a.motorista_id AND ps.data = a.data
  JOIN public.itens_saida isa ON isa.pedido_id = ps.id AND isa.produto_id = ia.produto_id AND isa.is_baixa_ambulante = true
  GROUP BY ia.id
)
UPDATE public.itens_ambulante ia
SET quantidade = ia.quantidade - bt.total_baixado
FROM baixa_totals bt
WHERE ia.id = bt.item_ambulante_id;
