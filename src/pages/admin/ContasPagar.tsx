import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Printer, Search, DollarSign, CheckCircle2, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import UndoPaymentFornecedorDialog from "@/components/UndoPaymentFornecedorDialog";
import { format, parseISO } from "date-fns";
import { DatePicker } from "@/components/DatePicker";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useTimeWindow } from "@/hooks/use-time-window";
import { TimeWindowControl } from "@/components/TimeWindowControl";

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localToday() {
  return new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
}

function normalizePaymentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isVistaConta(conta: any) {
  const obs = normalizePaymentText(String(conta?.observacao || ""));
  return obs.includes("a vista") || obs.includes("avista") || obs.includes("pix") || obs.includes("dinheiro");
}

export default function ContasPagar() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filters
  const [de, setDe] = useState(() => {
    const d = localToday();
    const dow = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - dow); // go back to Sunday
    return localDateStr(d);
  });
  const [ate, setAte] = useState(() => {
    const d = localToday();
    const dow = d.getDay();
    const sat = new Date(d);
    sat.setDate(d.getDate() + (6 - dow)); // go forward to Saturday
    return localDateStr(sat);
  });
  const [search, setSearch] = useState("");
  const [showPagos, setShowPagos] = useState(false);
  const timeWindow = useTimeWindow("30d");
  const [showCards, setShowCards] = useState(false);
  const [creditosOpen, setCreditosOpen] = useState(false);
  const [addCreditoFornecedor, setAddCreditoFornecedor] = useState("");
  const [addCreditoValor, setAddCreditoValor] = useState("");
  const [addCreditoObs, setAddCreditoObs] = useState("");
  const [addCreditoLoading, setAddCreditoLoading] = useState(false);
  const [pagoPeriodoOpen, setPagoPeriodoOpen] = useState(false);
  const [pagoPeriodoSelected, setPagoPeriodoSelected] = useState<Record<string, boolean>>({});
  const [pagoPeriodoObs, setPagoPeriodoObs] = useState("");
  const [pagoPeriodoObsOpen, setPagoPeriodoObsOpen] = useState(false);

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [addFornecedor, setAddFornecedor] = useState("");
  const [addValor, setAddValor] = useState("");
  const [addData, setAddData] = useState(() => localDateStr(localToday()));
  const [addObs, setAddObs] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [payFornecedorId, setPayFornecedorId] = useState("");
  const [payValor, setPayValor] = useState("");
  const [payObs, setPayObs] = useState("");
  const [payUsarCredito, setPayUsarCredito] = useState(false);

  const [payNotaOpen, setPayNotaOpen] = useState(false);
  const [payNotaItem, setPayNotaItem] = useState<any>(null);
  const [payNotaValor, setPayNotaValor] = useState("");
  const [payNotaDesconto, setPayNotaDesconto] = useState(false);
  const [payNotaDescontoValor, setPayNotaDescontoValor] = useState("");

  // Undo payment dialog
  const [undoOpen, setUndoOpen] = useState(false);

  // Loading flags to prevent double-click duplications
  const [paying, setPaying] = useState(false);
  const [payingNota, setPayingNota] = useState(false);

  // Print preview dialog
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printPreviewFornecedorId, setPrintPreviewFornecedorId] = useState("");
  const [printPreviewSelected, setPrintPreviewSelected] = useState<Record<string, boolean>>({});

  // Data fetching: janela de tempo para vendas/baixas do período
  const { data: contasJanela = [] } = useQuery({
    queryKey: ["financeiro_pagar", timeWindow.since],
    queryFn: async () => await fetchAll<any>(
      "financeiro_pagar",
      "*",
      "data_compra",
      true,
      timeWindow.since ? { gte: { column: "data_compra", value: timeWindow.since } } : undefined
    ),
  });

  // TODAS as contas em aberto (não-pagas), independente da janela.
  // Necessário para que o saldo do fornecedor considere notas antigas em aberto.
  const { data: contasAbertasAll = [] } = useQuery({
    queryKey: ["financeiro_pagar_abertos"],
    queryFn: async () => {
      const all: any[] = [];
      const BATCH = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("financeiro_pagar")
          .select("*")
          .neq("status", "pago")
          .order("data_compra", { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < BATCH) break;
        from += BATCH;
      }
      return all;
    },
  });

  const contas = (() => {
    const map = new Map<string, any>();
    contasJanela.forEach((c: any) => map.set(c.id, c));
    contasAbertasAll.forEach((c: any) => { if (!map.has(c.id)) map.set(c.id, c); });
    return Array.from(map.values());
  })();

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data } = await supabase.from("fornecedores").select("*").order("nome");
      return data || [];
    },
  });

  const { data: pagamentos = [] } = useQuery({
    queryKey: ["pagamentos_fornecedor"],
    queryFn: async () => await fetchAll<any>("pagamentos_fornecedor", "*", "data_pagamento", false),
  });

  const { data: alocacoes = [] } = useQuery({
    queryKey: ["pagamento_alocacoes_fornecedor"],
    queryFn: async () => await fetchAll<any>("pagamento_alocacoes_fornecedor", "*", "id", true),
  });

  // Fetch pedidos_entrada IDs that are AP Casa
  const { data: apCasaEntradaIds = new Set<string>() } = useQuery({
    queryKey: ["pedidos_entrada_apcasa_ids"],
    queryFn: async () => {
      const { data } = await supabase.from("pedidos_entrada").select("id").eq("tipo_pagamento", "apcasa");
      return new Set((data || []).map((p: any) => p.id));
    },
  });

  const fornecedorMap = useMemo(() => Object.fromEntries(fornecedores.map((f: any) => [f.id, f.nome])), [fornecedores]);

  // IDs of suppliers excluded from financial (e.g. "Z Loja")
  const excludedFornecedorIds = useMemo(
    () => new Set(fornecedores.filter((f: any) => f.nome.toUpperCase() === "Z LOJA").map((f: any) => f.id)),
    [fornecedores],
  );

  // Filter out excluded suppliers from contas
  const contasFiltered = useMemo(
    () => contas.filter((c: any) => !excludedFornecedorIds.has(c.fornecedor_id)),
    [contas, excludedFornecedorIds],
  );

  // Credit per supplier
  const creditoMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pagamentos) {
      if (excludedFornecedorIds.has(p.fornecedor_id)) continue;
      const alocado = alocacoes
        .filter((a: any) => a.pagamento_id === p.id)
        .reduce((s: number, a: any) => s + Number(a.valor_alocado), 0);
      const sobra = Number(p.valor) - alocado;
      if (sobra > 0.005) {
        map[p.fornecedor_id] = (map[p.fornecedor_id] || 0) + sobra;
      }
    }
    return map;
  }, [pagamentos, alocacoes, excludedFornecedorIds]);

  // Supplier summary
  const fornecedorSummary = useMemo(() => {
    const map: Record<string, { total: number; pago: number; aberto: number; credito: number }> = {};
    for (const c of contasFiltered) {
      if (!map[c.fornecedor_id]) map[c.fornecedor_id] = { total: 0, pago: 0, aberto: 0, credito: 0 };
      map[c.fornecedor_id].total += Number(c.valor_total);
      map[c.fornecedor_id].pago += Number(c.valor_pago);
      map[c.fornecedor_id].aberto += Number(c.valor_total) - Number(c.valor_pago);
    }
    for (const [fid, cred] of Object.entries(creditoMap)) {
      if (!map[fid]) map[fid] = { total: 0, pago: 0, aberto: 0, credito: 0 };
      map[fid].credito = cred;
    }
    return map;
  }, [contasFiltered, creditoMap]);

  // Total em Aberto = exatamente a mesma fórmula do rodapé impresso:
  // Total Dívida São Paulo = total em aberto bruto - crédito total disponível
  const totalAberto = useMemo(() => {
    const grandTotal = contasFiltered.reduce((s: number, c: any) => {
      if (c.status === "pago") return s;
      return s + (Number(c.valor_total) - Number(c.valor_pago));
    }, 0);
    const grandCredito = Object.values(creditoMap).reduce((s: number, v) => s + Number(v || 0), 0);
    return grandTotal - grandCredito;
  }, [contasFiltered, creditoMap]);

  // Period totals
  const deStr = de;
  const ateStr = ate;

  // Entradas period totals (baseado nas contas lançadas no financeiro)
  const entradasPeriodo = useMemo(() => {
    let prazo = 0;
    let vista = 0;

    for (const conta of contasFiltered) {
      if (conta.data_compra < deStr || conta.data_compra > ateStr) continue;

      const total = Number(conta.valor_total) || 0;
      const isVista = isVistaConta(conta);

      if (isVista) {
        vista += total;
      } else {
        prazo += total;
      }
    }

    return { prazo, vista, total: prazo + vista };
  }, [contasFiltered, deStr, ateStr]);

  // Pago no Período per supplier (separated vista / a prazo) - (maicon
  const pagoPeriodoData = useMemo(() => {
    const map: Record<string, { nome: string; vista: number; prazo: number }> = {};
    const pagamentosById = new Map(pagamentos.map((pagamento: any) => [pagamento.id, pagamento]));
    const prazoContasById = new Map<string, any>();

    // À Vista: contas dentro do período que foram pagas na compra
    for (const conta of contasFiltered) {
      const fid = conta.fornecedor_id;

      if (isVistaConta(conta)) {
        if (conta.data_compra < deStr || conta.data_compra > ateStr) continue;

        if (!map[fid]) {
          map[fid] = {
            nome: fornecedorMap[fid] || "Desconhecido",
            vista: 0,
            prazo: 0,
          };
        }

        map[fid].vista += Number(conta.valor_total) || 0;
        continue;
      }

      prazoContasById.set(conta.id, conta);
    }

    // Controle para não contar mais do que o valor realmente pago da nota
    const restantePagoPorConta = new Map<string, number>();

    for (const conta of prazoContasById.values()) {
      restantePagoPorConta.set(
        conta.id,
        Math.max(0, Math.min(Number(conta.valor_pago) || 0, Number(conta.valor_total) || 0)),
      );
    }

    const alocacoesOrdenadas = [...alocacoes].sort((a: any, b: any) => {
      const pagamentoA = pagamentosById.get(a.pagamento_id);
      const pagamentoB = pagamentosById.get(b.pagamento_id);

      const dataA = pagamentoA?.data_pagamento || "";
      const dataB = pagamentoB?.data_pagamento || "";

      if (dataA !== dataB) return dataA.localeCompare(dataB);

      return String(a.id).localeCompare(String(b.id));
    });

    // A prazo: valores pagos e alocados em notas
    for (const alocacao of alocacoesOrdenadas) {
      const conta = prazoContasById.get(alocacao.financeiro_pagar_id);
      if (!conta) continue;

      const pagamento = pagamentosById.get(alocacao.pagamento_id);
      if (!pagamento) continue;
      if (excludedFornecedorIds.has(pagamento.fornecedor_id)) continue;

      const restanteConta = restantePagoPorConta.get(conta.id) || 0;
      if (restanteConta <= 0.005) continue;

      const valorEfetivo = Math.min(Number(alocacao.valor_alocado) || 0, restanteConta);

      if (valorEfetivo <= 0.005) continue;

      restantePagoPorConta.set(conta.id, restanteConta - valorEfetivo);

      if (pagamento.data_pagamento < deStr || pagamento.data_pagamento > ateStr) {
        continue;
      }

      const fid = conta.fornecedor_id;

      if (!map[fid]) {
        map[fid] = {
          nome: fornecedorMap[fid] || "Desconhecido",
          vista: 0,
          prazo: 0,
        };
      }

      map[fid].prazo += valorEfetivo;
    }

    // A prazo: pagamentos feitos no período que sobraram como crédito
    // Exemplo: devia 300, pagou 500 => 300 quita nota + 200 entra como pago no período
    for (const pagamento of pagamentos) {
      if (pagamento.data_pagamento < deStr || pagamento.data_pagamento > ateStr) {
        continue;
      }

      if (excludedFornecedorIds.has(pagamento.fornecedor_id)) continue;

      const valorPagamento = Number(pagamento.valor) || 0;

      const totalAlocado = alocacoes
        .filter((a: any) => a.pagamento_id === pagamento.id)
        .reduce((s: number, a: any) => {
          return s + (Number(a.valor_alocado) || 0);
        }, 0);

      const sobraCredito = valorPagamento - totalAlocado;

      if (sobraCredito <= 0.005) continue;

      const fid = pagamento.fornecedor_id;

      if (!map[fid]) {
        map[fid] = {
          nome: fornecedorMap[fid] || "Desconhecido",
          vista: 0,
          prazo: 0,
        };
      }

      map[fid].prazo += sobraCredito;
    }

    return map;
  }, [contasFiltered, pagamentos, alocacoes, deStr, ateStr, fornecedorMap, excludedFornecedorIds]);

  const totalPagoPeriodo = useMemo(
    () => Object.values(pagoPeriodoData).reduce((s, item) => s + item.vista + item.prazo, 0),
    [pagoPeriodoData],
  );

  const openPagoPeriodo = () => {
    setPagoPeriodoSelected({});
    setPagoPeriodoObs("");
    setPagoPeriodoOpen(true);
  };

  const pagoPeriodoTotals = useMemo(() => {
    let vista = 0;
    let prazo = 0;
    for (const [fid, data] of Object.entries(pagoPeriodoData)) {
      if (pagoPeriodoSelected[`vista:${fid}`]) vista += data.vista;
      if (pagoPeriodoSelected[`prazo:${fid}`]) prazo += data.prazo;
    }
    return { vista, prazo, total: vista + prazo };
  }, [pagoPeriodoData, pagoPeriodoSelected]);

  const printPagoPeriodo = () => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const periodoStr = `${format(parseISO(deStr), "dd/MM/yyyy")} a ${format(parseISO(ateStr), "dd/MM/yyyy")}`;

    const sortedEntries = Object.entries(pagoPeriodoData).sort(([, a], [, b]) => a.nome.localeCompare(b.nome));

    // Independent selections per tipo
    const vistaEntries = sortedEntries.filter(([fid, d]) => pagoPeriodoSelected[`vista:${fid}`] && d.vista > 0.005);
    const prazoEntries = sortedEntries.filter(([fid, d]) => pagoPeriodoSelected[`prazo:${fid}`] && d.prazo > 0.005);

    const buildSection = (entries: typeof vistaEntries, getValue: (d: (typeof pagoPeriodoData)[string]) => number) => {
      if (entries.length === 0) return "";
      const rows = entries
        .map(
          ([, d]) =>
            `<tr style="border-bottom:1px solid #aaa;"><td style="padding:6px 8px;font-size:16px;line-height:1.2;">${d.nome}</td><td style="padding:6px 8px;text-align:right;font-weight:bold;font-size:16px;line-height:1.2;">R$ ${getValue(d).toFixed(2)}</td></tr>`,
        )
        .join("");
      return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:6px;"><tbody>${rows}</tbody></table>`;
    };

    const obsHtml = pagoPeriodoObs.trim()
      ? `<div style="font-weight:bold;font-size:17px;margin-bottom:8px;border-bottom:2px solid #000;padding-bottom:4px;">${pagoPeriodoObs.trim().replace(/</g, "&lt;")}</div>`
      : "";

    const html = `<!DOCTYPE html><html><head><title>Pago no Período</title>
    <style>
      @page { size: A4; margin: 8mm 10mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 15px; line-height: 1.3; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
      <button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button>
    </div>
    <div style="padding:2mm 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:4px;">
        <div style="font-size:11px;color:#555;">${periodoStr} &nbsp;|&nbsp; Emissão: ${hoje}</div>
        <div style="font-weight:bold;font-size:20px;white-space:nowrap;">Total: R$ ${pagoPeriodoTotals.total.toFixed(2)}</div>
      </div>
      ${obsHtml}
      ${buildSection(vistaEntries, (d) => d.vista)}
      ${buildSection(prazoEntries, (d) => d.prazo)}
    </div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
    setPagoPeriodoOpen(false);
  };

  // Filtered list
  const filtered = useMemo(() => {
    let list = contasFiltered.filter((c: any) => (!showPagos ? c.status !== "pago" : true));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) => (fornecedorMap[c.fornecedor_id] || "").toLowerCase().includes(s));
    }
    return list;
  }, [contasFiltered, showPagos, search, fornecedorMap]);

  // Add manual entry
  const addManual = useMutation({
    mutationFn: async () => {
      const valor = parseFloat(addValor.replace(",", "."));
      if (!addFornecedor || isNaN(valor) || valor <= 0) throw new Error("Dados inválidos");
      const { error } = await supabase.from("financeiro_pagar").insert({
        fornecedor_id: addFornecedor,
        data_compra: addData,
        valor_total: valor,
        observacao: addObs || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeiro_pagar"] });
      setAddOpen(false);
      setAddFornecedor("");
      setAddValor("");
      setAddObs("");
      toast({ title: "Conta adicionada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const registrarPagamento = async () => {
    if (paying) return; // guard against double-click
    const valorDigitado = parseFloat(payValor.replace(",", ".") || "0");
    const creditoDisponivel = payUsarCredito ? creditoMap[payFornecedorId] || 0 : 0;

    if (!payFornecedorId) {
      toast({ title: "Selecione um fornecedor", variant: "destructive" });
      return;
    }

    setPaying(true);
    try {

    const abertas = contasFiltered
      .filter((c: any) => c.fornecedor_id === payFornecedorId && c.status !== "pago")
      .sort((a: any, b: any) => a.data_compra.localeCompare(b.data_compra));

    const totalAbertoFornecedor = abertas.reduce((s: number, c: any) => {
      return s + Math.max(0, Number(c.valor_total) - Number(c.valor_pago));
    }, 0);

    if (valorDigitado <= 0 && creditoDisponivel <= 0) {
      toast({ title: "Informe um valor ou utilize o crédito", variant: "destructive" });
      return;
    }

    if (totalAbertoFornecedor <= 0.005 && valorDigitado <= 0) {
      toast({ title: "Fornecedor não possui contas em aberto", variant: "destructive" });
      return;
    }

    const alvoPagamento = valorDigitado > 0 ? valorDigitado : totalAbertoFornecedor;

    const creditoUsar = Math.min(creditoDisponivel, alvoPagamento, totalAbertoFornecedor);

    const valorDinheiro = Math.max(0, alvoPagamento - creditoUsar);

    let creditoRestante = creditoUsar;

    if (creditoRestante > 0.005) {
      const oldPayments = pagamentos
        .filter((p: any) => p.fornecedor_id === payFornecedorId)
        .map((p: any) => {
          const alocado = alocacoes
            .filter((a: any) => a.pagamento_id === p.id)
            .reduce((s: number, a: any) => s + Number(a.valor_alocado), 0);

          const sobra = Number(p.valor) - alocado;

          return { ...p, sobra };
        })
        .filter((p: any) => p.sobra > 0.005)
        .sort((a: any, b: any) => a.data_pagamento.localeCompare(b.data_pagamento));

      for (const conta of abertas) {
        if (creditoRestante <= 0.005) break;

        const devendo = Number(conta.valor_total) - Number(conta.valor_pago);
        if (devendo <= 0.005) continue;

        const usarCredito = Math.min(creditoRestante, devendo);

        let aindaAlocar = usarCredito;

        for (const op of oldPayments) {
          if (aindaAlocar <= 0.005) break;
          if (op.sobra <= 0.005) continue;

          const parcela = Math.min(aindaAlocar, op.sobra);

          const { error: alocError } = await supabase.from("pagamento_alocacoes_fornecedor").insert({
            pagamento_id: op.id,
            financeiro_pagar_id: conta.id,
            valor_alocado: parcela,
          });

          if (alocError) {
            toast({
              title: "Erro ao usar crédito",
              description: alocError.message,
              variant: "destructive",
            });
            return;
          }

          op.sobra -= parcela;
          aindaAlocar -= parcela;
        }

        const creditoAplicado = usarCredito - aindaAlocar;

        if (creditoAplicado <= 0.005) continue;

        creditoRestante -= creditoAplicado;

        const novoPago = Number(conta.valor_pago) + creditoAplicado;
        const novoStatus = novoPago >= Number(conta.valor_total) - 0.005 ? "pago" : "parcial";

        const { error: updateError } = await supabase
          .from("financeiro_pagar")
          .update({
            valor_pago: novoPago,
            status: novoStatus,
          })
          .eq("id", conta.id);

        if (updateError) {
          toast({
            title: "Erro ao atualizar conta",
            description: updateError.message,
            variant: "destructive",
          });
          return;
        }

        conta.valor_pago = novoPago;
        conta.status = novoStatus;
      }
    }

    let restante = valorDinheiro;

    if (valorDinheiro > 0.005) {
      const { data: pag, error: pe } = await supabase
        .from("pagamentos_fornecedor")
        .insert({
          fornecedor_id: payFornecedorId,
          valor: valorDinheiro,
          observacao: payObs || "",
        })
        .select()
        .single();

      if (pe || !pag) {
        toast({
          title: "Erro",
          description: pe?.message,
          variant: "destructive",
        });
        return;
      }

      for (const conta of abertas) {
        if (restante <= 0.005) break;

        const devendo = Number(conta.valor_total) - Number(conta.valor_pago);
        if (devendo <= 0.005) continue;

        const alocar = Math.min(restante, devendo);
        restante -= alocar;

        const { error: alocError } = await supabase.from("pagamento_alocacoes_fornecedor").insert({
          pagamento_id: pag.id,
          financeiro_pagar_id: conta.id,
          valor_alocado: alocar,
        });

        if (alocError) {
          toast({
            title: "Erro ao alocar pagamento",
            description: alocError.message,
            variant: "destructive",
          });
          return;
        }

        const novoPago = Number(conta.valor_pago) + alocar;
        const novoStatus = novoPago >= Number(conta.valor_total) - 0.005 ? "pago" : "parcial";

        const { error: updateError } = await supabase
          .from("financeiro_pagar")
          .update({
            valor_pago: novoPago,
            status: novoStatus,
          })
          .eq("id", conta.id);

        if (updateError) {
          toast({
            title: "Erro ao atualizar conta",
            description: updateError.message,
            variant: "destructive",
          });
          return;
        }

        conta.valor_pago = novoPago;
        conta.status = novoStatus;
      }
    }

    qc.invalidateQueries({ queryKey: ["financeiro_pagar"] });
    qc.invalidateQueries({ queryKey: ["pagamentos_fornecedor"] });
    qc.invalidateQueries({ queryKey: ["pagamento_alocacoes_fornecedor"] });

    setPayOpen(false);
    setPayValor("");
    setPayObs("");
    setPayUsarCredito(false);

    const creditoUsado = creditoUsar - creditoRestante;

    const msgs: string[] = [];

    if (creditoUsado > 0.005) {
      msgs.push(`R$ ${creditoUsado.toFixed(2)} do crédito utilizado`);
    }

    if (valorDinheiro > 0.005) {
      msgs.push(`R$ ${valorDinheiro.toFixed(2)} pago em dinheiro`);
    }

    if (restante > 0.005) {
      msgs.push(`R$ ${restante.toFixed(2)} ficou como saldo/crédito`);
    }

    toast({
      title: "Pagamento registrado",
      description: msgs.join(". ") || undefined,
    });
    } finally {
      setPaying(false);
    }
  };

  const pagarNota = async () => {
    if (payingNota) return; // guard against double-click
    if (!payNotaItem) return;
    const valor = parseFloat(payNotaValor.replace(",", ".") || "0");
    const desconto = payNotaDesconto ? parseFloat(payNotaDescontoValor.replace(",", ".") || "0") : 0;
    if (isNaN(valor) || valor < 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    if (payNotaDesconto && (isNaN(desconto) || desconto <= 0)) {
      toast({ title: "Valor de desconto inválido", variant: "destructive" });
      return;
    }
    if (valor <= 0 && desconto <= 0) {
      toast({ title: "Informe um valor de pagamento ou desconto", variant: "destructive" });
      return;
    }

    setPayingNota(true);
    try {
      const valorTotalOriginal = Number(payNotaItem.valor_total);
      const valorPagoAtual = Number(payNotaItem.valor_pago);

      // Se tem desconto, reduzir o valor_total da nota (isso reduz Entradas no Período)
      const novoValorTotal = payNotaDesconto ? valorTotalOriginal - desconto : valorTotalOriginal;
      const devendo = novoValorTotal - valorPagoAtual;
      const alocar = Math.min(valor, devendo);

      // Sempre registra pagamento (mesmo com valor 0 se tem desconto) para aparecer no Desfazer
      const obsPag = payNotaDesconto
        ? `Pagamento com desconto de R$ ${desconto.toFixed(2)} | nota:${payNotaItem.id} | desconto:${desconto.toFixed(2)}`
        : "";
      const { data: pag, error: pe } = await supabase
        .from("pagamentos_fornecedor")
        .insert({
          fornecedor_id: payNotaItem.fornecedor_id,
          valor: alocar,
          observacao: obsPag,
        })
        .select()
        .single();
      if (pe || !pag) return;

      if (alocar > 0) {
        await supabase.from("pagamento_alocacoes_fornecedor").insert({
          pagamento_id: pag.id,
          financeiro_pagar_id: payNotaItem.id,
          valor_alocado: alocar,
        });
      }

      const novoPago = valorPagoAtual + alocar;
      const novoStatus = novoPago >= novoValorTotal - 0.005 ? "pago" : "parcial";

      // Atualiza a nota: reduz valor_total se desconto, atualiza valor_pago e status
      const obsAtual = payNotaItem.observacao || "";
      const obsDesconto = payNotaDesconto
        ? `${obsAtual ? obsAtual + " | " : ""}Desconto: R$ ${desconto.toFixed(2)}`
        : undefined;

      await supabase
        .from("financeiro_pagar")
        .update({
          valor_total: novoValorTotal,
          valor_pago: novoPago,
          status: novoStatus,
          ...(obsDesconto ? { observacao: obsDesconto } : {}),
        })
        .eq("id", payNotaItem.id);

      qc.invalidateQueries({ queryKey: ["financeiro_pagar"] });
      qc.invalidateQueries({ queryKey: ["pagamentos_fornecedor"] });
      qc.invalidateQueries({ queryKey: ["pagamento_alocacoes_fornecedor"] });
      setPayNotaOpen(false);
      setPayNotaItem(null);
      setPayNotaDesconto(false);
      setPayNotaDescontoValor("");

      if (payNotaDesconto && desconto > 0) {
        toast({
          title: "Pagamento registrado",
          description: `R$ ${desconto.toFixed(2)} de desconto baixado em Entradas no Período (valor da nota reduzido).`,
        });
      } else {
        toast({ title: "Pagamento registrado" });
      }
    } finally {
      setPayingNota(false);
    }
  };

  // Build print HTML for given accounts grouped by supplier (with optional credit inclusion)
  const buildPrintHtml = (abertos: any[], titulo: string, options?: { includeAllCredits?: boolean }) => {
    const grouped: Record<string, any[]> = {};
    for (const c of abertos) {
      const nome = fornecedorMap[c.fornecedor_id] || "Desconhecido";
      if (!grouped[nome]) grouped[nome] = [];
      grouped[nome].push(c);
    }

    // If includeAllCredits, add suppliers that only have credit (no open accounts)
    if (options?.includeAllCredits) {
      for (const [fid, cred] of Object.entries(creditoMap)) {
        if (cred <= 0.005) continue;
        const nome = fornecedorMap[fid] || "Desconhecido";
        if (!grouped[nome]) grouped[nome] = [];
      }
    }

    const hoje = new Date().toLocaleDateString("pt-BR");
    const sortedNames = Object.keys(grouped).sort();
    let grandTotal = 0;
    let grandCredito = 0;
    let blocosHtml = "";

    for (const nome of sortedNames) {
      const items = (grouped[nome] || []).sort((a: any, b: any) => a.data_compra.localeCompare(b.data_compra));
      const totalForn = items.reduce((s: number, c: any) => s + (Number(c.valor_total) - Number(c.valor_pago)), 0);
      grandTotal += totalForn;

      // Find credit for this supplier
      const fid =
        items.length > 0 ? items[0].fornecedor_id : Object.entries(fornecedorMap).find(([, n]) => n === nome)?.[0];
      const credito = fid ? creditoMap[fid] || 0 : 0;
      if (credito > 0.005) grandCredito += credito;

      let rows = "";
      for (const c of items) {
        const saldo = Number(c.valor_total) - Number(c.valor_pago);
        const obs = (c.observacao || "").replace(/Conta manual/g, "").trim();
        rows += `<tr>
          <td style="padding:2px 6px 2px 0;">${format(parseISO(c.data_compra), "dd/MM/yyyy")}</td>
          <td style="text-align:right;padding:2px 6px;">R$ ${Number(c.valor_total).toFixed(2)}</td>
          <td style="text-align:right;padding:2px 6px;">R$ ${Number(c.valor_pago).toFixed(2)}</td>
          <td style="text-align:right;font-weight:bold;padding:2px 6px;">R$ ${saldo.toFixed(2)}</td>
          <td style="padding:2px 0 2px 6px;font-size:10px;max-width:40mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${obs}</td>
        </tr>`;
      }

      // Credit details for this supplier
      let creditBlockHtml = "";
      if (options?.includeAllCredits && credito > 0.005 && fid) {
        const details = getCreditoDetails(fid);
        let creditRows = "";
        for (const d of details) {
          const obs = (d.obs || "")
            .replace(/nota:[\w-]+/g, "")
            .replace(/desconto:[\d.]+/g, "")
            .replace(/\|/g, "")
            .trim();
          creditRows += `<tr>
            <td style="padding:2px 6px 2px 0;">${format(parseISO(d.data), "dd/MM/yyyy")}</td>
            <td style="text-align:right;font-weight:bold;padding:2px 6px;color:#006600;">R$ ${d.valor.toFixed(2)}</td>
            <td style="padding:2px 0 2px 6px;font-size:10px;">${obs}</td>
          </tr>`;
        }
        creditBlockHtml = `
          <div style="margin-top:4px;padding:4px;border:1px solid #006600;border-radius:3px;">
            <div style="font-weight:bold;font-size:11px;color:#006600;margin-bottom:2px;">CRÉDITO</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <tbody>${creditRows}</tbody>
            </table>
            <div style="text-align:right;font-weight:bold;font-size:11px;color:#006600;border-top:1px dashed #006600;padding-top:1px;margin-top:1px;">
              Crédito: R$ ${credito.toFixed(2)}
            </div>
          </div>
        `;
      }

      blocosHtml += `
        <div style="margin-bottom:8px;page-break-inside:avoid;break-inside:avoid;">
          <div style="font-weight:bold;font-size:13px;border-bottom:1px solid #333;padding-bottom:1px;margin-bottom:2px;">${nome}</div>
          ${
            items.length > 0
              ? `<table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead>
              <tr style="border-bottom:1px solid #999;">
                <th style="text-align:left;padding:1px 6px 1px 0;">Data</th>
                <th style="text-align:right;padding:1px 6px;">Valor</th>
                <th style="text-align:right;padding:1px 6px;">Pago</th>
                <th style="text-align:right;padding:1px 6px;">Saldo</th>
                <th style="text-align:left;padding:1px 0 1px 6px;">Obs</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="text-align:right;font-weight:bold;font-size:12px;border-top:1px dashed #999;padding-top:1px;margin-top:1px;">
            Total: R$ ${totalForn.toFixed(2)}
          </div>`
              : `<p style="font-size:11px;color:#666;margin:2px 0;">Nenhuma conta em aberto</p>`
          }
          ${creditBlockHtml}
          <div style="font-size:10px;margin-top:4px;">
            ___/___/___ Assi: ______________________________
          </div>
        </div>
      `;
    }

    const totalDivida = grandTotal - grandCredito;
    const showSummary = options?.includeAllCredits && grandCredito > 0.005;

    return `<!DOCTYPE html><html><head><title>${titulo}</title>
    <style>
      @page { size: A4; margin: 8mm 10mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 12px; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
      <button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button>
    </div>
    <div style="padding:2mm 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:2px solid #000;padding-bottom:4px;">
        <div>
          <div style="font-weight:bold;font-size:16px;">JP Flores — ${titulo}</div>
          <div style="font-size:12px;">Data: ${hoje}</div>
        </div>
        <div style="font-weight:bold;font-size:15px;">Total: R$ ${grandTotal.toFixed(2)}</div>
      </div>
      ${blocosHtml}
      <div style="border-top:2px solid #000;padding-top:6px;margin-top:10px;font-weight:bold;font-size:14px;">
        <div style="display:flex;justify-content:flex-end;margin-bottom:2px;">Total Geral em Aberto: R$ ${grandTotal.toFixed(2)}</div>
        ${
          showSummary
            ? `
          <div style="display:flex;justify-content:flex-end;margin-bottom:2px;color:#006600;">Total Geral de Crédito: R$ ${grandCredito.toFixed(2)}</div>
          <div style="display:flex;justify-content:flex-end;border-top:1px solid #000;padding-top:4px;margin-top:4px;font-size:15px;">Total Dívida São Paulo: R$ ${totalDivida.toFixed(2)}</div>
        `
            : ""
        }
      </div>
    </div>
    </body></html>`;
  };

  // Print all A4
  const printA4 = () => {
    const abertos = contasFiltered.filter((c: any) => c.status !== "pago");
    const html = buildPrintHtml(abertos, "Contas a Pagar em Aberto", { includeAllCredits: true });
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  // Print AP Casa only — large fonts, portrait, vertical half-page divider
  const printApCasa = () => {
    const apCasaContas = contasFiltered.filter(
      (c: any) => c.status !== "pago" && c.pedido_entrada_id && apCasaEntradaIds.has(c.pedido_entrada_id),
    );
    if (apCasaContas.length === 0) {
      toast({ title: "Nenhuma conta AP Casa em aberto", variant: "destructive" });
      return;
    }
    // Group by supplier
    const grouped: Record<string, { nome: string; items: any[] }> = {};
    for (const c of apCasaContas) {
      const nome = fornecedorMap[c.fornecedor_id] || "Desconhecido";
      if (!grouped[c.fornecedor_id]) grouped[c.fornecedor_id] = { nome, items: [] };
      grouped[c.fornecedor_id].items.push(c);
    }
    const suppliers = Object.values(grouped).sort((a, b) => a.nome.localeCompare(b.nome));

    const hoje = new Date().toLocaleDateString("pt-BR");
    let grandTotal = 0;
    let grandCredito = 0;
    let blocosHtml = "";

    for (const sup of suppliers) {
      const items = sup.items.sort((a: any, b: any) => a.data_compra.localeCompare(b.data_compra));
      const total = items.reduce((s: number, c: any) => s + (Number(c.valor_total) - Number(c.valor_pago)), 0);
      grandTotal += total;
      const fid = items[0]?.fornecedor_id;
      const credito = fid ? creditoMap[fid] || 0 : 0;
      if (credito > 0.005) grandCredito += credito;
      let rows = "";
      for (const c of items) {
        const saldo = Number(c.valor_total) - Number(c.valor_pago);
        rows += `<tr>
          <td style="padding:4px 6px 4px 0;">${format(parseISO(c.data_compra), "dd/MM")}</td>
          <td style="text-align:right;padding:4px 6px;">${Number(c.valor_total).toFixed(2)}</td>
          <td style="text-align:right;padding:4px 6px;">${Number(c.valor_pago).toFixed(2)}</td>
          <td style="text-align:right;font-weight:bold;padding:4px 6px;">${saldo.toFixed(2)}</td>
        </tr>`;
      }
      const creditoHtml =
        credito > 0.005
          ? `
        <div style="text-align:right;font-size:17px;font-weight:bold;color:#16a34a;margin-top:2px;">
          Crédito: ${credito.toFixed(2)}
        </div>`
          : "";
      blocosHtml += `
        <div style="margin-bottom:14px;break-inside:avoid;">
          <div style="font-weight:bold;font-size:20px;border-bottom:2px solid #333;padding-bottom:3px;margin-bottom:4px;">${sup.nome}</div>
          <table style="width:100%;border-collapse:collapse;font-size:18px;">
            <thead>
              <tr style="border-bottom:2px solid #999;">
                <th style="text-align:left;padding:4px 6px 4px 0;">Data</th>
                <th style="text-align:right;padding:4px 6px;">Valor</th>
                <th style="text-align:right;padding:4px 6px;">Pago</th>
                <th style="text-align:right;padding:4px 6px;">Saldo</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="text-align:right;font-weight:bold;font-size:19px;border-top:2px dashed #999;padding-top:4px;margin-top:4px;">
            Total: ${total.toFixed(2)}
          </div>
          ${creditoHtml}
          <div style="font-size:16px;margin-top:6px;padding-top:4px;">
            ___/___/___ Assi: ______________________________
          </div>
        </div>
      `;
    }

    const html = `<!DOCTYPE html><html><head><title>AP Casa</title>
    <style>
      @page { size: A4 portrait; margin: 8mm 10mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 18px; }
      .content {
        column-count: 2;
        column-gap: 12mm;
        column-rule: 1px solid #999;
      }
      .header-block { column-span: all; font-weight:bold;font-size:22px;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:8px; }
      .footer-block { column-span: all; border-top:3px solid #000;padding-top:6px;margin-top:12px;font-weight:bold;font-size:22px;text-align:right; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
      <button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button>
    </div>
    <div class="content">
      <div class="header-block">
        JP Flores — AP Casa
        <span style="font-size:16px;font-weight:normal;margin-left:10px;">${hoje}</span>
      </div>
      ${blocosHtml}
      <div class="footer-block">
        Total Geral: ${grandTotal.toFixed(2)}
        ${grandCredito > 0.005 ? `<br><span style="color:#16a34a;">Crédito Total: ${grandCredito.toFixed(2)}</span>` : ""}
      </div>
    </div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  const openPrintPreview = (fornecedorId: string) => {
    const abertos = contasFiltered.filter((c: any) => c.fornecedor_id === fornecedorId && c.status !== "pago");
    const temCredito = (creditoMap[fornecedorId] || 0) > 0.005;
    if (abertos.length === 0 && !temCredito) {
      toast({ title: "Nenhuma conta em aberto", variant: "destructive" });
      return;
    }
    const sel: Record<string, boolean> = {};
    abertos.forEach((c: any) => {
      sel[c.id] = true;
    });
    setPrintPreviewSelected(sel);
    setPrintPreviewFornecedorId(fornecedorId);
    setPrintPreviewOpen(true);
  };

  const printPreviewContas = useMemo(() => {
    if (!printPreviewFornecedorId) return [];
    return contasFiltered
      .filter((c: any) => c.fornecedor_id === printPreviewFornecedorId && c.status !== "pago")
      .sort((a: any, b: any) => a.data_compra.localeCompare(b.data_compra));
  }, [contas, printPreviewFornecedorId]);

  // Credit details per supplier (individual payments with excess)
  const getCreditoDetails = (fornecedorId: string) => {
    const details: { data: string; valor: number; pagamentoId: string; obs: string }[] = [];
    for (const p of pagamentos) {
      if (p.fornecedor_id !== fornecedorId) continue;
      const alocado = alocacoes
        .filter((a: any) => a.pagamento_id === p.id)
        .reduce((s: number, a: any) => s + Number(a.valor_alocado), 0);
      const sobra = Number(p.valor) - alocado;
      if (sobra > 0.005) {
        details.push({ data: p.data_pagamento, valor: sobra, pagamentoId: p.id, obs: p.observacao || "" });
      }
    }
    return details.sort((a, b) => a.data.localeCompare(b.data));
  };

  const confirmPrintFornecedor = () => {
    const selected = printPreviewContas.filter((c: any) => printPreviewSelected[c.id]);
    const credito = creditoMap[printPreviewFornecedorId] || 0;
    const creditoDetails = credito > 0.005 ? getCreditoDetails(printPreviewFornecedorId) : [];
    if (selected.length === 0 && creditoDetails.length === 0) {
      toast({ title: "Selecione ao menos uma conta", variant: "destructive" });
      return;
    }
    const nome = fornecedorMap[printPreviewFornecedorId] || "Fornecedor";

    // Build HTML with credit section
    let html: string;
    if (selected.length > 0) {
      html = buildPrintHtml(selected, `Contas a Pagar - ${nome}`);
      if (creditoDetails.length > 0) {
        // Inject credit section before closing </div></body>
        const creditHtml = buildCreditSectionHtml(creditoDetails, credito);
        html = html.replace("</div>\n    </body>", `${creditHtml}</div>\n    </body>`);
      }
    } else {
      // Only credit, no open accounts
      const hoje = new Date().toLocaleDateString("pt-BR");
      const creditHtml = buildCreditSectionHtml(creditoDetails, credito);
      html = `<!DOCTYPE html><html><head><title>Crédito - ${nome}</title>
      <style>
        @page { size: A4; margin: 8mm 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
        <button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
        <button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button>
      </div>
      <div style="padding:2mm 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:2px solid #000;padding-bottom:4px;">
          <div>
            <div style="font-weight:bold;font-size:16px;">JP Flores — Crédito - ${nome}</div>
            <div style="font-size:12px;">Data: ${hoje}</div>
          </div>
        </div>
        <p style="font-size:12px;margin-bottom:6px;">Nenhuma conta em aberto.</p>
        ${creditHtml}
      </div>
      </body></html>`;
    }

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
    setPrintPreviewOpen(false);
  };

  const buildCreditSectionHtml = (details: { data: string; valor: number; obs: string }[], totalCredito: number) => {
    let rows = "";
    for (const d of details) {
      const obs = (d.obs || "")
        .replace(/nota:[\w-]+/g, "")
        .replace(/desconto:[\d.]+/g, "")
        .replace(/\|/g, "")
        .trim();
      rows += `<tr>
        <td style="padding:2px 6px 2px 0;">${format(parseISO(d.data), "dd/MM/yyyy")}</td>
        <td style="text-align:right;font-weight:bold;padding:2px 6px;color:#006600;">R$ ${d.valor.toFixed(2)}</td>
        <td style="padding:2px 0 2px 6px;font-size:10px;">${obs}</td>
      </tr>`;
    }
    return `
      <div style="margin-top:10px;margin-bottom:8px;border:1px solid #006600;padding:6px;border-radius:4px;">
        <div style="font-weight:bold;font-size:13px;color:#006600;border-bottom:1px solid #006600;padding-bottom:2px;margin-bottom:4px;">CRÉDITO / SALDO A FAVOR</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="border-bottom:1px solid #999;">
              <th style="text-align:left;padding:1px 6px 1px 0;">Data Pagamento</th>
              <th style="text-align:right;padding:1px 6px;">Valor</th>
              <th style="text-align:left;padding:1px 0 1px 6px;">Obs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:right;font-weight:bold;font-size:12px;border-top:1px dashed #006600;padding-top:2px;margin-top:2px;color:#006600;">
          Total Crédito: R$ ${totalCredito.toFixed(2)}
        </div>
      </div>
    `;
  };

  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Contas a Pagar</h1>
        <Button size="sm" variant="outline" onClick={openPagoPeriodo}>
          <Printer className="h-4 w-4 mr-1" />
          Pago no Período
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCreditosOpen(true)}>
          <Printer className="h-4 w-4 mr-1" />
          Créditos
        </Button>
        <Button size="sm" variant="outline" onClick={printApCasa}>
          <Printer className="h-4 w-4 mr-1" />
          AP Casa
        </Button>
        <Button size="sm" variant="outline" onClick={() => setUndoOpen(true)}>
          <Undo2 className="h-4 w-4 mr-1" />
          Desfazer
        </Button>
        <Button size="sm" variant="outline" onClick={printA4}>
          <Printer className="h-4 w-4 mr-1" />
          Imprimir
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {/* Filters bar — single bar for everything */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">De</span>
        <DatePicker value={de} onChange={setDe} />
        <span className="text-xs text-muted-foreground">Até</span>
        <DatePicker value={ate} onChange={setAte} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showPagos} onChange={() => { const next = !showPagos; setShowPagos(next); if (!next) timeWindow.reset(); }} />
          Mostrar pagos
        </label>
        <TimeWindowControl
          label={timeWindow.label}
          nextLabel={timeWindow.nextLabel}
          canExpand={timeWindow.canExpand}
          onExpand={timeWindow.expand}
          showHint={showPagos}
        />
      </div>

      {/* Toggle + Summary cards */}
      <Button size="sm" variant="outline" className="w-fit text-xs gap-1" onClick={() => setShowCards((v) => !v)}>
        {showCards ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showCards ? "Ocultar resumo" : "Ver resumo"}
      </Button>
      {showCards && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground">Total em Aberto</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold text-destructive">{fmt(totalAberto)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground">Pago no Período</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold text-green-600">{fmt(totalPagoPeriodo)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground">Entradas no Período</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold">{fmt(entradasPeriodo.total)}</p>
              <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                <span>
                  A Prazo: <b className="text-foreground">{fmt(entradasPeriodo.prazo)}</b>
                </span>
                <span>
                  À Vista: <b className="text-foreground">{fmt(entradasPeriodo.vista)}</b>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Supplier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(fornecedorSummary)
          .filter(([fid, v]) => {
            if (v.aberto <= 0.005 && v.credito <= 0.005) return false;
            if (search) {
              return (fornecedorMap[fid] || "").toLowerCase().includes(search.toLowerCase());
            }
            return true;
          })
          .sort(([a], [b]) => (fornecedorMap[a] || "").localeCompare(fornecedorMap[b] || ""))
          .map(([fid, v]) => (
            <Card key={fid} className="p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm">{fornecedorMap[fid]}</p>
                  <p className="text-xs text-muted-foreground">
                    Total: {fmt(v.total)} | Pago: {fmt(v.pago)}
                  </p>
                  <p className="text-sm font-bold text-destructive">Saldo: {fmt(v.aberto)}</p>
                  {v.credito > 0.005 && <p className="text-xs text-blue-600">Crédito: {fmt(v.credito)}</p>}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => openPrintPreview(fid)}
                    title="Imprimir"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPayFornecedorId(fid);
                      setPayValor("");
                      setPayObs("");
                      setPayUsarCredito(false);
                      setPayOpen(true);
                    }}
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Pagar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Obs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma conta encontrada
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c: any) => {
              const saldo = Number(c.valor_total) - Number(c.valor_pago);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{fornecedorMap[c.fornecedor_id]}</TableCell>
                  <TableCell>{format(parseISO(c.data_compra), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-right">{fmt(Number(c.valor_total))}</TableCell>
                  <TableCell className="text-right">{fmt(Number(c.valor_pago))}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(saldo)}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{c.observacao}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${c.status === "pago" ? "bg-green-100 text-green-700" : c.status === "parcial" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}
                    >
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.status !== "pago" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Pagar esta nota"
                        onClick={() => {
                          setPayNotaItem(c);
                          setPayNotaValor((Number(c.valor_total) - Number(c.valor_pago)).toFixed(2));
                          setPayNotaDesconto(false);
                          setPayNotaDescontoValor("");
                          setPayNotaOpen(true);
                        }}
                      >
                        <DollarSign className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog: Add manual */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Conta a Pagar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <SearchableSelect
              options={fornecedores.map((f: any) => ({ value: f.id, label: f.nome }))}
              value={addFornecedor}
              onValueChange={setAddFornecedor}
              placeholder="Fornecedor"
            />
            <DatePicker value={addData} onChange={setAddData} />
            <Input placeholder="Valor" value={addValor} onChange={(e) => setAddValor(e.target.value)} />
            <Textarea
              placeholder="Observação (opcional)"
              value={addObs}
              onChange={(e) => setAddObs(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => addManual.mutate()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pay supplier (FIFO) */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento — {fornecedorMap[payFornecedorId]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(creditoMap[payFornecedorId] || 0) > 0.005 && (
              <>
                <p className="text-sm text-blue-600 font-medium">Crédito atual: {fmt(creditoMap[payFornecedorId])}</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={payUsarCredito} onCheckedChange={(v) => setPayUsarCredito(!!v)} />
                  <span className="text-sm font-medium">Utilizar Crédito</span>
                </label>
                {payUsarCredito && (
                  <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    O valor de <b>{fmt(creditoMap[payFornecedorId])}</b> do crédito será usado para abater notas em
                    aberto. Esse valor <b>não aparecerá</b> no "Pago no Período", pois já foi contabilizado quando o
                    pagamento original foi feito.
                  </p>
                )}
              </>
            )}
            {(() => {
              const abertas = contasFiltered.filter(
                (c: any) => c.fornecedor_id === payFornecedorId && c.status !== "pago",
              );
              const totalDevendo = abertas.reduce(
                (s: number, c: any) => s + Number(c.valor_total) - Number(c.valor_pago),
                0,
              );
              return totalDevendo > 0.005 ? (
                <p className="text-sm text-muted-foreground">
                  Total em aberto: <b className="text-foreground">{fmt(totalDevendo)}</b>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma conta em aberto. O valor ficará como saldo/crédito.
                </p>
              );
            })()}
            <Input
              placeholder="Valor total a pagar (R$)"
              value={payValor}
              onChange={(e) => setPayValor(e.target.value)}
            />
            {payUsarCredito &&
              (() => {
                const v = parseFloat(payValor.replace(",", ".") || "0");
                const cred = creditoMap[payFornecedorId] || 0;
                if (v > 0) {
                  const credUsar = Math.min(cred, v);
                  const dinheiro = Math.max(0, v - credUsar);
                  return (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                      <p>
                        Crédito usado: <b>{fmt(credUsar)}</b>
                      </p>
                      <p>
                        Valor em dinheiro: <b>{fmt(dinheiro)}</b> (aparece em Pago no Período)
                      </p>
                    </div>
                  );
                }
                return (
                  <p className="text-xs text-muted-foreground">
                    Pode deixar o valor zerado para usar apenas o crédito.
                  </p>
                );
              })()}
            <Textarea
              placeholder="Observação (opcional)"
              value={payObs}
              onChange={(e) => setPayObs(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button onClick={registrarPagamento} disabled={paying}>
              {paying ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pay specific nota */}
      <Dialog open={payNotaOpen} onOpenChange={setPayNotaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar Nota</DialogTitle>
          </DialogHeader>
          {payNotaItem && (
            <div className="space-y-3">
              <p className="text-sm">
                Fornecedor: <b>{fornecedorMap[payNotaItem.fornecedor_id]}</b>
              </p>
              <p className="text-sm">
                Saldo: <b>{fmt(Number(payNotaItem.valor_total) - Number(payNotaItem.valor_pago))}</b>
              </p>
              <Input placeholder="Valor" value={payNotaValor} onChange={(e) => setPayNotaValor(e.target.value)} />
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={payNotaDesconto} onCheckedChange={(v) => setPayNotaDesconto(!!v)} />
                <span className="text-sm font-medium">Desconto</span>
              </label>
              {payNotaDesconto && (
                <div className="space-y-1">
                  <Input
                    placeholder="Valor do desconto (R$)"
                    value={payNotaDescontoValor}
                    onChange={(e) => setPayNotaDescontoValor(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    O desconto será abatido do valor da nota (reduz Entradas no Período), não entra em Pago no Período.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={pagarNota} disabled={payingNota}>
              {payingNota ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Print preview for single supplier */}
      <Dialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Imprimir — {fornecedorMap[printPreviewFornecedorId]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-[50vh] overflow-auto">
            {printPreviewContas.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">Nenhuma conta em aberto.</p>
            )}
            {printPreviewContas.map((c: any) => {
              const saldo = Number(c.valor_total) - Number(c.valor_pago);
              return (
                <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={!!printPreviewSelected[c.id]}
                    onCheckedChange={(v) => setPrintPreviewSelected((prev) => ({ ...prev, [c.id]: !!v }))}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {format(parseISO(c.data_compra), "dd/MM/yyyy")} — {fmt(saldo)}
                    </p>
                    {c.observacao && <p className="text-xs text-muted-foreground truncate">{c.observacao}</p>}
                  </div>
                </label>
              );
            })}
            {(creditoMap[printPreviewFornecedorId] || 0) > 0.005 && (
              <div className="mt-2 p-2 rounded border border-green-300 bg-green-50">
                <p className="text-sm font-medium text-green-700">
                  Crédito: {fmt(creditoMap[printPreviewFornecedorId])}
                </p>
                <p className="text-xs text-green-600">Será incluído na impressão</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {Object.values(printPreviewSelected).filter(Boolean).length} de {printPreviewContas.length} selecionados
            </span>
            <span className="font-semibold">
              Total:{" "}
              {fmt(
                printPreviewContas
                  .filter((c: any) => printPreviewSelected[c.id])
                  .reduce((s: number, c: any) => s + Number(c.valor_total) - Number(c.valor_pago), 0),
              )}
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintPreviewOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmPrintFornecedor}>
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UndoPaymentFornecedorDialog open={undoOpen} onOpenChange={setUndoOpen} />

      {/* Pago no Período Dialog */}
      <Dialog open={pagoPeriodoOpen} onOpenChange={setPagoPeriodoOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Pago no Período — {format(parseISO(deStr), "dd/MM")} a {format(parseISO(ateStr), "dd/MM")}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const allEntries = Object.entries(pagoPeriodoData)
              .filter(([, d]) => d.vista > 0.005 || d.prazo > 0.005)
              .sort(([, a], [, b]) => a.nome.localeCompare(b.nome));
            if (allEntries.length === 0)
              return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum pagamento no período.</p>;

            const vistaEntries = allEntries.filter(([, d]) => d.vista > 0.005);
            const prazoEntries = allEntries.filter(([, d]) => d.prazo > 0.005);
            const allKeys = [
              ...vistaEntries.map(([fid]) => `vista:${fid}`),
              ...prazoEntries.map(([fid]) => `prazo:${fid}`),
            ];
            const allSelected = allKeys.length > 0 && allKeys.every((k) => pagoPeriodoSelected[k]);

            const toggleAll = () => {
              const sel: Record<string, boolean> = {};
              const shouldSelect = !allSelected;
              for (const k of allKeys) sel[k] = shouldSelect;
              setPagoPeriodoSelected(sel);
            };

            return (
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <Button size="sm" variant="outline" className="w-fit text-xs" onClick={toggleAll}>
                    {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit text-xs"
                    onClick={() => setPagoPeriodoObsOpen(!pagoPeriodoObsOpen)}
                  >
                    Observação
                  </Button>
                </div>
                {pagoPeriodoObsOpen && (
                  <textarea
                    className="w-full border-2 border-border rounded-md p-2 text-lg"
                    rows={2}
                    placeholder="Observação para impressão..."
                    value={pagoPeriodoObs}
                    onChange={(e) => setPagoPeriodoObs(e.target.value)}
                  />
                )}
                <div className="max-h-[50vh] overflow-auto space-y-5">
                  {vistaEntries.length > 0 && (
                    <div>
                      <p className="text-xl font-bold text-muted-foreground uppercase mb-3 border-b-2 border-border pb-2">
                        À Vista
                      </p>
                      <div className="rounded-md border-2 border-border overflow-hidden divide-y-2 divide-border bg-card">
                        {vistaEntries.map(([fid, d]) => (
                          <label
                            key={`vista-${fid}`}
                            className="flex items-center gap-4 px-3 py-4 hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={!!pagoPeriodoSelected[`vista:${fid}`]}
                              onCheckedChange={(v) =>
                                setPagoPeriodoSelected((prev) => ({ ...prev, [`vista:${fid}`]: !!v }))
                              }
                              className="h-6 w-6"
                            />
                            <span className="flex-1 text-2xl leading-tight">{d.nome}</span>
                            <span className="text-2xl font-bold leading-tight">{fmt(d.vista)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {prazoEntries.length > 0 && (
                    <div>
                      <p className="text-xl font-bold text-muted-foreground uppercase mb-3 border-b-2 border-border pb-2">
                        A Prazo (pago no período)
                      </p>
                      <div className="rounded-md border-2 border-border overflow-hidden divide-y-2 divide-border bg-card">
                        {prazoEntries.map(([fid, d]) => (
                          <label
                            key={`prazo-${fid}`}
                            className="flex items-center gap-4 px-3 py-4 hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={!!pagoPeriodoSelected[`prazo:${fid}`]}
                              onCheckedChange={(v) =>
                                setPagoPeriodoSelected((prev) => ({ ...prev, [`prazo:${fid}`]: !!v }))
                              }
                              className="h-6 w-6"
                            />
                            <span className="flex-1 text-2xl leading-tight">{d.nome}</span>
                            <span className="text-2xl font-bold leading-tight">{fmt(d.prazo)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t-2 border-border pt-4 space-y-3">
                  <div className="flex justify-between text-xl">
                    <span className="text-muted-foreground">À Vista:</span>
                    <span className="font-semibold">{fmt(pagoPeriodoTotals.vista)}</span>
                  </div>
                  <div className="flex justify-between text-xl">
                    <span className="text-muted-foreground">A Prazo (pago):</span>
                    <span className="font-semibold">{fmt(pagoPeriodoTotals.prazo)}</span>
                  </div>
                  <div className="flex justify-between text-2xl font-bold border-t-2 border-border pt-3">
                    <span>Total:</span>
                    <span>{fmt(pagoPeriodoTotals.total)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoPeriodoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={printPagoPeriodo}>
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Créditos Dialog */}
      <Dialog open={creditosOpen} onOpenChange={setCreditosOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créditos com Fornecedores</DialogTitle>
          </DialogHeader>

          {/* Add manual credit form */}
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <p className="text-sm font-medium">Adicionar Crédito Manual</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <SearchableSelect
                  options={fornecedores.map((f: any) => ({ value: f.id, label: f.nome }))}
                  value={addCreditoFornecedor}
                  onValueChange={setAddCreditoFornecedor}
                  placeholder="Fornecedor"
                />
              </div>
              <Input
                type="number"
                step="0.01"
                placeholder="Valor (R$)"
                value={addCreditoValor}
                onChange={(e) => setAddCreditoValor(e.target.value)}
              />
              <Input
                placeholder="Obs (opcional)"
                value={addCreditoObs}
                onChange={(e) => setAddCreditoObs(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={!addCreditoFornecedor || !addCreditoValor || addCreditoLoading}
              onClick={async () => {
                const val = parseFloat(addCreditoValor.replace(",", ".") || "0");
                if (val <= 0) {
                  toast({ title: "Valor inválido", variant: "destructive" });
                  return;
                }
                setAddCreditoLoading(true);
                const { error } = await supabase.from("pagamentos_fornecedor").insert({
                  fornecedor_id: addCreditoFornecedor,
                  valor: val,
                  observacao: addCreditoObs || "Crédito manual",
                  data_pagamento: localDateStr(localToday()),
                });
                setAddCreditoLoading(false);
                if (error) {
                  toast({ title: "Erro ao adicionar crédito", description: error.message, variant: "destructive" });
                  return;
                }
                toast({ title: "Crédito adicionado" });
                setAddCreditoFornecedor("");
                setAddCreditoValor("");
                setAddCreditoObs("");
                qc.invalidateQueries({ queryKey: ["pagamentos_fornecedor"] });
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {(() => {
            const entries = Object.entries(creditoMap)
              .filter(([, v]) => v > 0.005)
              .sort((a, b) => (fornecedorMap[a[0]] || "").localeCompare(fornecedorMap[b[0]] || ""));
            const totalCredito = entries.reduce((s, [, v]) => s + v, 0);
            if (entries.length === 0)
              return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum crédito encontrado.</p>;
            return (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Crédito</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(([fid, val]) => (
                      <TableRow key={fid}>
                        <TableCell className="font-medium">{fornecedorMap[fid] || fid}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">{fmt(val)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-right font-bold text-green-600">{fmt(totalCredito)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditosOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                const entries = Object.entries(creditoMap)
                  .filter(([, v]) => v > 0.005)
                  .sort((a, b) => (fornecedorMap[a[0]] || "").localeCompare(fornecedorMap[b[0]] || ""));
                const totalCredito = entries.reduce((s, [, v]) => s + v, 0);
                if (entries.length === 0) return;
                const rows = entries
                  .map(
                    ([fid, val]) =>
                      `<tr><td style="padding:4px 8px">${fornecedorMap[fid] || fid}</td><td style="padding:4px 8px;text-align:right;font-weight:bold">R$ ${val.toFixed(2)}</td></tr>`,
                  )
                  .join("");
                const html = `<html><head><title>Créditos Fornecedores</title><style>body{font-family:Courier New,monospace;font-size:13px;padding:20px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:6px 8px}th{text-align:left;background:#f5f5f5}@media print{button{display:none}}</style></head><body><h2>Créditos com Fornecedores</h2><table><thead><tr><th>Fornecedor</th><th style="text-align:right">Crédito</th></tr></thead><tbody>${rows}<tr style="border-top:2px solid #333"><td style="padding:6px 8px;font-weight:bold">TOTAL</td><td style="padding:6px 8px;text-align:right;font-weight:bold">R$ ${totalCredito.toFixed(2)}</td></tr></tbody></table></body></html>`;
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(html);
                  w.document.close();
                }
              }}
            >
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
