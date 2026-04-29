import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, ShoppingCart, Fuel, Receipt, Printer } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  motoristaId: string;
  motoristaNome: string;
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Get all Tuesdays in a given month/year. A Tuesday "belongs" to the month it falls in. */
function getTuesdaysInMonth(year: number, month: number): Date[] {
  const tuesdays: Date[] = [];
  const d = new Date(year, month, 1);
  // find first Tuesday
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) {
    tuesdays.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return tuesdays;
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FechamentoSemanal({ open, onOpenChange, motoristaId, motoristaNome }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | "all">("all");
  const [diesel, setDiesel] = useState("");
  const [despesas, setDespesas] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const weeks = useMemo(() => {
    const tuesdays = getTuesdaysInMonth(selectedYear, selectedMonth);
    return tuesdays.map((tue, i) => {
      const mon = new Date(tue);
      mon.setDate(mon.getDate() + 6); // Monday = Tuesday + 6
      return {
        index: i,
        label: `Semana ${String(i + 1).padStart(2, "0")}: ${formatDateBR(tue)} até ${formatDateBR(mon)}`,
        start: tue,
        end: mon,
        startStr: localDateStr(tue),
        endStr: localDateStr(mon),
      };
    });
  }, [selectedYear, selectedMonth]);

  const selectedWeek = typeof selectedWeekIdx === "number" ? weeks[selectedWeekIdx] : null;
  const isAllWeeks = selectedWeekIdx === "all";

  // Month date range for "all" mode
  const monthStart = useMemo(() => weeks.length > 0 ? weeks[0].startStr : "", [weeks]);
  const monthEnd = useMemo(() => weeks.length > 0 ? weeks[weeks.length - 1].endStr : "", [weeks]);

  // Fetch vendas for single week
  const { data: vendas = 0 } = useQuery({
    queryKey: ["fechamento-vendas", motoristaId, selectedWeek?.startStr, selectedWeek?.endStr],
    queryFn: async () => {
      if (!selectedWeek) return 0;
      const { data, error } = await supabase
        .from("pedidos_saida")
        .select("id, desconto, itens_saida(quantidade, preco)")
        .eq("motorista_id", motoristaId)
        .eq("archived", true)
        .gte("data", selectedWeek.startStr)
        .lte("data", selectedWeek.endStr);
      if (error) throw error;
      let total = 0;
      (data || []).forEach((p: any) => {
        const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.preco), 0);
        total += subtotal - Number(p.desconto || 0);
      });
      return total;
    },
    enabled: !!selectedWeek,
  });

  // Fetch compras for single week
  const { data: compras = 0 } = useQuery({
    queryKey: ["fechamento-compras", motoristaId, selectedWeek?.startStr, selectedWeek?.endStr],
    queryFn: async () => {
      if (!selectedWeek) return 0;
      const { data, error } = await supabase
        .from("notas_motorista")
        .select("valor")
        .eq("motorista_id", motoristaId)
        .gte("data_lancamento", selectedWeek.startStr)
        .lte("data_lancamento", selectedWeek.endStr);
      if (error) throw error;
      return (data || []).reduce((s: number, n: any) => s + Number(n.valor), 0);
    },
    enabled: !!selectedWeek,
  });

  // Fetch fechamento_semanal for single week
  const { data: fechamento } = useQuery({
    queryKey: ["fechamento-semanal", motoristaId, selectedWeek?.startStr],
    queryFn: async () => {
      if (!selectedWeek) return null;
      const { data, error } = await supabase
        .from("fechamento_semanal")
        .select("*")
        .eq("motorista_id", motoristaId)
        .eq("semana_inicio", selectedWeek.startStr)
        .maybeSingle() as any;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedWeek,
  });

  // Fetch ALL weeks aggregated data (per-week: use manual when available, auto otherwise)
  const { data: allTotals = { diesel: 0, despesas: 0, vendas: 0, compras: 0, lucro: 0 } } = useQuery({
    queryKey: ["fechamento-all-totals", motoristaId, monthStart, monthEnd, weeks.map(w => w.startStr).join(",")],
    queryFn: async () => {
      if (!monthStart || weeks.length === 0) return { diesel: 0, despesas: 0, vendas: 0, compras: 0, lucro: 0 };

      // Fetch all fechamentos for the month
      const { data: fechamentos } = await supabase
        .from("fechamento_semanal")
        .select("*")
        .eq("motorista_id", motoristaId)
        .gte("semana_inicio", monthStart)
        .lte("semana_inicio", monthEnd) as any;
      
      const fechMap: Record<string, any> = {};
      (fechamentos || []).forEach((f: any) => { fechMap[f.semana_inicio] = f; });

      let totalVendas = 0, totalCompras = 0, totalDiesel = 0, totalDespesas = 0;

      for (const week of weeks) {
        const fech = fechMap[week.startStr];
        totalDiesel += fech ? Number(fech.diesel) : 0;
        totalDespesas += fech ? Number(fech.despesas) : 0;

        // Vendas: use manual if set, otherwise calculate from orders
        if (fech?.venda_manual != null) {
          totalVendas += Number(fech.venda_manual);
        } else {
          const { data: pedidos } = await supabase
            .from("pedidos_saida")
            .select("id, desconto, itens_saida(quantidade, preco)")
            .eq("motorista_id", motoristaId)
            .eq("archived", true)
            .gte("data", week.startStr)
            .lte("data", week.endStr);
          (pedidos || []).forEach((p: any) => {
            const sub = (p.itens_saida || []).reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.preco), 0);
            totalVendas += sub - Number(p.desconto || 0);
          });
        }

        // Compras: use manual if set, otherwise calculate from notas
        if (fech?.compra_manual != null) {
          totalCompras += Number(fech.compra_manual);
        } else {
          const { data: notas } = await supabase
            .from("notas_motorista")
            .select("valor")
            .eq("motorista_id", motoristaId)
            .gte("data_lancamento", week.startStr)
            .lte("data_lancamento", week.endStr);
          totalCompras += (notas || []).reduce((s: number, n: any) => s + Number(n.valor), 0);
        }
      }

      return { diesel: totalDiesel, despesas: totalDespesas, vendas: totalVendas, compras: totalCompras, lucro: totalVendas - totalCompras - totalDiesel - totalDespesas };
    },
    enabled: isAllWeeks && !!monthStart,
  });

  // Sync local state when fechamento or week changes
  const fechamentoDiesel = fechamento ? Number(fechamento.diesel) : 0;
  const fechamentoDespesas = fechamento ? Number(fechamento.despesas) : 0;
  const vendaManual = fechamento?.venda_manual != null ? Number(fechamento.venda_manual) : null;
  const compraManual = fechamento?.compra_manual != null ? Number(fechamento.compra_manual) : null;

  const prevWeekKeyRef = useRef("");
  const weekKey = selectedWeek?.startStr || "";
  useEffect(() => {
    if (weekKey !== prevWeekKeyRef.current) {
      prevWeekKeyRef.current = weekKey;
      setDiesel(fechamento ? String(fechamento.diesel) : "");
      setDespesas(fechamento ? String(fechamento.despesas) : "");
    }
  }, [weekKey, fechamento]);

  // Use manual values when available, otherwise use auto-calculated
  const vendasFinal = vendaManual !== null ? vendaManual : vendas;
  const comprasFinal = compraManual !== null ? compraManual : compras;

  // Use fetched values for display, local state for editing
  const dieselVal = diesel !== "" ? Number(diesel) || 0 : fechamentoDiesel;
  const despesasVal = despesas !== "" ? Number(despesas) || 0 : fechamentoDespesas;
  const lucro = vendasFinal - comprasFinal - dieselVal - despesasVal;

  // Display values: either single week or all
  const displayVendas = isAllWeeks ? allTotals.vendas : vendasFinal;
  const displayCompras = isAllWeeks ? allTotals.compras : comprasFinal;
  const displayDiesel = isAllWeeks ? allTotals.diesel : dieselVal;
  const displayDespesas = isAllWeeks ? allTotals.despesas : despesasVal;
  const displayLucro = isAllWeeks ? allTotals.lucro : lucro;
  const showCards = isAllWeeks || !!selectedWeek;

  // Auto-save with debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSave = (newDiesel: string, newDespesas: string) => {
    if (!selectedWeek) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const d = Number(newDiesel) || 0;
      const de = Number(newDespesas) || 0;
      try {
        if (fechamento) {
          await supabase.from("fechamento_semanal").update({ diesel: d, despesas: de }).eq("id", fechamento.id);
        } else {
          await supabase.from("fechamento_semanal").insert({
            motorista_id: motoristaId,
            semana_inicio: selectedWeek.startStr,
            diesel: d,
            despesas: de,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["fechamento-semanal", motoristaId, selectedWeek.startStr] });
      } catch (e: any) {
        toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
      }
    }, 800);
  };

  const handleDieselChange = (v: string) => { setDiesel(v); autoSave(v, despesas); };
  const handleDespesasChange = (v: string) => { setDespesas(v); autoSave(diesel, v); };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  /** Helper to fetch vendas/compras/diesel/despesas for a date range.
   *  Per-week: uses venda_manual/compra_manual when set, auto-calculates otherwise. */
  const fetchRangeData = async (start: string, end: string) => {
    // Fetch fechamentos for the range
    const { data: fechamentos } = await supabase
      .from("fechamento_semanal")
      .select("diesel, despesas, venda_manual, compra_manual, semana_inicio")
      .eq("motorista_id", motoristaId)
      .gte("semana_inicio", start)
      .lte("semana_inicio", end);

    let totalDiesel = 0, totalDespesas = 0;
    const fechMap: Record<string, any> = {};
    (fechamentos || []).forEach((f: any) => {
      totalDiesel += Number(f.diesel);
      totalDespesas += Number(f.despesas);
      fechMap[f.semana_inicio] = f;
    });

    // Fetch auto vendas (all archived orders in range)
    const { data: pedidos } = await supabase
      .from("pedidos_saida")
      .select("id, desconto, data, itens_saida(quantidade, preco)")
      .eq("motorista_id", motoristaId)
      .eq("archived", true)
      .gte("data", start)
      .lte("data", end);

    let autoVendas = 0;
    const vendasPorDia: Record<string, number> = {};
    (pedidos || []).forEach((p: any) => {
      const sub = (p.itens_saida || []).reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.preco), 0);
      const val = sub - Number(p.desconto || 0);
      autoVendas += val;
      vendasPorDia[p.data] = (vendasPorDia[p.data] || 0) + val;
    });

    // Fetch auto compras
    const { data: notas } = await supabase
      .from("notas_motorista")
      .select("valor, data_lancamento")
      .eq("motorista_id", motoristaId)
      .gte("data_lancamento", start)
      .lte("data_lancamento", end);

    let autoCompras = 0;
    const comprasPorDia: Record<string, number> = {};
    (notas || []).forEach((n: any) => {
      const val = Number(n.valor);
      autoCompras += val;
      comprasPorDia[n.data_lancamento] = (comprasPorDia[n.data_lancamento] || 0) + val;
    });

    // Check if any week in range has manual overrides — if so, compute per-week
    const hasAnyManualVenda = Object.values(fechMap).some((f: any) => f.venda_manual != null);
    const hasAnyManualCompra = Object.values(fechMap).some((f: any) => f.compra_manual != null);

    let totalVendas = autoVendas;
    let totalCompras = autoCompras;

    if (hasAnyManualVenda || hasAnyManualCompra) {
      // Find all weeks (Tuesdays) that cover this range
      const rangeStart = new Date(start + "T12:00:00");
      const rangeEnd = new Date(end + "T12:00:00");
      // Find first Tuesday on or before rangeStart
      const allWeeksInRange: { startStr: string; endStr: string }[] = [];
      // Get all Tuesdays in the month range
      for (let yr = rangeStart.getFullYear(); yr <= rangeEnd.getFullYear(); yr++) {
        const mStart = yr === rangeStart.getFullYear() ? rangeStart.getMonth() : 0;
        const mEnd = yr === rangeEnd.getFullYear() ? rangeEnd.getMonth() : 11;
        for (let m = mStart; m <= mEnd; m++) {
          const tuesdays = getTuesdaysInMonth(yr, m);
          tuesdays.forEach(tue => {
            const mon = new Date(tue);
            mon.setDate(mon.getDate() + 6);
            const ws = localDateStr(tue);
            const we = localDateStr(mon);
            if (we >= start && ws <= end) {
              allWeeksInRange.push({ startStr: ws, endStr: we });
            }
          });
        }
      }
      // Deduplicate
      const seen = new Set<string>();
      const uniqueWeeks = allWeeksInRange.filter(w => {
        if (seen.has(w.startStr)) return false;
        seen.add(w.startStr);
        return true;
      });

      if (hasAnyManualVenda) {
        totalVendas = 0;
        for (const w of uniqueWeeks) {
          const fech = fechMap[w.startStr];
          if (fech?.venda_manual != null) {
            totalVendas += Number(fech.venda_manual);
          } else {
            // Auto vendas for this week
            const { data: wPedidos } = await supabase
              .from("pedidos_saida")
              .select("id, desconto, itens_saida(quantidade, preco)")
              .eq("motorista_id", motoristaId)
              .eq("archived", true)
              .gte("data", w.startStr)
              .lte("data", w.endStr);
            (wPedidos || []).forEach((p: any) => {
              const sub = (p.itens_saida || []).reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.preco), 0);
              totalVendas += sub - Number(p.desconto || 0);
            });
          }
        }
      }

      if (hasAnyManualCompra) {
        totalCompras = 0;
        for (const w of uniqueWeeks) {
          const fech = fechMap[w.startStr];
          if (fech?.compra_manual != null) {
            totalCompras += Number(fech.compra_manual);
          } else {
            const { data: wNotas } = await supabase
              .from("notas_motorista")
              .select("valor")
              .eq("motorista_id", motoristaId)
              .gte("data_lancamento", w.startStr)
              .lte("data_lancamento", w.endStr);
            totalCompras += (wNotas || []).reduce((s: number, n: any) => s + Number(n.valor), 0);
          }
        }
      }
    }

    return { totalVendas, totalCompras, totalDiesel, totalDespesas, vendasPorDia, comprasPorDia, fechMap };
  };

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /** Fetch aggregated data for any date range and print with detail breakdown */
  const printRelatorio = async (tipo: "Ano" | "Mês" | "Semana") => {
    let startStr = "";
    let endStr = "";
    let periodoLabel = "";

    if (tipo === "Ano") {
      startStr = `${selectedYear}-01-01`;
      endStr = `${selectedYear}-12-31`;
      periodoLabel = `Ano ${selectedYear}`;
    } else if (tipo === "Mês") {
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      startStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
      endStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${lastDay}`;
      periodoLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    } else {
      if (!selectedWeek) { toast({ title: "Selecione uma semana", variant: "destructive" }); return; }
      startStr = selectedWeek.startStr;
      endStr = selectedWeek.endStr;
      periodoLabel = `${selectedWeek.label} — ${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    }

    try {
      const data = await fetchRangeData(startStr, endStr);
      const { totalVendas, totalCompras, totalDiesel, totalDespesas } = data;
      const totalGastos = totalCompras + totalDiesel + totalDespesas;
      const lucroTotal = totalVendas - totalGastos;
      const lucroPct = totalVendas > 0 ? ((lucroTotal / totalVendas) * 100) : 0;

      // Build detail sections
      let detailHtml = "";

      if (tipo === "Ano") {
        // Detail by month
        let vendasRows = "";
        let comprasRows = "";
        let dieselRows = "";
        let despesasRows = "";
        let lucroRows = "";
        for (let m = 0; m < 12; m++) {
          const mStart = `${selectedYear}-${String(m + 1).padStart(2, "0")}-01`;
          const lastD = new Date(selectedYear, m + 1, 0).getDate();
          const mEnd = `${selectedYear}-${String(m + 1).padStart(2, "0")}-${lastD}`;
          const md = await fetchRangeData(mStart, mEnd);
          if (md.totalVendas > 0 || md.totalCompras > 0 || md.totalDiesel > 0 || md.totalDespesas > 0) {
            const mLucro = md.totalVendas - md.totalCompras - md.totalDiesel - md.totalDespesas;
            vendasRows += `<div class="sub-row"><span>${MONTH_NAMES[m]}</span><span>${fmt(md.totalVendas)}</span></div>`;
            comprasRows += `<div class="sub-row"><span>${MONTH_NAMES[m]}</span><span>${fmt(md.totalCompras)}</span></div>`;
            dieselRows += `<div class="sub-row"><span>${MONTH_NAMES[m]}</span><span>${fmt(md.totalDiesel)}</span></div>`;
            despesasRows += `<div class="sub-row"><span>${MONTH_NAMES[m]}</span><span>${fmt(md.totalDespesas)}</span></div>`;
            lucroRows += `<div class="sub-row"><span>${MONTH_NAMES[m]}</span><span class="${mLucro >= 0 ? 'positive' : 'negative'}">${fmt(mLucro)}</span></div>`;
          }
        }
        detailHtml = `
          <div class="section"><div class="section-title">🛒 Vendas — ${fmt(totalVendas)}</div>${vendasRows}</div>
          <div class="section"><div class="section-title">📦 Compras — ${fmt(totalCompras)}</div>${comprasRows}</div>
          <div class="section"><div class="section-title">⛽ Diesel — ${fmt(totalDiesel)}</div>${dieselRows}</div>
          <div class="section"><div class="section-title">💰 Despesas — ${fmt(totalDespesas)}</div>${despesasRows}</div>
          <div class="section"><div class="section-title">📈 Lucro — ${fmt(lucroTotal)}</div>${lucroRows}</div>
        `;
      } else if (tipo === "Mês") {
        // Detail by week
        const monthWeeks = getTuesdaysInMonth(selectedYear, selectedMonth);
        let vendasRows = "";
        let comprasRows = "";
        let dieselRows = "";
        let despesasRows = "";
        let lucroRows = "";
        for (let wi = 0; wi < monthWeeks.length; wi++) {
          const tue = monthWeeks[wi];
          const mon = new Date(tue);
          mon.setDate(mon.getDate() + 6);
          const wStart = localDateStr(tue);
          const wEnd = localDateStr(mon);
          const wd = await fetchRangeData(wStart, wEnd);
          const wLabel = `Sem ${wi + 1} (${formatDateBR(tue)}-${formatDateBR(mon)})`;
          const wLucro = wd.totalVendas - wd.totalCompras - wd.totalDiesel - wd.totalDespesas;
          vendasRows += `<div class="sub-row"><span>${wLabel}</span><span>${fmt(wd.totalVendas)}</span></div>`;
          comprasRows += `<div class="sub-row"><span>${wLabel}</span><span>${fmt(wd.totalCompras)}</span></div>`;
          dieselRows += `<div class="sub-row"><span>${wLabel}</span><span>${fmt(wd.totalDiesel)}</span></div>`;
          despesasRows += `<div class="sub-row"><span>${wLabel}</span><span>${fmt(wd.totalDespesas)}</span></div>`;
          lucroRows += `<div class="sub-row"><span>${wLabel}</span><span class="${wLucro >= 0 ? 'positive' : 'negative'}">${fmt(wLucro)}</span></div>`;
        }
        detailHtml = `
          <div class="section"><div class="section-title">🛒 Vendas — ${fmt(totalVendas)}</div>${vendasRows}</div>
          <div class="section"><div class="section-title">📦 Compras — ${fmt(totalCompras)}</div>${comprasRows}</div>
          <div class="section"><div class="section-title">⛽ Diesel — ${fmt(totalDiesel)}</div>${dieselRows}</div>
          <div class="section"><div class="section-title">💰 Despesas — ${fmt(totalDespesas)}</div>${despesasRows}</div>
          <div class="section"><div class="section-title">📈 Lucro — ${fmt(lucroTotal)}</div>${lucroRows}</div>
        `;
      } else {
        // Semana: detail by day
        const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const start = new Date(selectedWeek!.start);
        let vendasRows = "";
        let comprasRows = "";
        let lucroRows = "";
        for (let d = 0; d < 7; d++) {
          const day = new Date(start);
          day.setDate(day.getDate() + d);
          const ds = localDateStr(day);
          const vDia = data.vendasPorDia[ds] || 0;
          const cDia = data.comprasPorDia[ds] || 0;
          if (vDia > 0 || cDia > 0) {
            const dayLabel = `${daysOfWeek[day.getDay()]} ${formatDateBR(day)}`;
            const dLucro = vDia - cDia;
            if (vDia > 0) vendasRows += `<div class="sub-row"><span>${dayLabel}</span><span>${fmt(vDia)}</span></div>`;
            if (cDia > 0) comprasRows += `<div class="sub-row"><span>${dayLabel}</span><span>${fmt(cDia)}</span></div>`;
            lucroRows += `<div class="sub-row"><span>${dayLabel}</span><span class="${dLucro >= 0 ? 'positive' : 'negative'}">${fmt(dLucro)}</span></div>`;
          }
        }
        detailHtml = `
          <div class="section"><div class="section-title">🛒 Vendas — ${fmt(totalVendas)}</div>${vendasRows || '<div class="sub-row"><span>Sem movimentação</span><span>—</span></div>'}</div>
          <div class="section"><div class="section-title">📦 Compras — ${fmt(totalCompras)}</div>${comprasRows || '<div class="sub-row"><span>Sem movimentação</span><span>—</span></div>'}</div>
          <div class="section">
            <div class="sub-row"><span>⛽ Diesel</span><span>${fmt(totalDiesel)}</span></div>
            <div class="sub-row"><span>💰 Despesas</span><span>${fmt(totalDespesas)}</span></div>
          </div>
          <div class="section"><div class="section-title">📈 Lucro — ${fmt(lucroTotal)}</div>${lucroRows || '<div class="sub-row"><span>Sem movimentação</span><span>—</span></div>'}</div>
        `;
      }

      const html = `<!DOCTYPE html><html><head><title>Fechamento ${periodoLabel}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 11px; color: #111; }
        .header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        .header h1 { font-size: 16px; margin-bottom: 2px; }
        .header h2 { font-size: 13px; font-weight: normal; color: #555; }
        .section { margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
        .section-title { font-weight: bold; font-size: 13px; margin-bottom: 4px; padding: 4px 0; border-bottom: 1px dashed #bbb; }
        .sub-row { display: flex; justify-content: space-between; padding: 2px 12px; font-size: 11px; color: #333; }
        .sub-row:nth-child(odd) { background: #f9f9f9; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; }
        .row .label { font-weight: bold; font-size: 12px; }
        .row .value { text-align: right; font-size: 13px; }
        .row.total { border-top: 2px solid #333; border-bottom: 2px solid #333; margin-top: 8px; padding: 8px 0; }
        .positive { color: #059669; }
        .negative { color: #dc2626; }
        .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #999; }
      </style>
      </head><body>
        <div class="header">
          <h1>Fechamento — ${motoristaNome}</h1>
          <h2>${periodoLabel}</h2>
        </div>
        ${detailHtml}
        <div class="row">
          <span class="label">📊 Total Gastos</span>
          <span class="value">${fmt(totalGastos)}</span>
        </div>
        <div class="row total">
          <span class="label">📈 Lucro Total</span>
          <span class="value ${lucroTotal >= 0 ? "positive" : "negative"}">${fmt(lucroTotal)} (${lucroPct.toFixed(1)}%)</span>
        </div>
        <div class="footer">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
      </body></html>`;

      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch (e: any) {
      toast({ title: "Erro ao gerar relatório", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />Fechamento — {motoristaNome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Print buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => printRelatorio("Ano")}>
              <Printer className="h-4 w-4 mr-1" />Ano
            </Button>
            <Button size="sm" variant="outline" onClick={() => printRelatorio("Mês")}>
              <Printer className="h-4 w-4 mr-1" />Mês
            </Button>
            <Button size="sm" variant="outline" onClick={() => printRelatorio("Semana")}>
              <Printer className="h-4 w-4 mr-1" />Semana
            </Button>
          </div>

          {/* Year + Month selectors */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Ano</Label>
              <Select value={String(selectedYear)} onValueChange={v => { setSelectedYear(Number(v)); setSelectedWeekIdx("all"); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-[2]">
              <Label className="text-xs">Mês</Label>
              <Select value={String(selectedMonth)} onValueChange={v => { setSelectedMonth(Number(v)); setSelectedWeekIdx("all"); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Week selector */}
          <div>
            <Label className="text-xs">Semana</Label>
            <Select value={String(selectedWeekIdx)} onValueChange={v => setSelectedWeekIdx(v === "all" ? "all" : Number(v))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a semana" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📊 Todas as Semanas</SelectItem>
                {weeks.map(w => <SelectItem key={w.index} value={String(w.index)}>{w.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cards */}
          {showCards && (
            <div className="space-y-3">
              {isAllWeeks && (
                <p className="text-xs text-muted-foreground text-center font-medium">
                  Totais de {MONTH_NAMES[selectedMonth]} {selectedYear}
                </p>
              )}

              {/* Venda */}
              <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-emerald-600" />
                    <span className="font-semibold text-sm">Venda</span>
                  </div>
                  <span className="font-bold text-lg text-emerald-700 dark:text-emerald-400">R$ {displayVendas.toFixed(2)}</span>
                </CardContent>
              </Card>

              {/* Compra */}
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-sm">Compra</span>
                  </div>
                  <span className="font-bold text-lg text-blue-700 dark:text-blue-400">R$ {displayCompras.toFixed(2)}</span>
                </CardContent>
              </Card>

              {/* Diesel */}
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Fuel className="h-5 w-5 text-amber-600" />
                      <span className="font-semibold text-sm">Diesel</span>
                    </div>
                    <span className="font-bold text-lg text-amber-700 dark:text-amber-400">R$ {displayDiesel.toFixed(2)}</span>
                  </div>
                  {!isAllWeeks && (
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Valor do diesel"
                      value={diesel}
                      onChange={e => handleDieselChange(e.target.value)}
                      className="h-8 text-sm mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Despesas */}
              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-orange-600" />
                      <span className="font-semibold text-sm">Despesas</span>
                    </div>
                    <span className="font-bold text-lg text-orange-700 dark:text-orange-400">R$ {displayDespesas.toFixed(2)}</span>
                  </div>
                  {!isAllWeeks && (
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Valor das despesas"
                      value={despesas}
                      onChange={e => handleDespesasChange(e.target.value)}
                      className="h-8 text-sm mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Lucro */}
              <Card className={`border-2 ${displayLucro >= 0 ? "border-emerald-500 bg-emerald-100 dark:bg-emerald-950/30" : "border-red-500 bg-red-100 dark:bg-red-950/30"}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className={`h-6 w-6 ${displayLucro >= 0 ? "text-emerald-700" : "text-red-700"}`} />
                    <span className="font-bold text-base">Lucro Total</span>
                  </div>
                  <span className={`font-bold text-xl ${displayLucro >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    R$ {displayLucro.toFixed(2)}
                  </span>
                </CardContent>
              </Card>

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
