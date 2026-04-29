import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DatePicker } from "@/components/DatePicker";
import { toast } from "sonner";
import { RotateCcw, Save, Printer, Pencil, Trash2, ArrowLeft, Plus, BadgePercent, Archive } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { exportToExcel } from "@/lib/excel";
import { openHtmlPrint } from "@/lib/print";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface MercRow {
  produto_id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  custoAtivo: number;
  custoMin: number;
  custoMedio: number;
  lotes: { quantidade: number; preco: number; fornecedor: string }[];
}

interface SavedAcerto {
  id: string;
  motorista_id: string;
  data: string;
  custo_total: number;
  margem_percent: number;
  total_cobrar: number;
  created_at: string;
  updated_at: string;
  archived?: boolean;
}

export default function AcertoMotorista() {
  const queryClient = useQueryClient();

  // View state
  const [view, setView] = useState<"list" | "edit">("list");
  const [activeAcertoId, setActiveAcertoId] = useState<string | null>(null);

  // Creation form
  const [createMotoristaId, setCreateMotoristaId] = useState("");
  const [createDataStr, setCreateDataStr] = useState("");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Edit state
  const [motoristaId, setMotoristaId] = useState("");
  const [dataStr, setDataStr] = useState("");
  const [overrides, setOverrides] = useState<Record<string, { qty?: number; custo?: number }>>({});
  const [extraItems, setExtraItems] = useState<{ produto_id: string; quantidade: number }[]>([]);
  // Saved items from itens_acerto_motorista — source of truth for existing acertos
  const [savedAcertoItems, setSavedAcertoItems] = useState<{ produto_id: string; quantidade: number; custo_ativo: number }[]>([]);
  const [detailProd, setDetailProd] = useState<MercRow | null>(null);

  // Add item form
  const [addProdutoId, setAddProdutoId] = useState("");
  const [addQty, setAddQty] = useState("");

  // Print dialog state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [alsoExcel, setAlsoExcel] = useState(false);

  // Discount state
  const [descontoValor, setDescontoValor] = useState(0);
  const [descontoObs, setDescontoObs] = useState("");
  const [showDescontoDialog, setShowDescontoDialog] = useState(false);
  const [descontoInputValor, setDescontoInputValor] = useState("");
  const [descontoInputObs, setDescontoInputObs] = useState("");

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("*").order("nome");
      return data || [];
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => await fetchProdutosUpTo(5000),
  });

  // Fetch saved acertos
  const { data: savedAcertos = [] } = useQuery({
    queryKey: ["acertos-historico"],
    queryFn: async () => {
      const { data } = await supabase
        .from("acertos_motorista")
        .select("*")
        .order("data", { ascending: false });
      return (data || []) as SavedAcerto[];
    },
  });

  // Auto-archive acertos older than 5 days
  useEffect(() => {
    if (savedAcertos.length === 0) return;
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const cutoff = fiveDaysAgo.toISOString().slice(0, 10);
    const toArchive = savedAcertos.filter(a => !a.archived && a.data < cutoff);
    if (toArchive.length === 0) return;
    (async () => {
      const ids = toArchive.map(a => a.id);
      await supabase.from("acertos_motorista").update({ archived: true } as any).in("id", ids);
      queryClient.invalidateQueries({ queryKey: ["acertos-historico"] });
    })();
  }, [savedAcertos, queryClient]);

  const filteredAcertos = useMemo(() => {
    if (showArchived) return savedAcertos;
    return savedAcertos.filter(a => !a.archived);
  }, [savedAcertos, showArchived]);

  // ---- Edit view queries ----


  // Cost data from entries (only needed for adding NEW items to get their cost)
  const { data: costData = [] } = useQuery({
    queryKey: ["acerto-custos-v2", dataStr],
    queryFn: async () => {
      if (!dataStr) return [];
      const { data } = await supabase
        .from("itens_entrada")
        .select("produto_id, preco_custo, quantidade, pedidos_entrada!inner(data, fornecedores(nome))")
        .eq("pedidos_entrada.data", dataStr);
      return data || [];
    },
    enabled: view === "edit" && !!dataStr,
  });

  // Custo overrides
  const { data: acertoCustoOverrides = [] } = useQuery({
    queryKey: ["acerto-custo-overrides", dataStr],
    queryFn: async () => {
      if (!dataStr) return [];
      const { data, error } = await supabase.from("custo_overrides")
        .select("produto_id, preco_custo")
        .eq("data", dataStr);
      if (error) throw error;
      return data || [];
    },
    enabled: view === "edit" && !!dataStr,
  });

  const acertoOverrideMap = useMemo(() => {
    const m: Record<string, number> = {};
    (acertoCustoOverrides as any[]).forEach((o: any) => { m[o.produto_id] = Number(o.preco_custo); });
    return m;
  }, [acertoCustoOverrides]);

  const costStats = useMemo(() => {
    const map: Record<string, { preco: number; quantidade: number }[]> = {};
    (costData as any[]).forEach((item) => {
      const pid = item.produto_id;
      if (!map[pid]) map[pid] = [];
      map[pid].push({ preco: Number(item.preco_custo), quantidade: Number(item.quantidade) });
    });
    const result: Record<string, { max: number; min: number; avg: number }> = {};
    Object.entries(map).forEach(([pid, lotes]) => {
      if (acertoOverrideMap[pid] !== undefined) {
        const fixedPrice = acertoOverrideMap[pid];
        result[pid] = { max: fixedPrice, min: fixedPrice, avg: fixedPrice };
        return;
      }
      const prices = lotes.map(l => l.preco);
      const sorted = [...prices].sort((a, b) => a - b);
      const totalQty = lotes.reduce((s, l) => s + l.quantidade, 0);
      const avgPonderada = totalQty > 0
        ? lotes.reduce((s, l) => s + l.preco * l.quantidade, 0) / totalQty
        : prices.reduce((s, v) => s + v, 0) / prices.length;
      result[pid] = {
        max: sorted[sorted.length - 1],
        min: sorted[0],
        avg: avgPonderada,
      };
    });
    return result;
  }, [costData, acertoOverrideMap]);

  // Build lotes map from costData for detail view
  const lotesMap = useMemo(() => {
    const map: Record<string, { quantidade: number; preco: number; fornecedor: string }[]> = {};
    (costData as any[]).forEach((item) => {
      const pid = item.produto_id;
      if (!map[pid]) map[pid] = [];
      const fornecedorNome = item.pedidos_entrada?.fornecedores?.nome || "—";
      map[pid].push({
        quantidade: Number(item.quantidade),
        preco: Number(item.preco_custo),
        fornecedor: fornecedorNome,
      });
    });
    return map;
  }, [costData]);

  // Build rows from SAVED acerto items (source of truth) + extra items added manually
  const rows: MercRow[] = useMemo(() => {
    const grouped: Record<string, { qty: number; custo: number }> = {};

    // Use saved acerto items as the base (immutable snapshot)
    savedAcertoItems.forEach((item) => {
      const pid = item.produto_id;
      if (!grouped[pid]) grouped[pid] = { qty: 0, custo: item.custo_ativo };
      grouped[pid].qty += Number(item.quantidade);
      // Keep the saved cost
      grouped[pid].custo = item.custo_ativo;
    });

    // Extra manually added items (during this edit session)
    extraItems.forEach((item) => {
      const pid = item.produto_id;
      if (!grouped[pid]) {
        // For new items, try to get cost from costStats or default to 0
        const stats = costStats[pid];
        grouped[pid] = { qty: 0, custo: stats?.max || 0 };
      }
      grouped[pid].qty += item.quantidade;
    });

    if (Object.keys(grouped).length === 0) return [];

    return Object.entries(grouped).map(([pid, g]) => {
      const prod = produtos.find((p: any) => p.id === pid);
      const lotes = lotesMap[pid] || [];
      // If no lotes from costData, show a single synthetic lote with the saved cost
      const displayLotes = lotes.length > 0 ? lotes : (g.custo > 0 ? [{ quantidade: g.qty, preco: g.custo, fornecedor: "Custo salvo" }] : []);
      const stats = costStats[pid];
      return {
        produto_id: pid,
        descricao: prod?.descricao || pid,
        unidade: prod?.unidade || "UN",
        quantidade: g.qty,
        custoAtivo: g.custo,
        custoMin: stats?.min ?? g.custo,
        custoMedio: stats?.avg ?? g.custo,
        lotes: displayLotes,
      };
    }).sort((a, b) => {
      const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
      const ua = UNIT_ORDER[a.unidade] ?? 99;
      const ub = UNIT_ORDER[b.unidade] ?? 99;
      if (ua !== ub) return ua - ub;
      return a.descricao.localeCompare(b.descricao, "pt-BR");
    });
  }, [savedAcertoItems, extraItems, produtos, costStats, lotesMap]);

  const getQty = (r: MercRow) => overrides[r.produto_id]?.qty ?? r.quantidade;
  const getCusto = (r: MercRow) => overrides[r.produto_id]?.custo ?? r.custoAtivo;

  const custoTotal = rows.reduce((s, r) => s + getQty(r) * getCusto(r), 0);
  const margem = custoTotal * 0.32;
  const totalAntesDesconto = custoTotal + margem;
  const totalCobrar = totalAntesDesconto - descontoValor;

  // --- Auto-save after 10s of inactivity ---
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasEditedSinceLastSave = useRef(false);

  const doAutoSave = useCallback(async () => {
    if (!activeAcertoId || rows.length === 0) return;
    const activeRows = rows.filter((r) => getQty(r) > 0);
    if (activeRows.length === 0) return;

    const finalCusto = activeRows.reduce((s, r) => s + getQty(r) * getCusto(r), 0);
    const finalTotal = finalCusto * 1.32 - descontoValor;

    try {
      await supabase
        .from("acertos_motorista")
        .update({ custo_total: finalCusto, margem_percent: 32, total_cobrar: finalTotal, desconto_valor: descontoValor, desconto_obs: descontoObs } as any)
        .eq("id", activeAcertoId);

      await supabase.from("itens_acerto_motorista").delete().eq("acerto_id", activeAcertoId);

      const items = activeRows.map((r) => ({
        acerto_id: activeAcertoId,
        produto_id: r.produto_id,
        quantidade: getQty(r),
        custo_ativo: getCusto(r),
      }));
      await supabase.from("itens_acerto_motorista").insert(items);

      queryClient.invalidateQueries({ queryKey: ["acertos-historico"] });
      toast.success("Salvo automaticamente.");
    } catch (err: any) {
      toast.error("Erro ao salvar automaticamente: " + (err.message || ""));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAcertoId, rows, overrides, extraItems]);

  // Reset timer on every edit
  useEffect(() => {
    if (view !== "edit" || !activeAcertoId) return;
    // Skip the initial load (no edits yet)
    if (!hasEditedSinceLastSave.current) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doAutoSave();
      hasEditedSinceLastSave.current = false;
    }, 10000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [overrides, extraItems, view, activeAcertoId, doAutoSave]);

  // Cleanup on unmount or leaving edit view
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  const handleQtyChange = (pid: string, val: string) => {
    const num = val === "" ? undefined : Number(val);
    hasEditedSinceLastSave.current = true;
    setOverrides((prev) => ({ ...prev, [pid]: { ...prev[pid], qty: num } }));
  };

  const handleCustoChange = (pid: string, val: string) => {
    const num = val === "" ? undefined : Number(val.replace(",", "."));
    hasEditedSinceLastSave.current = true;
    setOverrides((prev) => ({ ...prev, [pid]: { ...prev[pid], custo: num } }));
  };

  const handleReset = () => {
    setOverrides({});
    setExtraItems([]);
    toast.success("Dados resetados para o original.");
  };

  const getMotNome = (mid: string) => (motoristas as any[]).find((m) => m.id === mid)?.nome || "—";

  // ---- Add item manually ----
  const handleAddItem = () => {
    if (!addProdutoId || !addQty) return;
    const qty = Number(addQty.replace(",", "."));
    if (qty <= 0) return;

    // Check if already exists in rows (will be merged via grouped logic)
    // If already in extraItems, sum qty
    setExtraItems((prev) => {
      const existing = prev.find((e) => e.produto_id === addProdutoId);
      if (existing) {
        return prev.map((e) =>
          e.produto_id === addProdutoId ? { ...e, quantidade: e.quantidade + qty } : e
        );
      }
      return [...prev, { produto_id: addProdutoId, quantidade: qty }];
    });

    setAddProdutoId("");
    setAddQty("");
    hasEditedSinceLastSave.current = true;
    toast.success("Item adicionado.");
  };

  // ---- Remove item (set qty to 0 via override) ----
  const handleRemoveItem = (pid: string) => {
    hasEditedSinceLastSave.current = true;
    setOverrides((prev) => ({ ...prev, [pid]: { ...prev[pid], qty: 0 } }));
  };

  // ---- Create acerto ----
  const handleCreateAcerto = async () => {
    if (!createMotoristaId || !createDataStr) {
      toast.error("Selecione motorista e data.");
      return;
    }

    setCreating(true);
    try {
      // Check if acerto already exists
      const { data: existing } = await supabase
        .from("acertos_motorista")
        .select("id")
        .eq("motorista_id", createMotoristaId)
        .eq("data", createDataStr)
        .maybeSingle();

      if (existing) {
        toast.error("Já existe um acerto para este motorista e data. Use o botão Editar.");
        setCreating(false);
        return;
      }

      // Fetch ambulante items
      const { data: ambs } = await supabase
        .from("ambulantes")
        .select("id")
        .eq("motorista_id", createMotoristaId)
        .eq("data", createDataStr);

      const grouped: Record<string, number> = {};

      if (ambs && ambs.length > 0) {
        const ambIds = ambs.map((a) => a.id);
        const { data: itens } = await supabase
          .from("itens_ambulante")
          .select("produto_id, quantidade")
          .in("ambulante_id", ambIds);
        (itens || []).forEach((it: any) => {
          grouped[it.produto_id] = (grouped[it.produto_id] || 0) + Number(it.quantidade);
        });
      }

      // Fetch saída items
      const { data: pedidos } = await supabase
        .from("pedidos_saida")
        .select("id")
        .eq("motorista_id", createMotoristaId)
        .eq("data", createDataStr);

      if (pedidos && pedidos.length > 0) {
        const pedidoIds = pedidos.map((p) => p.id);
        const { data: itens } = await supabase
          .from("itens_saida")
          .select("produto_id, quantidade")
          .in("pedido_id", pedidoIds);
        (itens || []).forEach((it: any) => {
          grouped[it.produto_id] = (grouped[it.produto_id] || 0) + Number(it.quantidade);
        });
      }

      if (Object.keys(grouped).length === 0) {
        toast.error("Nenhuma mercadoria encontrada para este motorista e data.");
        setCreating(false);
        return;
      }

      // Fetch cost data
      const { data: costItems } = await supabase
        .from("itens_entrada")
        .select("produto_id, preco_custo, quantidade, pedidos_entrada!inner(data)")
        .eq("pedidos_entrada.data", createDataStr);

      // Fetch custo_overrides
      const { data: overridesData } = await supabase
        .from("custo_overrides")
        .select("produto_id, preco_custo")
        .eq("data", createDataStr);

      const overrideMap: Record<string, number> = {};
      (overridesData || []).forEach((o: any) => { overrideMap[o.produto_id] = Number(o.preco_custo); });

      const maxCostMap: Record<string, number> = {};
      (costItems || []).forEach((it: any) => {
        const pid = it.produto_id;
        const price = Number(it.preco_custo);
        if (!maxCostMap[pid] || price > maxCostMap[pid]) maxCostMap[pid] = price;
      });

      const items = Object.entries(grouped).map(([pid, qty]) => {
        const custo = overrideMap[pid] ?? maxCostMap[pid] ?? 0;
        return { produto_id: pid, quantidade: qty, custo_ativo: custo };
      });

      const custoTotalCalc = items.reduce((s, it) => s + it.quantidade * it.custo_ativo, 0);
      const totalCobrarCalc = custoTotalCalc * 1.32;

      const { data: acerto, error } = await supabase
        .from("acertos_motorista")
        .insert({
          motorista_id: createMotoristaId,
          data: createDataStr,
          custo_total: custoTotalCalc,
          margem_percent: 32,
          total_cobrar: totalCobrarCalc,
        })
        .select("id")
        .single();

      if (error) throw error;

      await supabase.from("itens_acerto_motorista").insert(
        items.map((it) => ({ acerto_id: acerto.id, ...it }))
      );

      queryClient.invalidateQueries({ queryKey: ["acertos-historico"] });
      toast.success("Acerto criado com sucesso!");

      openEdit(acerto.id, createMotoristaId, createDataStr);
    } catch (err: any) {
      toast.error("Erro ao criar acerto: " + (err.message || ""));
    } finally {
      setCreating(false);
    }
  };

  // ---- Open edit view ----
  const openEdit = async (acertoId: string, motId: string, data: string) => {
    setActiveAcertoId(acertoId);
    setMotoristaId(motId);
    setDataStr(data);
    setOverrides({});
    setExtraItems([]);
    setDescontoValor(0);
    setDescontoObs("");
    setSavedAcertoItems([]);

    // Load acerto data (discount)
    const { data: acertoData } = await supabase
      .from("acertos_motorista")
      .select("*")
      .eq("id", acertoId)
      .single();
    if (acertoData) {
      setDescontoValor(Number((acertoData as any).desconto_valor) || 0);
      setDescontoObs((acertoData as any).desconto_obs || "");
    }

    // Load saved items — these are the immutable snapshot
    const { data: items } = await supabase
      .from("itens_acerto_motorista")
      .select("produto_id, quantidade, custo_ativo")
      .eq("acerto_id", acertoId);

    if (items && items.length > 0) {
      setSavedAcertoItems(items.map((it: any) => ({
        produto_id: it.produto_id,
        quantidade: Number(it.quantidade),
        custo_ativo: Number(it.custo_ativo),
      })));
    }

    setView("edit");
  };

  // ---- Save changes ----
  const handleSave = async () => {
    if (!activeAcertoId) return;

    // Filter rows where qty > 0
    const activeRows = rows.filter((r) => getQty(r) > 0);
    if (activeRows.length === 0) {
      toast.error("Nenhum item com quantidade > 0.");
      return;
    }

    const finalCusto = activeRows.reduce((s, r) => s + getQty(r) * getCusto(r), 0);
    const finalTotal = finalCusto * 1.32 - descontoValor;

    try {
      await supabase
        .from("acertos_motorista")
        .update({
          custo_total: finalCusto,
          margem_percent: 32,
          total_cobrar: finalTotal,
          desconto_valor: descontoValor,
          desconto_obs: descontoObs,
        } as any)
        .eq("id", activeAcertoId);

      await supabase.from("itens_acerto_motorista").delete().eq("acerto_id", activeAcertoId);

      const items = activeRows.map((r) => ({
        acerto_id: activeAcertoId,
        produto_id: r.produto_id,
        quantidade: getQty(r),
        custo_ativo: getCusto(r),
      }));
      await supabase.from("itens_acerto_motorista").insert(items);

      queryClient.invalidateQueries({ queryKey: ["acertos-historico"] });
      toast.success("Acerto salvo com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    }
  };

  // ---- Delete acerto ----
  const handleDeleteAcerto = async (id: string) => {
    await supabase.from("itens_acerto_motorista").delete().eq("acerto_id", id);
    await supabase.from("acertos_motorista").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["acertos-historico"] });
    toast.success("Acerto excluído.");
  };

  // ---- Back to list ----
  const handleBackToList = () => {
    setView("list");
    setActiveAcertoId(null);
    setMotoristaId("");
    setDataStr("");
    setOverrides({});
    setExtraItems([]);
    setSavedAcertoItems([]);
  };

  // ---- Print A4 (HTML – same header as Saídas) ----
  const handlePrintA4 = async () => {
    const motNome = getMotNome(motoristaId);
    const dataFormatada = dataStr
      ? new Date(dataStr + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase()).replace(/-feira/, "-Feira")
      : "";
    const activeRows = rows.filter((r) => getQty(r) > 0);

    const logoUrl = `${window.location.origin}/logo-ilha-verde.png`;

    const printCustoTotal = activeRows.reduce((s, r) => s + getQty(r) * getCusto(r), 0);
    const printMargem = printCustoTotal * 0.32;
    const printTotalAntes = printCustoTotal + printMargem;
    const printTotal = printTotalAntes - descontoValor;

    let rowsHtml = "";
    for (const r of activeRows) {
      const qty = getQty(r);
      const custo = getCusto(r);
      const sub = qty * custo;
      rowsHtml += `<tr><td class="col-qty">${qty}</td><td>${r.descricao}</td><td class="col-un">${r.unidade}</td><td class="col-price">R$ ${fmt(custo)}</td><td class="col-total">R$ ${fmt(sub)}</td></tr>`;
    }

    const styles = `
      body{font-family:Arial,Helvetica,sans-serif;margin:15px;font-size:11px;color:#222}
      .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:6px}
      .header img{width:55px;height:55px;object-fit:contain}
      .header-info{line-height:1.3}
      .header-info .empresa{font-size:13px;font-weight:bold}
      .header-info .cnpj{font-size:10px;color:#555}
      .header-info .data{font-size:11px;color:#555;font-weight:bold}
      .titulo{font-size:16px;font-weight:bold;margin:8px 0 4px}
      .motorista{font-size:12px;font-weight:600;color:#444;margin-bottom:6px}
      table{border-collapse:collapse;width:100%;margin-bottom:6px}
      th,td{border:1px solid #999;padding:2px 6px;text-align:left;font-size:12px}
      th{background:#e8e8e8;font-size:10px;font-weight:bold}
      .col-qty{width:30px;text-align:center}
      .col-un{width:25px;text-align:center}
      .col-price{width:75px;text-align:right}
      .col-total{width:75px;text-align:right}
      .total-row{font-weight:bold;text-align:right;font-size:12px;margin-top:2px}
      .desc-row{text-align:right;font-size:13px;margin-top:2px;color:#c00}
      @media print{body{margin:10px}}
    `;

    let descontoHtml = "";
    if (descontoValor > 0) {
      descontoHtml = `
        <div class="total-row" style="font-size:15px">Nota: ${fmt(printTotalAntes)}</div>
        <div class="desc-row">Desc. ${fmt(descontoValor)}${descontoObs ? ` (${descontoObs})` : ""}</div>
      `;
    }

    const body = `
      <div class="header">
        <img src="${logoUrl}" alt="Logo"/>
        <div class="header-info">
          <div class="empresa">Ilha Verde Comércio de Flores LTDA.</div>
          <div class="cnpj">CNPJ: 16.905.456/0001-30</div>
          <div class="data">Data: ${dataFormatada}</div>
        </div>
      </div>
      <div class="titulo">Acerto Motorista Terceirizado: ${motNome}</div>
      <table><thead><tr><th class="col-qty">QTD</th><th>Mercadoria</th><th class="col-un">UN</th><th class="col-price">Custo Ativo</th><th class="col-total">Subtotal</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="total-row" style="font-size:15px">Custo Total: ${fmt(printCustoTotal)}</div>
      <div class="total-row" style="font-size:14px">32% do Custo: ${fmt(printMargem)}</div>
      ${descontoHtml}
      <div class="total-row" style="font-size:16px">Total a Cobrar: ${fmt(printTotal)}</div>
    `;

    const html = `<html><head><title>Acerto</title><style>${styles}</style></head><body>${body}</body></html>`;
    openHtmlPrint(html);

    if (alsoExcel) {
      exportToExcel({
        filename: `acerto-${motNome}-${dataStr}`,
        sheetName: "Acerto",
        title: "Acerto do Motorista",
        info: [`Motorista: ${motNome}`, `Data: ${dataFormatada}`],
        columns: [
          { header: "UN", key: "unidade", width: 6, align: "center" },
          { header: "Mercadoria", key: "descricao", width: 30 },
          { header: "Qtd", key: "quantidade", width: 10, align: "center" },
          { header: "Custo Ativo", key: "custoAtivo", width: 14, format: "currency", align: "right" },
          { header: "Subtotal", key: "subtotal", width: 14, format: "currency", align: "right" },
        ],
        rows: activeRows.map((r) => ({
          unidade: r.unidade,
          descricao: r.descricao,
          quantidade: getQty(r),
          custoAtivo: getCusto(r),
          subtotal: getQty(r) * getCusto(r),
        })),
        totalRow: { label: "Total a Cobrar", value: printTotal, colSpan: 4 },
      });
    }

    setShowPrintDialog(false);
    setAlsoExcel(false);
  };

  const motoristaOptions = motoristas.filter((m: any) => m.user_id !== null).map((m: any) => ({ value: m.id, label: m.nome }));
  const produtoOptions = produtos.map((p: any) => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  // ===================== LIST VIEW =====================
  if (view === "list") {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Acerto do Motorista</h1>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-4 w-4 mr-1" />
            {showArchived ? "Ocultar arquivados" : "Ver arquivados"}
          </Button>
        </div>

        {/* Creation form */}
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1 min-w-[200px] flex-1">
                <Label>Motorista</Label>
                <SearchableSelect
                  options={motoristaOptions}
                  value={createMotoristaId}
                  onValueChange={setCreateMotoristaId}
                  placeholder="Selecione motorista"
                />
              </div>
              <div className="space-y-1 min-w-[180px]">
                <Label>Data</Label>
                <DatePicker value={createDataStr} onChange={setCreateDataStr} />
              </div>
              <Button onClick={handleCreateAcerto} disabled={creating || !createMotoristaId || !createDataStr}>
                <Plus className="h-4 w-4 mr-1" /> {creating ? "Criando..." : "Criar Acerto"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Saved acertos list */}
        {filteredAcertos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{showArchived ? "Nenhum acerto encontrado." : "Nenhum acerto recente. Use o botão acima para ver arquivados."}</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Total a Cobrar</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Criado em</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAcertos.map((ac) => (
                  <TableRow key={ac.id}>
                    <TableCell className="font-medium">{getMotNome(ac.motorista_id)}</TableCell>
                    <TableCell>{ac.data.split("-").reverse().join("/")}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(Number(ac.total_cobrar))}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                      {new Date(ac.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(ac.id, ac.motorista_id, ac.data)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir acerto?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O acerto de {getMotNome(ac.motorista_id)} em {ac.data.split("-").reverse().join("/")} ({fmt(Number(ac.total_cobrar))}) será excluído permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteAcerto(ac.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  // ===================== EDIT VIEW =====================
  const activeRows = rows.filter((r) => getQty(r) > 0);
  const zeroRows = rows.filter((r) => getQty(r) === 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={handleBackToList}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Acerto do Motorista</h1>
          <p className="text-sm text-muted-foreground">
            {getMotNome(motoristaId)} — {dataStr ? dataStr.split("-").reverse().join("/") : ""}
          </p>
        </div>
      </div>

      {/* Add item */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[200px] flex-1">
              <Label>Adicionar Produto</Label>
              <SearchableSelect
                options={produtoOptions}
                value={addProdutoId}
                onValueChange={setAddProdutoId}
                placeholder="Buscar produto..."
              />
            </div>
            <div className="space-y-1 w-24">
              <Label>Qtd</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder="0"
                className="h-10"
              />
            </div>
            <Button size="sm" onClick={handleAddItem} disabled={!addProdutoId || !addQty}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma mercadoria encontrada. Adicione itens acima.</p>
      ) : (
        <>
          {/* Table */}
          <div className="border rounded-lg overflow-hidden mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mercadoria</TableHead>
                  <TableHead className="w-24 text-center">Qtd</TableHead>
                  <TableHead className="w-32 text-right">Custo Ativo</TableHead>
                  <TableHead className="w-28 text-right hidden md:table-cell">Custo Mín.</TableHead>
                  <TableHead className="w-28 text-right hidden md:table-cell">Custo Médio</TableHead>
                  <TableHead className="w-32 text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const qty = getQty(r);
                  const custo = getCusto(r);
                  const isZero = qty === 0;
                  return (
                    <TableRow key={r.produto_id} className={isZero ? "opacity-40" : ""}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left text-primary underline underline-offset-2 hover:text-primary/80 font-medium"
                          onClick={() => setDetailProd(r)}
                        >
                          {r.descricao}
                        </button>
                        {r.unidade && <span className="ml-1 text-xs text-muted-foreground">({r.unidade})</span>}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="w-20 text-center h-8"
                          value={overrides[r.produto_id]?.qty ?? r.quantidade}
                          onChange={(e) => handleQtyChange(r.produto_id, e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-28 text-right h-8"
                          value={overrides[r.produto_id]?.custo ?? r.custoAtivo}
                          onChange={(e) => handleCustoChange(r.produto_id, e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm hidden md:table-cell">{fmt(r.custoMin)}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm hidden md:table-cell">{fmt(r.custoMedio)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(qty * custo)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleRemoveItem(r.produto_id)}
                          title="Remover item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

           {/* Summary */}
          <div className="flex flex-wrap gap-4 mb-4">
            <Card className="flex-1 min-w-[180px]">
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Custo Total</p>
                <p className="text-xl font-bold">{fmt(custoTotal)}</p>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[180px]">
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">32% do Custo</p>
                <p className="text-xl font-bold text-orange-500 dark:text-orange-400">{fmt(margem)}</p>
              </CardContent>
            </Card>
            {descontoValor > 0 && (
              <Card className="flex-1 min-w-[180px] border-destructive">
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Desconto</p>
                  <p className="text-xl font-bold text-destructive">- {fmt(descontoValor)}</p>
                  {descontoObs && <p className="text-xs text-muted-foreground mt-1">{descontoObs}</p>}
                </CardContent>
              </Card>
            )}
            <Card className="flex-1 min-w-[180px] border-primary">
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Total a Cobrar</p>
                <p className="text-2xl font-bold text-primary">{fmt(totalCobrar)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => {
              setDescontoInputValor(descontoValor > 0 ? descontoValor.toString() : "");
              setDescontoInputObs(descontoObs);
              setShowDescontoDialog(true);
            }}>
              <BadgePercent className="h-4 w-4 mr-1" /> {descontoValor > 0 ? `Desconto: ${fmt(descontoValor)}` : "Desconto"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4 mr-1" /> Resetar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar dados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todas as alterações de quantidade e custo serão perdidas e os dados originais serão recarregados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>Confirmar Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" /> Salvar Alterações
            </Button>

            <Button variant="outline" size="sm" onClick={() => setShowPrintDialog(true)}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir A4
            </Button>
          </div>
        </>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailProd} onOpenChange={(v) => { if (!v) setDetailProd(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhamento — {detailProd?.descricao}</DialogTitle>
            <DialogDescription>Lotes que compõem este produto no acerto.</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Preço Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailProd?.lotes.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.fornecedor}</TableCell>
                  <TableCell className="text-right">{l.quantidade}</TableCell>
                  <TableCell className="text-right">{fmt(l.preco)}</TableCell>
                  <TableCell className="text-right">{fmt(l.quantidade * l.preco)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Imprimir Acerto</DialogTitle>
            <DialogDescription>Escolha as opções de exportação.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-4">
            <Checkbox
              id="also-excel"
              checked={alsoExcel}
              onCheckedChange={(v) => setAlsoExcel(!!v)}
            />
            <Label htmlFor="also-excel">Também gerar Excel</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>Cancelar</Button>
            <Button onClick={handlePrintA4}>
              <Printer className="h-4 w-4 mr-1" /> Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={showDescontoDialog} onOpenChange={setShowDescontoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desconto no Acerto</DialogTitle>
            <DialogDescription>Informe o valor do desconto e a observação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Valor do Desconto (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0,00"
                value={descontoInputValor}
                onChange={(e) => setDescontoInputValor(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Observação do desconto</Label>
              <Textarea
                placeholder="Ex: referente a 3 maços de rosas estragadas"
                value={descontoInputObs}
                onChange={(e) => setDescontoInputObs(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            {descontoValor > 0 && (
              <Button variant="destructive" size="sm" onClick={() => {
                setDescontoValor(0);
                setDescontoObs("");
                hasEditedSinceLastSave.current = true;
                setShowDescontoDialog(false);
                toast.success("Desconto removido.");
              }}>
                Remover Desconto
              </Button>
            )}
            <Button onClick={() => {
              const val = Number(descontoInputValor.replace(",", ".")) || 0;
              setDescontoValor(val);
              setDescontoObs(descontoInputObs.trim());
              hasEditedSinceLastSave.current = true;
              setShowDescontoDialog(false);
              toast.success(val > 0 ? `Desconto de ${fmt(val)} aplicado.` : "Desconto removido.");
            }}>
              Aplicar Desconto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
