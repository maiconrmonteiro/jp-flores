
INSERT INTO cochos_cliente (cliente_id, preto, velling, quebrado)
SELECT DISTINCT ON (cliente_id)
  cliente_id,
  COALESCE((regexp_match(observacao, 'preto=(\d+)'))[1]::int, 0),
  COALESCE((regexp_match(observacao, 'velling=(\d+)'))[1]::int, 0),
  COALESCE((regexp_match(observacao, 'quebrado=(\d+)'))[1]::int, 0)
FROM pedidos_saida
WHERE observacao ~ '\[COCHO:preto=\d+,velling=\d+,quebrado=\d+\]'
ORDER BY cliente_id, data DESC, created_at DESC
ON CONFLICT (cliente_id) DO UPDATE
  SET preto = EXCLUDED.preto,
      velling = EXCLUDED.velling,
      quebrado = EXCLUDED.quebrado,
      updated_at = now();
