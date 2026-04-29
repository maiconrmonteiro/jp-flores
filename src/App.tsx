import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Login from "./pages/Login";
import AdminLayout from "./components/AdminLayout";
import Totalizador from "./pages/admin/Totalizador";
import Saidas from "./pages/admin/Saidas";
import Entradas from "./pages/admin/Entradas";
import Produtos from "./pages/admin/Produtos";
import Clientes from "./pages/admin/Clientes";
import Fornecedores from "./pages/admin/Fornecedores";
import Motoristas from "./pages/admin/Motoristas";
import Compradores from "./pages/admin/Compradores";
import Ambulantes from "./pages/admin/Ambulantes";
import AmbulanteTemplates from "./pages/admin/AmbulanteTemplates";
import AcertoMotorista from "./pages/admin/AcertoMotorista";
import Orcamentos from "./pages/admin/Orcamentos";
import Cooperflora from "./pages/admin/Cooperflora";
import CustosFixos from "./pages/admin/CustosFixos";
import Financeiro from "./pages/admin/Financeiro";
import ContasPagar from "./pages/admin/ContasPagar";
import MotoristaDashboard from "./pages/MotoristaDashboard";
import CompradorDashboard from "./pages/CompradorDashboard";
import NotFound from "./pages/NotFound";
import FinanceiroLayout from "./components/FinanceiroLayout";
import EntradasLayout from "./components/EntradasLayout";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "motorista") return <Navigate to="/motorista" replace />;
  if (role === "comprador") return <Navigate to="/comprador" replace />;
  if (role === "financeiro") return <Navigate to="/financeiro-dash" replace />;
  if (role === "entradas") return <Navigate to="/entradas-dash" replace />;
  return <Navigate to="/login" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Totalizador />} />
              <Route path="saidas" element={<Saidas />} />
              <Route path="entradas" element={<Entradas />} />
              <Route path="produtos" element={<Produtos />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="fornecedores" element={<Fornecedores />} />
              <Route path="motoristas" element={<Motoristas />} />
              <Route path="compradores" element={<Compradores />} />
              <Route path="ambulantes" element={<Ambulantes />} />
              <Route path="ambulantes-fixos" element={<AmbulanteTemplates />} />
              <Route path="acerto-motorista" element={<AcertoMotorista />} />
              <Route path="orcamentos" element={<Orcamentos />} />
              <Route path="cooperflora" element={<Cooperflora />} />
              <Route path="custos-fixos" element={<CustosFixos />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="contas-pagar" element={<ContasPagar />} />
            </Route>
            <Route path="/financeiro-dash" element={<FinanceiroLayout />}>
              <Route index element={<Saidas />} />
              <Route path="contas" element={<Financeiro />} />
              <Route path="contas-pagar" element={<ContasPagar />} />
            </Route>
            <Route path="/entradas-dash" element={<EntradasLayout />}>
              <Route index element={<Entradas />} />
            </Route>
            <Route path="/motorista" element={<MotoristaDashboard />} />
            <Route path="/comprador" element={<CompradorDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
