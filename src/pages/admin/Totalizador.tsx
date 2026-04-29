import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { paginateQuery } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Percent, X, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Search, Package, TrendingDown, TrendingUp, Minus, History } from "lucide-react";
import { CooperfloraButton } from "@/components/CooperfloraButton";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMarkup, MARKUP_PRESETS, useCostPricesForDate } from "@/hooks/use-markup";
import { sortByUnitThenName, consolidateItems } from "@/lib/print";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/excel";
import { format } from "date-fns";

// Audit history sub-component
function AuditHistory({ produtoId, dataFiltro, motoristas }: { produtoId: string; dataFiltro: string; motoristas: { id: string; nome: string }[] }) {
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ["audit_itens_saida", produtoId, dataFiltro],
    queryFn: async () => {
      const [saidaRes, ambRes, motoristasRes] = await Promise.all([
        supabase.from("pedidos_saida").select("id, motorista_id, cliente_id, clientes(nome)").eq("data", dataFiltro),
        supabase.from("ambulantes").select("id, motorista_id").eq("data", dataFiltro),
        supabase.from("motoristas").select("id, nome, user_id"),
      ]);
      const pedidoIds = [...(saidaRes.data || []).map(p => p.id), ...(ambRes.data || []).map(a => a.id)];
      if (pedidoIds.length === 0) return [];

      const pedidoCliente = new Map<string, string>();
      (saidaRes.data || []).forEach(p => {
        pedidoCliente.set(p.id, (p.clientes as any)?.nome || "");
      });
      (ambRes.data || []).forEach(a => {
        pedidoCliente.set(a.id, "Ambulante");
      });

      // Map auth user_id -> name (motorista name or fetch from edge function)
      const userIdToName = new Map<string, string>();
      (motoristasRes.data || []).forEach(m => {
        if (m.user_id) userIdToName.set(m.user_id, m.nome);
      });

      const { data, error } = await supabase
        .from("audit_itens_saida" as any)
        .select("*")
        .eq("produto_id", produtoId)
        .in("pedido_id", pedidoIds)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Collect unknown user_ids (admins/compradores not in motoristas)
      const unknownIds = new Set<string>();
      ((data as any[]) || []).forEach((log: any) => {
        if (log.user_id && !userIdToName.has(log.user_id)) unknownIds.add(log.user_id);
      });

      // Fetch names for unknown users via edge function
      if (unknownIds.size > 0) {
        try {
          const { data: namesData } = await supabase.functions.invoke("get-user-names", {
            body: { user_ids: Array.from(unknownIds) },
          });
          if (namesData?.data) {
            Object.entries(namesData.data).forEach(([uid, name]) => {
              userIdToName.set(uid, name as string);
            });
          }
        } catch { /* fallback to "Admin" */ }
      }

      return ((data as any[]) || []).map((log: any) => {
        const userName = log.user_id ? (userIdToName.get(log.user_id) || "Admin") : "Sistema";
        const cliente = pedidoCliente.get(log.pedido_id) || "";
        return { ...log, motNome: userName, cliente };
      });
    },
  });

  const opLabel = (op: string) => {
    if (op === "INSERT") return "Adicionou";
    if (op === "UPDATE") return "Alterou";
    if (op === "DELETE") return "Removeu";
    return op;
  };

  const opColor = (op: string) => {
    if (op === "INSERT") return "text-green-600 bg-green-50 border-green-200";
    if (op === "UPDATE") return "text-yellow-700 bg-yellow-50 border-yellow-200";
    if (op === "DELETE") return "text-destructive bg-destructive/5 border-destructive/20";
    return "";
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <History className="h-4 w-4" /> Histórico de Alterações
      </h4>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : auditLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum registro de alteração encontrado para esta data.</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-auto">
          {auditLogs.map((log: any) => (
            <div key={log.id} className={cn("rounded-md border p-2.5 text-xs", opColor(log.operacao))}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">{opLabel(log.operacao)}</span>
                <span className="text-[10px] opacity-70">{format(new Date(log.created_at), "dd/MM HH:mm")}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{log.motNome}</span>
                {log.cliente && <span className="opacity-60">· {log.cliente}</span>}
              </div>
              {log.operacao === "UPDATE" && (
                <div className="mt-1 font-mono">
                  Qty: {log.qty_antes} → {log.qty_depois}
                  {log.preco_antes !== log.preco_depois && ` | Preço: ${Number(log.preco_antes).toFixed(2)} → ${Number(log.preco_depois).toFixed(2)}`}
                </div>
              )}
              {log.operacao === "INSERT" && <div className="mt-1 font-mono">Qty: {log.qty_depois}</div>}
              {log.operacao === "DELETE" && <div className="mt-1 font-mono">Qty: {log.qty_antes} (removido)</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Use shared utility
import { getNextOperationDate } from "@/lib/utils";

export default function Totalizador() {
  const [dataFiltro, setDataFiltro] = useState(() => {
    return sessionStorage.getItem("totalizador_dataFiltro") || getNextOperationDate();
  });

  const handleDataFiltroChange = (val: string) => {
    setDataFiltro(val);
    sessionStorage.setItem("totalizador_dataFiltro", val);
  };
  const [motoristaFiltro, setMotoristaFiltro] = useState<string>("todos");
  const [detailProduct, setDetailProduct] = useState<{ id: string; descricao: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showOrientationDialog, setShowOrientationDialog] = useState(false);
  const [alsoExcel, setAlsoExcel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "negative" | "positive" | "zero">("all");
  const ITEMS_PER_PAGE = 20;

  const queryClient = useQueryClient();
  const { markup, customMarkup, isCustomMarkup, handleMarkupChange, handleCustomMarkupChange, setCustomActive } = useMarkup("admin");

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("motoristas").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: entradas = [] } = useQuery({
    queryKey: ["itens_entrada", dataFiltro],
    queryFn: async () => {
      return await paginateQuery(() =>
        supabase.from("itens_entrada")
          .select("quantidade, preco_custo, produto_id, produtos(descricao, unidade), pedidos_entrada!inner(data)")
          .eq("pedidos_entrada.data", dataFiltro)
          .order("id", { ascending: true })
      );
    },
  });

  // Use the shared cost price hook (same logic as pedidos/ambulante)
  // This handles: custo_overrides > same-day entries > fallback to previous entries
  const { data: costPricesForDate = {} } = useCostPricesForDate(dataFiltro);

  // Build override map for quick lookup (custo_overrides only, for legacy compatibility)
  const custoOverrideMap = useMemo(() => {
    const m: Record<string, number> = {};
    // costPricesForDate already includes overrides, but we need a separate map
    // to know which products have explicit overrides
    return m;
  }, []);

  const { data: saidas = [] } = useQuery({
    queryKey: ["itens_saida", dataFiltro],
    queryFn: async () => {
      return await paginateQuery(() =>
        supabase.from("itens_saida")
          .select("id, pedido_id, quantidade, preco, produto_id, is_baixa_ambulante, produtos(descricao, unidade), pedidos_saida!inner(id, data, created_at, orcamento_num, observacao, desconto, tipo_pagamento, motorista_id, motoristas(nome), cliente_id, clientes(nome, cep, cidade, estado, bairro, complemento, telefone))")
          .eq("pedidos_saida.data", dataFiltro)
          .order("id", { ascending: true })
      );
    },
  });

  const { data: itensAmbulante = [] } = useQuery({
    queryKey: ["itens_ambulante_totalizador", dataFiltro],
    queryFn: async () => {
      return await paginateQuery(() =>
        supabase.from("itens_ambulante")
          .select("id, quantidade, preco, produto_id, produtos(descricao, unidade), ambulantes!inner(data, created_at, motorista_id, motoristas(nome))")
          .eq("ambulantes.data", dataFiltro)
          .order("id", { ascending: true })
      );
    },
  });

  const saidasFiltradas = motoristaFiltro === "todos"
    ? (saidas as any[])
    : (saidas as any[]).filter(i => i.pedidos_saida?.motorista_id === motoristaFiltro);

  const saidasNormais = saidasFiltradas.filter((i: any) => !i.is_baixa_ambulante);

  const ambulanteFiltrado = motoristaFiltro === "todos"
    ? (itensAmbulante as any[])
    : (itensAmbulante as any[]).filter((i: any) => i.ambulantes?.motorista_id === motoristaFiltro);

  // All saidas including baixa_ambulante (needed for correct totals since ambulante qty is now saldo)
  const todasSaidas = saidasFiltradas;

  const produtoMap = new Map<string, { descricao: string; unidade: string; entradas: number; saidas: number; precoCusto: number }>();

  (entradas as any[]).forEach(i => {
    const key = i.produto_id;
    const cur = produtoMap.get(key) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", entradas: 0, saidas: 0, precoCusto: 0 };
    cur.entradas += Number(i.quantidade);
    // Use the shared cost price (already considers overrides + fallback)
    const sharedCost = (costPricesForDate as Record<string, number>)[key];
    if (sharedCost !== undefined) {
      cur.precoCusto = sharedCost;
    } else {
      cur.precoCusto = Math.max(cur.precoCusto, Number(i.preco_custo));
    }
    produtoMap.set(key, cur);
  });

  ambulanteFiltrado.forEach((i: any) => {
    const key = i.produto_id;
    const cur = produtoMap.get(key) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", entradas: 0, saidas: 0, precoCusto: 0 };
    cur.saidas += Number(i.quantidade);
    produtoMap.set(key, cur);
  });

  todasSaidas.forEach((i: any) => {
    const key = i.produto_id;
    const cur = produtoMap.get(key) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", entradas: 0, saidas: 0, precoCusto: 0 };
    cur.saidas += Number(i.quantidade);
    produtoMap.set(key, cur);
  });

  // Apply shared cost prices to ALL products in the map (handles overrides + fallback)
  for (const [pid, cost] of Object.entries(costPricesForDate as Record<string, number>)) {
    const cur = produtoMap.get(pid);
    if (cur) {
      cur.precoCusto = cost;
    }
  }

  const rows = sortByUnitThenName(
    Array.from(produtoMap.entries()).map(([id, v]) => ({
      id,
      ...v,
      saldo: v.entradas - v.saidas,
      precoVenda: v.precoCusto > 0 ? Math.round(v.precoCusto * (1 + markup / 100) * 100) / 100 : 0,
    })),
    r => r.unidade,
    r => r.descricao
  );

  const motoristaLabel = motoristaFiltro === "todos" ? "" : ` - Motorista: ${motoristas.find(m => m.id === motoristaFiltro)?.nome || ""}`;

  const allSaidasForPrint = [
    ...ambulanteFiltrado.map((i: any) => ({
      ...i,
      preco: i.preco,
      pedidos_saida: {
        motorista_id: i.ambulantes?.motorista_id,
        motoristas: i.ambulantes?.motoristas,
        cliente_id: null,
        clientes: null,
      },
      _isAmbulante: true,
    })),
    ...todasSaidas,
  ];

  const logoUrl = `${window.location.origin}/logo-jp-flores.png`;
  const dataFormatada = dataFiltro.split("-").reverse().join("/");

  const printStyles = `
    body{font-family:Arial,Helvetica,sans-serif;margin:15px;font-size:11px;color:#222}
    .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:6px}
    .header img{width:55px;height:55px;object-fit:contain}
    .header-info{line-height:1.3}
    .header-info .empresa{font-size:13px;font-weight:bold}
    .header-info .cnpj{font-size:10px;color:#555}
    .header-info .data{font-size:10px;color:#555}
    .orcamento-num{font-size:14px;font-weight:600;text-align:right;margin-bottom:4px;color:#222}
    .cliente-nome{font-size:16px;font-weight:bold;margin:6px 0 2px}
    .motorista-nome{font-size:12px;font-weight:600;color:#444;margin-bottom:2px}
    .endereco{font-size:10px;color:#555;margin-bottom:6px}
    table{border-collapse:collapse;width:100%;margin-bottom:6px}
    th,td{border:1px solid #999;padding:2px 6px;text-align:left;font-size:11px}
    th{background:#e8e8e8;font-size:10px;font-weight:bold}
    .col-qty{width:30px;text-align:center}
    .col-price{width:65px;text-align:right}
    .col-total{width:65px;text-align:right}
    .col-un-rom{width:25px;text-align:center}
    .neg{color:red}
    .total-row{font-weight:bold;text-align:right;font-size:12px;margin-top:2px}
    .page-break{page-break-before:always}
    h2{font-size:14px;margin:0 0 8px}
    @media print{body{margin:10px}}
  `;

  const headerHtml = (extra?: string) => `
    <div class="header">
      <img src="${logoUrl}" alt="Logo"/>
      <div class="header-info">
        <div class="empresa">JP Flores LTDA.</div>
        <div class="cnpj">CNPJ: 16.905.456/0001-30</div>
        <div class="data">Data: ${dataFormatada}</div>
      </div>
    </div>
    ${extra || ""}
  `;

  const openPrintWindow = (title: string, bodyContent: string) => {
    const html = `<html><head><title>${title}</title><style>${printStyles}</style></head><body>${bodyContent}</body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
    w?.print();
  };

  const printListaMotorista = (orientation: "portrait" | "landscape") => {
    const FIXED_ORDER = ["vantuir", "ulysses", "rodrigo", "alex", "gabriel", "tael", "jailson"];
    const normalizeMotoristaOrderName = (name: string) =>
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .split(/\s+/)[0] || "";
    const motoristaMap2 = new Map<string, Map<string, number>>();
    const motoristaNomes = new Map<string, string>();
    const produtoNomes = new Map<string, string>();
    const produtoUnidades = new Map<string, string>();
    const produtoSaldo = new Map<string, number>();
    const produtoCusto = new Map<string, number>();

    // Collect all products from rows (includes entry-only items)
    rows.forEach(r => {
      produtoNomes.set(r.id, r.descricao);
      produtoUnidades.set(r.id, r.unidade);
      produtoSaldo.set(r.id, r.saldo);
      produtoCusto.set(r.id, r.precoCusto ?? 0);
    });

    allSaidasForPrint.forEach((i: any) => {
      const motId = i.pedidos_saida?.motorista_id || i.ambulantes?.motorista_id;
      const motNome = i.pedidos_saida?.motoristas?.nome || i.ambulantes?.motoristas?.nome || "?";
      const prodDesc = i.produtos?.descricao || "?";
      motoristaNomes.set(motId, motNome);
      produtoNomes.set(i.produto_id, prodDesc);
      produtoUnidades.set(i.produto_id, i.produtos?.unidade || "UN");
      if (!motoristaMap2.has(i.produto_id)) motoristaMap2.set(i.produto_id, new Map());
      const pm = motoristaMap2.get(i.produto_id)!;
      pm.set(motId, (pm.get(motId) || 0) + Number(i.quantidade));
    });

    // Sort motoristas: fixed order first, then alphabetical, Saldo is a column not a motorista
    const motIds = Array.from(motoristaNomes.keys()).sort((a, b) => {
      const na = normalizeMotoristaOrderName(motoristaNomes.get(a) || "");
      const nb = normalizeMotoristaOrderName(motoristaNomes.get(b) || "");
      const ia = FIXED_ORDER.indexOf(na);
      const ib = FIXED_ORDER.indexOf(nb);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return na.localeCompare(nb);
    });

    // All product IDs (union of saidas + rows for entry-only)
    const allProdIds = new Set([...motoristaMap2.keys(), ...rows.map(r => r.id)]);
    const sortedProdIds = sortByUnitThenName(
      Array.from(allProdIds),
      id => produtoUnidades.get(id) || "UN",
      id => produtoNomes.get(id) || ""
    );

    const numMot = motIds.length;
    // Date formatting by extenso
    const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const [yyyy, mm, dd] = dataFiltro.split("-");
    const dateObj = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    const diaSemana = dias[dateObj.getDay()];
    const titulo = `JP Flores, ${Number(dd)} de ${meses[Number(mm) - 1]} de ${yyyy}, ${diaSemana}`;

    const colW = numMot > 0 ? Math.floor(90 / (numMot + 1)) : 90; // +1 for Produto col approx
    const listaStyles = `
      @page{size:${orientation}}
      body{font-family:Arial,Helvetica,sans-serif;margin:10px;font-size:13px;color:#222}
      h2{font-size:15px;margin:0 0 10px;text-align:center}
      table{border-collapse:collapse;width:100%;table-layout:auto}
      th,td{border:1px solid #999;padding:4px 5px;text-align:center;font-size:12px;line-height:1.4}
      th{background:#e8e8e8;font-size:11px;font-weight:bold}
      tr.zebra{background:#f2f2f2}
      .col-prod{text-align:left;white-space:nowrap;width:1%;padding-right:10px}
      .col-custo{white-space:nowrap;width:1%}
      .col-un{white-space:nowrap;width:1%}
      .col-saldo{white-space:nowrap;width:1%}
      .neg{color:red}
      @media print{body{margin:5px}tr.zebra{background:#f2f2f2 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    `;

    const showSaldo = motoristaFiltro === "todos";
    const showVenda = motoristaFiltro !== "todos";
    const motColWidth = numMot > 0 ? ((100 - 3) / numMot).toFixed(2) : "10";
    let body = `<h2>${titulo}</h2>`;
    body += `<table><colgroup><col class="col-prod"/><col class="col-un"/><col class="col-custo"/>${showVenda ? '<col class="col-custo"/>' : ''}${motIds.map(() => `<col style="width:${motColWidth}%"/>`).join("")}${showSaldo ? '<col class="col-saldo"/>' : ''}</colgroup>`;
    body += `<thead><tr><th class="col-prod">Produto</th><th class="col-un">UN</th><th class="col-custo">Custo</th>${showVenda ? '<th class="col-custo">Venda</th>' : ''}${motIds.map(id => `<th>${motoristaNomes.get(id)}</th>`).join("")}${showSaldo ? '<th class="col-saldo">Saldo</th>' : ''}</tr></thead><tbody>`;
    let rowIdx = 0;
    sortedProdIds.forEach(prodId => {
      const mots = motoristaMap2.get(prodId);
      const saldo = produtoSaldo.get(prodId) ?? 0;
      const custo = produtoCusto.get(prodId) ?? 0;
      const precoVenda = custo > 0 ? Math.round(custo * (1 + markup / 100) * 100) / 100 : 0;
      const un = produtoUnidades.get(prodId) || "UN";
      if (motIds.length === 1) {
        const qty = mots?.get(motIds[0]) || 0;
        if (qty === 0) return;
      }
      const zebraClass = rowIdx % 2 === 1 ? ' class="zebra"' : '';
      rowIdx++;
      body += `<tr${zebraClass}><td class="col-prod">${produtoNomes.get(prodId) || ""}</td><td class="col-un">${un}</td><td class="col-custo">${custo > 0 ? `R$ ${custo.toFixed(2)}` : "R$ 0,00"}</td>${showVenda ? `<td class="col-custo">${precoVenda > 0 ? `R$ ${precoVenda.toFixed(2)}` : "R$ 0,00"}</td>` : ''}${motIds.map(id => `<td>${mots?.get(id) || ""}</td>`).join("")}${showSaldo ? `<td class="col-saldo ${saldo < 0 ? "neg" : ""}">${saldo}</td>` : ''}</tr>`;
    });
    body += `</tbody></table>`;

    const html = `<html><head><title>Lista por Motorista</title><style>${listaStyles}</style></head><body>${body}</body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
    w?.print();

    if (alsoExcel) {
      const excelColumns: { header: string; key: string; width?: number; align?: "left" | "center" | "right"; format?: "currency" | "number" }[] = [
        { header: "Produto", key: "produto", width: 30 },
        { header: "UN", key: "unidade", width: 8, align: "center" },
        { header: "Custo", key: "custo", width: 12, align: "right", format: "currency" },
        ...(showVenda ? [{ header: "Venda", key: "venda", width: 12, align: "right" as const, format: "currency" as const }] : []),
        ...motIds.map(id => ({ header: motoristaNomes.get(id) || "", key: `mot_${id}`, width: 10, align: "center" as const })),
        ...(showSaldo ? [{ header: "Saldo", key: "saldo", width: 8, align: "center" as const }] : []),
      ];
      const excelRows = sortedProdIds.map(prodId => {
        const mots = motoristaMap2.get(prodId);
        const custo = produtoCusto.get(prodId) ?? 0;
        const row: Record<string, any> = {
          produto: produtoNomes.get(prodId) || "",
          unidade: produtoUnidades.get(prodId) || "",
          custo,
          venda: custo > 0 ? Math.round(custo * (1 + markup / 100) * 100) / 100 : 0,
          saldo: produtoSaldo.get(prodId) ?? 0,
        };
        motIds.forEach(id => { row[`mot_${id}`] = mots?.get(id) || ""; });
        return row;
      });
      exportToExcel({
        filename: `lista_motorista_${dataFiltro}`,
        sheetName: "Lista",
        title: titulo,
        columns: excelColumns,
        rows: excelRows,
        highlightNegative: "saldo",
        skipCompanyHeader: true,
      });
    }
  };

  const printSaldo = (mode: "all" | "negatives" | "positives" = "all") => {
    let filtered = rows.filter(r => r.saldo !== 0);
    if (mode === "negatives") filtered = filtered.filter(r => r.saldo < 0);
    if (mode === "positives") filtered = filtered.filter(r => r.saldo > 0);

    const modeLabel = mode === "negatives" ? " (Negativos)" : mode === "positives" ? " (Positivos)" : "";
    let body = `<div style="text-align:center;margin-bottom:10px"><strong>JP Flores</strong> — ${dataFormatada}</div>`;
    body += `<h2 style="text-align:center;font-size:15px;margin:0 0 10px">Saldo${motoristaLabel}${modeLabel}</h2>`;
    body += `<table><thead><tr><th>Produto</th><th>UN</th><th>Saldo</th><th>Preço Venda</th></tr></thead><tbody>`;
    filtered.forEach(r => {
      body += `<tr><td>${r.descricao}</td><td>${r.unidade}</td><td class="${r.saldo < 0 ? "neg" : ""}">${r.saldo}</td><td>R$ ${r.precoVenda.toFixed(2)}</td></tr>`;
    });
    body += `</tbody></table>`;
    openPrintWindow("Saldo", body);

    if (alsoExcel) {
      exportToExcel({
        filename: `saldo_${mode}_${dataFiltro}`,
        sheetName: "Saldo",
        title: `Saldo${motoristaLabel}${modeLabel}`,
        info: [`JP Flores — ${dataFormatada}`],
        columns: [
          { header: "Produto", key: "descricao", width: 30 },
          { header: "UN", key: "unidade", width: 8, align: "center" },
          { header: "Saldo", key: "saldo", width: 10, align: "center" },
          { header: "Preço Venda", key: "precoVenda", width: 14, format: "currency", align: "right" },
        ],
        rows: filtered,
        highlightNegative: "saldo",
        skipCompanyHeader: true,
      });
    }
  };

  const printRomaneio = () => {
    // Group by pedido_id so each order prints on its own page
    const pedidoMap2 = new Map<string, { motNome: string; cliente: any; orcamentoNum: number; observacao: string; desconto: number; tipoPagamento: string; itens: any[] }>();

    saidasFiltradas.forEach((i: any) => {
      const pedidoId = i.pedido_id;
      const motNome = i.pedidos_saida?.motoristas?.nome || "?";
      const cliente = i.pedidos_saida?.clientes;
      const orcamentoNum = i.pedidos_saida?.orcamento_num || 0;
      const observacao = i.pedidos_saida?.observacao || "";
      const desconto = Number(i.pedidos_saida?.desconto) || 0;
      const tipoPagamento = i.pedidos_saida?.tipo_pagamento || "";

      if (!pedidoMap2.has(pedidoId)) {
        pedidoMap2.set(pedidoId, { motNome, cliente, orcamentoNum, observacao, desconto, tipoPagamento, itens: [] });
      }
      pedidoMap2.get(pedidoId)!.itens.push(i);
    });

    let body = "";
    let first = true;
    pedidoMap2.forEach(({ motNome, cliente, orcamentoNum, observacao, desconto, tipoPagamento, itens }) => {
      if (!first) body += `<div class="page-break"></div>`;
      first = false;

      let enderecoHtml = "";
      if (cliente?.bairro) enderecoHtml += `${cliente.bairro}, `;
      if (cliente?.cidade) enderecoHtml += `${cliente.cidade}`;
      if (cliente?.estado) enderecoHtml += ` - ${cliente.estado}`;
      if (cliente?.cep) enderecoHtml += ` | CEP: ${cliente.cep}`;
      if (cliente?.complemento) enderecoHtml += ` | ${cliente.complemento}`;
      if (cliente?.telefone) enderecoHtml += ` | Tel: ${cliente.telefone}`;

      const num = orcamentoNum || Math.floor(10000 + Math.random() * 90000);
      const pagamentoHtml = tipoPagamento ? `<div style="font-size:11px;font-weight:600;color:#333;margin-bottom:4px">Pagamento: ${tipoPagamento}</div>` : "";
      body += headerHtml(`
        <div class="orcamento-num">Orçamento Nº ${num}</div>
        <div class="cliente-nome">${cliente?.nome || ""}</div>
        <div class="motorista-nome">Motorista: ${motNome}</div>
        ${enderecoHtml ? `<div class="endereco">${enderecoHtml}</div>` : ""}
        ${pagamentoHtml}
      `);

      const consolidated = consolidateItems(itens, "preco");
      const sortedItens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");
      body += `<table><thead><tr><th class="col-qty">QTD</th><th>Produto</th><th class="col-un-rom">UN</th><th class="col-price">Preço</th><th class="col-total">Total</th></tr></thead><tbody>`;
      let total = 0;
      sortedItens.forEach(i => {
        const t = Number(i.quantidade) * Number(i.preco);
        total += t;
        const un = (i as any).produtos?.unidade || "UN";
        body += `<tr><td class="col-qty">${i.quantidade}</td><td>${i.produtos?.descricao || ""}</td><td class="col-un-rom">${un}</td><td class="col-price">R$ ${Number(i.preco).toFixed(2)}</td><td class="col-total">R$ ${t.toFixed(2)}</td></tr>`;
      });
      body += `</tbody></table>`;

      const obsHtml = observacao.trim() ? `<div style="margin-top:6px;font-size:11px;color:#333"><strong>Obs.:</strong> ${observacao.trim()}</div>` : "";

      let totalHtml = "";
      if (desconto > 0) {
        const descontoValor = total * (desconto / 100);
        const totalFinal = total - descontoValor;
        totalHtml = `<div class="total-row">Subtotal: R$ ${total.toFixed(2)}</div>`;
        totalHtml += `<div class="total-row" style="font-weight:normal;font-size:11px">Desconto (${desconto}%): -R$ ${descontoValor.toFixed(2)}</div>`;
        totalHtml += `<div class="total-row">Total: R$ ${totalFinal.toFixed(2)}</div>`;
      } else {
        totalHtml = `<div class="total-row">Total: R$ ${total.toFixed(2)}</div>`;
      }

      body += `${obsHtml}${totalHtml}`;
    });

    openPrintWindow("Romaneio", body);
  };

  const motoristaOptions = [
    { value: "todos", label: "Todos os Motoristas" },
    ...motoristas.map(m => ({ value: m.id, label: m.nome })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Totalizador Geral</h1>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>Data:</Label>
            <DatePicker value={dataFiltro} onChange={handleDataFiltroChange} className="w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <Label>Motorista:</Label>
            <div className="w-56">
              <SearchableSelect
                options={motoristaOptions}
                value={motoristaFiltro}
                onValueChange={setMotoristaFiltro}
                placeholder="Filtrar motorista..."
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["itens_entrada", dataFiltro] });
              queryClient.invalidateQueries({ queryKey: ["itens_saida", dataFiltro] });
              queryClient.invalidateQueries({ queryKey: ["itens_ambulante_totalizador", dataFiltro] });
              queryClient.invalidateQueries({ queryKey: ["cost-prices-for-date", dataFiltro] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>


      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Button variant="outline" onClick={() => setShowOrientationDialog(true)}><Printer className="mr-2 h-4 w-4" />Imprimir Lista</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline"><Printer className="mr-2 h-4 w-4" />Imprimir Saldo<ChevronDown className="ml-2 h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => printSaldo("all")}>Todos (positivos e negativos)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => printSaldo("negatives")}>Somente negativos</DropdownMenuItem>
            <DropdownMenuItem onClick={() => printSaldo("positives")}>Somente positivos</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={printRomaneio}><Printer className="mr-2 h-4 w-4" />Imprimir Pedidos (A4)</Button>
        <label htmlFor="tot-excel" className="inline-flex items-center gap-1.5 cursor-pointer ml-1">
          <Checkbox id="tot-excel" checked={alsoExcel} onCheckedChange={v => setAlsoExcel(!!v)} />
          <span className="text-xs font-medium">Excel</span>
        </label>
      </div>

      {/* Summary cards */}
      {(() => {
        const totalProdutos = rows.length;
        const negativos = rows.filter(r => r.saldo < 0).length;
        const positivos = rows.filter(r => r.saldo > 0).length;
        const zerados = rows.filter(r => r.saldo === 0).length;
        return (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button onClick={() => { setStatusFilter("all"); setCurrentPage(1); }} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all", statusFilter === "all" ? "ring-1 ring-primary bg-primary/10 border-primary text-primary" : "hover:bg-muted/50 text-muted-foreground")}>
              <Package className="h-3 w-3" /> Total <span className="font-bold">{totalProdutos}</span>
            </button>
            <button onClick={() => { setStatusFilter("negative"); setCurrentPage(1); }} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all", statusFilter === "negative" ? "ring-1 ring-destructive bg-destructive/10 border-destructive text-destructive" : "hover:bg-muted/50 text-destructive/70")}>
              <TrendingDown className="h-3 w-3" /> Faltando <span className="font-bold">{negativos}</span>
            </button>
            <button onClick={() => { setStatusFilter("positive"); setCurrentPage(1); }} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all", statusFilter === "positive" ? "ring-1 ring-primary bg-primary/10 border-primary text-primary" : "hover:bg-muted/50 text-primary/70")}>
              <TrendingUp className="h-3 w-3" /> Sobrando <span className="font-bold">{positivos}</span>
            </button>
            <button onClick={() => { setStatusFilter("zero"); setCurrentPage(1); }} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all", statusFilter === "zero" ? "ring-1 ring-border bg-muted/50 text-foreground" : "hover:bg-muted/50 text-muted-foreground")}>
              <Minus className="h-3 w-3" /> Zerado <span className="font-bold">{zerados}</span>
            </button>
            <div className="relative ml-auto flex-shrink-0 w-40">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-7 h-7 text-xs"
              />
            </div>
          </div>
        );
      })()}

      {/* Filtered + paginated table */}
      {(() => {
        const filtered = rows.filter(r => {
          const matchSearch = searchTerm === "" || r.descricao.toLowerCase().includes(searchTerm.toLowerCase());
          const matchStatus = statusFilter === "all" ||
            (statusFilter === "negative" && r.saldo < 0) ||
            (statusFilter === "positive" && r.saldo > 0) ||
            (statusFilter === "zero" && r.saldo === 0);
          return matchSearch && matchStatus;
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
        const page = Math.min(currentPage, totalPages);
        const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

        return (
          <>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Produto</TableHead>
                    <TableHead className="w-[3.5rem] font-semibold">UN</TableHead>
                    <TableHead className="w-[4.5rem] text-right font-semibold">Entradas</TableHead>
                    <TableHead className="w-[4.5rem] text-right font-semibold">Saídas</TableHead>
                    <TableHead className="w-[5rem] text-right font-semibold">Saldo</TableHead>
                    <TableHead className="w-[6.5rem] text-right font-semibold">Preço Venda</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(r => {
                    const saldoColor = r.saldo < 0 ? "text-destructive" : r.saldo > 0 ? "text-primary" : "text-muted-foreground";
                    const saldoBg = r.saldo < 0 ? "bg-destructive/5" : r.saldo > 0 ? "bg-primary/5" : "";
                    return (
                      <TableRow
                        key={r.id}
                        className={cn("cursor-pointer transition-colors hover:bg-primary/35 hover:shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.45)]", saldoBg)}
                        onClick={() => { setDetailProduct({ id: r.id, descricao: r.descricao }); setShowHistory(false); }}
                      >
                        <TableCell className="font-medium">{r.descricao}</TableCell>
                        <TableCell className="text-muted-foreground">{r.unidade}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.entradas || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.saidas || "-"}</TableCell>
                        <TableCell className={cn("text-right font-bold tabular-nums", saldoColor)}>
                          {r.saldo < 0 ? r.saldo : r.saldo > 0 ? `+${r.saldo}` : "0"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.precoVenda > 0 ? `R$ ${r.precoVenda.toFixed(2)}` : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {paginated.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "Nenhum produto encontrado" : "Nenhum movimento na data selecionada"}
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  {filtered.length} produto{filtered.length !== 1 ? "s" : ""} · Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("ellipsis");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "ellipsis" ? (
                        <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === page ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Floating detail panel */}
      {detailProduct && (() => {
        const detailRows: { quantidade: number; descricao: string; cliente: string; motorista: string; createdAt: string }[] = [];

        // Saídas normais (não baixa ambulante)
        saidasNormais.forEach((i: any) => {
          if (i.produto_id === detailProduct.id) {
            detailRows.push({
              quantidade: Number(i.quantidade),
              descricao: i.produtos?.descricao || "",
              cliente: i.pedidos_saida?.clientes?.nome || "-",
              motorista: i.pedidos_saida?.motoristas?.nome || "-",
              createdAt: i.pedidos_saida?.created_at || "",
            });
          }
        });

        // Saídas de baixa ambulante (mostrar como venda ao cliente)
        const baixasAmbulante = saidasFiltradas.filter((i: any) => i.is_baixa_ambulante && i.produto_id === detailProduct.id);
        baixasAmbulante.forEach((i: any) => {
          detailRows.push({
            quantidade: Number(i.quantidade),
            descricao: i.produtos?.descricao || "",
            cliente: (i.pedidos_saida?.clientes?.nome || "-") + " (Baixa Amb.)",
            motorista: i.pedidos_saida?.motoristas?.nome || "-",
            createdAt: i.pedidos_saida?.created_at || "",
          });
        });

        // Ambulante: quantidade já é o saldo líquido (trigger desconta baixas automaticamente)
        ambulanteFiltrado.forEach((i: any) => {
          if (i.produto_id === detailProduct.id) {
            const qtd = Number(i.quantidade);
            if (qtd > 0) {
              detailRows.push({
                quantidade: qtd,
                descricao: i.produtos?.descricao || "",
                cliente: "Ambulante (saldo)",
                motorista: i.ambulantes?.motoristas?.nome || "-",
                createdAt: i.ambulantes?.created_at || "",
              });
            }
          }
        });

        // Ordenar por data de criação (mais antigos primeiro)
        detailRows.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetailProduct(null)}>
            <div className="bg-background border rounded-lg shadow-xl p-6 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Detalhes: {detailProduct.descricao}</h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant={showHistory ? "default" : "outline"}
                    size="icon"
                    title="Ver Histórico de Alterações"
                    onClick={() => setShowHistory(h => !h)}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDetailProduct(null)}><X className="h-4 w-4" /></Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>QTD</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead className="text-right">Digitado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhuma saída para este produto</TableCell></TableRow>
                  ) : detailRows.map((d, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{d.quantidade}</TableCell>
                      <TableCell>{d.cliente}</TableCell>
                      <TableCell>{d.motorista}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {d.createdAt ? format(new Date(d.createdAt), "dd/MM HH:mm") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {showHistory && <AuditHistory produtoId={detailProduct.id} dataFiltro={dataFiltro} motoristas={motoristas} />}
            </div>
          </div>
        );
      })()}
      <Dialog open={showOrientationDialog} onOpenChange={setShowOrientationDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Orientação da página</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button onClick={() => { setShowOrientationDialog(false); printListaMotorista("portrait"); }}>Retrato</Button>
            <Button variant="outline" onClick={() => { setShowOrientationDialog(false); printListaMotorista("landscape"); }}>Paisagem</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
