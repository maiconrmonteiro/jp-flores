import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  BarChart3, PackagePlus, PackageMinus, Box, Users, Truck, ShoppingCart, Factory, LogOut, Menu, X, ShoppingBag, ClipboardList, Calculator, ChevronDown, BookUser, FileText, Flower2, KeyRound, DollarSign, Wallet, CreditCard
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MarkupPopover } from "@/components/MarkupPopover";
import { ApplyPricesButton } from "@/components/ApplyPricesButton";
import { useMarkup, MARKUP_PRESETS } from "@/hooks/use-markup";

const mainLinks = [
  { to: "/admin", icon: BarChart3, label: "Totalizador", end: true },
  { to: "/admin/saidas", icon: PackageMinus, label: "Saídas" },
  { to: "/admin/entradas", icon: PackagePlus, label: "Entradas" },
  { to: "/admin/ambulantes", icon: ShoppingBag, label: "Ambulantes" },
  { to: "/admin/ambulantes-fixos", icon: ClipboardList, label: "Pedidos Fixos" },
  { to: "/admin/acerto-motorista", icon: Calculator, label: "Acerto Motorista" },
  { to: "/admin/orcamentos", icon: FileText, label: "Orçamentos" },
  { to: "/admin/cooperflora", icon: Flower2, label: "Cooperflora" },
  { to: "/admin/custos-fixos", icon: DollarSign, label: "Custos Fixos" },
];

const financeiroLinks = [
  { to: "/admin/financeiro", icon: Wallet, label: "Contas a Receber" },
  { to: "/admin/contas-pagar", icon: CreditCard, label: "Contas a Pagar" },
];

const cadastroLinks = [
  { to: "/admin/clientes", icon: Users, label: "Clientes" },
  { to: "/admin/motoristas", icon: Truck, label: "Motoristas" },
  { to: "/admin/compradores", icon: ShoppingCart, label: "Compradores" },
  { to: "/admin/produtos", icon: Box, label: "Produtos" },
  { to: "/admin/fornecedores", icon: Factory, label: "Fornecedores" },
];

export default function AdminLayout() {
  const { role, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const location = useLocation();
  const { markup, customMarkup, isCustomMarkup, handleMarkupChange, handleCustomMarkupChange, setCustomActive } = useMarkup("admin");

  const isCadastroActive = cadastroLinks.some(l => location.pathname === l.to);
  const isFinanceiroActive = financeiroLinks.some(l => location.pathname === l.to);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;
  if (role !== "admin") return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen">
      {/* Mobile toggle */}
      <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden" onClick={() => setOpen(!open)}>
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-56 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
          <img src="/logo-ilha-verde.png" alt="Ilha Verde" className="h-10 w-auto" />
          <span className="font-bold text-xs text-sidebar-foreground leading-tight">Ilha Verde<br/>Comércio de Flores</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {mainLinks.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:translate-x-0.5"
              )}
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </NavLink>
          ))}

          {/* Financeiro group */}
          <div>
            <button
              onClick={() => setFinanceiroOpen(prev => !prev)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isFinanceiroActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <Wallet className="h-4 w-4" />
              <span className="flex-1 text-left">Financeiro</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", (financeiroOpen || isFinanceiroActive) && "rotate-180")} />
            </button>
            {(financeiroOpen || isFinanceiroActive) && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                {financeiroLinks.map(l => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:translate-x-0.5"
                    )}
                  >
                    <l.icon className="h-4 w-4" />
                    {l.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Cadastros group */}
          <div>
            <button
              onClick={() => setCadastroOpen(prev => !prev)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isCadastroActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <BookUser className="h-4 w-4" />
              <span className="flex-1 text-left">Cadastros</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", (cadastroOpen || isCadastroActive) && "rotate-180")} />
            </button>
            {(cadastroOpen || isCadastroActive) && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                {cadastroLinks.map(l => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:translate-x-0.5"
                    )}
                  >
                    <l.icon className="h-4 w-4" />
                    {l.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="p-2 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-3 py-1">
            <MarkupPopover markup={markup} customMarkup={customMarkup} isCustomMarkup={isCustomMarkup} presets={MARKUP_PRESETS} onPresetChange={handleMarkupChange} onCustomChange={handleCustomMarkupChange} onCustomActivate={setCustomActive} />
            <ApplyPricesButton markup={markup} />
          </div>
          <div className="flex items-center gap-1 px-1 mt-1">
            <ChangePasswordDialog trigger={
              <Button variant="ghost" size="icon" title="Trocar Senha" className="text-sidebar-foreground">
                <KeyRound className="h-4 w-4" />
              </Button>
            } />
            <Button variant="ghost" className="flex-1 justify-start text-sidebar-foreground" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <main className="flex-1 md:ml-56 pt-14 md:pt-6 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
