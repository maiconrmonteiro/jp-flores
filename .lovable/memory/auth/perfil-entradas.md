---
name: perfil-entradas
description: Perfil de usuário 'entradas' com acesso restrito apenas à tela de Pedidos de Entrada para arquivamento
type: feature
---
Perfil **entradas** (enum app_role) tem acesso restrito apenas à tela de Pedidos de Entrada via rota `/entradas-dash` (EntradasLayout).

**Permissões (RLS):** SELECT em pedidos_entrada/itens_entrada/fornecedores/compradores/produtos; UPDATE em pedidos_entrada (para arquivar); ALL em financeiro_pagar/pagamentos_fornecedor/pagamento_alocacoes_fornecedor (necessário para fluxo de arquivamento à vista).

**UI restrita em Entradas.tsx:** quando `role === "entradas"`, esconde botões de copiar imagem, imprimir, ver foto e excluir. Mantém apenas botão grande "ARQUIVAR" (variant default, com ícone Archive). Detecção via `useAuth()` + flag `isRestrito`.

**Login:** sanitizado como `entradas@interno.app`. Usuário inicial criado via migration com senha `123456`.
