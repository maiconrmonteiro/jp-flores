import { useState } from "react";
import { localToday, localDateStr, getTuesdayOfWeek } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Search, X, DollarSign, Printer, Truck, Plus, ChevronDown, Undo2, Box, Minus, FileText, History } from "lucide-react";
import ManualHistoryDialog from "@/components/ManualHistoryDialog";
import { parseCochoFromObs, stripCochoFromObs, upsertCochoInObs, cochoHasValues, formatCochoLine, CochoData } from "@/components/CochoButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { printSaida80mm, printSaidaA4 } from "@/lib/print";
import UndoPaymentDialog from "@/components/UndoPaymentDialog";
import { fetchAll } from "@/lib/fetch-all";
import { useTimeWindow } from "@/hooks/use-time-window";
import { TimeWindowControl } from "@/components/TimeWindowControl";


function ClienteCardWithCocho({ c, cochoPerClient, salvarCochos, setPgDialog, printCobrancaUnica }: {
  c: { id: string; nome: string; saldo: number; credito: number; abertos: number; motoristaId?: string };
  cochoPerClient: (id: string) => CochoData;
  salvarCochos: (id: string, cocho: CochoData) => Promise<void>;
  setPgDialog: (v: { clienteId: string; clienteNome: string; motoristaId: string }) => void;
  printCobrancaUnica: (c: any) => void;
}) {
  const cocho = cochoPerClient(c.id);
  const hasCocho = cochoHasValues(cocho);
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

  const adj = (setter: (v: number) => void, cur: number, delta: number) => setter(Math.max(0, cur + delta));

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
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setPgDialog({ clienteId: c.id, clienteNome: c.nome, motoristaId: c.motoristaId || "" })}>
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
                ].map(({ label, value, set }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-xs">{label}</span>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => adj(set, value, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={value || ""}
                        onChange={e => set(Math.max(0, Number(e.target.value) || 0))}
                        className="h-7 w-14 text-xs text-center"
                      />
                      <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => adj(set, value, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => { setPreto(0); setVelling(0); setQuebrado(0); }}>Zerar</Button>
                  <Button size="sm" className="flex-1 text-xs" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => printCobrancaUnica(c)} title="Imprimir cobrança">
          <Printer className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Financeiro() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [filterCliente, setFilterCliente] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const timeWindow = useTimeWindow("30d");
  const [pgDialog, setPgDialog] = useState<{ clienteId: string; clienteNome: string; motoristaId: string } | null>(null);
  const [pgNotaDialog, setPgNotaDialog] = useState<{ id: string; clienteId: string; clienteNome: string; saldo: number; motoristaId: string } | null>(null);
  const [pgValor, setPgValor] = useState("");
  const [pgData, setPgData] = useState(getTuesdayOfWeek());
  const [pgObs, setPgObs] = useState("");
  const [pgLoading, setPgLoading] = useState(false);
  const [printTarget, setPrintTarget] = useState<any>(null);
  const [selectedMotorista, setSelectedMotorista] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHistOpen, setManualHistOpen] = useState(false);
  const [manualClienteId, setManualClienteId] = useState("");
  const [manualMotoristaId, setManualMotoristaId] = useState("");
  const [manualData, setManualData] = useState(localToday());
  const [manualValor, setManualValor] = useState("");
  const [manualTipo, setManualTipo] = useState("aprazo");
  const [manualValorPago, setManualValorPago] = useState("");
  const [manualObs, setManualObs] = useState("");
  const [manualSomarVendido, setManualSomarVendido] = useState("somar");
  const [manualCochoPreto, setManualCochoPreto] = useState(0);
  const [manualCochoVelling, setManualCochoVelling] = useState(0);
  const [manualCochoQuebrado, setManualCochoQuebrado] = useState(0);
  const [usarCredito, setUsarCredito] = useState(false);
  const [transferCreditoDialog, setTransferCreditoDialog] = useState<{
    clienteId: string;
    clienteNome: string;
    motoristaOrigemId: string;
    motoristaOrigemNome: string;
    motoristaDestinoId: string;
    motoristaDestinoNome: string;
    valorMaximo: number;
  } | null>(null);
  const [transferValor, setTransferValor] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [filterCardCliente, setFilterCardCliente] = useState("");
  const [vendidoDe, setVendidoDe] = useState(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return localDateStr(d); });
  const [vendidoAte, setVendidoAte] = useState(() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return localDateStr(d); });
  const [resumoMotoristaId, setResumoMotoristaId] = useState<string | null>(null);
  const [filterDataAte, setFilterDataAte] = useState("");
  const [undoOpen, setUndoOpen] = useState(false);

  // Fetch all financeiro_receber within time window (for vendas/baixas do período)
  const { data: recebiveisJanela = [], isLoading } = useQuery({
    queryKey: ["financeiro_receber", timeWindow.since],
    queryFn: async () => {
      return await fetchAll<any>(
        "financeiro_receber",
        "*, clientes(nome), motoristas(nome), pedidos_saida(orcamento_num, observacao, itens_saida(*, produtos(descricao, unidade)))",
        "data_venda",
        true,
        timeWindow.since ? { gte: { column: "data_venda", value: timeWindow.since } } : undefined
      );
    },
  });

  // Buscar TODOS os recebíveis em aberto (não-pagos), independente da janela.
  // Necessário para que o saldo do cliente considere notas antigas em aberto.
  const { data: recebiveisAbertosAll = [] } = useQuery({
    queryKey: ["financeiro_receber_abertos"],
    queryFn: async () => {
      const all: any[] = [];
      const BATCH = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("financeiro_receber")
          .select("*, clientes(nome), motoristas(nome), pedidos_saida(orcamento_num, observacao, itens_saida(*, produtos(descricao, unidade)))")
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
  });

  // Mescla janela + abertos antigos. Resto do código continua usando `recebiveis`.
  const recebiveis = (() => {
    const map = new Map<string, any>();
    recebiveisJanela.forEach((r: any) => map.set(r.id, r));
    recebiveisAbertosAll.forEach((r: any) => { if (!map.has(r.id)) map.set(r.id, r); });
    return Array.from(map.values());
  })();

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => { const { data } = await supabase.from("motoristas").select("*").order("nome"); return data || []; },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => { const { data } = await supabase.from("clientes").select("*").order("nome"); return data || []; },
  });

  // Fetch pagamentos + alocacoes to calculate credit (paginated)
  const { data: pagamentos = [] } = useQuery({
    queryKey: ["pagamentos"],
    queryFn: async () => await fetchAll<any>("pagamentos", "*", "data_pagamento", true),
  });
  const { data: alocacoes = [] } = useQuery({
    queryKey: ["pagamento_alocacoes"],
    queryFn: async () => await fetchAll<any>("pagamento_alocacoes", "*", "id", true),
  });

  // Calculate credit per client+motorista: total paid - total allocated
  const creditoMap = (() => {
    // key = "clienteId|motoristaId"
    const pgMap = new Map<string, number>();
    pagamentos.forEach((p: any) => {
      const key = `${p.cliente_id}|${p.motorista_id || ""}`;
      pgMap.set(key, (pgMap.get(key) || 0) + Number(p.valor));
    });
    const alocMap = new Map<string, number>();
    alocacoes.forEach((a: any) => {
      const pg = pagamentos.find((p: any) => p.id === a.pagamento_id);
      if (pg) {
        const key = `${pg.cliente_id}|${pg.motorista_id || ""}`;
        alocMap.set(key, (alocMap.get(key) || 0) + Number(a.valor_alocado));
      }
    });
    const result = new Map<string, number>();
    pgMap.forEach((total, key) => {
      const alocado = alocMap.get(key) || 0;
      const credito = total - alocado;
      if (credito > 0.01) result.set(key, credito);
    });
    return result;
  })();

  // Créditos do cliente em OUTROS motoristas (para oferecer transferência manual)
  // Retorna lista [{ motoristaId, motoristaNome, valor }] de créditos com motoristas != motoristaAtual
  const getCreditosOutrosMotoristas = (clienteId: string, motoristaAtualId: string) => {
    const result: { motoristaId: string; motoristaNome: string; valor: number }[] = [];
    creditoMap.forEach((valor, key) => {
      const [cId, mId] = key.split("|");
      if (cId === clienteId && mId !== motoristaAtualId && valor > 0.01) {
        const m = motoristas.find((mm: any) => mm.id === mId);
        result.push({
          motoristaId: mId,
          motoristaNome: m?.nome || "(sem motorista)",
          valor,
        });
      }
    });
    return result.sort((a, b) => b.valor - a.valor);
  };

  // Group by cliente for summary
  const clienteSummary = (() => {
    const map = new Map<string, { nome: string; total: number; pago: number; abertos: number; credito: number; motoristaId: string }>();
    recebiveis
      .filter((r: any) => !selectedMotorista || r.motorista_id === selectedMotorista)
      .forEach((r: any) => {
        const cur = map.get(r.cliente_id) || { nome: r.clientes?.nome || "—", total: 0, pago: 0, abertos: 0, credito: 0, motoristaId: selectedMotorista };
        cur.total += Number(r.valor_total);
        cur.pago += Number(r.valor_pago);
        if (r.status !== "pago") cur.abertos++;
        const creditKey = `${r.cliente_id}|${selectedMotorista}`;
        cur.credito = creditoMap.get(creditKey) || 0;
        map.set(r.cliente_id, cur);
      });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v, saldo: Math.round((v.total - v.pago) * 100) / 100 })).sort((a, b) => b.saldo - a.saldo);
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

  // Build a map: financeiro_id -> motorista_id for linking pagamentos to motoristas
  const finMotoristaMap = new Map<string, string>();
  recebiveis.forEach((r: any) => finMotoristaMap.set(r.id, r.motorista_id));

  // Group by motorista
  const motoristaSummary = (() => {
    const map = new Map<string, { nome: string; totalNaRua: number; vendidoPeriodo: number; totalCobrado: number }>();

    recebiveis.forEach((r: any) => {
      const cur = map.get(r.motorista_id) || { nome: r.motoristas?.nome || "—", totalNaRua: 0, vendidoPeriodo: 0, totalCobrado: 0 };
      if (r.status !== "pago") cur.totalNaRua += Number(r.valor_total) - Number(r.valor_pago);
      const isNaoSomar = (r.pedidos_saida?.observacao || "").startsWith("[NV]");
      if (r.data_venda >= vendidoDe && r.data_venda <= vendidoAte) {
        if (!isNaoSomar) cur.vendidoPeriodo += Number(r.valor_total);
        // Notas à vista vendidas no período contam como cobradas
        if (r.tipo_pagamento === "avista") {
          cur.totalCobrado += Number(r.valor_total);
        }
        // Notas parciais: valor_pago (parte à vista) conta como cobrado
        if (r.tipo_pagamento === "parcial") {
          cur.totalCobrado += Number(r.valor_pago);
        }
      }
      map.set(r.motorista_id, cur);
    });

    // Cobrado a prazo: use pagamento date via alocacoes
    alocacoes.forEach((a: any) => {
      const pg = pagamentos.find((p: any) => p.id === a.pagamento_id);
      if (!pg) return;
      if (pg.data_pagamento < vendidoDe || pg.data_pagamento > vendidoAte) return;
      const finRec = recebiveis.find((r: any) => r.id === a.financeiro_id);
      if (finRec && finRec.tipo_pagamento === "avista") return; // já contado acima
      const motId = finMotoristaMap.get(a.financeiro_id);
      if (!motId) return;
      const cur = map.get(motId);
      if (cur) cur.totalCobrado += Number(a.valor_alocado);
    });

    // Crédito como cobrado: pagamentos a partir de 2026-04-20 cujo valor excede o total alocado
    // (sobra vira crédito do cliente). A sobra conta no Cobrado do motorista do pagamento.
    const CREDITO_INICIO = "2026-04-20";
    pagamentos.forEach((pg: any) => {
      if (!pg.data_pagamento) return;
      if (pg.data_pagamento < CREDITO_INICIO) return;
      if (pg.data_pagamento < vendidoDe || pg.data_pagamento > vendidoAte) return;
      const totalAlocado = alocacoes
        .filter((a: any) => a.pagamento_id === pg.id)
        .reduce((s: number, a: any) => s + Number(a.valor_alocado), 0);
      const sobra = Number(pg.valor) - totalAlocado;
      if (sobra <= 0.01) return;
      const motId = pg.motorista_id;
      if (!motId) return;
      const cur = map.get(motId);
      if (cur) cur.totalCobrado += sobra;
    });

    // Include non-terceirizado + virtual terceirizados (no user_id), exclude real terceirizados
    const terceirizadoIds = new Set(motoristas.filter((m: any) => m.terceirizado).map((m: any) => m.id));
    const realTerceirizadoIds = new Set(motoristas.filter((m: any) => m.terceirizado && m.user_id).map((m: any) => m.id));
    return Array.from(map.entries())
      .filter(([id]) => !realTerceirizadoIds.has(id))
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => {
        const aTerc = terceirizadoIds.has(a.id) ? 1 : 0;
        const bTerc = terceirizadoIds.has(b.id) ? 1 : 0;
        if (aTerc !== bTerc) return aTerc - bTerc;
        return b.totalNaRua - a.totalNaRua;
      });
  })();

  const resumoMotoristaDetalhes = (() => {
    if (!resumoMotoristaId) return null;

    // Recebiveis deste motorista no período (vendas)
    const recsPeriodo = recebiveis
      .filter((r: any) => r.motorista_id === resumoMotoristaId)
      .filter((r: any) => r.data_venda >= vendidoDe && r.data_venda <= vendidoAte)
      .filter((r: any) => !((r.pedidos_saida?.observacao || "").startsWith("[NV]")));

    const vendasPeriodo = recsPeriodo.map((r: any) => ({
      id: r.id,
      data: r.data_venda,
      cliente: r.clientes?.nome || "—",
      orcamento: r.pedidos_saida?.orcamento_num || "—",
      valor: Number(r.valor_total),
      tipo: r.tipo_pagamento,
      status: r.status,
    }));

    // Notas pagas à vista (vendidas no período)
    const notasPagas = recsPeriodo
      .filter((r: any) => r.tipo_pagamento === "avista")
      .map((r: any) => ({
        id: r.id,
        data: r.data_venda,
        cliente: r.clientes?.nome || "—",
        orcamento: r.pedidos_saida?.orcamento_num || "—",
        valor: Number(r.valor_total),
      }));

    // Cobranças a prazo: pagamentos feitos no período (baseado na data do pagamento)
    const recsMotorista = recebiveis.filter((r: any) => r.motorista_id === resumoMotoristaId);
    const recsMotoristaIds = new Set(recsMotorista.map((r: any) => r.id));
    const recMap = new Map(recsMotorista.map((r: any) => [r.id, r]));

    const baixasSaldo: any[] = [];
    alocacoes.forEach((a: any) => {
      if (!recsMotoristaIds.has(a.financeiro_id)) return;
      const pg = pagamentos.find((p: any) => p.id === a.pagamento_id);
      if (!pg) return;
      if (pg.data_pagamento < vendidoDe || pg.data_pagamento > vendidoAte) return;
      const rec = recMap.get(a.financeiro_id);
      if (!rec || rec.tipo_pagamento === "avista") return;
      baixasSaldo.push({
        id: a.id,
        data: pg.data_pagamento,
        cliente: rec.clientes?.nome || "—",
        orcamento: rec.pedidos_saida?.orcamento_num || "—",
        valor: Number(a.valor_alocado),
        status: rec.status,
      });
    });

    // Créditos como cobrança: pagamentos do motorista a partir de 2026-04-20 com sobra (não alocada)
    const CREDITO_INICIO = "2026-04-20";
    const creditosPeriodo: any[] = [];
    pagamentos
      .filter((pg: any) => pg.motorista_id === resumoMotoristaId)
      .filter((pg: any) => pg.data_pagamento >= CREDITO_INICIO)
      .filter((pg: any) => pg.data_pagamento >= vendidoDe && pg.data_pagamento <= vendidoAte)
      .forEach((pg: any) => {
        const totalAlocado = alocacoes
          .filter((a: any) => a.pagamento_id === pg.id)
          .reduce((s: number, a: any) => s + Number(a.valor_alocado), 0);
        const sobra = Number(pg.valor) - totalAlocado;
        if (sobra <= 0.01) return;
        const cli = clientes.find((c: any) => c.id === pg.cliente_id);
        creditosPeriodo.push({
          id: pg.id,
          data: pg.data_pagamento,
          cliente: cli?.nome || "—",
          observacao: pg.observacao || "",
          valor: sobra,
        });
      });

    const totalVendido = vendasPeriodo.reduce((s: number, i: any) => s + i.valor, 0);
    const totalNotaPaga = notasPagas.reduce((s: number, i: any) => s + i.valor, 0);
    const totalBaixado = baixasSaldo.reduce((s: number, i: any) => s + i.valor, 0);
    const totalCreditos = creditosPeriodo.reduce((s: number, i: any) => s + i.valor, 0);
    const motoristaNome = motoristas.find((m: any) => m.id === resumoMotoristaId)?.nome || "—";

    return { motoristaNome, vendasPeriodo, notasPagas, baixasSaldo, creditosPeriodo, totalVendido, totalNotaPaga, totalBaixado, totalCreditos };
  })();

  // Transfere crédito de um motorista para outro do mesmo cliente.
  // Cria 2 pagamentos espelho: 1 negativo no motorista origem (zera o crédito lá)
  // e 1 positivo no motorista destino (vira crédito disponível lá, contando no "Cobrado no Período").
  const executarTransferenciaCredito = async () => {
    if (!transferCreditoDialog || transferLoading) return;
    const valor = Number(transferValor);
    if (!valor || valor <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    if (valor > transferCreditoDialog.valorMaximo + 0.01) {
      toast({ title: `Valor máximo: R$ ${transferCreditoDialog.valorMaximo.toFixed(2)}`, variant: "destructive" });
      return;
    }
    setTransferLoading(true);
    try {
      const hoje = localToday();
      const obsBase = `Transferência de crédito: ${transferCreditoDialog.motoristaOrigemNome} → ${transferCreditoDialog.motoristaDestinoNome}`;

      // 1. Cria pagamento NEGATIVO no motorista de origem (consome o crédito de lá)
      // Para "queimar" o crédito antigo, criamos uma alocação fictícia: pagamento de -valor
      // OU melhor: criamos pagamento positivo no destino e alocação no destino,
      // e pra zerar o crédito do origem, criamos uma alocação a partir dos pagamentos antigos
      // do origem para um "pseudo-recebível" não — não temos isso.
      //
      // Solução mais simples e consistente: criar 2 pagamentos:
      //   (a) origem: valor negativo (estorno)  → reduz total_pago do origem em "valor"
      //   (b) destino: valor positivo            → aumenta total_pago do destino em "valor"
      // Isso preserva a contabilidade total do cliente (zero soma) e respeita a fórmula
      // crédito = total_pago - total_alocado, sem mexer em alocações antigas.

      const { error: e1 } = await supabase.from("pagamentos").insert({
        cliente_id: transferCreditoDialog.clienteId,
        motorista_id: transferCreditoDialog.motoristaOrigemId,
        valor: -valor,
        data_pagamento: hoje,
        observacao: `${obsBase} (estorno)`,
        created_by: user?.id,
      } as any);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("pagamentos").insert({
        cliente_id: transferCreditoDialog.clienteId,
        motorista_id: transferCreditoDialog.motoristaDestinoId,
        valor: valor,
        data_pagamento: hoje,
        observacao: `${obsBase} (recebido)`,
        created_by: user?.id,
      } as any);
      if (e2) throw e2;

      toast({
        title: `R$ ${valor.toFixed(2)} transferidos de ${transferCreditoDialog.motoristaOrigemNome} para ${transferCreditoDialog.motoristaDestinoNome}`,
      });

      setTransferCreditoDialog(null);
      setTransferValor("");
      qc.invalidateQueries({ queryKey: ["pagamentos"] });
      qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
    } catch (err: any) {
      toast({ title: "Erro na transferência", description: err.message, variant: "destructive" });
    } finally {
      setTransferLoading(false);
    }
  };

  const registrarPagamento = async () => {
    if (!pgDialog || pgLoading) return;
    const valor = Number(pgValor);
    if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    setPgLoading(true);

    const creditKey = `${pgDialog.clienteId}|${pgDialog.motoristaId}`;
    const creditoDisponivel = creditoMap.get(creditKey) || 0;
    const valorCredito = usarCredito ? Math.min(creditoDisponivel, valor) : 0;
    const valorDinheiro = valor - valorCredito;

    try {
      // Create pagamento with the full value (dinheiro + crédito)
      const obsText = [
        pgObs.trim(),
        valorCredito > 0 ? `(R$ ${valorDinheiro.toFixed(2)} dinheiro + R$ ${valorCredito.toFixed(2)} crédito)` : "",
      ].filter(Boolean).join(" ");

      const { data: pg, error: pgErr } = await supabase.from("pagamentos")
        .insert({ cliente_id: pgDialog.clienteId, motorista_id: pgDialog.motoristaId || null, valor: valorDinheiro, data_pagamento: pgData, observacao: obsText, created_by: user?.id } as any)
        .select().single();
      if (pgErr) throw pgErr;

      // FIFO: get open recebiveis for this client+motorista ordered by date
      let query = supabase.from("financeiro_receber")
        .select("*")
        .eq("cliente_id", pgDialog.clienteId)
        .neq("status", "pago")
        .order("data_venda", { ascending: true });
      if (pgDialog.motoristaId) query = query.eq("motorista_id", pgDialog.motoristaId);
      const { data: abertos } = await query;

      let restante = valor; // total to allocate (dinheiro + crédito consumed)
      const notasPagasAgora: { id: string; alocadoNovo: number }[] = []; // p/ rastrear quais notas receberam alocação nesta operação
      for (const rec of (abertos || [])) {
        if (restante <= 0) break;
        const saldo = Number(rec.valor_total) - Number(rec.valor_pago);
        if (saldo <= 0) continue;
        const alocar = Math.min(restante, saldo);

        await supabase.from("pagamento_alocacoes").insert({
          pagamento_id: pg.id,
          financeiro_id: rec.id,
          valor_alocado: alocar,
        });

        const novoPago = Number(rec.valor_pago) + alocar;
        const novoStatus = novoPago >= Number(rec.valor_total) - 0.005 ? "pago" : "parcial";
        await supabase.from("financeiro_receber").update({
          valor_pago: novoPago,
          status: novoStatus,
        }).eq("id", rec.id);

        // Archive pedido when fully paid
        if (novoStatus === "pago") {
          await supabase.from("pedidos_saida").update({ archived: true } as any).eq("id", rec.pedido_saida_id);
        }

        notasPagasAgora.push({ id: rec.id, alocadoNovo: alocar });
        restante -= alocar;
      }

      // CORREÇÃO BUG: Queima do crédito agora aloca proporcionalmente nas notas que foram pagas AGORA,
      // distribuindo o crédito antigo entre elas. Antes, o sistema fazia 1 alocação fictícia na primeira
      // nota, o que bagunçava o "Desfazer Pagamento".
      if (valorCredito > 0 && notasPagasAgora.length > 0) {
        // Busca pagamentos antigos do mesmo cliente+motorista com valor não alocado (FIFO por data)
        let creditQuery = supabase.from("pagamentos")
          .select("*, pagamento_alocacoes(valor_alocado)")
          .eq("cliente_id", pgDialog.clienteId)
          .neq("id", pg.id)
          .order("data_pagamento", { ascending: true });
        if (pgDialog.motoristaId) creditQuery = creditQuery.eq("motorista_id", pgDialog.motoristaId);
        else creditQuery = creditQuery.is("motorista_id", null);
        const { data: allPagamentos } = await creditQuery;

        // Distribui o crédito a queimar PROPORCIONALMENTE entre as notas pagas agora
        // (cada nota recebe uma "fatia" de cada pagamento antigo, proporcional ao quanto foi alocado nela)
        let creditoRestante = valorCredito;
        for (const oldPg of (allPagamentos || [])) {
          if (creditoRestante <= 0) break;
          const totalAlocado = (oldPg.pagamento_alocacoes || []).reduce((s: number, a: any) => s + Number(a.valor_alocado), 0);
          const livre = Math.max(0, Number(oldPg.valor) - totalAlocado);
          if (livre <= 0.005) continue;
          const usarDestePg = Math.min(creditoRestante, livre);

          // Distribui esse "usarDestePg" entre as notasPagasAgora proporcionalmente ao alocado novo de cada uma
          const totalAlocadoAgora = notasPagasAgora.reduce((s, n) => s + n.alocadoNovo, 0);
          if (totalAlocadoAgora <= 0) break;

          let distribuido = 0;
          for (let i = 0; i < notasPagasAgora.length; i++) {
            const nota = notasPagasAgora[i];
            const isUltima = i === notasPagasAgora.length - 1;
            // Última nota recebe o resto pra evitar erro de arredondamento
            const fatia = isUltima
              ? usarDestePg - distribuido
              : Math.round((usarDestePg * nota.alocadoNovo / totalAlocadoAgora) * 100) / 100;
            if (fatia <= 0.005) continue;
            await supabase.from("pagamento_alocacoes").insert({
              pagamento_id: oldPg.id,
              financeiro_id: nota.id,
              valor_alocado: fatia,
            });
            distribuido += fatia;
          }
          creditoRestante -= usarDestePg;
        }
      }

      const parts = [];
      if (valorDinheiro > 0) parts.push(`R$ ${valorDinheiro.toFixed(2)} em dinheiro`);
      if (valorCredito > 0) parts.push(`R$ ${valorCredito.toFixed(2)} de crédito`);
      toast({ title: `Pagamento de R$ ${valor.toFixed(2)} registrado! ${parts.join(" + ")}` });

      setPgDialog(null);
      setPgValor("");
      setPgObs("");
      setUsarCredito(false);
      qc.invalidateQueries({ queryKey: ["financeiro_receber"] });
      qc.invalidateQueries({ queryKey: ["pagamentos"] });
      qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setPgLoading(false);
    }
  };

  // Pay a specific nota (not FIFO)
  const registrarPagamentoNota = async () => {
    if (!pgNotaDialog || pgLoading) return;
    const valor = Number(pgValor);
    if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    if (valor > pgNotaDialog.saldo + 0.01) { toast({ title: `Valor máximo para esta nota: R$ ${pgNotaDialog.saldo.toFixed(2)}`, variant: "destructive" }); return; }
    setPgLoading(true);

    try {
      const { data: pg, error: pgErr } = await supabase.from("pagamentos")
        .insert({ cliente_id: pgNotaDialog.clienteId, motorista_id: pgNotaDialog.motoristaId || null, valor, data_pagamento: pgData, observacao: pgObs.trim() || null, created_by: user?.id } as any)
        .select().single();
      if (pgErr) throw pgErr;

      // Allocate entirely to this specific nota
      await supabase.from("pagamento_alocacoes").insert({
        pagamento_id: pg.id,
        financeiro_id: pgNotaDialog.id,
        valor_alocado: valor,
      });

      // Update the nota
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
      setPgNotaDialog(null);
      setPgValor("");
      setPgObs("");
      qc.invalidateQueries({ queryKey: ["financeiro_receber"] });
      qc.invalidateQueries({ queryKey: ["pagamentos"] });
      qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setPgLoading(false);
    }
  };

  const handleReprint = async (pedidoSaidaId: string, format: "80mm" | "a4") => {
    const { data: full } = await supabase.from("pedidos_saida")
      .select("*, motoristas(nome), clientes(nome, cep, cidade, estado, bairro, complemento, telefone), itens_saida(*, produtos(descricao, unidade))")
      .eq("id", pedidoSaidaId).single();
    if (!full) return;
    const disc = Number(full.desconto) || 0;
    if (format === "80mm") printSaida80mm(full, disc);
    else printSaidaA4(full, disc, full.observacao || "");
  };

  const printCobrancaUnica = (cliente: typeof clienteSummary[0]) => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const motNome = motoristas.find((m: any) => m.id === selectedMotorista)?.nome || "";
    const half = buildClienteHtml(cliente);
    const html = `<!DOCTYPE html><html><head><title>Cobrança - ${cliente.nome}</title>
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
    <div class="page">
      <div class="top-half">
        <div class="via">${half}</div>
        <div class="via">${half}</div>
      </div>
      <div class="bottom-half"></div>
    </div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const buildClienteHtml = (c: { id: string; nome: string; saldo: number; credito: number }) => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const motNome = motoristas.find((m: any) => m.id === selectedMotorista)?.nome || "";
    const recs = recebiveis
      .filter((r: any) => r.cliente_id === c.id && r.motorista_id === selectedMotorista && r.status !== "pago")
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
        <div style="font-weight:bold;font-size:15px;margin-bottom:2px;">ILHA VERDE</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
          <span>Data: ${hoje}</span>
          <span>Motorista: ${motNome}</span>
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

  const printCobrancas = () => {
    const clientesComSaldo = clienteSummary.filter(c => c.saldo > 0 || c.credito > 0);
    if (clientesComSaldo.length === 0) { toast({ title: "Nenhum cliente com saldo", variant: "destructive" }); return; }

    const motNome = motoristas.find((m: any) => m.id === selectedMotorista)?.nome || "";

    // Build pages: 2 clients per A4 page, each client duplicated side-by-side
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

    const html = `<!DOCTYPE html><html><head><title>Cobrança - ${motNome}</title>
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
    const motNome = motoristas.find((m: any) => m.id === selectedMotorista)?.nome || "";
    const hoje = new Date().toLocaleDateString("pt-BR");
    let totalGeralDevedor = 0;
    let blocosHtml = "";
    clientesComSaldo.forEach((c) => {
      const recs = recebiveis
        .filter((r: any) => r.cliente_id === c.id && r.motorista_id === selectedMotorista && r.status !== "pago")
        .sort((a: any, b: any) => a.data_venda.localeCompare(b.data_venda));
      let rows = "";
      recs.forEach((r: any) => {
        const saldo = Number(r.valor_total) - Number(r.valor_pago);
        const dataVenda = r.data_venda?.split("-").reverse().join("/") || "";
        const diasAtraso = Math.max(0, Math.floor((Date.now() - new Date(r.data_venda).getTime()) / 86400000) - 15);
        const obs = r.observacao ? String(r.observacao).trim() : "";
        rows += `<tr><td style="padding:2px 6px 2px 0;">${dataVenda}</td><td style="text-align:right;padding:2px 6px;">${Number(r.valor_total).toFixed(2)}</td><td style="text-align:right;padding:2px 6px;">${Number(r.valor_pago).toFixed(2)}</td><td style="text-align:right;font-weight:bold;padding:2px 6px;">${saldo.toFixed(2)}</td><td style="text-align:center;padding:2px 6px;">${diasAtraso > 0 ? diasAtraso : ""}</td><td style="padding:2px 0 2px 6px;font-size:10px;max-width:40mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${obs}</td></tr>`;
      });
      const cochoTotal = cochoPerClient(c.id);
      const cochoLine = cochoHasValues(cochoTotal) ? `<span style="margin-left:12px;font-size:10px;">Cochos: ${formatCochoLine(cochoTotal)}</span>` : "";
      const creditoLine = c.credito > 0 ? `<span style="margin-left:12px;color:#059669;font-size:10px;">Crédito: R$ ${c.credito.toFixed(2)}</span>` : "";
      totalGeralDevedor += c.saldo;
      blocosHtml += `<div style="margin-bottom:8px;"><div style="font-weight:bold;font-size:13px;border-bottom:1px solid #333;padding-bottom:1px;margin-bottom:2px;">${c.nome}</div><table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr style="border-bottom:1px solid #999;"><th style="text-align:left;padding:1px 6px 1px 0;">Data</th><th style="text-align:right;padding:1px 6px;">Título</th><th style="text-align:right;padding:1px 6px;">Vl.Pago</th><th style="text-align:right;padding:1px 6px;">Devedor</th><th style="text-align:center;padding:1px 6px;">Dias</th><th style="text-align:left;padding:1px 0 1px 6px;">Obs</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:right;font-weight:bold;font-size:12px;border-top:1px dashed #999;padding-top:1px;margin-top:1px;">Total: R$ ${c.saldo.toFixed(2)}${creditoLine}${cochoLine}</div></div>`;
    });
    const html = `<!DOCTYPE html><html><head><title>Relatório - ${motNome}</title><style>@page { size: A4; margin: 8mm 10mm; } * { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Courier New', monospace; font-size: 12px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;"><button onclick="window.print()" style="padding:8px 24px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button><button onclick="window.close()" style="padding:8px 24px;font-size:16px;cursor:pointer;margin-left:8px;">✕ Fechar</button></div><div style="padding:2mm 0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:2px solid #000;padding-bottom:4px;"><div><div style="font-weight:bold;font-size:16px;">ILHA VERDE — Relatório de Cobranças</div><div style="font-size:12px;">Motorista: ${motNome} | Data: ${hoje}</div></div><div style="font-weight:bold;font-size:15px;">Total: R$ ${totalGeralDevedor.toFixed(2)}</div></div>${blocosHtml}<div style="border-top:2px solid #000;padding-top:4px;margin-top:8px;display:flex;justify-content:flex-end;font-weight:bold;font-size:14px;">Total Geral Devedor: R$ ${totalGeralDevedor.toFixed(2)}</div></div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const printPagoPorClienteMotorista = () => {
    if (!resumoMotoristaDetalhes || !resumoMotoristaId) return;
    const motNome = resumoMotoristaDetalhes.motoristaNome;
    const hoje = new Date().toLocaleDateString("pt-BR");
    const periodo = `${vendidoDe.split("-").reverse().join("/")} até ${vendidoAte.split("-").reverse().join("/")}`;

    // Agrupa por cliente: à vista (notasPagas) + a prazo cobrado (baixasSaldo)
    type Linha = { data: string; orcamento: string | number; valor: number; tipo: "À vista" | "A prazo" };
    const map = new Map<string, { cliente: string; total: number; linhas: Linha[] }>();

    resumoMotoristaDetalhes.notasPagas.forEach((i: any) => {
      const cur = map.get(i.cliente) || { cliente: i.cliente, total: 0, linhas: [] };
      cur.total += Number(i.valor);
      cur.linhas.push({ data: i.data, orcamento: i.orcamento, valor: Number(i.valor), tipo: "À vista" });
      map.set(i.cliente, cur);
    });
    resumoMotoristaDetalhes.baixasSaldo.forEach((i: any) => {
      const cur = map.get(i.cliente) || { cliente: i.cliente, total: 0, linhas: [] };
      cur.total += Number(i.valor);
      cur.linhas.push({ data: i.data, orcamento: i.orcamento, valor: Number(i.valor), tipo: "A prazo" });
      map.set(i.cliente, cur);
    });

    const clientes = Array.from(map.values()).sort((a, b) => b.total - a.total);
    if (clientes.length === 0) {
      toast({ title: "Nenhum pagamento no período", variant: "destructive" });
      return;
    }
    const totalGeral = clientes.reduce((s, c) => s + c.total, 0);

    let blocos = "";
    clientes.forEach((c) => {
      const linhasOrd = c.linhas.sort((a, b) => a.data.localeCompare(b.data));
      let rows = "";
      linhasOrd.forEach((l) => {
        rows += `<tr>
          <td style="padding:2px 6px 2px 0;">${l.data.split("-").reverse().join("/")}</td>
          <td style="padding:2px 6px;">${l.orcamento}</td>
          <td style="padding:2px 6px;">${l.tipo}</td>
          <td style="text-align:right;padding:2px 6px;font-weight:bold;">R$ ${l.valor.toFixed(2)}</td>
        </tr>`;
      });
      blocos += `<div style="margin-bottom:10px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #333;padding-bottom:2px;margin-bottom:2px;">
          <div style="font-weight:bold;font-size:14px;">${c.cliente}</div>
          <div style="font-weight:bold;font-size:14px;">R$ ${c.total.toFixed(2)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr style="border-bottom:1px solid #999;">
            <th style="text-align:left;padding:1px 6px 1px 0;">Data</th>
            <th style="text-align:left;padding:1px 6px;">Nº Pedido</th>
            <th style="text-align:left;padding:1px 6px;">Tipo</th>
            <th style="text-align:right;padding:1px 6px;">Valor</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    });

    const html = `<!DOCTYPE html><html><head><title>Pagos no Período - ${motNome}</title>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:2px solid #000;padding-bottom:4px;">
        <div>
          <div style="font-weight:bold;font-size:16px;">ILHA VERDE — Pagos no Período</div>
          <div style="font-size:12px;">Motorista: ${motNome} | Período: ${periodo} | Emitido: ${hoje}</div>
        </div>
        <div style="font-weight:bold;font-size:15px;">Total: R$ ${totalGeral.toFixed(2)}</div>
      </div>
      ${blocos}
      <div style="border-top:2px solid #000;padding-top:6px;margin-top:10px;display:flex;justify-content:space-between;font-weight:bold;font-size:16px;">
        <span>TOTAL GERAL COBRADO NO PERÍODO</span>
        <span>R$ ${totalGeral.toFixed(2)}</span>
      </div>
    </div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const adicionarManual = async () => {
    const valor = Number(manualValor) || 0;
    const temCocho = manualCochoPreto > 0 || manualCochoVelling > 0 || manualCochoQuebrado > 0;
    if (!manualClienteId || !manualMotoristaId || (valor <= 0 && !temCocho)) {
      toast({ title: "Preencha cliente, motorista e valor (ou adicione cochos)", variant: "destructive" }); return;
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
    if (manualSomarVendido === "nao_somar") obsFinal = `[NV] ${obsFinal}`;
    try {
      // Create a dummy pedido_saida to satisfy FK
      const { data: pedido, error: pedErr } = await supabase.from("pedidos_saida")
        .insert({ motorista_id: manualMotoristaId, cliente_id: manualClienteId, data: manualData, tipo_pagamento: valor === 0 ? "aprazo" : manualTipo, observacao: obsFinal, archived: true, created_by: user?.id } as any)
        .select().single();
      if (pedErr) throw pedErr;

      await supabase.from("financeiro_receber").insert({
        pedido_saida_id: pedido.id, cliente_id: manualClienteId, motorista_id: manualMotoristaId,
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
      setManualClienteId(""); setManualMotoristaId(""); setManualValor(""); setManualValorPago(""); setManualObs("");
      setManualTipo("aprazo");
      setManualSomarVendido("somar");
      setManualCochoPreto(0); setManualCochoVelling(0); setManualCochoQuebrado(0);
      qc.invalidateQueries({ queryKey: ["financeiro_receber"] });
      qc.invalidateQueries({ queryKey: ["pedidos_saida"] });
      qc.invalidateQueries({ queryKey: ["cochos_cliente"] });
    } catch (e: any) {
      toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" });
    }
  };

  const filtered = recebiveis
    .filter((r: any) => !selectedMotorista || r.motorista_id === selectedMotorista)
    .filter((r: any) => !filterCardCliente || (r.clientes?.nome || "").toLowerCase().includes(filterCardCliente.toLowerCase()))
    .filter((r: any) => showArchived || r.status !== "pago");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setUndoOpen(true)}><Undo2 className="h-4 w-4 mr-1" />Desfazer Pgto</Button>
          <Button size="sm" variant="outline" onClick={() => setManualHistOpen(true)}><History className="h-4 w-4 mr-1" />Hist. Manual</Button>
          <Button size="sm" onClick={() => setManualOpen(true)}><Plus className="h-4 w-4 mr-1" />Conta Manual</Button>
        </div>
      </div>
      <ManualHistoryDialog open={manualHistOpen} onOpenChange={setManualHistOpen} />
      <Tabs defaultValue="receber">
        <TabsList>
          <TabsTrigger value="receber">Contas a Receber</TabsTrigger>
          <TabsTrigger value="resumo">Resumo Motoristas</TabsTrigger>
        </TabsList>

        <TabsContent value="receber" className="space-y-4">
          {/* Seletor de motorista + resumo por cliente */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 max-w-xs">
              <Label className="text-sm font-medium mb-1 block">Selecione o motorista</Label>
              <select value={selectedMotorista} onChange={e => setSelectedMotorista(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full">
                <option value="">— Selecione —</option>
                {motoristas.filter((m: any) => !m.terceirizado).map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                {motoristas.filter((m: any) => m.terceirizado && !m.user_id).length > 0 && <option disabled>──────────</option>}
                {motoristas.filter((m: any) => m.terceirizado && !m.user_id).map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            {selectedMotorista && clienteSummary.filter(c => c.saldo > 0 || c.credito > 0).length > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={printCobrancas}>
                  <Printer className="h-4 w-4 mr-1" />Cobranças
                </Button>
                <Button size="sm" variant="outline" onClick={printRelatorioCompleto}>
                  <FileText className="h-4 w-4 mr-1" />Relatório
                </Button>
              </>
            )}
          </div>

          {selectedMotorista && (
            <>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={filterCardCliente} onChange={e => setFilterCardCliente(e.target.value)} placeholder="Filtrar cliente..." className="h-9 pl-8 text-sm" />
                {filterCardCliente && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setFilterCardCliente("")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {clienteSummary
                  .filter(c => c.saldo > 0 || c.credito > 0 || cochoHasValues(cochoPerClient(c.id)))
                  .filter(c => !filterCardCliente || c.nome.toLowerCase().includes(filterCardCliente.toLowerCase()))
                  .map(c => (
                  <ClienteCardWithCocho key={c.id} c={c} cochoPerClient={cochoPerClient} salvarCochos={salvarCochos} setPgDialog={setPgDialog} printCobrancaUnica={printCobrancaUnica} />
                ))}
                {clienteSummary.filter(c => c.saldo > 0 || c.credito > 0 || cochoHasValues(cochoPerClient(c.id))).filter(c => !filterCardCliente || c.nome.toLowerCase().includes(filterCardCliente.toLowerCase())).length === 0 && (
                  <p className="text-muted-foreground text-sm col-span-full">Nenhum saldo pendente para este motorista.</p>
                )}
              </div>
            </>
          )}

          {/* Mostrar pagos checkbox */}
          <div className="flex items-center gap-2 flex-wrap">
            <Checkbox id="show-archived-fin" checked={showArchived} onCheckedChange={(v) => { setShowArchived(!!v); if (!v) timeWindow.reset(); }} />
            <Label htmlFor="show-archived-fin" className="text-sm cursor-pointer">Mostrar pagos</Label>
            <TimeWindowControl
              label={timeWindow.label}
              nextLabel={timeWindow.nextLabel}
              canExpand={timeWindow.canExpand}
              onExpand={timeWindow.expand}
              showHint={showArchived}
            />
          </div>

          {isLoading ? <p>Carregando...</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((r: any) => {
                  const saldo = Number(r.valor_total) - Number(r.valor_pago);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.data_venda?.split("-").reverse().join("/")}</TableCell>
                      <TableCell>{r.clientes?.nome}</TableCell>
                      <TableCell>{r.motoristas?.nome}</TableCell>
                      <TableCell>R$ {Number(r.valor_total).toFixed(2)}</TableCell>
                      <TableCell>R$ {Number(r.valor_pago).toFixed(2)}</TableCell>
                      <TableCell className={saldo > 0 ? "text-destructive font-semibold" : ""}>R$ {saldo.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={
                          r.status === "pago" ? "bg-emerald-600 text-white" :
                          r.status === "parcial" ? "bg-amber-500 text-white" :
                          "bg-red-500 text-white"
                        }>
                          {r.status === "pago" ? "Pago" : r.status === "parcial" ? "Parcial" : "Aberto"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {r.status !== "pago" && (
                            <Button variant="ghost" size="icon" title="Pagar esta nota" onClick={() => {
                              const saldo = Number(r.valor_total) - Number(r.valor_pago);
                              setPgNotaDialog({ id: r.id, clienteId: r.cliente_id, clienteNome: r.clientes?.nome || "", saldo, motoristaId: r.motorista_id });
                              setPgValor(saldo.toFixed(2));
                              setPgData(getTuesdayOfWeek());
                              setPgObs("");
                            }}>
                              <DollarSign className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Reimprimir" onClick={() => setPrintTarget(r)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="resumo" className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">De</Label>
              <DatePicker value={vendidoDe} onChange={setVendidoDe} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Até</Label>
              <DatePicker value={vendidoAte} onChange={setVendidoAte} />
            </div>
            <span className="text-xs text-muted-foreground pb-2">
              Vendido de {vendidoDe.split("-").reverse().join("/")} até {vendidoAte.split("-").reverse().join("/")}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {motoristaSummary.map(m => (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => setResumoMotoristaId(m.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setResumoMotoristaId(m.id); }}
                className="rounded-lg border bg-card px-5 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-[160px]">
                    <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-bold">{m.nome}</span>
                  </div>
                  <div className="flex flex-1 items-center justify-end gap-8 flex-wrap">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total na rua</p>
                      <p className="font-bold text-destructive">R$ {m.totalNaRua.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Vendido no período</p>
                      <p className="font-semibold">R$ {m.vendidoPeriodo.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Cobrado no período</p>
                      <p className="font-semibold text-emerald-600">R$ {m.totalCobrado.toFixed(2)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:block">Ver detalhes →</span>
                  </div>
                </div>
              </div>
            ))}
            {motoristaSummary.length === 0 && (
              <p className="text-muted-foreground col-span-full text-center py-8">Nenhum dado financeiro registrado</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Pagamento Dialog */}
      <Dialog open={!!pgDialog} onOpenChange={v => { if (!v) { setPgDialog(null); setUsarCredito(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento — {pgDialog?.clienteNome}</DialogTitle>
          </DialogHeader>
          {(() => {
            const credito = pgDialog ? (creditoMap.get(`${pgDialog.clienteId}|${pgDialog.motoristaId}`) || 0) : 0;
            const creditosOutros = pgDialog ? getCreditosOutrosMotoristas(pgDialog.clienteId, pgDialog.motoristaId) : [];
            const motoristaAtualNome = pgDialog ? (motoristas.find((m: any) => m.id === pgDialog.motoristaId)?.nome || "") : "";
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
                      <Checkbox id="usar-credito" checked={usarCredito} onCheckedChange={(v) => setUsarCredito(!!v)} />
                      <Label htmlFor="usar-credito" className="text-sm font-medium cursor-pointer">
                        Utilizar crédito disponível: <span className="text-emerald-700 font-bold">R$ {credito.toFixed(2)}</span>
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
                {creditosOutros.length > 0 && pgDialog && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-900">
                      ⚠️ Este cliente tem crédito com outro(s) motorista(s):
                    </div>
                    {creditosOutros.map((c) => (
                      <div key={c.motoristaId} className="flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-medium">{c.motoristaNome}:</span>{" "}
                          <span className="text-amber-700 font-bold">R$ {c.valor.toFixed(2)}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-amber-400 hover:bg-amber-100"
                          onClick={() => {
                            setTransferCreditoDialog({
                              clienteId: pgDialog.clienteId,
                              clienteNome: pgDialog.clienteNome,
                              motoristaOrigemId: c.motoristaId,
                              motoristaOrigemNome: c.motoristaNome,
                              motoristaDestinoId: pgDialog.motoristaId,
                              motoristaDestinoNome: motoristaAtualNome,
                              valorMaximo: c.valor,
                            });
                            setTransferValor(c.valor.toFixed(2));
                          }}
                        >
                          Transferir p/ {motoristaAtualNome}
                        </Button>
                      </div>
                    ))}
                    <div className="text-[10px] text-amber-800 italic">
                      A transferência registra o crédito como "Cobrado no Período" do motorista de destino.
                    </div>
                  </div>
                )}
                <div>
                  <Label>Data</Label>
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
                if (v > (pgNotaDialog?.saldo || 0)) {
                  setPgValor((pgNotaDialog?.saldo || 0).toFixed(2));
                } else {
                  setPgValor(e.target.value);
                }
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

      {/* Print choice dialog */}
      <AlertDialog open={!!printTarget} onOpenChange={v => { if (!v) setPrintTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reimprimir Pedido</AlertDialogTitle>
            <AlertDialogDescription>{printTarget?.clientes?.nome} — R$ {Number(printTarget?.valor_total || 0).toFixed(2)}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <Button className="flex-1" variant="secondary" onClick={() => { handleReprint(printTarget.pedido_saida_id, "80mm"); setPrintTarget(null); }}>
              <Printer className="mr-2 h-4 w-4" />80mm
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => { handleReprint(printTarget.pedido_saida_id, "a4"); setPrintTarget(null); }}>
              <Printer className="mr-2 h-4 w-4" />A4
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual conta dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Conta a Receber</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <SearchableSelect
                options={clientes.map((c: any) => ({ value: c.id, label: c.nome }))}
                value={manualClienteId}
                onValueChange={setManualClienteId}
                placeholder="Selecione o cliente"
              />
            </div>
            <div>
              <Label>Motorista</Label>
              <SearchableSelect
                options={motoristas.map((m: any) => ({ value: m.id, label: m.nome }))}
                value={manualMotoristaId}
                onValueChange={setManualMotoristaId}
                placeholder="Selecione o motorista"
              />
            </div>
            <div>
              <Label>Data</Label>
              <DatePicker value={manualData} onChange={setManualData} />
            </div>
            <div>
              <Label>Valor Total (R$)</Label>
              <Input type="number" min={0} step={0.01} value={manualValor} onChange={e => setManualValor(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Tipo de Pagamento</Label>
              <Select value={manualTipo} onValueChange={v => { setManualTipo(v); setManualValorPago(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="avista">À vista</SelectItem>
                  <SelectItem value="aprazo">A prazo</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {manualTipo === "parcial" && (
              <div>
                <Label>Valor já pago (R$)</Label>
                <Input type="number" min={0} step={0.01} value={manualValorPago} onChange={e => setManualValorPago(e.target.value)} placeholder="0.00" />
              </div>
            )}
            <div>
              <Label>Somar no Vendido do Período?</Label>
              <Select value={manualSomarVendido} onValueChange={setManualSomarVendido}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="somar">Somar no vendido no período</SelectItem>
                  <SelectItem value="nao_somar">Não somar no vendido no período</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {manualSomarVendido === "somar"
                  ? "Aumenta dinheiro na rua e entra no vendido do período."
                  : "Apenas lança a nota (dinheiro na rua), sem afetar o vendido do período."}
              </p>
            </div>
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
              <Plus className="mr-2 h-4 w-4" />Adicionar Conta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhe motorista resumo */}
      <Dialog open={!!resumoMotoristaId} onOpenChange={v => { if (!v) setResumoMotoristaId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {resumoMotoristaDetalhes?.motoristaNome} — {vendidoDe.split("-").reverse().join("/")} até {vendidoAte.split("-").reverse().join("/")}
            </DialogTitle>
          </DialogHeader>
          {resumoMotoristaDetalhes && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={printPagoPorClienteMotorista}>
                  <Printer className="h-4 w-4 mr-1" />Imprimir pagos por cliente
                </Button>
              </div>
              {/* Vendas no período */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center justify-between w-full rounded-md border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    <h3 className="font-semibold text-sm">🛒 Vendas no período</h3>
                  </div>
                  <span className="font-bold text-sm">R$ {resumoMotoristaDetalhes.totalVendido.toFixed(2)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  {resumoMotoristaDetalhes.vendasPeriodo.length === 0 ? (
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
                        {resumoMotoristaDetalhes.vendasPeriodo.map((i: any) => (
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
                  <span className="font-bold text-sm">R$ {resumoMotoristaDetalhes.totalNotaPaga.toFixed(2)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  {resumoMotoristaDetalhes.notasPagas.length === 0 ? (
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
                        {resumoMotoristaDetalhes.notasPagas.map((i: any) => (
                          <TableRow key={i.id}>
                            <TableCell className="text-xs py-1">{i.data.split("-").reverse().join("/")}</TableCell>
                            <TableCell className="text-xs py-1">{i.cliente}</TableCell>
                            <TableCell className="text-xs py-1">{i.orcamento}</TableCell>
                            <TableCell className="text-xs py-1 text-right font-semibold">R$ {i.valor.toFixed(2)}</TableCell>
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
                  <span className="font-bold text-sm text-emerald-600">R$ {resumoMotoristaDetalhes.totalBaixado.toFixed(2)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  {resumoMotoristaDetalhes.baixasSaldo.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3">Nenhuma venda a prazo cobrada no período.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs py-1">Data Venda</TableHead>
                        <TableHead className="text-xs py-1">Cliente</TableHead>
                        <TableHead className="text-xs py-1">Nº Pedido</TableHead>
                        <TableHead className="text-xs py-1">Status</TableHead>
                        <TableHead className="text-xs py-1 text-right">Valor Cobrado</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {resumoMotoristaDetalhes.baixasSaldo.map((i: any) => (
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

              {resumoMotoristaDetalhes.creditosPeriodo && resumoMotoristaDetalhes.creditosPeriodo.length > 0 && (
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="w-full flex items-center justify-between bg-muted/50 px-3 py-2 rounded text-sm font-semibold">
                    <span>Créditos no período (sobra de pagamento)</span>
                    <span className="text-emerald-600">R$ {resumoMotoristaDetalhes.totalCreditos.toFixed(2)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs py-1">Data</TableHead>
                        <TableHead className="text-xs py-1">Cliente</TableHead>
                        <TableHead className="text-xs py-1">Observação</TableHead>
                        <TableHead className="text-xs py-1 text-right">Crédito</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {resumoMotoristaDetalhes.creditosPeriodo.map((i: any) => (
                          <TableRow key={i.id}>
                            <TableCell className="text-xs py-1">{i.data.split("-").reverse().join("/")}</TableCell>
                            <TableCell className="text-xs py-1">{i.cliente}</TableCell>
                            <TableCell className="text-xs py-1">{i.observacao}</TableCell>
                            <TableCell className="text-xs py-1 text-right font-semibold text-emerald-600">R$ {i.valor.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="border-t pt-3 flex justify-between font-bold">
                <span>Total cobrado no período</span>
                <span className="text-emerald-600">R$ {(resumoMotoristaDetalhes.totalNotaPaga + resumoMotoristaDetalhes.totalBaixado + (resumoMotoristaDetalhes.totalCreditos || 0)).toFixed(2)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <UndoPaymentDialog open={undoOpen} onOpenChange={setUndoOpen} dateFrom={vendidoDe} dateTo={vendidoAte} />

      {/* Confirmação de Transferência de Crédito entre Motoristas */}
      <AlertDialog open={!!transferCreditoDialog} onOpenChange={v => { if (!v) { setTransferCreditoDialog(null); setTransferValor(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transferir Crédito entre Motoristas</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div>
                  Cliente: <span className="font-semibold text-foreground">{transferCreditoDialog?.clienteNome}</span>
                </div>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
                  <div>De: <span className="font-semibold text-foreground">{transferCreditoDialog?.motoristaOrigemNome}</span></div>
                  <div>Para: <span className="font-semibold text-foreground">{transferCreditoDialog?.motoristaDestinoNome}</span></div>
                  <div className="text-xs text-amber-800 mt-2">
                    Crédito disponível em {transferCreditoDialog?.motoristaOrigemNome}: <span className="font-bold">R$ {transferCreditoDialog?.valorMaximo.toFixed(2)}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Valor a transferir (R$)</Label>
                  <Input
                    type="number"
                    value={transferValor}
                    onChange={e => setTransferValor(e.target.value)}
                    min={0}
                    max={transferCreditoDialog?.valorMaximo}
                    step={0.01}
                    className="mt-1"
                  />
                </div>
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  ℹ️ Após confirmar, o crédito sai do {transferCreditoDialog?.motoristaOrigemNome} e fica disponível no {transferCreditoDialog?.motoristaDestinoNome}, contando como "Cobrado no Período" deste último. Esta operação é registrada no histórico de pagamentos e pode ser revertida.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executarTransferenciaCredito} disabled={transferLoading}>
              {transferLoading ? "Transferindo..." : "Confirmar Transferência"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
