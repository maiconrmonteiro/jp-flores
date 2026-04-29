import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Flower2, 
  Package, 
  TrendingUp, 
  AlertTriangle,
  Wallet,
  CreditCard,
  History,
  CalendarDays,
  Gift
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { user } = useAuth();
  const userName = user?.user_metadata?.nome || "Administrador";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch some basic stats for today
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", today],
    queryFn: async () => {
      const [saidasRes, produtosRes, aReceberRes, aPagarRes] = await Promise.all([
        supabase.from("pedidos_saida").select("id, total_final").eq("data", today),
        supabase.from("produtos").select("id", { count: "exact" }),
        supabase.from("financeiro_receber").select("valor_total, valor_pago").neq("status", "pago"),
        supabase.from("financeiro_pagar").select("valor_total, valor_pago").neq("status", "pago"),
      ]);

      const totalVendas = saidasRes.data?.reduce((acc, curr) => acc + (Number(curr.total_final) || 0), 0) || 0;
      const numPedidos = saidasRes.data?.length || 0;
      const totalProdutos = produtosRes.count || 0;

      const valorEmAberto = aReceberRes.data?.reduce((acc, curr) => acc + (Number(curr.valor_total) - Number(curr.valor_pago)), 0) || 0;
      const contasAPagar = aPagarRes.data?.reduce((acc, curr) => acc + (Number(curr.valor_total) - Number(curr.valor_pago)), 0) || 0;

      return {
        totalVendas,
        numPedidos,
        totalProdutos,
        valorEmAberto,
        contasAPagar
      };
    }
  });

  const commemorativeDates = [
    { name: "Dia das Mães", date: new Date(2026, 4, 10), icon: Gift, color: "text-pink-500" },
    { name: "Dia dos Namorados", date: new Date(2026, 5, 12), icon: Gift, color: "text-red-500" },
    { name: "Dia dos Avós", date: new Date(2026, 6, 26), icon: Gift, color: "text-blue-400" },
    { name: "Dia da Secretária", date: new Date(2026, 8, 30), icon: Gift, color: "text-purple-400" },
    { name: "Finados", date: new Date(2026, 10, 2), icon: Gift, color: "text-slate-500" },
    { name: "Natal", date: new Date(2026, 11, 25), icon: Gift, color: "text-emerald-600" },
  ].filter(d => d.date >= new Date()).sort((a, b) => a.date.getTime() - b.date.getTime());

  const nextDate = commemorativeDates[0];

  return (
    <div className="space-y-6">
      {nextDate && (
        <div className="bg-gradient-to-r from-pink-500/10 to-orange-500/10 border border-pink-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-pink-500 p-2 rounded-full">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-pink-900">Data comemorativa chegando!</p>
              <h3 className="text-lg font-bold text-pink-700">{nextDate.name} - {format(nextDate.date, "dd 'de' MMMM", { locale: ptBR })}</h3>
            </div>
          </div>
          <div className="hidden md:block text-right">
            <p className="text-xs font-semibold text-pink-600 uppercase tracking-wider">Prepare seu estoque</p>
            <p className="text-xs text-muted-foreground">Faltam {Math.ceil((nextDate.date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} dias</p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {userName}!
        </h1>
        <p className="text-muted-foreground">
          Aqui está o resumo financeiro e operacional da <span className="font-semibold text-primary">JP Flores</span> hoje.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Hoje</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {stats?.totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.numPedidos} pedidos realizados hoje
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total em Aberto</CardTitle>
            <Wallet className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">R$ {stats?.valorEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              Valores pendentes de recebimento
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contas a Pagar</CardTitle>
            <CreditCard className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">R$ {stats?.contasAPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              Total de obrigações pendentes
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produtos</CardTitle>
            <Flower2 className="h-4 w-4 text-pink-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProdutos}</div>
            <p className="text-xs text-muted-foreground">
              Itens ativos no catálogo
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Package className="h-5 w-5" />
              Gestão de Distribuição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/10">
              <div className="text-center space-y-2">
                <Flower2 className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground italic">
                  Análise de fluxo de caixa e volume de vendas em breve...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-indigo-600">
              <CalendarDays className="h-5 w-5" />
              Calendário de Eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {commemorativeDates.slice(0, 4).map((d, i) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-md bg-muted group-hover:bg-primary/10 transition-colors", d.color)}>
                      <d.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{format(d.date, "dd 'de' MMMM", { locale: ptBR })}</p>
                    </div>
                  </div>
                  {i === 0 && (
                    <span className="text-[10px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-bold">PRÓXIMO</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
