---
name: Crédito conta como Cobrado no período
description: A partir de 20/04/2026, sobra de pagamento (crédito) entra no Cobrado no período da tela Financeiro
type: feature
---
A partir de **2026-04-20**, qualquer `pagamento` cuja soma de `pagamento_alocacoes` seja menor que `valor` (ou seja, gerou crédito para o cliente — seja crédito manual lançado pela Natalia ou baixa de um valor maior que o cliente devia) tem o **excesso somado no card "Cobrado no período"** da tela Financeiro (`src/pages/admin/Financeiro.tsx`).

Implementação:
- `motoristaSummary`: além de somar alocações, percorre `pagamentos` filtrando `data_pagamento >= '2026-04-20'` E dentro do período `[vendidoDe, vendidoAte]`. Calcula `sobra = valor - sum(alocacoes)` e adiciona ao `totalCobrado` do `motorista_id` do pagamento.
- `resumoMotoristaDetalhes`: monta lista `creditosPeriodo` com data, cliente, observação e valor da sobra. Soma em `totalCreditos` e inclui no "Total cobrado no período".
- UI do diálogo de detalhes: nova seção "Créditos no período (sobra de pagamento)" colapsável.

Não aplica em `MotoristaFinanceiro.tsx` (escopo limitado à tela Financeiro admin/financeiro).

Constante: `CREDITO_INICIO = "2026-04-20"` — créditos antes dessa data continuam fora.
