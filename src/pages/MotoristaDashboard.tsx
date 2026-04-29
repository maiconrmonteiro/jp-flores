import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getNextOperationDate, localToday, localDateStr } from "@/lib/utils";
import { ApplyPricesButton } from "@/components/ApplyPricesButton";
import { useCompanySaldo } from "@/hooks/use-company-saldo";
import { fetchCostPricesForDate, useCostPricesForDate } from "@/hooks/use-markup";
import { fetchProdutosUpTo } from "@/lib/produtos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Printer, LogOut, Trash2, ShoppingBag, Percent, CalendarIcon, X, ChevronsUpDown, ArrowLeft, UserPlus, BarChart3, ClipboardList, FileText, MessageSquare, Package, Users, Search, KeyRound, Bluetooth, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { MarkupPopover } from "@/components/MarkupPopover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { printSaida80mm, printAmbulanteA4, printAmbulante80mm, printSaidaA4, printAllSaidasA4, printSaldoEmpresa80mm, sortByUnitThenName } from "@/lib/print";
import { btPrintSaida, isBluetoothSupported } from "@/lib/bluetooth-printer";
import { exportToExcel } from "@/lib/excel";
import { CochoButton, stripCochoFromObs, parseCochoFromObs, cochoHasValues } from "@/components/CochoButton";
import { mergeCochoIntoCliente } from "@/lib/cocho-cobranca";
import { registrarPagamentoFaturamento } from "@/lib/avista-pagamento";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import OrderItemsEditor, { OrderItemsEditorHandle } from "@/components/OrderItemsEditor";
import OfflineIndicator from "@/components/OfflineIndicator";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { enqueue } from "@/lib/offline-queue";
import { getCachedData, setCachedData } from "@/lib/offline-cache";
import { usePastDateGuard } from "@/components/PastDateGuard";
import Orcamentos from "@/pages/admin/Orcamentos";
import MotoristaFinanceiro from "@/components/MotoristaFinanceiro";
import { extractPartialPaymentValue, stripPartialPaymentObservation, upsertPartialPaymentObservation } from "@/lib/order-payment";
import { PaginatedList } from "@/components/PaginatedList";

interface ItemSaida { _key?: string; id?: string; produto_id: string; quantidade: number; preco: number; is_baixa_ambulante: boolean; }
interface ItemAmb { _key?: string; id?: string; produto_id: string; quantidade: number; }

let _itemKeyCounter = 0;
const nextKey = () => `k_${++_itemKeyCounter}`;

const MARKUP_PRESETS = [70, 75, 80];

async function saveMarkupToDb(motoristaId: string, value: number) {
  await supabase.from("motoristas").update({ markup: value } as any).eq("id", motoristaId);
}

