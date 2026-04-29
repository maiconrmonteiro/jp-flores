export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      acertos_motorista: {
        Row: {
          archived: boolean
          created_at: string
          custo_total: number
          data: string
          desconto_obs: string
          desconto_valor: number
          id: string
          margem_percent: number
          motorista_id: string
          total_cobrar: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          custo_total?: number
          data: string
          desconto_obs?: string
          desconto_valor?: number
          id?: string
          margem_percent?: number
          motorista_id: string
          total_cobrar?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          custo_total?: number
          data?: string
          desconto_obs?: string
          desconto_valor?: number
          id?: string
          margem_percent?: number
          motorista_id?: string
          total_cobrar?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acertos_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulante_templates: {
        Row: {
          created_at: string
          id: string
          motorista_id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          motorista_id: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          motorista_id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulante_templates_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulantes: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          id: string
          motorista_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motorista_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motorista_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulantes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_itens_saida: {
        Row: {
          created_at: string
          id: string
          item_id: string
          operacao: string
          pedido_id: string
          preco_antes: number | null
          preco_depois: number | null
          produto_id: string
          qty_antes: number | null
          qty_depois: number | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          operacao: string
          pedido_id: string
          preco_antes?: number | null
          preco_depois?: number | null
          produto_id: string
          qty_antes?: number | null
          qty_depois?: number | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          operacao?: string
          pedido_id?: string
          preco_antes?: number | null
          preco_depois?: number | null
          produto_id?: string
          qty_antes?: number | null
          qty_depois?: number | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      auto_pedidos_log: {
        Row: {
          cliente_nome: string
          created_at: string
          id: string
          motorista_id: string
          pedido_saida_id: string
          seen: boolean
          template_id: string
        }
        Insert: {
          cliente_nome?: string
          created_at?: string
          id?: string
          motorista_id: string
          pedido_saida_id: string
          seen?: boolean
          template_id: string
        }
        Update: {
          cliente_nome?: string
          created_at?: string
          id?: string
          motorista_id?: string
          pedido_saida_id?: string
          seen?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_pedidos_log_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_pedidos_log_pedido_saida_id_fkey"
            columns: ["pedido_saida_id"]
            isOneToOne: false
            referencedRelation: "pedidos_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_pedidos_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cliente_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_templates: {
        Row: {
          cliente_id: string
          created_at: string
          dia_semana: string
          id: string
          motorista_id: string | null
          nome: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          dia_semana?: string
          id?: string
          motorista_id?: string | null
          nome: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          dia_semana?: string
          id?: string
          motorista_id?: string | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_templates_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_templates_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          estado: string | null
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          nome: string
          telefone?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      cochos_cliente: {
        Row: {
          cliente_id: string
          id: string
          preto: number
          quebrado: number
          updated_at: string
          velling: number
        }
        Insert: {
          cliente_id: string
          id?: string
          preto?: number
          quebrado?: number
          updated_at?: string
          velling?: number
        }
        Update: {
          cliente_id?: string
          id?: string
          preto?: number
          quebrado?: number
          updated_at?: string
          velling?: number
        }
        Relationships: [
          {
            foreignKeyName: "cochos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      compradores: {
        Row: {
          created_at: string
          id: string
          nome: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cooperflora_variantes: {
        Row: {
          created_at: string
          fator_conversao: number
          id: string
          nome_cooperflora: string
          produto_id: string
        }
        Insert: {
          created_at?: string
          fator_conversao?: number
          id?: string
          nome_cooperflora: string
          produto_id: string
        }
        Update: {
          created_at?: string
          fator_conversao?: number
          id?: string
          nome_cooperflora?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooperflora_variantes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      custo_overrides: {
        Row: {
          created_at: string
          data: string
          id: string
          preco_custo: number
          produto_id: string
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          preco_custo: number
          produto_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          preco_custo?: number
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custo_overrides_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_semanal: {
        Row: {
          compra_manual: number | null
          created_at: string
          despesas: number
          diesel: number
          id: string
          motorista_id: string
          semana_inicio: string
          venda_manual: number | null
        }
        Insert: {
          compra_manual?: number | null
          created_at?: string
          despesas?: number
          diesel?: number
          id?: string
          motorista_id: string
          semana_inicio: string
          venda_manual?: number | null
        }
        Update: {
          compra_manual?: number | null
          created_at?: string
          despesas?: number
          diesel?: number
          id?: string
          motorista_id?: string
          semana_inicio?: string
          venda_manual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_semanal_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pagar: {
        Row: {
          created_at: string
          data_compra: string
          fornecedor_id: string
          id: string
          observacao: string | null
          pedido_entrada_id: string | null
          status: string
          valor_pago: number
          valor_total: number
        }
        Insert: {
          created_at?: string
          data_compra: string
          fornecedor_id: string
          id?: string
          observacao?: string | null
          pedido_entrada_id?: string | null
          status?: string
          valor_pago?: number
          valor_total?: number
        }
        Update: {
          created_at?: string
          data_compra?: string
          fornecedor_id?: string
          id?: string
          observacao?: string | null
          pedido_entrada_id?: string | null
          status?: string
          valor_pago?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_pagar_pedido_entrada_id_fkey"
            columns: ["pedido_entrada_id"]
            isOneToOne: false
            referencedRelation: "pedidos_entrada"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_receber: {
        Row: {
          cliente_id: string
          created_at: string
          data_venda: string
          id: string
          motorista_id: string
          observacao: string | null
          pedido_saida_id: string
          status: string
          tipo_pagamento: string
          valor_pago: number
          valor_total: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_venda: string
          id?: string
          motorista_id: string
          observacao?: string | null
          pedido_saida_id: string
          status?: string
          tipo_pagamento?: string
          valor_pago?: number
          valor_total?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_venda?: string
          id?: string
          motorista_id?: string
          observacao?: string | null
          pedido_saida_id?: string
          status?: string
          tipo_pagamento?: string
          valor_pago?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_receber_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_receber_pedido_saida_id_fkey"
            columns: ["pedido_saida_id"]
            isOneToOne: true
            referencedRelation: "pedidos_saida"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      itens_acerto_motorista: {
        Row: {
          acerto_id: string
          custo_ativo: number
          id: string
          produto_id: string
          quantidade: number
        }
        Insert: {
          acerto_id: string
          custo_ativo?: number
          id?: string
          produto_id: string
          quantidade?: number
        }
        Update: {
          acerto_id?: string
          custo_ativo?: number
          id?: string
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_acerto_motorista_acerto_id_fkey"
            columns: ["acerto_id"]
            isOneToOne: false
            referencedRelation: "acertos_motorista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_acerto_motorista_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_ambulante: {
        Row: {
          ambulante_id: string
          id: string
          preco: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          ambulante_id: string
          id?: string
          preco?: number
          produto_id: string
          quantidade?: number
        }
        Update: {
          ambulante_id?: string
          id?: string
          preco?: number
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_ambulante_ambulante_id_fkey"
            columns: ["ambulante_id"]
            isOneToOne: false
            referencedRelation: "ambulantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_ambulante_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_ambulante_template: {
        Row: {
          id: string
          produto_id: string
          quantidade: number
          template_id: string
        }
        Insert: {
          id?: string
          produto_id: string
          quantidade?: number
          template_id: string
        }
        Update: {
          id?: string
          produto_id?: string
          quantidade?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_ambulante_template_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_ambulante_template_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ambulante_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_cliente_template: {
        Row: {
          id: string
          preco: number
          produto_id: string
          quantidade: number
          template_id: string
        }
        Insert: {
          id?: string
          preco?: number
          produto_id: string
          quantidade?: number
          template_id: string
        }
        Update: {
          id?: string
          preco?: number
          produto_id?: string
          quantidade?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_cliente_template_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_cliente_template_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cliente_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_entrada: {
        Row: {
          id: string
          pedido_id: string
          preco_custo: number
          produto_id: string
          qty_pedida: number
          quantidade: number
        }
        Insert: {
          id?: string
          pedido_id: string
          preco_custo?: number
          produto_id: string
          qty_pedida?: number
          quantidade?: number
        }
        Update: {
          id?: string
          pedido_id?: string
          preco_custo?: number
          produto_id?: string
          qty_pedida?: number
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_entrada_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_entrada_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_orcamento: {
        Row: {
          id: string
          orcamento_id: string
          preco: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          id?: string
          orcamento_id: string
          preco?: number
          produto_id: string
          quantidade?: number
        }
        Update: {
          id?: string
          orcamento_id?: string
          preco?: number
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_orcamento_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_orcamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_saida: {
        Row: {
          id: string
          is_baixa_ambulante: boolean
          pedido_id: string
          preco: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          id?: string
          is_baixa_ambulante?: boolean
          pedido_id: string
          preco?: number
          produto_id: string
          quantidade?: number
        }
        Update: {
          id?: string
          is_baixa_ambulante?: boolean
          pedido_id?: string
          preco?: number
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_saida_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_saida_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      motoristas: {
        Row: {
          created_at: string
          id: string
          markup: number
          nome: string
          terceirizado: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          markup?: number
          nome: string
          terceirizado?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          markup?: number
          nome?: string
          terceirizado?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      notas_motorista: {
        Row: {
          created_at: string
          data_lancamento: string
          data_vencimento: string
          id: string
          motorista_id: string
          observacao: string
          status: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_lancamento?: string
          data_vencimento?: string
          id?: string
          motorista_id: string
          observacao?: string
          status?: string
          valor?: number
        }
        Update: {
          created_at?: string
          data_lancamento?: string
          data_vencimento?: string
          id?: string
          motorista_id?: string
          observacao?: string
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          data: string | null
          desconto_tipo: string
          desconto_valor: number
          id: string
          motorista_id: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string | null
          desconto_tipo?: string
          desconto_valor?: number
          id?: string
          motorista_id: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string | null
          desconto_tipo?: string
          desconto_valor?: number
          id?: string
          motorista_id?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamento_alocacoes: {
        Row: {
          financeiro_id: string
          id: string
          pagamento_id: string
          valor_alocado: number
        }
        Insert: {
          financeiro_id: string
          id?: string
          pagamento_id: string
          valor_alocado: number
        }
        Update: {
          financeiro_id?: string
          id?: string
          pagamento_id?: string
          valor_alocado?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_alocacoes_financeiro_id_fkey"
            columns: ["financeiro_id"]
            isOneToOne: false
            referencedRelation: "financeiro_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_alocacoes_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamento_alocacoes_fornecedor: {
        Row: {
          financeiro_pagar_id: string
          id: string
          pagamento_id: string
          valor_alocado: number
        }
        Insert: {
          financeiro_pagar_id: string
          id?: string
          pagamento_id: string
          valor_alocado: number
        }
        Update: {
          financeiro_pagar_id?: string
          id?: string
          pagamento_id?: string
          valor_alocado?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_alocacoes_fornecedor_financeiro_pagar_id_fkey"
            columns: ["financeiro_pagar_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_alocacoes_fornecedor_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos_fornecedor"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          data_pagamento: string
          id: string
          motorista_id: string | null
          observacao: string | null
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          id?: string
          motorista_id?: string | null
          observacao?: string | null
          valor: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          id?: string
          motorista_id?: string | null
          observacao?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_fornecedor: {
        Row: {
          created_at: string
          created_by: string | null
          data_pagamento: string
          fornecedor_id: string
          id: string
          observacao: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          fornecedor_id: string
          id?: string
          observacao?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          fornecedor_id?: string
          id?: string
          observacao?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_entrada: {
        Row: {
          archived: boolean
          comprador_id: string
          created_at: string
          created_by: string | null
          data: string
          desconto: number
          fornecedor_id: string
          id: string
          nota_foto_url: string | null
          orcamento_num: number
          tipo_pagamento: string
        }
        Insert: {
          archived?: boolean
          comprador_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          desconto?: number
          fornecedor_id: string
          id?: string
          nota_foto_url?: string | null
          orcamento_num?: number
          tipo_pagamento?: string
        }
        Update: {
          archived?: boolean
          comprador_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          desconto?: number
          fornecedor_id?: string
          id?: string
          nota_foto_url?: string | null
          orcamento_num?: number
          tipo_pagamento?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_entrada_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "compradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_entrada_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_saida: {
        Row: {
          archived: boolean
          cliente_id: string
          created_at: string
          created_by: string | null
          data: string
          desconto: number
          id: string
          motorista_id: string
          observacao: string | null
          orcamento_num: number
          tipo_pagamento: string
        }
        Insert: {
          archived?: boolean
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          desconto?: number
          id?: string
          motorista_id: string
          observacao?: string | null
          orcamento_num?: number
          tipo_pagamento?: string
        }
        Update: {
          archived?: boolean
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          desconto?: number
          id?: string
          motorista_id?: string
          observacao?: string | null
          orcamento_num?: number
          tipo_pagamento?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_saida_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_saida_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          created_at: string
          descricao: string
          id: string
          unidade: Database["public"]["Enums"]["unidade_medida"]
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          unidade?: Database["public"]["Enums"]["unidade_medida"]
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          unidade?: Database["public"]["Enums"]["unidade_medida"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "motorista" | "comprador" | "financeiro" | "entradas"
      unidade_medida: "CX" | "UN" | "MC" | "VS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "motorista", "comprador", "financeiro", "entradas"],
      unidade_medida: ["CX", "UN", "MC", "VS"],
    },
  },
} as const
