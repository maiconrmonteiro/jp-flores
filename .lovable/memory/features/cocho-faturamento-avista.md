---
name: Cocho no faturamento (sempre soma na cobrança)
description: Ao faturar qualquer pedido com cochos marcados, as quantidades são SEMPRE somadas ao saldo do cliente (cochos_cliente), sem diálogo de escolha
type: feature
---
Ao faturar um pedido (à vista, parcial ou a prazo) que possui cochos marcados (tag `[COCHO:...]` na observação), o sistema SEMPRE soma as quantidades de preto/velling/quebrado ao saldo do cliente em `cochos_cliente`, via helper `mergeCochoIntoCliente` em `src/lib/cocho-cobranca.ts`. Funciona como um lançamento manual: a cada faturamento as quantidades aumentam.

Não há mais diálogo perguntando "pagos junto" vs "pegar depois" — o controle é manual via tela de cobrança (cliente pode decrementar quando devolver/pagar).

Implementado em `src/pages/admin/Saidas.tsx` e `src/pages/MotoristaDashboard.tsx` no fluxo de Faturar.
