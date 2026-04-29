---
name: Pagamento à vista no histórico de desfazer
description: Faturamento à vista (e parcial) cria registro em pagamentos+alocacoes para aparecer no UndoPaymentDialog
type: feature
---
Sempre que uma nota é faturada como "À vista" ou "Parcial" (com valor pago > 0) — em `src/pages/admin/Saidas.tsx` ou `src/pages/MotoristaDashboard.tsx` —, além de criar o `financeiro_receber` com `status=pago/parcial`, o sistema também insere um registro em `pagamentos` + `pagamento_alocacoes` via helper `registrarPagamentoFaturamento` em `src/lib/avista-pagamento.ts`.

Isso garante que essas notas apareçam no diálogo "Desfazer Pagamento" (`UndoPaymentDialog`) e possam ser revertidas pela edge function `undo-payment`, que reabre o pedido (`archived: false`) e zera o `valor_pago`.

Observação do pagamento gerado: "Faturamento à vista" ou "Faturamento parcial", opcionalmente concatenado com a observação manual da nota. A `data_pagamento` usa a data do próprio pedido. Aplica-se aos 3 fluxos: faturamento normal, cocho "pago junto" e cocho "pegar depois".