export default function MotoristaDashboard() {
  const { user, role, loading, signOut } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const [showFinanceiro, setShowFinanceiro] = useState(false);
  const [open, setOpen] = useState(false);
  const editorRef = useRef<OrderItemsEditorHandle>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [autoOrderId, _setAutoOrderId] = useState<string | null>(null);
  const autoOrderIdRef = useRef<string | null>(null);
  const setAutoOrderId = (id: string | null) => { autoOrderIdRef.current = id; _setAutoOrderId(id); };
  const [clienteId, setClienteId] = useState("");
  const [data, setData] = useState(getNextOperationDate());
  const { guardedOnChange: guardedDateChange, dialog: pastDateDialog } = usePastDateGuard(setData);
  const [itens, setItens] = useState<ItemSaida[]>([]);
  const [tipoPagamento, setTipoPagamento] = useState("pendente");
  const [parcialDialog, setParcialDialog] = useState<{ orderId: string } | null>(null);
  const [parcialValor, setParcialValor] = useState("");
  const [valorPagoParcial, setValorPagoParcial] = useState("");
  const [cooperfloraStage, setCooperfloraStage] = useState<0 | 1 | 2>(0);
  const { data: companySaldo, isLoading: companySaldoLoading } = useCompanySaldo(data, cooperfloraStage >= 1);
  const [filterDate, setFilterDate] = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterPagamento, setFilterPagamento] = useState(() => localStorage.getItem("motorista-filter-pagamento") || "");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchived, setConfirmArchived] = useState(false);
  const [alsoExcel, setAlsoExcel] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: "pedido" | "ambulante"; item: any } | null>(null);
  const [printTarget, setPrintTarget] = useState<any>(null);
  const [confirmImportTpl, setConfirmImportTpl] = useState<{ template: any; type: "ambulante" | "cliente" } | null>(null);
  const [faturarAction, setFaturarAction] = useState<any>(null);
  const [faturarValorPago, setFaturarValorPago] = useState("");
  const [faturarObs, setFaturarObs] = useState("");
  

  // Auto-pedidos popup
  const [autoPedidosPopup, setAutoPedidosPopup] = useState<any[]>([]);

  // Desconto
  const DISCOUNT_PRESETS = [5, 10, 15];
  const [desconto, setDesconto] = useState(0);
  const [customDesconto, setCustomDesconto] = useState("");
  const [isCustomDesconto, setIsCustomDesconto] = useState(false);
  const descontoRef = useRef(0);
  descontoRef.current = desconto;

  // Observação
  const [observacao, setObservacao] = useState("");
  const observacaoRef = useRef("");
  observacaoRef.current = observacao;

  // Gerenciamento de clientes (sheet)
  const [clientesSheetOpen, setClientesSheetOpen] = useState(false);
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteFormOpen, setClienteFormOpen] = useState(false);
  const [clienteEditId, setClienteEditId] = useState<string | null>(null);
  const [clienteForm, setClienteForm] = useState({ nome: "", cep: "", cidade: "", estado: "", bairro: "", complemento: "" });
  const clienteFormEmpty = { nome: "", cep: "", cidade: "", estado: "", bairro: "", complemento: "" };
  const [confirmDeleteCliente, setConfirmDeleteCliente] = useState<any>(null);

  const saveCliente = async () => {
    if (!clienteForm.nome.trim()) { toast({ title: "Informe o nome do cliente", variant: "destructive" }); return; }
    if (clienteEditId) {
      const { error } = await supabase.from("clientes").update(clienteForm).eq("id", clienteEditId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("clientes").insert(clienteForm);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: "Salvo!" });
    setClienteFormOpen(false); setClienteEditId(null); setClienteForm(clienteFormEmpty);
    qc.invalidateQueries({ queryKey: ["clientes"] });
  };

  const removeCliente = async (id: string) => {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Excluído!" });
    qc.invalidateQueries({ queryKey: ["clientes"] });
  };

  const openEditCliente = (c: any) => {
    setClienteEditId(c.id);
    setClienteForm({ nome: c.nome, cep: c.cep || "", cidade: c.cidade || "", estado: c.estado || "", bairro: c.bairro || "", complemento: c.complemento || "" });
    setClienteFormOpen(true);
  };

  // Saldo da empresa
  const [saldoOpen, setSaldoOpen] = useState(false);
  const [saldoData, setSaldoData] = useState(localToday());

  const { data: saldoEntradas = [] } = useQuery({
    queryKey: ["saldo-entradas", saldoData],
    queryFn: async () => {
      const { data, error } = await supabase.from("itens_entrada")
        .select("quantidade, produto_id, produtos(descricao, unidade), pedidos_entrada!inner(data)")
        .eq("pedidos_entrada.data", saldoData);
      if (error) throw error;
      return data;
    },
    enabled: saldoOpen,
  });

  const { data: saldoSaidas = [] } = useQuery({
    queryKey: ["saldo-saidas", saldoData],
    queryFn: async () => {
      const { data, error } = await supabase.from("itens_saida")
        .select("quantidade, produto_id, is_baixa_ambulante, produtos(descricao, unidade), pedidos_saida!inner(data)")
        .eq("pedidos_saida.data", saldoData);
      if (error) throw error;
      return data;
    },
    enabled: saldoOpen,
  });

  const { data: saldoAmbulante = [] } = useQuery({
    queryKey: ["saldo-ambulante", saldoData],
    queryFn: async () => {
      const { data, error } = await supabase.from("itens_ambulante")
        .select("quantidade, produto_id, produtos(descricao, unidade), ambulantes!inner(data)")
        .eq("ambulantes.data", saldoData);
      if (error) throw error;
      return data;
    },
    enabled: saldoOpen,
  });

  const { data: saldoCostPrices } = useCostPricesForDate(saldoData, saldoOpen);

  

  const orderId = editId || autoOrderId;

  // Markup state
  const [markup, setMarkup] = useState(70);
  const [customMarkup, setCustomMarkup] = useState("");
  const [isCustomMarkup, setIsCustomMarkup] = useState(false);

  const saldoRows = useMemo(() => {
    const map = new Map<string, { descricao: string; unidade: string; entradas: number; saidas: number }>();
    (saldoEntradas as any[]).forEach(i => {
      const cur = map.get(i.produto_id) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", entradas: 0, saidas: 0 };
      cur.entradas += Number(i.quantidade);
      map.set(i.produto_id, cur);
    });
    (saldoSaidas as any[]).forEach((i: any) => {
      const cur = map.get(i.produto_id) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", entradas: 0, saidas: 0 };
      cur.saidas += Number(i.quantidade);
      map.set(i.produto_id, cur);
    });
    (saldoAmbulante as any[]).forEach((i: any) => {
      const cur = map.get(i.produto_id) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", entradas: 0, saidas: 0 };
      cur.saidas += Number(i.quantidade);
      map.set(i.produto_id, cur);
    });
    return Array.from(map.entries())
      .map(([id, v]) => {
        const saldo = v.entradas - v.saidas;
        const custo = Number((saldoCostPrices as any)?.[id] || 0);
        const precoVenda = custo > 0 ? Math.round(custo * (1 + markup / 100) * 100) / 100 : 0;
        return { id, ...v, saldo, precoVenda };
      })
      .filter(r => r.saldo !== 0)
      .sort((a, b) => {
        const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
        const ua = UNIT_ORDER[a.unidade] ?? 99;
        const ub = UNIT_ORDER[b.unidade] ?? 99;
        if (ua !== ub) return ua - ub;
        return a.descricao.localeCompare(b.descricao, "pt-BR");
      });
  }, [saldoEntradas, saldoSaidas, saldoAmbulante, saldoCostPrices, markup]);

  const [ambOpen, setAmbOpen] = useState(false);
  const [ambEditId, setAmbEditId] = useState<string | null>(null);
  const [ambAutoOrderId, setAmbAutoOrderId] = useState<string | null>(null);
  const [ambData, setAmbData] = useState(localToday());
  const [ambItens, setAmbItens] = useState<ItemAmb[]>([]);
  

  const ambOrderId = ambEditId || ambAutoOrderId;

  const { data: motorista } = useQuery({
    queryKey: ["my-motorista", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("*").eq("user_id", user!.id).maybeSingle();
      if (data) setCachedData(`my-motorista-${user!.id}`, data);
      return data;
    },
    enabled: !!user,
    initialData: () => user ? getCachedData<any>(`my-motorista-${user.id}`) : undefined,
  });

  useEffect(() => {
    if (motorista) {
      const dbMarkup = (motorista as any).markup ?? 70;
      setMarkup(dbMarkup);
      if (!MARKUP_PRESETS.includes(dbMarkup)) {
        setIsCustomMarkup(true);
        setCustomMarkup(String(dbMarkup));
      }
    }
  }, [motorista?.id]);

  // Check for unseen auto-created orders
  useEffect(() => {
    if (!motorista?.id) return;
    (async () => {
      const { data: unseen } = await supabase
        .from("auto_pedidos_log")
        .select("*")
        .eq("motorista_id", motorista.id)
        .eq("seen", false)
        .order("created_at", { ascending: false });
      if (unseen && unseen.length > 0) {
        setAutoPedidosPopup(unseen);
      }
    })();
  }, [motorista?.id]);

  const handleMarkupChange = (value: number) => {
    setMarkup(value);
    setIsCustomMarkup(false);
    setCustomMarkup("");
    if (motorista?.id) saveMarkupToDb(motorista.id, value);
  };

  const handleCustomMarkupChange = (val: string) => {
    setCustomMarkup(val);
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      setMarkup(num);
      if (motorista?.id) saveMarkupToDb(motorista.id, num);
    }
  };

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["my-pedidos-saida", motorista?.id, showArchived],
    queryFn: async () => {
      let query = supabase.from("pedidos_saida")
        .select("*, clientes(nome, cep, cidade, estado, bairro, complemento, telefone), motoristas(nome), itens_saida(*, produtos(descricao, unidade))")
        .eq("motorista_id", motorista!.id)
        .order("data", { ascending: false });
      if (!showArchived) {
        query = query.eq("archived", false);
      }
      const { data, error } = await query;
      if (error) throw error;
      const sorted = (data || []).sort((a: any, b: any) => {
        if (b.data !== a.data) return b.data.localeCompare(a.data);
        return (a.clientes?.nome || "").localeCompare(b.clientes?.nome || "", "pt-BR");
      });
      setCachedData(`my-pedidos-saida-${motorista!.id}`, sorted);
      return sorted;
    },
    enabled: !!motorista,
    initialData: () => motorista ? getCachedData<any[]>(`my-pedidos-saida-${motorista.id}`) : undefined,
  });

  const { data: ambulantes = [] } = useQuery({
    queryKey: ["my-ambulantes", motorista?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ambulantes")
        .select("*, itens_ambulante(*, produtos(descricao, unidade))")
        .eq("motorista_id", motorista!.id)
        .order("data", { ascending: false });
      if (error) throw error;
      setCachedData(`my-ambulantes-${motorista!.id}`, data);
      return data;
    },
    enabled: !!motorista,
    initialData: () => motorista ? getCachedData<any[]>(`my-ambulantes-${motorista.id}`) : undefined,
  });

  // Check which pedidos have financeiro_receber (cobrança) - motorista cannot edit these
  const { data: pedidosComCobranca = [] } = useQuery({
    queryKey: ["pedidos-com-cobranca", motorista?.id],
    queryFn: async () => {
      const { data } = await supabase.from("financeiro_receber")
        .select("pedido_saida_id")
        .eq("motorista_id", motorista!.id);
      return (data || []).map((r: any) => r.pedido_saida_id);
    },
    enabled: !!motorista,
  });
  const pedidoBloqueadoSet = new Set(pedidosComCobranca);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("*").order("nome");
      const result = data || [];
      setCachedData("clientes", result);
      return result;
    },
    initialData: () => getCachedData<any[]>("clientes"),
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const result = await fetchProdutosUpTo(5000);
      setCachedData("produtos", result);
      return result;
    },
    initialData: () => getCachedData<any[]>("produtos"),
  });

  // Produtos com entrada nos últimos 15 dias em relação à data do pedido (para priorizar no dropdown)
  const { data: entradasDoDia = [] } = useQuery({
    queryKey: ["entradas-recentes-produtos", data],
    queryFn: async () => {
      const refDate = new Date(data + "T00:00:00");
      refDate.setDate(refDate.getDate() - 15);
      const startDate = localDateStr(refDate);
      const { data: items } = await supabase
        .from("itens_entrada")
        .select("produto_id, pedidos_entrada!inner(data)")
        .gte("pedidos_entrada.data", startDate)
        .lte("pedidos_entrada.data", data);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });
  // Produtos já digitados em saídas na mesma data
  const { data: saidasDoDia = [] } = useQuery({
    queryKey: ["saidas-do-dia-produtos", data],
    queryFn: async () => {
      const { data: items } = await supabase
        .from("itens_saida")
        .select("produto_id, pedidos_saida!inner(data)")
        .eq("pedidos_saida.data", data);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });
  const produtosPrioritarios = new Set([...entradasDoDia, ...saidasDoDia]);

  // Produtos com entrada nos últimos 15 dias em relação à data do ambulante
  const { data: entradasDoDiaAmb = [] } = useQuery({
    queryKey: ["entradas-recentes-produtos", ambData],
    queryFn: async () => {
      const refDate = new Date(ambData + "T00:00:00");
      refDate.setDate(refDate.getDate() - 15);
      const startDate = localDateStr(refDate);
      const { data: items } = await supabase
        .from("itens_entrada")
        .select("produto_id, pedidos_entrada!inner(data)")
        .gte("pedidos_entrada.data", startDate)
        .lte("pedidos_entrada.data", ambData);
      return [...new Set((items || []).map(i => i.produto_id))];
    },
  });
  const produtosPrioritariosAmb = new Set(entradasDoDiaAmb);

  const { data: latestCostPrices = {} } = useCostPricesForDate(data, !!motorista);
  const { data: filterDateCostPrices = {} } = useCostPricesForDate(filterDate || localToday(), !!filterDate);

  const { data: ambTemplates = [] } = useQuery({
    queryKey: ["ambulante-templates-motorista", motorista?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ambulante_templates")
        .select("*, itens_ambulante_template(*, produtos(descricao, unidade))")
        .eq("motorista_id", motorista!.id)
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!motorista,
  });

  // ---- Pedidos Fixos (template CRUD) ----
  const [fixosDialogOpen, setFixosDialogOpen] = useState(false);
  const [fixosTab, setFixosTab] = useState<"ambulante" | "cliente">("ambulante");

  // Ambulante template state
  const [tplOpen, setTplOpen] = useState(false);
  const [tplEditId, setTplEditId] = useState<string | null>(null);
  const [tplNome, setTplNome] = useState("");
  const [tplItens, setTplItens] = useState<{ _key?: string; id?: string; produto_id: string; quantidade: number }[]>([]);
  const [tplConfirmDelete, setTplConfirmDelete] = useState<any>(null);

  const resetTplForm = () => { setTplEditId(null); setTplNome(""); setTplItens([]); };

  const startEditTpl = (t: any) => {
    setTplEditId(t.id); setTplNome(t.nome);
    setTplItens((t.itens_ambulante_template || []).map((i: any) => ({
      _key: `t_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: Number(i.quantidade),
    })));
    setTplOpen(true);
  };

  const ensureTpl = async (): Promise<string> => {
    if (tplEditId) return tplEditId;
    if (!motorista?.id) throw new Error("Motorista não encontrado");
    const nome = tplNome.trim() || "Novo pedido fixo";
    const { data: created, error } = await supabase.from("ambulante_templates")
      .insert({ nome, motorista_id: motorista.id }).select().single();
    if (error) throw error;
    setTplEditId(created.id);
    if (!tplNome.trim()) setTplNome(nome);
    return created.id;
  };

  const tplAddItem = async (item: any): Promise<{ id: string }> => {
    const templateId = await ensureTpl();
    const { data: saved, error } = await supabase.from("itens_ambulante_template")
      .insert({ template_id: templateId, produto_id: item.produto_id, quantidade: item.quantidade })
      .select().single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["ambulante-templates-motorista"] });
    return { id: saved.id };
  };

  const tplEditItem = async (item: any): Promise<void> => {
    if (!item.id || item.id.startsWith("tmp_")) return;
    await supabase.from("itens_ambulante_template").update({ quantidade: item.quantidade }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["ambulante-templates-motorista"] });
  };

  const tplRemoveItem = async (item: any): Promise<void> => {
    if (item.id && !item.id.startsWith("tmp_")) {
      await supabase.from("itens_ambulante_template").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["ambulante-templates-motorista"] });
    }
  };

  const handleTplDialogClose = async () => {
    // Save name if template exists and name changed
    if (tplEditId && tplNome.trim()) {
      await supabase.from("ambulante_templates").update({ nome: tplNome.trim() }).eq("id", tplEditId);
    }
    // Delete template if it was created but has no items
    if (tplEditId) {
      const { data: remaining } = await supabase.from("itens_ambulante_template").select("id").eq("template_id", tplEditId);
      if (!remaining || remaining.length === 0) {
        await supabase.from("ambulante_templates").delete().eq("id", tplEditId);
      }
    }
    qc.invalidateQueries({ queryKey: ["ambulante-templates-motorista"] });
    resetTplForm();
  };

  const deleteTpl = async (id: string) => {
    await supabase.from("ambulante_templates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["ambulante-templates-motorista"] });
    toast({ title: "Pedido fixo excluído!" });
  };

  // Cliente template state
  const [ctplOpen, setCtplOpen] = useState(false);
  const [ctplEditId, setCtplEditId] = useState<string | null>(null);
  const [ctplNome, setCtplNome] = useState("");
  const [ctplClienteId, setCtplClienteId] = useState("");
  const [ctplDiaSemana, setCtplDiaSemana] = useState("terca");
  const [ctplItens, setCtplItens] = useState<{ _key?: string; id?: string; produto_id: string; quantidade: number; preco?: number }[]>([]);
  const [ctplConfirmDelete, setCtplConfirmDelete] = useState<any>(null);

  const { data: myCliTemplates = [] } = useQuery({
    queryKey: ["my-cliente-templates", motorista?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cliente_templates")
        .select("*, clientes(nome), itens_cliente_template(*, produtos(descricao, unidade))")
        .eq("motorista_id", motorista!.id)
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!motorista,
  });

  const resetCtplForm = () => { setCtplEditId(null); setCtplNome(""); setCtplClienteId(""); setCtplDiaSemana("terca"); setCtplItens([]); };

  const startEditCtpl = (t: any) => {
    setCtplEditId(t.id); setCtplNome(t.nome); setCtplClienteId(t.cliente_id);
    setCtplDiaSemana(t.dia_semana || "terca");
    setCtplItens((t.itens_cliente_template || []).map((i: any) => ({
      _key: `t_${i.id}`, id: i.id, produto_id: i.produto_id, quantidade: Number(i.quantidade), preco: Number(i.preco || 0),
    })));
    setCtplOpen(true);
  };

  const ensureCtpl = async (): Promise<string> => {
    if (ctplEditId) return ctplEditId;
    if (!motorista?.id) throw new Error("Motorista não encontrado");
    if (!ctplClienteId) throw new Error("Selecione o cliente primeiro");
    const nome = ctplNome.trim() || "Novo pedido fixo";
    const { data: created, error } = await supabase.from("cliente_templates")
      .insert({ nome, cliente_id: ctplClienteId, motorista_id: motorista.id, dia_semana: ctplDiaSemana } as any).select().single();
    if (error) throw error;
    setCtplEditId(created.id);
    if (!ctplNome.trim()) setCtplNome(nome);
    return created.id;
  };

  const ctplAddItem = async (item: any): Promise<{ id: string }> => {
    if (!ctplClienteId) { toast({ title: "Selecione o cliente primeiro", variant: "destructive" }); throw new Error("Cliente não selecionado"); }
    const templateId = await ensureCtpl();
    const { data: saved, error } = await supabase.from("itens_cliente_template")
      .insert({ template_id: templateId, produto_id: item.produto_id, quantidade: item.quantidade, preco: item.preco ?? 0 })
      .select().single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["my-cliente-templates"] });
    qc.invalidateQueries({ queryKey: ["cliente-templates-motorista"] });
    return { id: saved.id };
  };

  const ctplEditItem = async (item: any): Promise<void> => {
    if (!item.id || item.id.startsWith("tmp_")) return;
    await supabase.from("itens_cliente_template").update({ quantidade: item.quantidade, preco: item.preco ?? 0 }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["my-cliente-templates"] });
    qc.invalidateQueries({ queryKey: ["cliente-templates-motorista"] });
  };

  const ctplRemoveItem = async (item: any): Promise<void> => {
    if (item.id && !item.id.startsWith("tmp_")) {
      await supabase.from("itens_cliente_template").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["my-cliente-templates"] });
      qc.invalidateQueries({ queryKey: ["cliente-templates-motorista"] });
    }
  };

  const handleCtplDialogClose = async () => {
    if (ctplEditId && ctplNome.trim()) {
      await supabase.from("cliente_templates").update({ nome: ctplNome.trim(), cliente_id: ctplClienteId, dia_semana: ctplDiaSemana } as any).eq("id", ctplEditId);
    }
    if (ctplEditId) {
      const { data: remaining } = await supabase.from("itens_cliente_template").select("id").eq("template_id", ctplEditId);
      if (!remaining || remaining.length === 0) {
        await supabase.from("cliente_templates").delete().eq("id", ctplEditId);
      }
    }
    qc.invalidateQueries({ queryKey: ["my-cliente-templates"] });
    qc.invalidateQueries({ queryKey: ["cliente-templates-motorista"] });
    resetCtplForm();
  };

  const deleteCtpl = async (id: string) => {
    await supabase.from("cliente_templates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["my-cliente-templates"] });
    qc.invalidateQueries({ queryKey: ["cliente-templates-motorista"] });
    toast({ title: "Pedido fixo excluído!" });
  };

  const importAmbTemplate = async (templateId: string) => {
    const template = ambTemplates.find((t: any) => t.id === templateId);
    if (!template) return;
    try {
      const oid = await ensureAmbOrder();
      const templateItems = template.itens_ambulante_template || [];
      for (const ti of templateItems) {
        if (ambItens.some(i => i.produto_id === ti.produto_id)) continue;
        if (isOnline) {
          const { data: saved, error } = await supabase.from("itens_ambulante")
            .insert({ ambulante_id: oid, produto_id: ti.produto_id, quantidade: ti.quantidade, preco: 0 })
            .select().single();
          if (error) throw error;
          setAmbItens(prev => [...prev, { _key: nextKey(), id: saved.id, produto_id: ti.produto_id, quantidade: Number(ti.quantidade) }]);
        } else {
          const tempId = `temp_${Date.now()}_${Math.random()}`;
          enqueue({ type: "insert", table: "itens_ambulante", data: { ambulante_id: oid, produto_id: ti.produto_id, quantidade: ti.quantidade, preco: 0 } });
          setAmbItens(prev => [...prev, { _key: nextKey(), id: tempId, produto_id: ti.produto_id, quantidade: Number(ti.quantidade) }]);
        }
      }
      qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
      toast({ title: `Itens do "${template.nome}" importados!` });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }
  };

  const getSuggestedPrice = useCallback((produtoId: string): number => {
    const costPrice = (latestCostPrices as Record<string, number>)[produtoId];
    if (!costPrice) return 0;
    return Math.round(costPrice * (1 + markup / 100) * 100) / 100;
  }, [latestCostPrices, markup]);

  const { data: cliTemplates = [] } = useQuery({
    queryKey: ["cliente-templates-motorista"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cliente_templates")
        .select("*, clientes(nome), itens_cliente_template(*, produtos(descricao, unidade))")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!motorista,
  });

  const cliTemplatesForCliente = cliTemplates.filter((t: any) => t.cliente_id === clienteId);

  const importCliTemplate = async (templateId: string) => {
    const template = cliTemplates.find((t: any) => t.id === templateId);
    if (!template) return;
    try {
      const oid = await ensureOrder();
      for (const ti of (template.itens_cliente_template || [])) {
        if (itens.some(i => i.produto_id === ti.produto_id)) continue;
        // Se o template tem preço definido (> 0), usa ele; senão calcula custo + margem
        const preco = Number(ti.preco) > 0 ? Number(ti.preco) : getSuggestedPrice(ti.produto_id);
        if (isOnline) {
          const { data: saved, error } = await supabase.from("itens_saida")
            .insert({ pedido_id: oid, produto_id: ti.produto_id, quantidade: ti.quantidade, preco, is_baixa_ambulante: false })
            .select().single();
          if (error) throw error;
          setItens(prev => [...prev, { _key: nextKey(), id: saved.id, produto_id: ti.produto_id, quantidade: Number(ti.quantidade), preco, is_baixa_ambulante: false }]);
        } else {
          const tempId = `temp_${Date.now()}_${Math.random()}`;
          enqueue({ type: "insert", table: "itens_saida", data: { pedido_id: oid, produto_id: ti.produto_id, quantidade: ti.quantidade, preco, is_baixa_ambulante: false } });
          setItens(prev => [...prev, { _key: nextKey(), id: tempId, produto_id: ti.produto_id, quantidade: Number(ti.quantidade), preco, is_baixa_ambulante: false }]);
        }
      }
      qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
      toast({ title: `Itens do "${template.nome}" importados!` });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }
  };

  // currentStock: itens_ambulante.quantidade IS the saldo now (trigger auto-decrements)
  const getAmbulanteStock = (dateFilter: string) => {
    const stock = new Map<string, { descricao: string; unidade: string; total: number; baixado: number }>();
    (ambulantes as any[]).filter((a: any) => a.data === dateFilter).forEach((a: any) => {
      (a.itens_ambulante || []).forEach((i: any) => {
        const cur = stock.get(i.produto_id) || { descricao: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", total: 0, baixado: 0 };
        cur.total += Number(i.quantidade);
        stock.set(i.produto_id, cur);
      });
    });
    return stock;
  };

  const currentStock = getAmbulanteStock(data);

  // --- Pedido Saída auto-save ---
  const removePedido = async (id: string) => {
    if (isOnline) {
      const { error } = await supabase.from("pedidos_saida").delete().eq("id", id);
      if (!error) { qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] }); toast({ title: "Pedido excluído!" }); }
    } else {
      enqueue({ type: "delete", table: "pedidos_saida", matchId: id });
      toast({ title: "Pedido será excluído ao sincronizar" });
    }
  };

  const changeTipoPagamento = async (id: string, tp: string) => {
    const { error } = await supabase.from("pedidos_saida").update({ tipo_pagamento: tp } as any).eq("id", id);
    if (error) { toast({ title: "Erro ao atualizar pagamento", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
  };

  const resetForm = () => { setEditId(null); setAutoOrderId(null); setClienteId(""); setData(getNextOperationDate()); setItens([]); setDesconto(0); setCustomDesconto(""); setIsCustomDesconto(false); setObservacao(""); setTipoPagamento("pendente"); setParcialValor(""); setValorPagoParcial(""); };

  const startEdit = (p: any) => {
    const parcialExistente = extractPartialPaymentValue(p.observacao);
    setEditId(p.id);
    setClienteId(p.cliente_id);
    setData(p.data);
    setItens((p.itens_saida || []).map((i: any) => ({ _key: nextKey(), id: i.id, produto_id: i.produto_id, quantidade: i.quantidade, preco: i.preco, is_baixa_ambulante: i.is_baixa_ambulante || false })));
    const disc = Number(p.desconto) || 0; setDesconto(disc); setCustomDesconto(disc > 0 && !DISCOUNT_PRESETS.includes(disc) ? String(disc) : ""); setIsCustomDesconto(disc > 0 && !DISCOUNT_PRESETS.includes(disc));
    setObservacao(stripPartialPaymentObservation(p.observacao || ""));
    setTipoPagamento(p.tipo_pagamento || "pendente");
    setValorPagoParcial(parcialExistente ? parcialExistente.toFixed(2) : "");
    setOpen(true);
  };

  const handleDialogClose = async () => {
    await editorRef.current?.flushEdit();
    const currentId = editId || autoOrderIdRef.current;
    const latestDesconto = descontoRef.current;
    const latestObs = observacaoRef.current;
    if (autoOrderId && itens.length === 0) {
      if (isOnline) {
        await supabase.from("pedidos_saida").delete().eq("id", autoOrderId);
      } else {
        enqueue({ type: "delete", table: "pedidos_saida", matchId: autoOrderId });
      }
    } else if (currentId) {
      // Save desconto and observacao on close
      const observacaoFinal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0
        ? upsertPartialPaymentObservation(latestObs, Number(valorPagoParcial))
        : stripPartialPaymentObservation(latestObs);
      if (isOnline) {
        await supabase.from("pedidos_saida").update({ cliente_id: clienteId, data, desconto: latestDesconto, observacao: observacaoFinal, tipo_pagamento: tipoPagamento } as any).eq("id", currentId);
      } else {
        enqueue({ type: "update", table: "pedidos_saida", matchId: currentId, data: { cliente_id: clienteId, data, desconto: latestDesconto, observacao: observacaoFinal, tipo_pagamento: tipoPagamento } });
      }
    }
    resetForm();
    qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
    qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
  };

  const ensureOrder = async (): Promise<string> => {
    const currentId = orderId || autoOrderIdRef.current;
    const latestDesconto = descontoRef.current;
    const latestObs = observacaoRef.current;
    const observacaoFinal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0
      ? upsertPartialPaymentObservation(latestObs, Number(valorPagoParcial))
      : stripPartialPaymentObservation(latestObs);
    if (currentId) {
      if (isOnline) {
        await supabase.from("pedidos_saida").update({ cliente_id: clienteId, data, observacao: observacaoFinal, tipo_pagamento: tipoPagamento, desconto: latestDesconto } as any).eq("id", currentId);
      } else {
        enqueue({ type: "update", table: "pedidos_saida", matchId: currentId, data: { cliente_id: clienteId, data, observacao: observacaoFinal, tipo_pagamento: tipoPagamento, desconto: latestDesconto } });
      }
      return currentId;
    }
    if (!motorista) throw new Error("Motorista não encontrado");
    if (!clienteId) throw new Error("Selecione o cliente");
    if (!isOnline) throw new Error("É necessário estar online para criar um novo pedido");
    const { data: pedido, error } = await supabase.from("pedidos_saida")
      .insert({ motorista_id: motorista.id, cliente_id: clienteId, data, created_by: user?.id, tipo_pagamento: tipoPagamento, desconto: latestDesconto } as any)
      .select().single();
    if (error) throw error;
    setAutoOrderId(pedido.id);
    return pedido.id;
  };

  const handleAddItem = useCallback(async (item: any, _isBaixa: boolean) => {
    try {
      const oid = await ensureOrder();
      if (isOnline) {
        const { data: saved, error } = await supabase.from("itens_saida")
          .insert({ pedido_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: item.preco || 0, is_baixa_ambulante: item.is_baixa_ambulante || false })
          .select().single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
        qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
        return { id: saved.id };
      } else {
        const tempId = `temp_${Date.now()}`;
        enqueue({ type: "insert", table: "itens_saida", data: { pedido_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: item.preco || 0, is_baixa_ambulante: item.is_baixa_ambulante || false } });
        return { id: tempId };
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      throw e;
    }
  }, [orderId, clienteId, data, motorista, user?.id, isOnline]);

  const handleEditItem = useCallback(async (item: any) => {
    if (!item.id) return;

    if (isOnline) {
      await supabase.from("itens_saida").update({ quantidade: item.quantidade, preco: item.preco }).eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
      // Trigger auto-syncs ambulante for baixa items
      if (item.is_baixa_ambulante) {
        qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
      }
    } else {
      enqueue({ type: "update", table: "itens_saida", matchId: item.id, data: { quantidade: item.quantidade, preco: item.preco } });
    }
  }, [isOnline]);

  const handleRemoveItem = useCallback(async (item: any) => {
    if (!item.id) return;

    if (isOnline) {
      await supabase.from("itens_saida").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
      // Trigger auto-syncs ambulante for baixa items
      if (item.is_baixa_ambulante) {
        qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
      }
    } else {
      enqueue({ type: "delete", table: "itens_saida", matchId: item.id });
    }
  }, [isOnline]);

  const saveCurrentState = async () => {
    const currentId = editId || autoOrderIdRef.current;
    if (!currentId) return;
    const latestDesconto = descontoRef.current;
    const latestObs = observacaoRef.current;
    const observacaoFinal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0
      ? upsertPartialPaymentObservation(latestObs, Number(valorPagoParcial))
      : stripPartialPaymentObservation(latestObs);
    if (isOnline) {
      await supabase.from("pedidos_saida").update({ cliente_id: clienteId, data, desconto: latestDesconto, observacao: observacaoFinal, tipo_pagamento: tipoPagamento } as any).eq("id", currentId);
    } else {
      enqueue({ type: "update", table: "pedidos_saida", matchId: currentId, data: { cliente_id: clienteId, data, desconto: latestDesconto, observacao: observacaoFinal, tipo_pagamento: tipoPagamento } });
    }
  };

  const handlePrint80mm = async () => {
    const oid = orderId;
    if (!oid) { toast({ title: "Salve o pedido antes de imprimir", variant: "destructive" }); return; }
    try {
      await saveCurrentState();
      const { data: fullOrder, error } = await supabase.from("pedidos_saida")
        .select("*, clientes(nome, cep, cidade, estado, bairro, complemento, telefone), motoristas(nome), itens_saida(*, produtos(descricao, unidade))")
        .eq("id", oid).maybeSingle();
      if (error) throw error;
      if (!fullOrder) { toast({ title: "Pedido não encontrado", variant: "destructive" }); return; }
      printSaida80mm(fullOrder, descontoRef.current);
    } catch (e: any) {
      console.error("Erro ao imprimir 80mm:", e);
      toast({ title: "Erro ao imprimir", description: e.message, variant: "destructive" });
    }
  };

  const handlePrintA4 = async () => {
    const oid = orderId;
    if (!oid) { toast({ title: "Salve o pedido antes de imprimir", variant: "destructive" }); return; }
    try {
      await saveCurrentState();
      const { data: fullOrder, error } = await supabase.from("pedidos_saida")
        .select("*, clientes(nome, cep, cidade, estado, bairro, complemento, telefone), motoristas(nome), itens_saida(*, produtos(descricao, unidade))")
        .eq("id", oid).maybeSingle();
      if (error) throw error;
      if (!fullOrder) { toast({ title: "Pedido não encontrado", variant: "destructive" }); return; }
      printSaidaA4(fullOrder, descontoRef.current, observacaoRef.current ?? "");
    } catch (e: any) {
      console.error("Erro ao imprimir A4:", e);
      toast({ title: "Erro ao imprimir", description: e.message, variant: "destructive" });
    }
  };

  // --- Ambulante auto-save ---
  const removeAmb = async (id: string) => {
    if (isOnline) {
      // Find the ambulante to get motorista_id and data
      const { data: amb } = await supabase.from("ambulantes").select("motorista_id, data").eq("id", id).single();
      if (amb) {
        // Find all pedidos_saida for same motorista and date
        const { data: pedidos } = await supabase.from("pedidos_saida")
          .select("id")
          .eq("motorista_id", amb.motorista_id)
          .eq("data", amb.data);
        if (pedidos && pedidos.length > 0) {
          const pedidoIds = pedidos.map(p => p.id);
          // Convert baixa_ambulante items to regular sales so they remain in totalizador
          await supabase.from("itens_saida")
            .update({ is_baixa_ambulante: false })
            .in("pedido_id", pedidoIds)
            .eq("is_baixa_ambulante", true);
        }
      }
      const { error } = await supabase.from("ambulantes").delete().eq("id", id);
      if (!error) {
        qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
        qc.invalidateQueries({ queryKey: ["my-orders"] });
        toast({ title: "Ambulante excluído!" });
      }
    } else {
      enqueue({ type: "delete", table: "ambulantes", matchId: id });
      toast({ title: "Ambulante será excluído ao sincronizar" });
    }
  };

  const resetAmbForm = () => { setAmbEditId(null); setAmbAutoOrderId(null); setAmbData(localToday()); setAmbItens([]); };

  const startEditAmb = (a: any) => {
    setAmbEditId(a.id);
    setAmbData(a.data);
    setAmbItens((a.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0).filter((i: any) => Number(i.quantidade) > 0).map((i: any) => ({ _key: nextKey(), id: i.id, produto_id: i.produto_id, quantidade: i.quantidade })));
    setAmbOpen(true);
  };

  const handleAmbDialogClose = async () => {
    if (ambAutoOrderId && ambItens.length === 0) {
      if (isOnline) {
        await supabase.from("ambulantes").delete().eq("id", ambAutoOrderId);
      } else {
        enqueue({ type: "delete", table: "ambulantes", matchId: ambAutoOrderId });
      }
    }
    resetAmbForm();
    qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
  };

  const ensureAmbOrder = async (): Promise<string> => {
    if (ambOrderId) {
      if (isOnline) {
        await supabase.from("ambulantes").update({ data: ambData }).eq("id", ambOrderId);
      } else {
        enqueue({ type: "update", table: "ambulantes", matchId: ambOrderId, data: { data: ambData } });
      }
      return ambOrderId;
    }
    if (!motorista) throw new Error("Motorista não encontrado");
    // Check if ambulante already exists for this date
    const existing = (ambulantes as any[]).find((a: any) => a.data === ambData);
    if (existing) {
      setAmbEditId(existing.id);
      return existing.id;
    }
    if (!isOnline) throw new Error("É necessário estar online para criar um novo ambulante");
    const { data: amb, error } = await supabase.from("ambulantes")
      .insert({ motorista_id: motorista.id, data: ambData, created_by: user?.id })
      .select().single();
    if (error) throw error;
    setAmbAutoOrderId(amb.id);
    return amb.id;
  };

  const handleAmbAddItem = useCallback(async (item: any) => {
    try {
      const oid = await ensureAmbOrder();
      if (isOnline) {
        const { data: saved, error } = await supabase.from("itens_ambulante")
          .insert({ ambulante_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: 0 })
          .select().single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
        return { id: saved.id };
      } else {
        const tempId = `temp_${Date.now()}`;
        enqueue({ type: "insert", table: "itens_ambulante", data: { ambulante_id: oid, produto_id: item.produto_id, quantidade: item.quantidade, preco: 0 } });
        return { id: tempId };
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      throw e;
    }
  }, [ambOrderId, ambData, motorista, user?.id, isOnline]);

  const handleAmbEditItem = useCallback(async (item: any) => {
    if (!item.id) return;
    if (isOnline) {
      await supabase.from("itens_ambulante").update({ quantidade: item.quantidade }).eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
    } else {
      enqueue({ type: "update", table: "itens_ambulante", matchId: item.id, data: { quantidade: item.quantidade } });
    }
  }, [isOnline]);

  const handleAmbRemoveItem = useCallback(async (item: any) => {
    if (!item.id) return;
    if (isOnline) {
      await supabase.from("itens_ambulante").delete().eq("id", item.id);
      qc.invalidateQueries({ queryKey: ["my-ambulantes"] });
    } else {
      enqueue({ type: "delete", table: "itens_ambulante", matchId: item.id });
    }
  }, [isOnline]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;
  if (role !== "motorista") return <Navigate to="/" replace />;

  const clienteOptions = clientes.map(c => ({ value: c.id, label: c.nome }));
  const produtoOptions = produtos.map(p => ({ value: p.id, label: `${p.descricao} (${p.unidade})` }));

  const ambulanteDates = [...new Set((ambulantes as any[]).map((a: any) => a.data))].sort();
  const stockByDate = ambulanteDates.map(d => {
    const stock = getAmbulanteStock(d);
    const rows = Array.from(stock.entries()).map(([id, v]) => ({ id, ...v, saldo: v.total })).filter(r => r.total > 0);
    return { date: d, rows: sortByUnitThenName(rows, r => r.unidade, r => r.descricao) };
  }).filter(d => d.rows.length > 0);

  if (showFinanceiro && motorista) {
    return <MotoristaFinanceiro motoristaId={motorista.id} motoristaNome={motorista.nome} onBack={() => setShowFinanceiro(false)} />;
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <OfflineIndicator />
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <img src="/logo-jp-flores.png" alt="JP Flores" className="h-8 w-auto shrink-0" />
        <span className="text-base font-semibold truncate">{motorista?.nome || ""}</span>
        <ChangePasswordDialog />
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setFixosDialogOpen(true)} title="Pedidos Fixos"><Package className="h-3.5 w-3.5" /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setClientesSheetOpen(true)} title="Clientes"><Users className="h-3.5 w-3.5" /></Button>
        {(motorista as any)?.terceirizado && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowFinanceiro(true)} title="Financeiro">
            <DollarSign className="h-3.5 w-3.5 mr-1" />Financeiro
          </Button>
        )}
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={signOut} title="Sair"><LogOut className="h-3.5 w-3.5" /></Button>
      </div>

      <Tabs defaultValue="pedidos">
        <div className="flex flex-col gap-2 mb-4">
          <TabsList className="w-full">
            <TabsTrigger value="pedidos" className="flex-1">Pedidos de Saída</TabsTrigger>
            <TabsTrigger value="ambulante" className="flex-1"><ShoppingBag className="mr-1 h-4 w-4" />Ambulante</TabsTrigger>
            <TabsTrigger value="orcamentos" className="flex-1"><FileText className="mr-1 h-4 w-4" />Orçamentos</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setSaldoOpen(true)}><BarChart3 className="mr-1 h-4 w-4" />Saldo da Empresa</Button>
            <ApplyPricesButton markup={markup} motoristaId={motorista?.id} />
            <MarkupPopover markup={markup} customMarkup={customMarkup} isCustomMarkup={isCustomMarkup} presets={MARKUP_PRESETS} onPresetChange={handleMarkupChange} onCustomChange={handleCustomMarkupChange} onCustomActivate={() => { setIsCustomMarkup(true); setCustomMarkup(String(markup)); }} />
          </div>
        </div>

        <TabsContent value="pedidos">
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <select value={filterDate} onChange={e => setFilterDate(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring flex-1 min-w-0">
                  <option value="">Todas as datas</option>
                  {[...new Set(pedidos.map((p: any) => p.data))].sort().reverse().map(d => (
                    <option key={d} value={d}>{d.split("-").reverse().join("/")}</option>
                  ))}
                </select>
                {filterDate && <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setFilterDate("")}><X className="h-4 w-4" /></Button>}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={filterCliente ? "default" : "outline"} size="icon" className="h-9 w-9 shrink-0" title="Buscar cliente">
                    <Search className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-2" align="start">
                  <input
                    type="text"
                    value={filterCliente}
                    onChange={e => setFilterCliente(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                    autoFocus
                  />
                  {filterCliente && <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setFilterCliente("")}>Limpar</Button>}
                </PopoverContent>
              </Popover>
              <select value={filterPagamento} onChange={e => { const v = e.target.value; setFilterPagamento(v); localStorage.setItem("motorista-filter-pagamento", v); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring flex-1 min-w-0">
                <option value="">Pgto</option>
                <option value="pendente">Pendente</option>
                <option value="avista">À vista</option>
                <option value="aprazo">A prazo</option>
                <option value="parcial">Parcial</option>
              </select>
              {(filterCliente || filterPagamento) && <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setFilterCliente(""); setFilterPagamento(""); localStorage.removeItem("motorista-filter-pagamento"); }}><X className="h-4 w-4" /></Button>}
              <Button variant={showArchived ? "default" : "outline"} size="icon" className="h-9 w-9 shrink-0" title={showArchived ? "Voltar" : "Faturados"} onClick={() => {
                if (showArchived) { setShowArchived(false); } else { setConfirmArchived(true); }
              }}>
                <DollarSign className="h-4 w-4" />
              </Button>
            </div>
            {filterDate && (
              <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs w-fit" onClick={async () => {
                try {
                  // Always fetch fresh data from the database to avoid stale cache issues
                  const { data: freshPedidos, error } = await supabase.from("pedidos_saida")
                    .select("*, clientes(nome, cep, cidade, estado, bairro, complemento, telefone), motoristas(nome), itens_saida(*, produtos(descricao, unidade))")
                    .eq("motorista_id", motorista!.id)
                    .eq("data", filterDate)
                    .eq("archived", false);
                  if (error) throw error;
                  if (!freshPedidos || freshPedidos.length === 0) { toast({ title: "Nenhum pedido nessa data" }); return; }
                  const sorted = freshPedidos.sort((a: any, b: any) => (a.clientes?.nome || "").localeCompare(b.clientes?.nome || "", "pt-BR"));
                  printAllSaidasA4(sorted);
                } catch (err: any) {
                  toast({ title: "Erro ao buscar pedidos", description: err.message, variant: "destructive" });
                }
              }}>
                <Printer className="h-4 w-4" />Imprimir Pedidos
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between mb-3">
            <Dialog open={open} onOpenChange={async v => { if (!v) { await handleDialogClose(); } setOpen(v); }}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Pedido</Button></DialogTrigger>
              <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
                <div className="rounded-lg border bg-muted/40 px-2 py-1.5 space-y-1.5">
                  <Button variant="ghost" className="w-full justify-center gap-1.5 h-7 text-xs font-semibold" onClick={async () => { await handleDialogClose(); setOpen(false); }}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {editId ? "Editar" : "Novo"} Pedido — Voltar
                  </Button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <SearchableSelect options={clienteOptions} value={clienteId} onValueChange={(v) => { setClienteId(v); const oid = editId || autoOrderIdRef.current; if (oid && v) { if (isOnline) { supabase.from("pedidos_saida").update({ cliente_id: v } as any).eq("id", oid).then(() => qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] })); } else { enqueue({ type: "update", table: "pedidos_saida", matchId: oid, data: { cliente_id: v } }); } } }} placeholder="Cliente" />
                    <DatePicker value={data} onChange={guardedDateChange} className="w-full" />
                  </div>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">

                  {clienteId && cliTemplatesForCliente.length > 0 && (
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <Select onValueChange={(id) => {
                        const tpl = cliTemplatesForCliente.find((t: any) => t.id === id);
                        if (tpl) setConfirmImportTpl({ template: tpl, type: "cliente" });
                      }}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Importar pedido fixo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cliTemplatesForCliente.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.nome} ({(t.itens_cliente_template || []).length} itens)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {currentStock.size > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                          <span className="flex items-center gap-1"><ShoppingBag className="h-4 w-4" /> Saldo Ambulante ({data.split("-").reverse().join("/")})</span>
                          <ChevronsUpDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="rounded-md border p-2 bg-muted/50 mt-1 max-h-48 overflow-y-auto">
                          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] leading-tight">
                            {Array.from(currentStock.entries()).sort((a, b) => {
                              const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
                              const ua = UNIT_ORDER[a[1].unidade] ?? 99;
                              const ub = UNIT_ORDER[b[1].unidade] ?? 99;
                              if (ua !== ub) return ua - ub;
                              return a[1].descricao.localeCompare(b[1].descricao, "pt-BR");
                            }).map(([id, v]) => {
                              const saldo = v.total;
                              return (
                                <div key={id} className="flex justify-between items-baseline min-w-0 gap-1">
                                  <span className="truncate text-muted-foreground">{v.descricao}</span>
                                  <span className="font-semibold tabular-nums shrink-0">{saldo}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  <OrderItemsEditor
                    ref={editorRef}
                    items={itens}
                    setItems={setItens}
                    produtoOptions={produtoOptions}
                    priceField="preco"
                    getSuggestedPrice={getSuggestedPrice}
                    showAmbulanteButton={true}
                    currentStock={currentStock}
                    onAddItem={handleAddItem}
                    onEditItem={handleEditItem}
                    onRemoveItem={handleRemoveItem}
                    ambulantePrimary={data <= localToday() && currentStock.size > 0}
                    priorityProductIds={produtosPrioritarios}
                    orderDate={data}
                    showCooperfloraButton
                    companySaldo={companySaldo}
                    companySaldoLoading={companySaldoLoading}
                    cooperfloraStage={cooperfloraStage}
                    onCooperfloraStageChange={setCooperfloraStage}
                  />

                  {/* Desconto + Observação inline */}
                  <div className="flex items-center gap-1">
                    <Popover modal={false}>
                      <PopoverTrigger asChild>
                        <Button type="button" size="sm" variant={desconto > 0 ? "default" : "outline"} className="h-8 px-2 gap-1 text-xs">
                          <Percent className="h-3.5 w-3.5" />
                          {desconto > 0 ? `${desconto}%` : "0"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="start">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant={desconto === 0 && !isCustomDesconto ? "default" : "outline"} onClick={() => { setDesconto(0); setIsCustomDesconto(false); setCustomDesconto(""); }} className="h-7 px-2 text-xs">Sem</Button>
                          {DISCOUNT_PRESETS.map(p => (
                            <Button key={p} type="button" size="sm" variant={desconto === p && !isCustomDesconto ? "default" : "outline"} onClick={() => { setDesconto(p); setIsCustomDesconto(false); setCustomDesconto(""); }} className="h-7 px-2 text-xs">{p}%</Button>
                          ))}
                          <Button type="button" size="sm" variant={isCustomDesconto ? "default" : "outline"} onClick={() => { setIsCustomDesconto(true); setCustomDesconto(desconto > 0 ? String(desconto) : ""); }} className="h-7 px-2 text-xs">Outro</Button>
                          {isCustomDesconto && (
                            <div className="flex items-center gap-1">
                              <Input type="number" value={customDesconto} onChange={e => { setCustomDesconto(e.target.value); const n = Number(e.target.value); if (!isNaN(n) && n >= 0) setDesconto(n); }} className="h-7 w-14 text-xs" min={0} max={100} step={1} placeholder="%" />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>

                    <Popover modal={false}>
                      <PopoverTrigger asChild>
                        <Button type="button" size="sm" variant={observacao.trim() ? "default" : "outline"} className="h-8 w-8 p-0">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2" align="start">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">Observação (cabeçalho A4)</Label>
                          <Textarea
                            value={stripCochoFromObs(observacao)}
                            onChange={e => {
                              const cochoMatch = observacao.match(/\[COCHO:preto=\d+,velling=\d+,quebrado=\d+\]/);
                              const newText = e.target.value + (cochoMatch ? ` ${cochoMatch[0]}` : "");
                              setObservacao(newText);
                            }}
                            onKeyDown={e => e.stopPropagation()}
                            placeholder="Digite a observação..."
                            className="min-h-[80px] text-sm"
                          />
                          {stripCochoFromObs(observacao).trim() && (
                            <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => {
                              const cochoMatch = observacao.match(/\[COCHO:preto=\d+,velling=\d+,quebrado=\d+\]/);
                              setObservacao(cochoMatch ? cochoMatch[0] : "");
                            }}>
                              Limpar
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>

                    <CochoButton observacao={observacao} onObservacaoChange={setObservacao} />

                    {orderId && itens.length > 0 && (
                      <>
                        <Button type="button" size="sm" variant="secondary" className="h-8 px-2 gap-1 text-xs" onClick={handlePrint80mm}>
                          <Printer className="h-3.5 w-3.5" />80mm
                        </Button>
                        <Button type="button" size="sm" variant="secondary" className="h-8 px-2 gap-1 text-xs" onClick={handlePrintA4}>
                          <Printer className="h-3.5 w-3.5" />A4
                        </Button>
                      </>
                    )}

                    <Select value={tipoPagamento} onValueChange={async (v) => {
                      if (v === "parcial") {
                        if (orderId) {
                          setParcialDialog({ orderId });
                          setParcialValor(valorPagoParcial);
                        }
                        return;
                      }
                      setTipoPagamento(v);
                      if (v !== "parcial") setValorPagoParcial("");
                      if (orderId) {
                        await changeTipoPagamento(orderId, v);
                      }
                    }}>
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="avista">À vista</SelectItem>
                        <SelectItem value="aprazo">A prazo</SelectItem>
                        <SelectItem value="parcial">Parcial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subtotal / Desconto / Total Final */}
                  {itens.length > 0 && (() => {
                    const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
                    const totalFinal = desconto > 0 ? subtotal * (1 - desconto / 100) : subtotal;
                    const parcialVal = tipoPagamento === "parcial" && Number(valorPagoParcial) > 0 ? Number(valorPagoParcial) : null;
                    return (
                      <div className="rounded-md border bg-muted/40 p-2 space-y-0.5 text-sm">
                        {desconto > 0 ? (
                          <>
                            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
                            <div className="flex justify-between text-destructive"><span>Desconto ({desconto}%)</span><span>- R$ {(subtotal - totalFinal).toFixed(2)}</span></div>
                            <div className="flex justify-between font-bold text-base"><span>Total Final</span><span>R$ {totalFinal.toFixed(2)}</span></div>
                          </>
                        ) : (
                          <div className="flex justify-between font-bold"><span>Total</span><span>R$ {subtotal.toFixed(2)}</span></div>
                        )}
                        {parcialVal !== null && (
                          <>
                            <div className="flex justify-between text-blue-600"><span>Pagou</span><span>R$ {parcialVal.toFixed(2)}</span></div>
                            <div className="flex justify-between font-bold text-amber-600"><span>Ficou</span><span>R$ {(totalFinal - parcialVal).toFixed(2)}</span></div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? <p>Carregando...</p> :
            (() => {
              const filteredPedidos = pedidos
                .filter((p: any) => !filterDate || p.data === filterDate)
                .filter((p: any) => !filterCliente || (p.clientes?.nome || "").toLowerCase().includes(filterCliente.toLowerCase()))
                .filter((p: any) => !filterPagamento || (p.tipo_pagamento || "pendente") === filterPagamento);
              // Build date-color index: alternate bg per unique date
              const uniqueDates = [...new Set(filteredPedidos.map((p: any) => p.data))].sort();
              const dateColorIndex: Record<string, number> = {};
              uniqueDates.forEach((d, i) => { dateColorIndex[d] = i % 2; });
              return (
                <>
                  {(filterDate || filterCliente || filterPagamento) && (
                    <p className="text-center text-sm font-medium text-muted-foreground py-1">{filteredPedidos.length} pedido(s)</p>
                  )}
                  <PaginatedList items={filteredPedidos} resetDeps={[filterDate, filterCliente, filterPagamento]}>
                    {(visiblePedidos: any[]) => (<>
                  {/* Mobile list */}
                  <div className="md:hidden space-y-1">
                    {visiblePedidos.map((p: any) => {
                      const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
                      const disc = Number(p.desconto) || 0;
                      const total = disc > 0 ? subtotal * (1 - disc / 100) : subtotal;
                      const tp = p.tipo_pagamento || "pendente";
                      const bloqueado = pedidoBloqueadoSet.has(p.id);
                      return (
                        <div key={p.id} className={`border rounded-lg p-2 ${bloqueado ? "opacity-70" : "cursor-pointer active:bg-accent/50"} ${dateColorIndex[p.data] === 1 ? "bg-emerald-50" : ""}`} onClick={() => !bloqueado && startEdit(p)}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{p.data.split("-").slice(1).reverse().join("/")}</span>
                            <span className="font-medium text-sm truncate flex-1 ml-2">{p.clientes?.nome}</span>
                            {bloqueado && <Badge variant="outline" className="text-[10px] border-muted-foreground/30">Faturado</Badge>}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">R$ {total.toFixed(2)}</span>
                              {disc > 0 && <span className="text-[10px] text-muted-foreground line-through">R$ {subtotal.toFixed(2)}</span>}
                              <Badge className={tp === "avista" ? "bg-emerald-600 text-white text-[10px]" : tp === "aprazo" ? "bg-amber-500 text-white text-[10px]" : tp === "parcial" ? "bg-blue-500 text-white text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                                {tp === "avista" ? "À vista" : tp === "aprazo" ? "A prazo" : tp === "parcial" ? (() => { const pv = extractPartialPaymentValue(p.observacao); return pv ? `Parcial R$${pv.toFixed(2)}` : "Parcial"; })() : "Pend."}
                              </Badge>
                            </div>
                            <div className="flex gap-0" onClick={e => e.stopPropagation()}>
                              {!bloqueado && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>}
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPrintTarget(p)}><Printer className="h-4 w-4" /></Button>
                              {!bloqueado && (motorista as any)?.terceirizado && tp !== "pendente" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); const parcial = extractPartialPaymentValue(p.observacao); setFaturarValorPago(parcial !== null ? parcial.toFixed(2) : ""); setFaturarAction(p); }}>
                                  <DollarSign className="h-4 w-4 text-emerald-600" />
                                </Button>
                              )}
                              {!bloqueado && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmAction({ type: "pedido", item: p })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <Table className="hidden md:table">
                    <TableHeader><TableRow>
                      <TableHead className="w-14">Data</TableHead><TableHead>Cliente</TableHead><TableHead className="w-[12%]">Total</TableHead><TableHead className="w-16">Pgto</TableHead><TableHead className="w-24">Ações</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {visiblePedidos.map((p: any) => {
                        const subtotalD = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
                        const discD = Number(p.desconto) || 0;
                        const totalD = discD > 0 ? subtotalD * (1 - discD / 100) : subtotalD;
                        const tp = p.tipo_pagamento || "pendente";
                        const bloqueado = pedidoBloqueadoSet.has(p.id);
                        return (
                          <TableRow key={p.id} className={`${bloqueado ? "opacity-70" : "cursor-pointer"} h-9 ${dateColorIndex[p.data] === 1 ? "bg-emerald-50 hover:bg-emerald-100" : ""}`} onClick={() => !bloqueado && startEdit(p)}>
                            <TableCell className="w-14 text-xs">{p.data.split("-").slice(1).reverse().join("/")}</TableCell>
                            <TableCell>
                              {p.clientes?.nome}
                              {bloqueado && <Badge variant="outline" className="text-[10px] ml-1 border-muted-foreground/30">Faturado</Badge>}
                            </TableCell>
                            <TableCell>
                              R$ {totalD.toFixed(2)}
                              {discD > 0 && <span className="text-xs text-muted-foreground line-through ml-1">R$ {subtotalD.toFixed(2)}</span>}
                            </TableCell>
                            <TableCell>
                              <Badge className={tp === "avista" ? "bg-emerald-600 text-white hover:bg-emerald-700 text-[10px]" : tp === "aprazo" ? "bg-amber-500 text-white hover:bg-amber-600 text-[10px]" : tp === "parcial" ? "bg-blue-500 text-white hover:bg-blue-600 text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                                {tp === "avista" ? "À vista" : tp === "aprazo" ? "A prazo" : tp === "parcial" ? "Parcial" : "Pend."}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                {!bloqueado && <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => startEdit(p)}><Pencil className="h-5 w-5" /></Button>}
                                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setPrintTarget(p)}><Printer className="h-5 w-5" /></Button>
                                {!bloqueado && (motorista as any)?.terceirizado && tp !== "pendente" && (
                                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => { const parcial = extractPartialPaymentValue(p.observacao); setFaturarValorPago(parcial !== null ? parcial.toFixed(2) : ""); setFaturarAction(p); }} title="Faturar">
                                    <DollarSign className="h-5 w-5 text-emerald-600" />
                                  </Button>
                                )}
                                {!bloqueado && <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setConfirmAction({ type: "pedido", item: p })}><Trash2 className="h-5 w-5 text-destructive" /></Button>}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </>)}
                  </PaginatedList>
                  {filterDate && filteredPedidos.length > 0 && (() => {
                    let totalVenda = 0;
                    let totalCusto = 0;
                    filteredPedidos.forEach((p: any) => {
                      const disc = Number(p.desconto) || 0;
                      (p.itens_saida || []).forEach((it: any) => {
                        const qty = Number(it.quantidade);
                        const preco = Number(it.preco);
                        const subtItem = qty * preco;
                        totalVenda += disc > 0 ? subtItem * (1 - disc / 100) : subtItem;
                        const custo = filterDateCostPrices[it.produto_id] || 0;
                        totalCusto += qty * custo;
                      });
                    });
                    return (
                      <div className="mt-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex flex-col sm:flex-row items-center justify-around gap-2 text-sm font-semibold">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>Total Compra (Custo):</span>
                          <span className="text-destructive">R$ {totalCusto.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>Total Vendas:</span>
                          <span className="text-emerald-600">R$ {totalVenda.toFixed(2)}</span>
                        </div>
                        {totalCusto > 0 && totalVenda > 0 && (
                          <div className="flex items-center gap-2">
                            <Percent className="h-4 w-4 text-muted-foreground" />
                            <span>Markup:</span>
                            <span className="text-primary">{((totalVenda / totalCusto - 1) * 100).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
        </TabsContent>

        <TabsContent value="ambulante">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Meus Ambulantes</h2>
                <div className="flex items-center gap-2">
                  <Checkbox id="mot-amb-excel" checked={alsoExcel} onCheckedChange={v => setAlsoExcel(!!v)} />
                  <label htmlFor="mot-amb-excel" className="text-sm cursor-pointer">Excel</label>
                </div>
              </div>
              <Dialog open={ambOpen} onOpenChange={v => { if (!v) handleAmbDialogClose(); setAmbOpen(v); }}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Ambulante</Button></DialogTrigger>
                <DialogContent className="w-[95vw] max-w-4xl h-[95vh] flex flex-col overflow-hidden">
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                    <Button variant="ghost" className="w-full justify-center gap-2 h-9 text-sm font-semibold" onClick={() => { handleAmbDialogClose(); setAmbOpen(false); }}>
                      <ArrowLeft className="h-4 w-4" />
                      {ambEditId ? "Editar" : "Novo"} Ambulante — Voltar
                    </Button>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Data</Label>
                      <DatePicker value={ambData} onChange={(newDate) => {
                        // Block changing to a date that already has an ambulante (unless it's the one being edited)
                        const existing = (ambulantes as any[]).find((a: any) => a.data === newDate && a.id !== ambEditId);
                        if (existing) {
                          toast({ title: "Já existe um ambulante para essa data", description: "Edite o ambulante existente ao invés de criar outro.", variant: "destructive" });
                          return;
                        }
                        setAmbData(newDate);
                      }} />
                    </div>
                  </div>
                  <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                    {ambTemplates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <Select onValueChange={(id) => {
                          const tpl = ambTemplates.find((t: any) => t.id === id);
                          if (tpl) setConfirmImportTpl({ template: tpl, type: "ambulante" });
                        }}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Importar pedido fixo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {ambTemplates.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.nome} ({(t.itens_ambulante_template || []).length} itens)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <OrderItemsEditor
                      items={ambItens}
                      setItems={setAmbItens}
                      produtoOptions={produtoOptions}
                      onAddItem={handleAmbAddItem}
                      onEditItem={handleAmbEditItem}
                      onRemoveItem={handleAmbRemoveItem}
                      priorityProductIds={produtosPrioritariosAmb}
                    />

                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {(ambulantes as any[]).length === 0 ? (
              <p className="text-muted-foreground">Nenhum ambulante registrado.</p>
            ) : (
              (ambulantes as any[]).map((a: any) => {
                return (
                  <div key={a.id} className="space-y-2 border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{a.data.split("-").reverse().join("/")}</h3>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={async () => {
                          // itens_ambulante.quantidade IS the saldo now
                          const saldoItems = (a.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0);
                          const saldoAmbulante = { ...a, itens_ambulante: saldoItems };
                          const dateCosts = await fetchCostPricesForDate(a.data);
                          printAmbulanteA4(saldoAmbulante, motorista?.nome || "", dateCosts, markup, { hideTotal: true });
                          if (alsoExcel) {
                            const items = saldoItems.map((i: any) => {
                              const cost = dateCosts[i.produto_id] || 0;
                              const precoVenda = Math.round(cost * (1 + markup / 100) * 100) / 100;
                              return { produto: i.produtos?.descricao || "", unidade: i.produtos?.unidade || "", quantidade: Number(i.quantidade), preco: precoVenda, total: (Number(i.quantidade) * precoVenda) };
                            });
                            const grandTotal = items.reduce((s: number, it: any) => s + it.total, 0);
                            exportToExcel({
                              filename: `ambulante_saldo_${a.data}`, sheetName: "Saldo Ambulante", title: "Saldo Ambulante",
                              info: [`Motorista: ${motorista?.nome || ""}`, `Data: ${a.data.split("-").reverse().join("/")}`, `Margem de venda: ${markup}%`],
                              columns: [
                                { header: "Produto", key: "produto", width: 30 },
                                { header: "UN", key: "unidade", width: 8, align: "center" },
                                { header: "Qtd", key: "quantidade", width: 8, align: "center" },
                                { header: "Preço", key: "preco", width: 12, format: "currency", align: "right" },
                                { header: "Total", key: "total", width: 14, format: "currency", align: "right" },
                              ],
                              rows: items,
                              totalRow: { label: "Total:", value: grandTotal, colSpan: 4 },
                            });
                          }
                        }}><Printer className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Imprimir 80mm" onClick={async () => {
                          const saldoItems = (a.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0);
                          const saldoAmbulante = { ...a, itens_ambulante: saldoItems };
                          const dateCosts = await fetchCostPricesForDate(a.data);
                          printAmbulante80mm(saldoAmbulante, motorista?.nome || "", dateCosts, markup);
                        }}><span className="text-[10px] font-bold">80</span></Button>
                        <Button variant="ghost" size="icon" onClick={() => startEditAmb(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmAction({ type: "ambulante", item: a })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Produto</TableHead><TableHead className="w-16">UN</TableHead><TableHead className="w-16 text-center">Saldo</TableHead><TableHead className="w-20 text-right">Preço</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {sortByUnitThenName((a.itens_ambulante || []).filter((i: any) => Number(i.quantidade) > 0), (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "").map((i: any) => {
                          const cost = (latestCostPrices as Record<string, number>)[i.produto_id] || 0;
                          const precoVenda = cost > 0 ? Math.round(cost * (1 + markup / 100) * 100) / 100 : 0;
                          return (
                            <TableRow key={i.id}>
                              <TableCell className="text-sm">{i.produtos?.descricao}</TableCell>
                              <TableCell className="text-sm">{i.produtos?.unidade}</TableCell>
                              <TableCell className={`text-center text-sm font-medium ${Number(i.quantidade) < 0 ? "text-destructive" : ""}`}>{i.quantidade}</TableCell>
                              <TableCell className="text-right text-sm">{precoVenda > 0 ? precoVenda.toFixed(2) : "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })
            )}

            {stockByDate.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between">
                    <span>Saldo Geral por Data</span>
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {stockByDate.map(({ date, rows }) => (
                    <div key={date} className="mt-2 border rounded-md p-3">
                      <h4 className="font-medium mb-2">{date.split("-").reverse().join("/")}</h4>
                      <div className="grid grid-cols-2 gap-1 text-sm">
                        {rows.map(r => (
                          <div key={r.id} className="flex justify-between">
                            <span>{r.descricao}</span>
                            <span className={`font-medium ${r.saldo < 0 ? "text-destructive" : ""}`}>{r.saldo}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </TabsContent>


        <TabsContent value="orcamentos">
          <Orcamentos />
        </TabsContent>
      </Tabs>

      {/* Saldo Dialog */}
      <Dialog open={saldoOpen} onOpenChange={setSaldoOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Saldo da Empresa</DialogTitle></DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <Label>Data:</Label>
              <DatePicker value={saldoData} onChange={setSaldoData} className="w-auto" />
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => printSaldoEmpresa80mm(saldoRows, saldoData, markup)}
                disabled={saldoRows.filter((r) => r.saldo > 0).length === 0}
              >
                <Printer className="h-4 w-4 mr-1" />
                Imprimir 80mm
              </Button>
            </div>
            <div className="overflow-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-[3.5rem]">UN</TableHead>
                    <TableHead className="w-[4rem] text-right">Saldo</TableHead>
                    <TableHead className="w-[5rem] text-right">Preço</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saldoRows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.descricao}</TableCell>
                      <TableCell>{r.unidade}</TableCell>
                      <TableCell className={cn("text-right", r.saldo < 0 && "text-destructive font-bold")}>{r.saldo}</TableCell>
                      <TableCell className="text-right">{r.precoVenda > 0 ? `R$ ${r.precoVenda.toFixed(2)}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {saldoRows.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum movimento nesta data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Confirm delete dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => { if (!v) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {confirmAction?.type === "pedido" ? "Pedido" : "Ambulante"}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!confirmAction) return "";
                const item = confirmAction.item;
                const dataFmt = item.data.split("-").reverse().join("/");
                if (confirmAction.type === "pedido") {
                  const total = (item.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
                  const cliente = item.clientes?.nome || "—";
                  return `Deseja realmente excluir o pedido do cliente ${cliente}, com data ${dataFmt}, no valor de R$ ${total.toFixed(2)}?`;
                } else {
                  const totalItens = (item.itens_ambulante || []).length;
                  return `Deseja realmente excluir o ambulante com data ${dataFmt} (${totalItens} itens)?`;
                }
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!confirmAction) return;
              if (confirmAction.type === "pedido") removePedido(confirmAction.item.id);
              else removeAmb(confirmAction.item.id);
              setConfirmAction(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print choice dialog */}
      <AlertDialog open={!!printTarget} onOpenChange={(v) => { if (!v) setPrintTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Imprimir Pedido</AlertDialogTitle>
            <AlertDialogDescription>
              {printTarget?.clientes?.nome || ""} — R$ {((printTarget?.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0)).toFixed(2)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            {isBluetoothSupported() && (
              <Button className="w-full" variant="default" onClick={async () => {
                try {
                  await btPrintSaida(printTarget, Number(printTarget.desconto) || 0);
                  toast({ title: "Impresso via Bluetooth!" });
                } catch (e: any) {
                  toast({ title: "Erro Bluetooth", description: e.message, variant: "destructive" });
                }
                setPrintTarget(null);
              }}>
                <Bluetooth className="mr-2 h-4 w-4" />Bluetooth 80mm
              </Button>
            )}
            <div className="flex gap-3">
              <Button className="flex-1" variant="secondary" onClick={() => { printSaida80mm(printTarget, Number(printTarget.desconto) || 0); setPrintTarget(null); }}>
                <Printer className="mr-2 h-4 w-4" />80mm PDF
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => { printSaidaA4(printTarget, Number(printTarget.desconto) || 0, printTarget.observacao || ""); setPrintTarget(null); }}>
                <Printer className="mr-2 h-4 w-4" />A4
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Faturar dialog (terceirizado only) */}
      <AlertDialog open={!!faturarAction} onOpenChange={(v) => { if (!v) { setFaturarAction(null); setFaturarValorPago(""); setFaturarObs(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Faturar Pedido</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!faturarAction) return "";
                const p = faturarAction;
                const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
                const disc = Number(p.desconto) || 0;
                const total = disc > 0 ? subtotal * (1 - disc / 100) : subtotal;
                const tp = p.tipo_pagamento || "aprazo";
                const tpLabel = tp === "avista" ? "À vista" : tp === "aprazo" ? "A prazo" : tp === "parcial" ? "Parcial" : tp;
                return `Faturar pedido do cliente ${p.clientes?.nome || "—"}, data ${p.data.split("-").reverse().join("/")}, valor R$ ${total.toFixed(2)} como "${tpLabel}"?`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {faturarAction?.tipo_pagamento === "parcial" && (
            <div className="px-1 pb-2">
              <Label className="text-sm">Valor já pago (R$)</Label>
              <Input type="number" value={faturarValorPago} onChange={e => setFaturarValorPago(e.target.value)} placeholder="0.00" min={0} step={0.01} />
            </div>
          )}
          <div className="px-1 pb-2">
            <Label className="text-sm">Observação (opcional)</Label>
            <Input value={faturarObs} onChange={e => setFaturarObs(e.target.value)} placeholder="Obs do faturamento..." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!faturarAction) return;
              const p = faturarAction;
              const subtotal = (p.itens_saida || []).reduce((s: number, i: any) => s + i.quantidade * i.preco, 0);
              const disc = Number(p.desconto) || 0;
              const total = disc > 0 ? subtotal * (1 - disc / 100) : subtotal;
              const tp = p.tipo_pagamento || "aprazo";
              let valorPago = 0;
              if (tp === "avista") {
                valorPago = total;
              } else if (tp === "parcial") {
                valorPago = Number(faturarValorPago) || 0;
                if (valorPago <= 0 || valorPago >= total) {
                  toast({ title: "Informe um valor parcial válido (entre 0 e o total)", variant: "destructive" });
                  return;
                }
              }
              const status = tp === "avista" ? "pago" : valorPago > 0 ? "parcial" : "aberto";

              await supabase.from("pedidos_saida").update({ archived: true } as any).eq("id", p.id);
              const { data: existing } = await supabase.from("financeiro_receber").select("id").eq("pedido_saida_id", p.id).maybeSingle();
              let finId: string | null = existing?.id || null;
              if (!existing) {
                const { data: novoRec } = await supabase.from("financeiro_receber").insert({
                  pedido_saida_id: p.id,
                  cliente_id: p.cliente_id,
                  motorista_id: p.motorista_id,
                  data_venda: p.data,
                  valor_total: total,
                  valor_pago: valorPago,
                  status,
                  tipo_pagamento: tp,
                  observacao: faturarObs.trim() || "",
                } as any).select("id").single();
                finId = novoRec?.id || null;
              }
              if (finId && (tp === "avista" || tp === "parcial") && valorPago > 0) {
                await registrarPagamentoFaturamento({
                  financeiroId: finId, clienteId: p.cliente_id, motoristaId: p.motorista_id,
                  valorPago, dataPagamento: p.data,
                  tipoPagamento: tp as "avista" | "parcial", userId: user?.id,
                  observacaoExtra: faturarObs.trim() || undefined,
                });
              }
              // Cochos: sempre somar ao saldo do cliente (controle manual via cobrança)
              const cocho = parseCochoFromObs(p.observacao);
              if (cochoHasValues(cocho)) {
                await mergeCochoIntoCliente(p.cliente_id, cocho);
              }
              qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
              qc.invalidateQueries({ queryKey: ["pedidos-com-cobranca"] });
              qc.invalidateQueries({ queryKey: ["motorista-financeiro"] });
              qc.invalidateQueries({ queryKey: ["pagamentos"] });
              qc.invalidateQueries({ queryKey: ["pagamento_alocacoes"] });
              qc.invalidateQueries({ queryKey: ["cochos_cliente"] });
              toast({ title: "Pedido faturado!" });
              setFaturarAction(null);
              setFaturarValorPago("");
              setFaturarObs("");
            }}>Faturar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Fixos Dialog */}
      <Dialog open={fixosDialogOpen} onOpenChange={(v) => { if (!v) { resetTplForm(); resetCtplForm(); } setFixosDialogOpen(v); }}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Pedidos Fixos</DialogTitle></DialogHeader>
          <Tabs value={fixosTab} onValueChange={v => setFixosTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="w-full">
              <TabsTrigger value="ambulante" className="flex-1"><ShoppingBag className="mr-1 h-4 w-4" />Ambulante</TabsTrigger>
              <TabsTrigger value="cliente" className="flex-1"><Users className="mr-1 h-4 w-4" />Cliente</TabsTrigger>
            </TabsList>

            <TabsContent value="ambulante" className="flex-1 overflow-y-auto mt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">Meus Pedidos Fixos — Ambulante</span>
                <Dialog open={tplOpen} onOpenChange={(v) => { if (!v) handleTplDialogClose(); setTplOpen(v); }}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Novo</Button></DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                    <DialogHeader><DialogTitle>{tplEditId ? "Editar" : "Novo"} Pedido Fixo (Ambulante)</DialogTitle></DialogHeader>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                      <div className="space-y-1"><Label>Nome</Label><Input value={tplNome} onChange={e => setTplNome(e.target.value)} placeholder="Ex: Pedido do dia a dia" /></div>
                      <OrderItemsEditor
                        items={tplItens}
                        setItems={setTplItens}
                        produtoOptions={produtoOptions.map(p => ({ value: p.value, label: p.label }))}
                        onAddItem={tplAddItem}
                        onEditItem={tplEditItem}
                        onRemoveItem={tplRemoveItem}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {ambTemplates.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum pedido fixo de ambulante.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="w-16">Itens</TableHead><TableHead className="w-20">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ambTemplates.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm">{t.nome}</TableCell>
                        <TableCell className="text-sm">{(t.itens_ambulante_template || []).length}</TableCell>
                        <TableCell><div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => startEditTpl(t)}><Pencil className="h-5 w-5" /></Button>
                          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setTplConfirmDelete(t)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                        </div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="cliente" className="flex-1 overflow-y-auto mt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">Meus Pedidos Fixos — Cliente</span>
                <Dialog open={ctplOpen} onOpenChange={(v) => { if (!v) handleCtplDialogClose(); setCtplOpen(v); }}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Novo</Button></DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                    <DialogHeader><DialogTitle>{ctplEditId ? "Editar" : "Novo"} Pedido Fixo (Cliente)</DialogTitle></DialogHeader>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                      <div className="space-y-1"><Label>Nome</Label><Input value={ctplNome} onChange={e => setCtplNome(e.target.value)} placeholder="Ex: Pedido semanal" /></div>
                      <div className="space-y-1"><Label>Cliente</Label><SearchableSelect options={clienteOptions} value={ctplClienteId} onValueChange={setCtplClienteId} placeholder="Selecione cliente" /></div>
                      <div className="space-y-1">
                        <Label>Dia da semana</Label>
                        <Select value={ctplDiaSemana} onValueChange={setCtplDiaSemana}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="terca">Terça-feira</SelectItem>
                            <SelectItem value="quinta">Quinta-feira</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">Preço 0 = calcula automático (custo + margem) na hora de usar.</p>
                      <OrderItemsEditor
                        items={ctplItens}
                        setItems={setCtplItens}
                        produtoOptions={produtoOptions.map(p => ({ value: p.value, label: p.label }))}
                        priceField="preco"
                        onAddItem={ctplAddItem}
                        onEditItem={ctplEditItem}
                        onRemoveItem={ctplRemoveItem}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {myCliTemplates.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum pedido fixo de cliente.</p> : (
                 <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Cliente</TableHead><TableHead className="w-14">Dia</TableHead><TableHead className="w-14">Itens</TableHead><TableHead className="w-20">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {myCliTemplates.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm">{t.nome}</TableCell>
                        <TableCell className="text-sm">{(t as any).clientes?.nome}</TableCell>
                        <TableCell className="text-sm">{t.dia_semana === "quinta" ? "Qui" : "Ter"}</TableCell>
                        <TableCell className="text-sm">{(t.itens_cliente_template || []).length}</TableCell>
                        <TableCell><div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => startEditCtpl(t)}><Pencil className="h-5 w-5" /></Button>
                          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setCtplConfirmDelete(t)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                        </div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Confirm delete ambulante template */}
      <AlertDialog open={!!tplConfirmDelete} onOpenChange={(v) => { if (!v) setTplConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir "{tplConfirmDelete?.nome}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (tplConfirmDelete) deleteTpl(tplConfirmDelete.id); setTplConfirmDelete(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete cliente template */}
      <AlertDialog open={!!ctplConfirmDelete} onOpenChange={(v) => { if (!v) setCtplConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir "{ctplConfirmDelete?.nome}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (ctplConfirmDelete) deleteCtpl(ctplConfirmDelete.id); setCtplConfirmDelete(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar faturados */}
      <AlertDialog open={confirmArchived} onOpenChange={setConfirmArchived}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pedidos Faturados</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja listar todos os pedidos faturados? Isso pode incluir pedidos com datas antigas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowArchived(true); setConfirmArchived(false); }}>Listar Faturados</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pastDateDialog}

      {/* Clientes Sheet */}
      <Sheet open={clientesSheetOpen} onOpenChange={setClientesSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Clientes</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <div className="flex gap-2 mb-3">
              <Input placeholder="Buscar cliente..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="flex-1" />
              <Button onClick={() => { setClienteEditId(null); setClienteForm(clienteFormEmpty); setClienteFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Novo</Button>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Cidade</TableHead><TableHead>Estado</TableHead><TableHead className="w-24">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(clientes || []).filter((c: any) => !clienteSearch || c.nome?.toLowerCase().includes(clienteSearch.toLowerCase()) || c.cidade?.toLowerCase().includes(clienteSearch.toLowerCase()) || c.bairro?.toLowerCase().includes(clienteSearch.toLowerCase())).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell>{c.cidade}</TableCell>
                    <TableCell>{c.estado}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditCliente(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteCliente(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cliente Form Dialog */}
      <Dialog open={clienteFormOpen} onOpenChange={v => { if (!v) { setClienteEditId(null); setClienteForm(clienteFormEmpty); } setClienteFormOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{clienteEditId ? "Editar" : "Novo"} Cliente</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveCliente(); }} className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={clienteForm.nome} onChange={e => setClienteForm(f => ({ ...f, nome: e.target.value }))} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CEP</Label><Input value={clienteForm.cep} onChange={e => setClienteForm(f => ({ ...f, cep: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Cidade</Label><Input value={clienteForm.cidade} onChange={e => setClienteForm(f => ({ ...f, cidade: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Estado</Label><Input value={clienteForm.estado} onChange={e => setClienteForm(f => ({ ...f, estado: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Bairro</Label><Input value={clienteForm.bairro} onChange={e => setClienteForm(f => ({ ...f, bairro: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Complemento</Label><Input value={clienteForm.complemento} onChange={e => setClienteForm(f => ({ ...f, complemento: e.target.value }))} /></div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteCliente} onOpenChange={(v) => { if (!v) setConfirmDeleteCliente(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir o cliente "{confirmDeleteCliente?.nome}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDeleteCliente) removeCliente(confirmDeleteCliente.id); setConfirmDeleteCliente(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Parcial value dialog */}
      <Dialog open={!!parcialDialog} onOpenChange={v => { if (!v) { setParcialDialog(null); setParcialValor(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Valor Pago (Parcial)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Informe o valor que o cliente já pagou:</p>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={parcialValor} onChange={e => setParcialValor(e.target.value)} placeholder="0.00" min={0} step={0.01} autoFocus />
            </div>
            <Button className="w-full" onClick={async () => {
              if (!parcialDialog) return;
              const valor = Number(parcialValor);
              if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
              setTipoPagamento("parcial");
              setValorPagoParcial(valor.toFixed(2));
              await supabase.from("pedidos_saida").update({ tipo_pagamento: "parcial", observacao: upsertPartialPaymentObservation(observacaoRef.current, valor) } as any).eq("id", parcialDialog.orderId);
              qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
              setParcialDialog(null);
              setParcialValor("");
              toast({ title: `Parcial: R$ ${valor.toFixed(2)} registrado` });
            }}>
              <DollarSign className="mr-2 h-4 w-4" />Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!confirmImportTpl} onOpenChange={(o) => !o && setConfirmImportTpl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar Pedido Fixo</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente puxar os {confirmImportTpl?.type === "ambulante"
                ? (confirmImportTpl?.template?.itens_ambulante_template || []).length
                : (confirmImportTpl?.template?.itens_cliente_template || []).length} itens do pedido fixo "{confirmImportTpl?.template?.nome}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmImportTpl) {
                if (confirmImportTpl.type === "ambulante") importAmbTemplate(confirmImportTpl.template.id);
                else importCliTemplate(confirmImportTpl.template.id);
              }
              setConfirmImportTpl(null);
            }}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Auto-pedidos popup */}
      <AlertDialog open={autoPedidosPopup.length > 0} onOpenChange={(o) => {
        if (!o) {
          // Mark all as seen
          const ids = autoPedidosPopup.map((p: any) => p.id);
          supabase.from("auto_pedidos_log").update({ seen: true } as any).in("id", ids).then(() => {});
          setAutoPedidosPopup([]);
          qc.invalidateQueries({ queryKey: ["my-pedidos-saida"] });
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>📋 Pedidos Fixos Lançados Automaticamente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Os seguintes pedidos foram criados automaticamente a partir dos seus pedidos fixos:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {autoPedidosPopup.map((p: any) => (
                    <li key={p.id} className="text-sm">
                      <strong>{p.cliente_nome}</strong> — {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
