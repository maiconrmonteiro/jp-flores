import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { localToday, getTuesdayOfWeek } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Search, X, ArrowLeft, DollarSign, Plus, Printer, FileText, Calendar, Undo2, CreditCard, Box, ChevronDown, TrendingUp, Trash2, History } from "lucide-react";
import ManualHistoryDialog from "@/components/ManualHistoryDialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import FechamentoSemanal from "@/components/FechamentoSemanal";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DatePicker } from "@/components/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import UndoPaymentDialog from "@/components/UndoPaymentDialog";
import { parseCochoFromObs, stripCochoFromObs, upsertCochoInObs, cochoHasValues, formatCochoLine, CochoData } from "@/components/CochoButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTimeWindow } from "@/hooks/use-time-window";
import { TimeWindowControl } from "@/components/TimeWindowControl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  motoristaId: string;
  motoristaNome: string;
  onBack: () => void;
}

function localDateStr(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ClienteCardTerceirizado({ c, cocho, hasCocho, salvarCochos, setPgDialog, printSingleCobranca }: {
  c: { id: string; nome: string; saldo: number; credito: number; abertos: number };
  cocho: CochoData;
  hasCocho: boolean;
  salvarCochos: (id: string, cocho: CochoData) => Promise<void>;
  setPgDialog: (v: { clienteId: string; clienteNome: string }) => void;
  printSingleCobranca: (c: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preto, setPreto] = useState(cocho.preto);
  const [velling, setVelling] = useState(cocho.velling);
  const [quebrado, setQuebrado] = useState(cocho.quebrado);
  const [saving, setSaving] = useState(false);

  const handleOpen = (v: boolean) => {
    if (v) { setPreto(cocho.preto); setVelling(cocho.velling); setQuebrado(cocho.quebrado); }
    setOpen(v);
  };

  const handleSave = async () => {
    setSaving(true);
    await salvarCochos(c.id, { preto, velling, quebrado });
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm truncate">{c.nome}</span>
        <div className="flex gap-1">
          {c.credito > 0 && <Badge className="bg-emerald-600 text-white text-[10px]">Crédito</Badge>}
          {c.abertos > 0 && <Badge variant="outline" className="text-xs">{c.abertos} pendente{c.abertos !== 1 ? "s" : ""}</Badge>}
        </div>
      </div>
      {c.saldo > 0 && <div className="text-lg font-bold text-destructive">Saldo: R$ {c.saldo.toFixed(2)}</div>}
      {c.credito > 0 && <div className="text-sm font-semibold text-emerald-600">Crédito: R$ {c.credito.toFixed(2)}</div>}
      {hasCocho && (
        <div className="text-xs mt-1 text-muted-foreground flex items-center gap-1">
          <Box className="h-3 w-3" /> {formatCochoLine(cocho)}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setPgDialog({ clienteId: c.id, clienteNome: c.nome })}>
          <DollarSign className="h-3.5 w-3.5 mr-1" />Pagar
        </Button>
        {hasCocho && (
          <Popover open={open} onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant={open ? "default" : "outline"} className="text-xs" title="Baixar cochos">
                <Box className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Baixar Cochos — {c.nome}</Label>
                {[
                  { label: "Preto", value: preto, set: setPreto },
                  { label: "Velling", value: velling, set: setVelling },
                  { label: "Quebrado", value: quebrado, set: setQuebrado },
                ].map(f => (
                  <div key={f.label} className="flex items-center justify-between gap-2">
                    <Label className="text-xs w-16">{f.label}</Label>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => f.set(Math.max(0, f.value - 1))}><span className="text-lg leading-none">−</span></Button>
                      <Input type="number" className="h-7 w-14 text-center text-xs" value={f.value} onChange={e => f.set(Math.max(0, Number(e.target.value) || 0))} />
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => f.set(f.value + 1)}><span className="text-lg leading-none">+</span></Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" className="w-full mt-1" disabled={saving} onClick={handleSave}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <Button size="sm" variant="outline" className="text-xs" onClick={() => printSingleCobranca(c)} title="Imprimir cobrança">
          <Printer className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function MotoristaFinanceiro({ motoristaId, motoristaNome, onBack }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Date range filter - default: last Sunday to this Saturday
  const now = new Date();
  const lastSunday = startOfWeek(now, { weekStartsOn: 0 });
  const thisSaturday = endOfWeek(now, { weekStartsOn: 0 });
  const [dateFrom, setDateFrom] = useState(localDateStr(lastSunday));
  const [dateTo, setDateTo] = useState(localDateStr(thisSaturday));

  const [filterCliente, setFilterCliente] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCardCliente, setFilterCardCliente] = useState("");
  const [showPagos, setShowPagos] = useState(false);
  const timeWindow = useTimeWindow("30d");
  const [showResumoDialog, setShowResumoDialog] = useState(false);

  // Pagamento dialog
  const [pgDialog, setPgDialog] = useState<{ clienteId: string; clienteNome: string } | null>(null);
  const [pgNotaDialog, setPgNotaDialog] = useState<{ id: string; clienteId: string; clienteNome: string; saldo: number } | null>(null);
  const [pgValor, setPgValor] = useState("");
  const [pgData, setPgData] = useState(getTuesdayOfWeek());
  const [pgObs, setPgObs] = useState("");
  const [usarCredito, setUsarCredito] = useState(false);
  const [pgLoading, setPgLoading] = useState(false);

  // Manual dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [manualClienteId, setManualClienteId] = useState("");
  const [manualData, setManualData] = useState(localToday());
  const [manualValor, setManualValor] = useState("");
  const [manualTipo, setManualTipo] = useState("aprazo");
  const [manualValorPago, setManualValorPago] = useState("");
  const [manualObs, setManualObs] = useState("");
  const [manualCochoPreto, setManualCochoPreto] = useState(0);
  const [manualCochoVelling, setManualCochoVelling] = useState(0);
  const [manualCochoQuebrado, setManualCochoQuebrado] = useState(0);

  // Nota dialog
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaValor, setNotaValor] = useState("");
  const [notaData, setNotaData] = useState(localToday());
  const [notaObs, setNotaObs] = useState("");
  const [undoOpen, setUndoOpen] = useState(false);
  const [manualHistOpen, setManualHistOpen] = useState(false);
  const [contasPagarOpen, setContasPagarOpen] = useState(false);
  const [showNotasPagas, setShowNotasPagas] = useState(false);
  const [fechamentoOpen, setFechamentoOpen] = useState(false);
  const [deleteNotaId, setDeleteNotaId] = useState<string | null>(null);

  const { data: recebiveisJanela = [], isLoading } = useQuery({
    queryKey: ["motorista-financeiro", motoristaId, timeWindow.since],
    queryFn: async () => {
      const all: any[] = [];
      const BATCH = 1000;
      let from = 0;
      while (true) {
        let q: any = supabase
          .from("financeiro_receber")
          .select("*, clientes(nome), pedidos_saida(orcamento_num, observacao)")
          .eq("motorista_id", motoristaId)
          .order("data_venda", { ascending: true })
          .range(from, from + BATCH - 1);
        if (timeWindow.since) q = q.gte("data_venda", timeWindow.since);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < BATCH) break;
        from += BATCH;
      }
      return all;
    },
    enabled: !!motoristaId,
  });

  // Buscar TODOS os recebíveis em aberto (não-pagos) do motorista, independente da janela.
  // Necessário para que o saldo do cliente e o crédito disponível considerem notas antigas.
  const { data: recebiveisAbertosAll = [] } = useQuery({
    queryKey: ["motorista-financeiro-abertos", motoristaId],
    queryFn: async () => {
      const all: any[] = [];
      const BATCH = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("financeiro_receber")
          .select("*, clientes(nome), pedidos_saida(orcamento_num, observacao)")
          .eq("motorista_id", motoristaId)
          .neq("status", "pago")
          .order("data_venda", { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < BATCH) break;
        from += BATCH;
      }
      return all;
    },
    enabled: !!motoristaId,
  });

  // Mesclar: usa janela como base e adiciona abertos antigos que não estão na janela.
  // Assim o resto do código (vendas no período, baixas, etc) continua usando a janela,
  // mas o saldo do cliente passa a considerar TODAS as notas em aberto.
  const recebiveis = (() => {
    const map = new Map<string, any>();
    recebiveisJanela.forEach((r: any) => map.set(r.id, r));
    recebiveisAbertosAll.forEach((r: any) => { if (!map.has(r.id)) map.set(r.id, r); });
    return Array.from(map.values());
  })();

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => { const { data } = await supabase.from("clientes").select("*").order("nome"); return data || []; },
  });

  const { data: pagamentos = [] } = useQuery({
    queryKey: ["pagamentos"],
    queryFn: async () => await fetchAll<any>("pagamentos", "*", "data_pagamento", true),
  });

  const { data: alocacoes = [] } = useQuery({
    queryKey: ["pagamento_alocacoes"],
    queryFn: async () => await fetchAll<any>("pagamento_alocacoes", "*", "id", true),
  });

  const { data: notas = [] } = useQuery({
    queryKey: ["notas-motorista", motoristaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_motorista" as any)
        .select("*")
        .eq("motorista_id", motoristaId)
        .order("data_lancamento", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!motoristaId,
  });

  // Credit map - scoped per client+motorista
  const creditoMap = (() => {
    const pgMap = new Map<string, number>();
    pagamentos.forEach((p: any) => {
      // Only count pagamentos for this motorista (or old ones without motorista_id that were allocated to this motorista's recebiveis)
      if (p.motorista_id === motoristaId || (!p.motorista_id && recebiveis.some((r: any) => r.cliente_id === p.cliente_id))) {
        pgMap.set(p.cliente_id, (pgMap.get(p.cliente_id) || 0) + Number(p.valor));
      }
    });
    const alocMap = new Map<string, number>();
    alocacoes.forEach((a: any) => {
      const pg = pagamentos.find((p: any) => p.id === a.pagamento_id);
      if (!pg) return;
      if (pg.motorista_id === motoristaId || (!pg.motorista_id && recebiveis.some((r: any) => r.cliente_id === pg.cliente_id))) {
        alocMap.set(pg.cliente_id, (alocMap.get(pg.cliente_id) || 0) + Number(a.valor_alocado));
      }
    });
    const result = new Map<string, number>();
    pgMap.forEach((total, clienteId) => {
      const alocado = alocMap.get(clienteId) || 0;
      const credito = total - alocado;
      if (credito > 0.01) result.set(clienteId, credito);
    });
    return result;
  })();

  // Period-filtered recebiveis
  const recebiveisNoPeriodo = recebiveis.filter((r: any) => {
    if (dateFrom && r.data_venda < dateFrom) return false;
    if (dateTo && r.data_venda > dateTo) return false;
    return true;
  });

  // Period summaries
  const totalVendidoPeriodo = recebiveisNoPeriodo.reduce((s: number, r: any) => s + Number(r.valor_total), 0);

  // Total cobrado: à vista + parcial (valor_pago) vendidas no período + alocações a prazo pagas no período
  let totalCobradoPeriodo = 0;
  recebiveisNoPeriodo.forEach((r: any) => {
    if (r.tipo_pagamento === "avista") totalCobradoPeriodo += Number(r.valor_total);
    if (r.tipo_pagamento === "parcial") totalCobradoPeriodo += Number(r.valor_pago);
  });

  // Cobrado a prazo: alocações com pagamento no período
  const pagamentosNoPeriodo = pagamentos.filter((p: any) => {
    if (dateFrom && p.data_pagamento < dateFrom) return false;
    if (dateTo && p.data_pagamento > dateTo) return false;
    return recebiveis.some((r: any) => r.cliente_id === p.cliente_id);
  });
  alocacoes.forEach((a: any) => {
    const pg = pagamentos.find((p: any) => p.id === a.pagamento_id);
    if (!pg) return;
    if (dateFrom && pg.data_pagamento < dateFrom) return;
    if (dateTo && pg.data_pagamento > dateTo) return;
    const finRec = recebiveis.find((r: any) => r.id === a.financeiro_id);
    if (!finRec || finRec.motorista_id !== motoristaId) return;
    if (finRec.tipo_pagamento === "avista") return; // já contado
    totalCobradoPeriodo += Number(a.valor_alocado);
  });

  // Client summary (all time for cards)
  // Saldo = Σ(valor_total − valor_pago) APENAS de notas com status !== "pago", descontando crédito disponível
  const clienteSummary = (() => {
    const map = new Map<string, { nome: string; total: number; pago: number; abertos: number; credito: number; bruto: number }>();
    recebiveis.forEach((r: any) => {
      const cur = map.get(r.cliente_id) || { nome: r.clientes?.nome || "—", total: 0, pago: 0, abertos: 0, credito: 0, bruto: 0 };
      cur.total += Number(r.valor_total);
      cur.pago += Number(r.valor_pago);
      if (r.status !== "pago") {
        cur.abertos++;
        cur.bruto += Number(r.valor_total) - Number(r.valor_pago);
      }
      cur.credito = creditoMap.get(r.cliente_id) || 0;
      map.set(r.cliente_id, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({
      id,
      ...v,
      saldo: Math.round(Math.max(0, v.bruto - v.credito) * 100) / 100,
    })).sort((a, b) => b.saldo - a.saldo);
  })();

  // Total na rua = soma do saldo líquido (já com crédito descontado) de todos os clientes
  const totalNaRua = clienteSummary.reduce((s, c) => s + c.saldo, 0);

  // Resumo detalhes for dialog
  const resumoDetalhes = (() => {
    const recsPeriodo = recebiveis.filter((r: any) => r.data_venda >= dateFrom && r.data_venda <= dateTo);
    const vendasPeriodo = recsPeriodo.map((r: any) => ({
      id: r.id, data: r.data_venda, cliente: r.clientes?.nome || "—",
      orcamento: r.pedidos_saida?.orcamento_num || "—",
      valor: Number(r.valor_total), tipo: r.tipo_pagamento, status: r.status,
    }));
    const notasPagas = recsPeriodo
      .filter((r: any) => r.tipo_pagamento === "avista" || r.tipo_pagamento === "parcial")
      .map((r: any) => ({
        id: r.id, data: r.data_venda, cliente: r.clientes?.nome || "—",
        orcamento: r.pedidos_saida?.orcamento_num || "—",
        valor: r.tipo_pagamento === "avista" ? Number(r.valor_total) : Number(r.valor_pago),
        tipo: r.tipo_pagamento,
      }));
    const recsIds = new Set(recebiveis.map((r: any) => r.id));
    const recMap = new Map(recebiveis.map((r: any) => [r.id, r]));
    const baixasSaldo: any[] = [];
    alocacoes.forEach((a: any) => {
      if (!recsIds.has(a.financeiro_id)) return;
      const pg = pagamentos.find((p: any) => p.id === a.pagamento_id);
      if (!pg) return;
      if (pg.data_pagamento < dateFrom || pg.data_pagamento > dateTo) return;
      const rec = recMap.get(a.financeiro_id);
      if (!rec || rec.tipo_pagamento === "avista") return;
      baixasSaldo.push({
        id: a.id, data: pg.data_pagamento, cliente: rec.clientes?.nome || "—",
        orcamento: rec.pedidos_saida?.orcamento_num || "—",
        valor: Number(a.valor_alocado), status: rec.status,
      });
    });
    const totalVendido = vendasPeriodo.reduce((s: number, i: any) => s + i.valor, 0);
    const totalNotaPaga = notasPagas.reduce((s: number, i: any) => s + i.valor, 0);
    const totalBaixado = baixasSaldo.reduce((s: number, i: any) => s + i.valor, 0);
    return { vendasPeriodo, notasPagas, baixasSaldo, totalVendido, totalNotaPaga, totalBaixado };
  })();

  // Fetch cochos per client from dedicated table
  const { data: cochosData = [] } = useQuery({
    queryKey: ["cochos_cliente"],
    queryFn: async () => {
      const { data } = await supabase.from("cochos_cliente").select("*");
      return data || [];
    },
  });

  const cochoPerClient = (clienteId: string): CochoData => {
    const row = cochosData.find((c: any) => c.cliente_id === clienteId);
    if (!row) return { preto: 0, velling: 0, quebrado: 0 };
    return { preto: row.preto || 0, velling: row.velling || 0, quebrado: row.quebrado || 0 };
  };

  const salvarCochos = async (clienteId: string, newCocho: CochoData) => {
    const existing = cochosData.find((c: any) => c.cliente_id === clienteId);
    if (existing) {
      await supabase.from("cochos_cliente").update({ preto: newCocho.preto, velling: newCocho.velling, quebrado: newCocho.quebrado, updated_at: new Date().toISOString() }).eq("cliente_id", clienteId);
    } else {
      await supabase.from("cochos_cliente").insert({ cliente_id: clienteId, preto: newCocho.preto, velling: newCocho.velling, quebrado: newCocho.quebrado } as any);
    }
    qc.invalidateQueries({ queryKey: ["cochos_cliente"] });
    toast({ title: "Cochos atualizados" });
  };

  const registrarPagamento = async () => {
    if (!pgDialog || pgLoading) return;
    const valor = Number(pgValor);
    if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    setPgLoading(true);

    const creditoDisponivel = creditoMap.get(pgDialog.clienteId) || 0;
    const valorCredito = usarCredito ? Math.min(creditoDisponivel, valor) : 0;
    const valorDinheiro = valor - valorCredito;

    try {
      const obsText = [pgObs.trim(), valorCredito > 0 ? `(R$ ${valorDinheiro.toFixed(2)} dinheiro + R$ ${valorCredito.toFixed(2)} crédito)` : ""].filter(Boolean).join(" ");

      const { data: pg, error: pgErr } = await supabase.from("pagamentos")
        .insert({ cliente_id: pgDialog.clienteId, motorista_id: motoristaId, valor: valorDinheiro, data_pagamento: pgData, observacao: obsText, created_by: user?.id } as any)
        .select().single();
      if (pgErr) throw pgErr;

      const { data: abertos } = await supabase.from("financeiro_receber")
        .select("*").eq("cliente_id", pgDialog.clienteId).eq("motorista_id", motoristaId).neq("status", "pago").order("data_venda", { ascending: true });

      let restante = valor;
      for (const rec of (abertos || [])) {
        if (restante <= 0) break;
        const saldo = Number(rec.valor_total) - Number(rec.valor_pago);
        if (saldo <= 0) continue;
        const alocar = Math.min(restante, saldo);
        await supabase.from("pagamento_alocacoes").insert({ pagamento_id: pg.id, financeiro_id: rec.id, valor_alocado: alocar });
        const novoPago = Number(rec.valor_pago) + alocar;
        const novoStatus = novoPago >= Number(rec.valor_total) - 0.005 ? "pago" : "parcial";
        await supabase.from("financeiro_receber").update({ valor_pago: novoPago, status: novoStatus }).eq("id", rec.id);
        if (novoStatus === "pago") {
          await supabase.from("pedidos_saida").update({ archived: true } as any).eq("id", rec.pedido_saida_id);
        }
        restante -= alocar;
      }

      toast({ title: `Pagamento de R$ ${valor.toFixed(2)} registrado!` });
      setPgDialog(null); setPgValor(""); setPgObs(""); setUsarCredito(false);
      qc.invalidateQueries({ queryKey: ["motorista-financeiro"] });
      qc.invalidateQueries({ queryKey: ["pagamentos"] });
      qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setPgLoading(false);
    }
  };

  const registrarPagamentoNota = async () => {
    if (!pgNotaDialog || pgLoading) return;
    const valor = Number(pgValor);
    if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    if (valor > pgNotaDialog.saldo + 0.01) { toast({ title: `Valor máximo: R$ ${pgNotaDialog.saldo.toFixed(2)}`, variant: "destructive" }); return; }
    setPgLoading(true);
    try {
      const { data: pg, error: pgErr } = await supabase.from("pagamentos")
        .insert({ cliente_id: pgNotaDialog.clienteId, motorista_id: motoristaId, valor, data_pagamento: pgData, observacao: pgObs.trim() || null, created_by: user?.id } as any)
        .select().single();
      if (pgErr) throw pgErr;
      await supabase.from("pagamento_alocacoes").insert({ pagamento_id: pg.id, financeiro_id: pgNotaDialog.id, valor_alocado: valor });
      const { data: rec } = await supabase.from("financeiro_receber").select("*").eq("id", pgNotaDialog.id).single();
      if (rec) {
        const novoPago = Number(rec.valor_pago) + valor;
        const novoStatus = novoPago >= Number(rec.valor_total) - 0.005 ? "pago" : "parcial";
        await supabase.from("financeiro_receber").update({ valor_pago: novoPago, status: novoStatus }).eq("id", pgNotaDialog.id);
        if (novoStatus === "pago") {
          await supabase.from("pedidos_saida").update({ archived: true } as any).eq("id", rec.pedido_saida_id);
        }
      }
      toast({ title: `Pagamento de R$ ${valor.toFixed(2)} registrado na nota!` });
      setPgNotaDialog(null); setPgValor(""); setPgObs("");
      qc.invalidateQueries({ queryKey: ["motorista-financeiro"] });
      qc.invalidateQueries({ queryKey: ["pagamentos"] });
      qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setPgLoading(false);
    }
  };

  const adicionarManual = async () => {
    const valor = Number(manualValor) || 0;
    const temCocho = manualCochoPreto > 0 || manualCochoVelling > 0 || manualCochoQuebrado > 0;
    if (!manualClienteId || (valor <= 0 && !temCocho)) {
      toast({ title: "Preencha cliente e valor (ou adicione cochos)", variant: "destructive" }); return;
    }
    let valorPago = 0;
    let status = "aberto";
    if (valor === 0) { status = "aberto"; }
    else if (manualTipo === "avista") { valorPago = valor; status = "pago"; }
    else if (manualTipo === "parcial") {
      valorPago = Number(manualValorPago) || 0;
      if (valorPago <= 0 || valorPago >= valor) { toast({ title: "Valor parcial deve ser entre 0 e o total", variant: "destructive" }); return; }
      status = "parcial";
    }
    let obsFinal = manualObs.trim() || "Conta manual";
    try {
      const { data: pedido, error: pedErr } = await supabase.from("pedidos_saida")
        .insert({ motorista_id: motoristaId, cliente_id: manualClienteId, data: manualData, tipo_pagamento: valor === 0 ? "aprazo" : manualTipo, observacao: obsFinal, archived: true, created_by: user?.id } as any)
        .select().single();
      if (pedErr) throw pedErr;

      await supabase.from("financeiro_receber").insert({
        pedido_saida_id: pedido.id, cliente_id: manualClienteId, motorista_id: motoristaId,
        data_venda: manualData, valor_total: valor, valor_pago: valorPago, tipo_pagamento: valor === 0 ? "aprazo" : manualTipo, status,
      });
      // Save cochos to dedicated table
      if (temCocho) {
        const existing = cochosData.find((c: any) => c.cliente_id === manualClienteId);
        const cur = existing ? { preto: existing.preto || 0, velling: existing.velling || 0, quebrado: existing.quebrado || 0 } : { preto: 0, velling: 0, quebrado: 0 };
        const merged = { preto: cur.preto + manualCochoPreto, velling: cur.velling + manualCochoVelling, quebrado: cur.quebrado + manualCochoQuebrado };
        if (existing) {
          await supabase.from("cochos_cliente").update({ ...merged, updated_at: new Date().toISOString() }).eq("cliente_id", manualClienteId);
        } else {
          await supabase.from("cochos_cliente").insert({ cliente_id: manualClienteId, ...merged } as any);
        }
      }
      toast({ title: "Conta a receber adicionada!" });
      setManualOpen(false);
      setManualClienteId(""); setManualValor(""); setManualValorPago(""); setManualObs(""); setManualTipo("aprazo");
      setManualCochoPreto(0); setManualCochoVelling(0); setManualCochoQuebrado(0);
      qc.invalidateQueries({ queryKey: ["motorista-financeiro"] });
      qc.invalidateQueries({ queryKey: ["cochos_cliente"] });
    } catch (e: any) {
      toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" });
    }
  };

  const lancarNota = async () => {
    const valor = Number(notaValor);
    if (valor <= 0) { toast({ title: "Informe o valor da nota", variant: "destructive" }); return; }

    const dataLanc = notaData;
    const vencimento = localDateStr(addDays(new Date(dataLanc + "T12:00:00"), 14));

    try {
      const { error } = await supabase.from("notas_motorista" as any).insert({
        motorista_id: motoristaId,
        valor,
        data_lancamento: dataLanc,
        data_vencimento: vencimento,
        observacao: notaObs.trim(),
        status: "pendente",
      } as any);
      if (error) throw error;
      toast({ title: `Nota lançada! Vencimento: ${vencimento.split("-").reverse().join("/")}` });
      setNotaOpen(false); setNotaValor(""); setNotaObs(""); setNotaData(localToday());
      qc.invalidateQueries({ queryKey: ["notas-motorista"] });
    } catch (e: any) {
      toast({ title: "Erro ao lançar nota", description: e.message, variant: "destructive" });
    }
  };

  const marcarNotaPaga = async (notaId: string) => {
    try {
      await supabase.from("notas_motorista" as any).update({ status: "pago" } as any).eq("id", notaId);
      toast({ title: "Nota marcada como paga!" });
      qc.invalidateQueries({ queryKey: ["notas-motorista"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const desfazerNotaPaga = async (notaId: string) => {
    try {
      await supabase.from("notas_motorista" as any).update({ status: "pendente" } as any).eq("id", notaId);
      toast({ title: "Nota revertida para pendente!" });
      qc.invalidateQueries({ queryKey: ["notas-motorista"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const apagarNota = async (notaId: string) => {
    try {
      await supabase.from("notas_motorista" as any).delete().eq("id", notaId);
      toast({ title: "Nota apagada com sucesso!" });
      qc.invalidateQueries({ queryKey: ["notas-motorista"] });
      setDeleteNotaId(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const buildClienteHtml = (c: typeof clienteSummary[0]) => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const recs = recebiveis
      .filter((r: any) => r.cliente_id === c.id && r.status !== "pago")
      .sort((a: any, b: any) => a.data_venda.localeCompare(b.data_venda));

    let rows = "";
    recs.forEach((r: any) => {
      const saldo = Number(r.valor_total) - Number(r.valor_pago);
      const dataVenda = r.data_venda?.split("-").reverse().join("/") || "";
      const diasAtraso = Math.max(0, Math.floor((Date.now() - new Date(r.data_venda).getTime()) / 86400000) - 15);
      const obs = r.observacao ? String(r.observacao).trim() : "";
      rows += `<tr>
        <td style="padding:1px 4px 1px 0;">${dataVenda}</td>
        <td style="text-align:right;padding:1px 4px;">${Number(r.valor_total).toFixed(2)}</td>
        <td style="text-align:right;padding:1px 4px;">${Number(r.valor_pago).toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold;padding:1px 4px;">${saldo.toFixed(2)}</td>
        <td style="text-align:center;padding:1px 0 1px 4px;">${diasAtraso > 0 ? diasAtraso : ""}</td>
        <td style="padding:1px 0 1px 4px;font-size:10px;max-width:30mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${obs}</td>
      </tr>`;
    });

    const creditoLine = c.credito > 0 ? `<div style="margin-top:2px;font-size:12px;color:#059669">Crédito: R$ ${c.credito.toFixed(2)}</div>` : "";

    const cochoTotal = cochoPerClient(c.id);
    const cochoLine = cochoHasValues(cochoTotal) ? `<div style="margin-top:6px;font-size:20px;font-weight:bold;">Cochos: ${formatCochoLine(cochoTotal)}</div>` : "";

    return `
      <div style="font-family:'Courier New',monospace;font-size:12px;padding:4mm 2mm 4mm 5mm;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;">
        <div style="font-weight:bold;font-size:15px;margin-bottom:2px;">JP Flores</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
          <span>Data: ${hoje}</span>
          <span>Motorista: ${motoristaNome}</span>
        </div>
        <div style="font-weight:bold;font-size:14px;margin:3px 0;border-bottom:1px solid #000;padding-bottom:2px;">${c.nome}</div>
        <div style="width:64mm;max-width:100%;">
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead>
              <tr style="border-bottom:1px solid #000;">
                <th style="text-align:left;padding:1px 4px 1px 0;">Data</th>
                <th style="text-align:right;padding:1px 4px;">Título</th>
                <th style="text-align:right;padding:1px 4px;">Vl.Pago</th>
                <th style="text-align:right;padding:1px 4px;">Devedor</th>
                <th style="text-align:center;padding:1px 0 1px 4px;">Dias</th>
                <th style="text-align:left;padding:1px 0 1px 4px;">Obs</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="border-top:1px dashed #000;margin-top:2px;padding-top:2px;display:flex;justify-content:space-between;font-weight:bold;font-size:12px;">
            <span>Total Devedor:</span>
            <span style="margin-left:8px;">R$ ${c.saldo.toFixed(2)}</span>
          </div>
          ${creditoLine}
          ${cochoLine}
        </div>
        <div style="margin-top:auto;padding-top:14px;padding-bottom:8mm;font-size:11px;display:flex;gap:10px;">
          <span>Data: ___/___/___</span>
          <span>Ass. _________________________</span>
        </div>
      </div>
    `;
  };

  const printSingleCobranca = (c: typeof clienteSummary[0]) => {
    const content = buildClienteHtml(c);
    const html = `<!DOCTYPE html><html><head><title>Cobrança - ${c.nome}</title>
    <style>
      @page { size: A4; margin: 3mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { width: 204mm; }
      .page { width: 204mm; height: 291mm; display: flex; flex-direction: column; }
      .top-half { height: 145.5mm; display: flex; border-bottom: 1px dashed #999; }
      .bottom-half { height: 145.5mm; }
      .via { width: 102mm; border-right: 1px dashed #999; overflow: visible; }
      .via:last-child { border-right: none; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
      <button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button>
    </div>
    <div class="page">
      <div class="top-half">
        <div class="via">${content}</div>
        <div class="via">${content}</div>
      </div>
      <div class="bottom-half"></div>
    </div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const printCobrancas = () => {
    const clientesComSaldo = clienteSummary.filter(c => c.saldo > 0 || c.credito > 0);
    if (clientesComSaldo.length === 0) { toast({ title: "Nenhum cliente com saldo", variant: "destructive" }); return; }

    let pagesHtml = "";
    for (let i = 0; i < clientesComSaldo.length; i += 2) {
      const c1 = clientesComSaldo[i];
      const c2 = clientesComSaldo[i + 1];
      const half1 = buildClienteHtml(c1);
      const half2 = c2 ? buildClienteHtml(c2) : "";
      pagesHtml += `
        <div class="page">
          <div class="top-half">
            <div class="via">${half1}</div>
            <div class="via">${half1}</div>
          </div>
          ${half2 ? `
          <div class="bottom-half">
            <div class="via">${half2}</div>
            <div class="via">${half2}</div>
          </div>` : `<div class="bottom-half"></div>`}
        </div>
      `;
    }

    const html = `<!DOCTYPE html><html><head><title>Cobrança - ${motoristaNome}</title>
    <style>
      @page { size: A4; margin: 3mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { width: 204mm; }
      .page { width: 204mm; height: 291mm; page-break-after: always; display: flex; flex-direction: column; }
      .top-half, .bottom-half { height: 145.5mm; display: flex; border-bottom: 1px dashed #999; }
      .via { width: 102mm; border-right: 1px dashed #999; overflow: visible; }
      .via:last-child { border-right: none; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
      <button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button>
    </div>
    ${pagesHtml}
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const printRelatorioCompleto = () => {
    const clientesComSaldo = clienteSummary.filter(c => c.saldo > 0 || c.credito > 0);
    if (clientesComSaldo.length === 0) { toast({ title: "Nenhum cliente com saldo", variant: "destructive" }); return; }

    const hoje = new Date().toLocaleDateString("pt-BR");
    let totalGeralDevedor = 0;
    let blocosHtml = "";

    clientesComSaldo.forEach((c) => {
      const recs = recebiveis
        .filter((r: any) => r.cliente_id === c.id && r.status !== "pago")
        .sort((a: any, b: any) => a.data_venda.localeCompare(b.data_venda));

      let rows = "";
      recs.forEach((r: any) => {
        const saldo = Number(r.valor_total) - Number(r.valor_pago);
        const dataVenda = r.data_venda?.split("-").reverse().join("/") || "";
        const diasAtraso = Math.max(0, Math.floor((Date.now() - new Date(r.data_venda).getTime()) / 86400000) - 15);
        const obs = r.observacao ? String(r.observacao).trim() : "";
        rows += `<tr>
          <td style="padding:2px 6px 2px 0;">${dataVenda}</td>
          <td style="text-align:right;padding:2px 6px;">${Number(r.valor_total).toFixed(2)}</td>
          <td style="text-align:right;padding:2px 6px;">${Number(r.valor_pago).toFixed(2)}</td>
          <td style="text-align:right;font-weight:bold;padding:2px 6px;">${saldo.toFixed(2)}</td>
          <td style="text-align:center;padding:2px 6px;">${diasAtraso > 0 ? diasAtraso : ""}</td>
          <td style="padding:2px 0 2px 6px;font-size:10px;max-width:40mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${obs}</td>
        </tr>`;
      });

      const cochoTotal = cochoPerClient(c.id);
      const cochoLine = cochoHasValues(cochoTotal) ? `<span style="margin-left:12px;font-size:10px;">Cochos: ${formatCochoLine(cochoTotal)}</span>` : "";
      const creditoLine = c.credito > 0 ? `<span style="margin-left:12px;color:#059669;font-size:10px;">Crédito: R$ ${c.credito.toFixed(2)}</span>` : "";

      totalGeralDevedor += c.saldo;

      blocosHtml += `
        <div style="margin-bottom:8px;">
          <div style="font-weight:bold;font-size:13px;border-bottom:1px solid #333;padding-bottom:1px;margin-bottom:2px;">${c.nome}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead>
              <tr style="border-bottom:1px solid #999;">
                <th style="text-align:left;padding:1px 6px 1px 0;">Data</th>
                <th style="text-align:right;padding:1px 6px;">Título</th>
                <th style="text-align:right;padding:1px 6px;">Vl.Pago</th>
                <th style="text-align:right;padding:1px 6px;">Devedor</th>
                <th style="text-align:center;padding:1px 6px;">Dias</th>
                <th style="text-align:left;padding:1px 0 1px 6px;">Obs</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="text-align:right;font-weight:bold;font-size:12px;border-top:1px dashed #999;padding-top:1px;margin-top:1px;">
            Total: R$ ${c.saldo.toFixed(2)}${creditoLine}${cochoLine}
          </div>
        </div>
      `;
    });

    const html = `<!DOCTYPE html><html><head><title>Relatório - ${motoristaNome}</title>
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
          <div style="font-weight:bold;font-size:16px;">JP Flores — Relatório de Cobranças</div>
          <div style="font-size:12px;">Motorista: ${motoristaNome} | Data: ${hoje}</div>
        </div>
        <div style="font-weight:bold;font-size:15px;">Total: R$ ${totalGeralDevedor.toFixed(2)}</div>
      </div>
      ${blocosHtml}
      <div style="border-top:2px solid #000;padding-top:4px;margin-top:8px;display:flex;justify-content:flex-end;font-weight:bold;font-size:14px;">
        Total Geral Devedor: R$ ${totalGeralDevedor.toFixed(2)}
      </div>
    </div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // Table shows ALL recebiveis (not period-filtered), follows card client filter
  const filtered = recebiveis
    .filter((r: any) => !filterCardCliente || (r.clientes?.nome || "").toLowerCase().includes(filterCardCliente.toLowerCase()))
    .filter((r: any) => showPagos || r.status !== "pago");

  const notaVencimento = notaData ? localDateStr(addDays(new Date(notaData + "T12:00:00"), 14)) : "";

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">Financeiro — {motoristaNome}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {clienteSummary.filter(c => c.saldo > 0 || c.credito > 0).length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={printCobrancas}>
                <Printer className="h-4 w-4 mr-1" />Cobranças
              </Button>
              <Button size="sm" variant="outline" onClick={printRelatorioCompleto}>
                <FileText className="h-4 w-4 mr-1" />Relatório
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setContasPagarOpen(true)}>
            <CreditCard className="h-4 w-4 mr-1" />Contas a Pagar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFechamentoOpen(true)}>
            <TrendingUp className="h-4 w-4 mr-1" />Fechamento
          </Button>
          <Button size="sm" variant="outline" onClick={() => setUndoOpen(true)}>
            <Undo2 className="h-4 w-4 mr-1" />Desfazer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManualHistOpen(true)}>
            <History className="h-4 w-4 mr-1" />Hist. Manual
          </Button>
          <Button size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Conta Manual
          </Button>
        </div>
      </div>
      <ManualHistoryDialog open={manualHistOpen} onOpenChange={setManualHistOpen} motoristaId={motoristaId} />


      {/* Date range filter */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">De:</Label>
          <DatePicker value={dateFrom} onChange={setDateFrom} className="w-[130px] h-8 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Até:</Label>
          <DatePicker value={dateTo} onChange={setDateTo} className="w-[130px] h-8 text-xs" />
        </div>
      </div>

      {/* Summary card - clickable to open details dialog */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowResumoDialog(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowResumoDialog(true); }}
        className="rounded-lg border bg-card px-5 py-3 cursor-pointer hover:bg-accent/30 transition-colors mb-4"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total na rua</p>
            <p className="text-xl font-bold text-destructive">R$ {totalNaRua.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Vendido (período)</p>
            <p className="text-xl font-bold">R$ {totalVendidoPeriodo.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Cobrado (período)</p>
            <p className="text-xl font-bold text-emerald-600">R$ {totalCobradoPeriodo.toFixed(2)}</p>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">Ver detalhes →</span>
        </div>
      </div>

      {/* Client cards - always visible */}
      {clienteSummary.filter(c => c.saldo > 0 || c.credito > 0).length > 0 && (
        <>
          <div className="relative w-full max-w-xs mb-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filterCardCliente} onChange={e => setFilterCardCliente(e.target.value)} placeholder="Filtrar cliente..." className="h-9 pl-8 text-sm" />
            {filterCardCliente && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setFilterCardCliente("")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {clienteSummary
              .filter(c => c.saldo > 0 || c.credito > 0)
              .filter(c => !filterCardCliente || c.nome.toLowerCase().includes(filterCardCliente.toLowerCase()))
              .map(c => {
                const cocho = cochoPerClient(c.id);
                const hasCocho = cochoHasValues(cocho);
                return (
                  <ClienteCardTerceirizado key={c.id} c={c} cocho={cocho} hasCocho={hasCocho} salvarCochos={salvarCochos} setPgDialog={setPgDialog} printSingleCobranca={printSingleCobranca} />
                );
              })}
          </div>
        </>
      )}

      {/* Table - follows card client filter */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Checkbox id="show-pagos-mot" checked={showPagos} onCheckedChange={(v) => { setShowPagos(!!v); if (!v) timeWindow.reset(); }} />
        <Label htmlFor="show-pagos-mot" className="text-sm cursor-pointer">Mostrar pagos</Label>
        <TimeWindowControl
          label={timeWindow.label}
          nextLabel={timeWindow.nextLabel}
          canExpand={timeWindow.canExpand}
          onExpand={timeWindow.expand}
          showHint={showPagos}
        />
      </div>

      {isLoading ? <p>Carregando...</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r: any) => {
              const saldo = Number(r.valor_total) - Number(r.valor_pago);
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.data_venda?.split("-").reverse().join("/")}</TableCell>
                  <TableCell className="text-xs">{r.clientes?.nome}</TableCell>
                  <TableCell className="text-xs">R$ {Number(r.valor_total).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">R$ {Number(r.valor_pago).toFixed(2)}</TableCell>
                  <TableCell className={`text-xs ${saldo > 0 ? "text-destructive font-semibold" : ""}`}>R$ {saldo.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${
                      r.status === "pago" ? "bg-emerald-600 text-white" :
                      r.status === "parcial" ? "bg-amber-500 text-white" :
                      "bg-red-500 text-white"
                    }`}>
                      {r.status === "pago" ? "Pago" : r.status === "parcial" ? "Parcial" : "Aberto"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.status !== "pago" && (
                      <Button variant="ghost" size="icon" title="Pagar esta nota" onClick={() => {
                        const s = Number(r.valor_total) - Number(r.valor_pago);
                        setPgNotaDialog({ id: r.id, clienteId: r.cliente_id, clienteNome: r.clientes?.nome || "", saldo: s });
                        setPgValor(s.toFixed(2));
                        setPgData(getTuesdayOfWeek());
                        setPgObs("");
                      }}>
                        <DollarSign className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Pagamento Dialog */}
      <Dialog open={!!pgDialog} onOpenChange={v => { if (!v) { setPgDialog(null); setUsarCredito(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento — {pgDialog?.clienteNome}</DialogTitle>
          </DialogHeader>
          {(() => {
            const credito = pgDialog ? (creditoMap.get(pgDialog.clienteId) || 0) : 0;
            const valor = Number(pgValor) || 0;
            const valorCredito = usarCredito ? Math.min(credito, valor) : 0;
            const valorDinheiro = valor - valorCredito;
            return (
              <div className="space-y-4">
                <div>
                  <Label>Valor Total (R$)</Label>
                  <Input type="number" value={pgValor} onChange={e => setPgValor(e.target.value)} placeholder="0.00" min={0} step={0.01} />
                </div>
                {credito > 0 && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox id="usar-credito-mot" checked={usarCredito} onCheckedChange={(v) => setUsarCredito(!!v)} />
                      <Label htmlFor="usar-credito-mot" className="text-sm font-medium cursor-pointer">
                        Utilizar crédito: <span className="text-emerald-700 font-bold">R$ {credito.toFixed(2)}</span>
                      </Label>
                    </div>
                    {usarCredito && valor > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1 pl-6">
                        <div>💰 Dinheiro: <span className="font-semibold">R$ {valorDinheiro.toFixed(2)}</span></div>
                        <div>🏷️ Crédito: <span className="font-semibold text-emerald-700">R$ {valorCredito.toFixed(2)}</span></div>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label>Data</Label>
                  <DatePicker value={pgData} onChange={setPgData} />
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input value={pgObs} onChange={e => setPgObs(e.target.value)} placeholder="Opcional" />
                </div>
                <Button className="w-full" onClick={registrarPagamento} disabled={pgLoading}>
                  <DollarSign className="mr-2 h-4 w-4" />{pgLoading ? "Processando..." : "Confirmar Pagamento"}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Nota-specific payment dialog */}
      <Dialog open={!!pgNotaDialog} onOpenChange={v => { if (!v) setPgNotaDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar Nota — {pgNotaDialog?.clienteNome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">Saldo desta nota: <span className="font-bold text-foreground">R$ {pgNotaDialog?.saldo.toFixed(2)}</span></div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={pgValor} onChange={e => {
                const v = Number(e.target.value);
                if (v > (pgNotaDialog?.saldo || 0)) setPgValor((pgNotaDialog?.saldo || 0).toFixed(2));
                else setPgValor(e.target.value);
              }} placeholder="0.00" min={0} max={pgNotaDialog?.saldo} step={0.01} />
            </div>
            <div>
              <Label>Data</Label>
              <DatePicker value={pgData} onChange={setPgData} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={pgObs} onChange={e => setPgObs(e.target.value)} placeholder="Opcional" />
            </div>
            <Button className="w-full" onClick={registrarPagamentoNota} disabled={pgLoading}>
              <DollarSign className="mr-2 h-4 w-4" />{pgLoading ? "Processando..." : "Confirmar Pagamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conta Manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <SearchableSelect
                options={clientes.map((c: any) => ({ value: c.id, label: c.nome }))}
                value={manualClienteId}
                onValueChange={setManualClienteId}
                placeholder="Selecionar cliente"
              />
            </div>
            <div>
              <Label>Data</Label>
              <DatePicker value={manualData} onChange={setManualData} />
            </div>
            <div>
              <Label>Valor Total (R$)</Label>
              <Input type="number" value={manualValor} onChange={e => setManualValor(e.target.value)} placeholder="0.00" min={0} step={0.01} />
            </div>
            <div>
              <Label>Tipo de Pagamento</Label>
              <Select value={manualTipo} onValueChange={setManualTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aprazo">A prazo</SelectItem>
                  <SelectItem value="avista">À vista</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {manualTipo === "parcial" && (
              <div>
                <Label>Valor Pago (R$)</Label>
                <Input type="number" value={manualValorPago} onChange={e => setManualValorPago(e.target.value)} placeholder="0.00" min={0} step={0.01} />
              </div>
            )}
            <div>
              <Label>Observação</Label>
              <Input value={manualObs} onChange={e => setManualObs(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="border rounded-md p-3 space-y-2">
              <Label className="flex items-center gap-1"><Box className="h-4 w-4" /> Cochos</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Preto</Label>
                  <Input type="number" min={0} value={manualCochoPreto} onChange={e => setManualCochoPreto(Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div>
                  <Label className="text-xs">Velling</Label>
                  <Input type="number" min={0} value={manualCochoVelling} onChange={e => setManualCochoVelling(Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div>
                  <Label className="text-xs">Quebrado</Label>
                  <Input type="number" min={0} value={manualCochoQuebrado} onChange={e => setManualCochoQuebrado(Math.max(0, Number(e.target.value) || 0))} />
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={adicionarManual}>
              <Plus className="mr-2 h-4 w-4" />Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nota Dialog */}
      <Dialog open={notaOpen} onOpenChange={setNotaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lançar Nota</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor da Nota (R$)</Label>
              <Input type="number" value={notaValor} onChange={e => setNotaValor(e.target.value)} placeholder="0.00" min={0} step={0.01} />
            </div>
            <div>
              <Label>Data do Lançamento</Label>
              <DatePicker value={notaData} onChange={setNotaData} />
            </div>
            {notaVencimento && (
              <div className="rounded-md border bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">Vencimento (14 dias):</p>
                <p className="text-lg font-bold">{notaVencimento.split("-").reverse().join("/")}</p>
              </div>
            )}
            <div>
              <Label>Observação</Label>
              <Input value={notaObs} onChange={e => setNotaObs(e.target.value)} placeholder="Opcional" />
            </div>
            <Button className="w-full" onClick={lancarNota}>
              <FileText className="mr-2 h-4 w-4" />Lançar Nota
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Contas a Pagar Dialog */}
      <Dialog open={contasPagarOpen} onOpenChange={setContasPagarOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />Contas a Pagar — {motoristaNome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setNotaOpen(true)}>
                <FileText className="h-4 w-4 mr-1" />Lançar Nota
              </Button>
            </div>

            {/* Notas pendentes */}
            {(() => {
              const pendentes = notas.filter((n: any) => n.status !== "pago");
              const pagas = notas.filter((n: any) => n.status === "pago");
              return (
                <>
                  {pendentes.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Pendentes</h3>
                      {pendentes.map((n: any) => {
                        const vencida = n.data_vencimento < localToday();
                        const diasParaVencer = Math.ceil((new Date(n.data_vencimento + "T12:00:00").getTime() - Date.now()) / 86400000);
                        return (
                          <div key={n.id} className={`rounded-lg border p-3 flex items-center justify-between gap-2 ${vencida ? "border-destructive bg-destructive/5" : "bg-card"}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm">R$ {Number(n.valor).toFixed(2)}</span>
                                <Badge className={`text-[10px] ${vencida ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                                  {vencida ? "Vencida" : "Pendente"}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Lançada: {n.data_lancamento?.split("-").reverse().join("/")} · Vencimento: {n.data_vencimento?.split("-").reverse().join("/")}
                                {!vencida && <span className="ml-1 text-amber-600">({diasParaVencer} dias)</span>}
                                {vencida && <span className="ml-1 text-destructive font-semibold">(vencida há {Math.abs(diasParaVencer)} dias)</span>}
                              </div>
                              {n.observacao && <p className="text-xs text-muted-foreground truncate">{n.observacao}</p>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => marcarNotaPaga(n.id)}>
                                Pagar
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteNotaId(n.id)} title="Apagar nota">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">Nenhuma nota pendente</p>
                  )}

                  {/* Histórico de pagas */}
                  {pagas.length > 0 && (
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-between text-sm font-semibold"
                        onClick={() => setShowNotasPagas(!showNotasPagas)}
                      >
                        <span className="flex items-center gap-1">
                          <Undo2 className="h-4 w-4" />Histórico de Pagamentos ({pagas.length})
                        </span>
                        <span className="text-xs text-muted-foreground">{showNotasPagas ? "Ocultar" : "Mostrar"}</span>
                      </Button>
                      {showNotasPagas && (
                        <div className="space-y-2">
                          {pagas.map((n: any) => (
                            <div key={n.id} className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm">R$ {Number(n.valor).toFixed(2)}</span>
                                  <Badge className="text-[10px] bg-emerald-600 text-white">Pago</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Lançada: {n.data_lancamento?.split("-").reverse().join("/")} · Vencimento: {n.data_vencimento?.split("-").reverse().join("/")}
                                </div>
                                {n.observacao && <p className="text-xs text-muted-foreground truncate">{n.observacao}</p>}
                              </div>
                              <Button size="sm" variant="destructive" className="text-xs shrink-0" onClick={() => desfazerNotaPaga(n.id)}>
                                <Undo2 className="h-3.5 w-3.5 mr-1" />Desfazer
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteNotaId} onOpenChange={(open) => !open && setDeleteNotaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar nota?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. A nota será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteNotaId && apagarNota(deleteNotaId)}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UndoPaymentDialog open={undoOpen} onOpenChange={setUndoOpen} motoristaId={motoristaId} dateFrom={dateFrom} dateTo={dateTo} />
      <FechamentoSemanal open={fechamentoOpen} onOpenChange={setFechamentoOpen} motoristaId={motoristaId} motoristaNome={motoristaNome} />

      {/* Resumo detalhes dialog */}
      <Dialog open={showResumoDialog} onOpenChange={setShowResumoDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📊 {motoristaNome} — {dateFrom.split("-").reverse().join("/")} até {dateTo.split("-").reverse().join("/")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Vendas no período */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full rounded-md border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors group">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  <h3 className="font-semibold text-sm">🛒 Vendas no período</h3>
                </div>
                <span className="font-bold text-sm">R$ {resumoDetalhes.totalVendido.toFixed(2)}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {resumoDetalhes.vendasPeriodo.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3">Nenhuma venda no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs py-1">Data</TableHead>
                      <TableHead className="text-xs py-1">Cliente</TableHead>
                      <TableHead className="text-xs py-1">Nº Pedido</TableHead>
                      <TableHead className="text-xs py-1">Tipo</TableHead>
                      <TableHead className="text-xs py-1">Status</TableHead>
                      <TableHead className="text-xs py-1 text-right">Valor</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {resumoDetalhes.vendasPeriodo.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="text-xs py-1">{i.data.split("-").reverse().join("/")}</TableCell>
                          <TableCell className="text-xs py-1">{i.cliente}</TableCell>
                          <TableCell className="text-xs py-1">{i.orcamento}</TableCell>
                          <TableCell className="text-xs py-1">
                            <Badge variant="outline" className="text-[10px]">
                              {i.tipo === "avista" ? "À vista" : i.tipo === "parcial" ? "Parcial" : "A prazo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1">
                            <Badge className={
                              i.status === "pago" ? "bg-emerald-600 text-white text-[10px]" :
                              i.status === "parcial" ? "bg-amber-500 text-white text-[10px]" :
                              "bg-red-500 text-white text-[10px]"
                            }>
                              {i.status === "pago" ? "Pago" : i.status === "parcial" ? "Parcial" : "Aberto"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1 text-right font-semibold">R$ {i.valor.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Notas pagas à vista */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full rounded-md border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors group">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  <h3 className="font-semibold text-sm">💰 Notas pagas à vista</h3>
                </div>
                <span className="font-bold text-sm">R$ {resumoDetalhes.totalNotaPaga.toFixed(2)}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {resumoDetalhes.notasPagas.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3">Nenhuma nota paga à vista no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs py-1">Data</TableHead>
                      <TableHead className="text-xs py-1">Cliente</TableHead>
                      <TableHead className="text-xs py-1">Nº Pedido</TableHead>
                      <TableHead className="text-xs py-1 text-right">Valor</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {resumoDetalhes.notasPagas.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="text-xs py-1">{i.data.split("-").reverse().join("/")}</TableCell>
                          <TableCell className="text-xs py-1">{i.cliente}</TableCell>
                          <TableCell className="text-xs py-1">{i.orcamento}</TableCell>
                          <TableCell className="text-xs py-1 text-right font-semibold">
                            R$ {i.valor.toFixed(2)}
                            {i.tipo === "parcial" && <Badge className="ml-1 bg-blue-500 text-white text-[9px]">Parcial</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Vendas a prazo cobradas */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full rounded-md border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors group">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  <h3 className="font-semibold text-sm">📋 Vendas a prazo cobradas</h3>
                </div>
                <span className="font-bold text-sm text-emerald-600">R$ {resumoDetalhes.totalBaixado.toFixed(2)}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {resumoDetalhes.baixasSaldo.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3">Nenhuma venda a prazo cobrada no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs py-1">Data</TableHead>
                      <TableHead className="text-xs py-1">Cliente</TableHead>
                      <TableHead className="text-xs py-1">Nº Pedido</TableHead>
                      <TableHead className="text-xs py-1">Status</TableHead>
                      <TableHead className="text-xs py-1 text-right">Valor Cobrado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {resumoDetalhes.baixasSaldo.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="text-xs py-1">{i.data.split("-").reverse().join("/")}</TableCell>
                          <TableCell className="text-xs py-1">{i.cliente}</TableCell>
                          <TableCell className="text-xs py-1">{i.orcamento}</TableCell>
                          <TableCell className="text-xs py-1">
                            <Badge className={i.status === "pago" ? "bg-emerald-600 text-white text-[10px]" : "bg-amber-500 text-white text-[10px]"}>
                              {i.status === "pago" ? "Pago" : "Parcial"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1 text-right font-semibold text-emerald-600">R$ {i.valor.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CollapsibleContent>
            </Collapsible>

            <div className="border-t pt-3 flex justify-between font-bold">
              <span>Total cobrado no período</span>
              <span className="text-emerald-600">R$ {(resumoDetalhes.totalNotaPaga + resumoDetalhes.totalBaixado).toFixed(2)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
