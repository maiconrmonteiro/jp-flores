

## Plano: Adicionar forma de pagamento "AP Casa" nas Entradas

### Resumo
Adicionar a opção "AP Casa" como nova forma de pagamento nos pedidos de entrada. Ela funciona identicamente ao "A Prazo" no financeiro (contas a pagar), mas serve como filtro para facilitar a impressão em lote. Também será adicionado um botão "Imprimir Filtrados" que aparece quando há filtros ativos (data + pagamento), permitindo imprimir todas as entradas filtradas de uma vez em A4.

### O que muda para o usuário
- Nos selects de pagamento (Admin Entradas e Comprador), aparece a nova opção "AP Casa"
- Na lista de pedidos, "AP Casa" aparece com label e cor próprios (ex: roxo/lilás)
- Ao arquivar um pedido "AP Casa", ele entra no Contas a Pagar como "A prazo" (comportamento idêntico)
- Quando há filtros ativos na listagem de Entradas, aparece um botão "Imprimir Filtrados (A4)" que gera um documento A4 com todos os pedidos filtrados, cada um em uma página separada

### Arquivos a alterar

**1. `src/pages/admin/Entradas.tsx`**
- Adicionar `<option value="apcasa">AP Casa</option>` nos 3 selects (formulário de edição, filtro, e labels)
- Atualizar as labels: `pagLabel` e `pagColor` para incluir `apcasa` → "AP Casa" com cor distinta
- Na função `archiveOrder`, tratar `apcasa` igual a `aprazo` (não é vista, status "aberto", observacao "A prazo")
- Adicionar botão "Imprimir Filtrados (A4)" quando houver filtros ativos, que chama `printEntradaA4` para cada pedido filtrado em um HTML único multi-página

**2. `src/pages/CompradorDashboard.tsx`**
- Adicionar `<option value="apcasa">AP Casa</option>` nos 2 selects (formulário e filtro)
- Atualizar labels e cores para incluir `apcasa`

**3. `src/lib/print.ts`**
- Na função `formatTipoPagamento`, adicionar: `if (tp === "apcasa") return "AP Casa";`
- Criar função `printAllEntradasA4(pedidos: any[])` que gera um HTML com page-break entre pedidos, reutilizando a lógica de `printEntradaA4`

**4. `src/pages/admin/ContasPagar.tsx`**
- Nenhuma alteração necessária — o registro financeiro já chega com observacao "A prazo", então o sistema trata normalmente

### Detalhes técnicos

```text
Mapa de valores tipo_pagamento:
  pendente  → "Pendente"    (cinza)
  avista    → "À vista"     (verde)
  aprazo    → "A prazo"     (laranja)
  apcasa    → "AP Casa"     (roxo)  ← NOVO

archiveOrder — lógica de decisão:
  avista  → valor_pago = total, status = "pago"
  aprazo  → valor_pago = 0,     status = "aberto"
  apcasa  → valor_pago = 0,     status = "aberto"  ← mesmo que aprazo
```

