# Requisitos de Integração - API Cooperflora

**Data da reunião:** 03/03/2026  
**Objetivo:** Definir os requisitos técnicos para integração do sistema Ilha Verde com o catálogo da Cooperflora, permitindo consulta de disponibilidade e compra direta pelo nosso sistema.

---

## 1. Visão Geral

Nosso sistema já possui um **mapeamento interno** entre os produtos do nosso estoque e as variantes vendidas pela Cooperflora (ex: "Alstroemeria Branca" → "AKM 0,70", "Avalanche 060").

Precisamos de uma API que permita:
- **Consultar produtos disponíveis** (estoque, preço, unidade)
- **Realizar pedidos** de compra

---

## 2. Endpoints Necessários

### 2.1 Consulta de Catálogo / Disponibilidade

Precisamos de um endpoint que retorne os produtos disponíveis no momento, com estoque e preço.

**Exemplo de requisição:**
```
GET /api/produtos/disponiveis
Authorization: Bearer {API_KEY}
```

**Exemplo de resposta esperada:**
```json
{
  "produtos": [
    {
      "codigo": "AKM070",
      "nome": "AKM 0,70",
      "preco": 12.50,
      "estoque_disponivel": 150,
      "unidade_venda": "maço"
    },
    {
      "codigo": "AVL060",
      "nome": "Avalanche 060",
      "preco": 18.00,
      "estoque_disponivel": 80,
      "unidade_venda": "maço"
    }
  ],
  "data_atualizacao": "2026-03-03T08:00:00Z"
}
```

**Campos importantes na resposta:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| codigo | string | Código único do produto/variante |
| nome | string | Nome da variante (ex: "AKM 0,70") |
| preco | number | Preço unitário (por maço/cocho) |
| estoque_disponivel | number | Quantidade disponível para compra |
| unidade_venda | string | Unidade de venda (maço, cocho, etc.) |

**Perguntas:**
- É possível filtrar por categoria ou buscar por nome?
- Com que frequência o estoque/preço é atualizado?
- Existe paginação? Quantos produtos costumam estar disponíveis?

---

### 2.2 Realizar Pedido / Compra

Endpoint para enviar um pedido de compra com os itens selecionados.

**Exemplo de requisição:**
```
POST /api/pedidos
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "itens": [
    { "codigo": "AKM070", "quantidade": 10 },
    { "codigo": "AVL060", "quantidade": 5 }
  ],
  "observacao": "Pedido Ilha Verde - Motorista João"
}
```

**Exemplo de resposta esperada:**
```json
{
  "pedido_id": "PED-2026-0301",
  "status": "confirmado",
  "total": 215.00,
  "itens_confirmados": [
    { "codigo": "AKM070", "quantidade": 10, "preco_unitario": 12.50, "subtotal": 125.00 },
    { "codigo": "AVL060", "quantidade": 5, "preco_unitario": 18.00, "subtotal": 90.00 }
  ],
  "data_carregamento": "2026-03-04"
}
```

**Perguntas:**
- É possível cancelar um pedido após confirmado? Até quando?
- Existe quantidade mínima por item?
- Existe horário limite para pedidos? (ex: até 14h para carregamento no dia seguinte)

---

## 3. Autenticação

**Preferência:** API Key fixa por cliente (mais simples de integrar).

**Perguntas:**
- Qual método de autenticação? (API Key, OAuth, usuário/senha?)
- O token expira? Precisa renovar periodicamente?
- Cada empresa terá sua própria chave?

---

## 4. Ambiente de Teste

Para desenvolvermos a integração sem afetar pedidos reais, precisamos de:

- **Ambiente de homologação/sandbox** com dados fictícios
- **API Key de teste** separada da produção
- **Documentação da API** (Swagger/OpenAPI seria ideal)

---

## 5. Requisitos Técnicos

| Item | Nossa preferência |
|------|-------------------|
| Formato | REST API com JSON |
| Protocolo | HTTPS |
| Autenticação | API Key no header Authorization |
| Documentação | Swagger/OpenAPI |
| Ambiente de teste | Sandbox separado |
| Rate limit | Informar se existe limite de requisições |

---

## 6. O que já temos pronto do nosso lado

✅ Tabela de mapeamento produto interno → variante Cooperflora  
✅ Fator de conversão por variante (ex: 10 unidades/maço, 20 unidades/maço)  
✅ Interface com botão Cooperflora integrado nas telas de compra  
✅ Lógica de conversão automática de unidades e preços  
✅ Infraestrutura para chamar APIs externas via backend  

**Assim que tivermos os endpoints + API Key de teste, conseguimos implementar a integração rapidamente.**

---

## 7. Fluxo Visual da Integração

```
Nosso Sistema                          API Cooperflora
─────────────                          ───────────────
                                       
[Botão Cooperflora] ──────────────────► GET /produtos/disponiveis
                                              │
                    ◄─────────────────── Lista de produtos com
                                        preço e estoque
                                              │
[Tela: Catálogo Cooperflora]                  │
  - Mostra apenas produtos mapeados           │
  - Usuário seleciona qtd                     │
  - Clica "Comprar"                           │
         │                                    │
         └────────────────────────────► POST /pedidos
                                              │
                    ◄─────────────────── Confirmação do pedido
                                              │
[Sistema dá entrada automática                │
 no estoque com conversão]                    
```

---

**Contato técnico Ilha Verde:**  
_[Preencher antes da reunião]_

**Próximos passos após a reunião:**
1. Receber documentação da API e API Key de teste
2. Implementar integração no ambiente de homologação
3. Testar fluxo completo de consulta e compra
4. Liberar em produção
