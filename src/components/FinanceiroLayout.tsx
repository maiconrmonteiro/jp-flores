import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { PackageMinus, LogOut, Menu, X, KeyRound, Wallet, CreditCard } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useState } from "react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/financeiro-dash", icon: PackageMinus, label: "Saídas", end: true },
  { to: "/financeiro-dash/contas", icon: Wallet, label: "Contas a Receber" },
  { to: "/financeiro-dash/contas-pagar", icon: CreditCard, label: "Contas a Pagar" },
];

export default function FinanceiroLayout() {
  const { role, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;
  if (role !== "financeiro") return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen">
      <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden" onClick={() => setOpen(!open)}>
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-56 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
          <img src="/logo-ilha-verde.png" alt="Ilha Verde" className="h-10 w-auto" />
          <span className="font-bold text-xs text-sidebar-foreground leading-tight">Ilha Verde<br/>Financeiro</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {links.map(l => (
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
        </nav>
        <div className="p-2 border-t border-sidebar-border">
          <div className="flex items-center gap-1 px-1">
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

      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <main className="flex-1 md:ml-56 pt-14 md:pt-6 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
