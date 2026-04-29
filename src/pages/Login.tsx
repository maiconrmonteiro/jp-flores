import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn } from "lucide-react";

function sanitizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
}

export default function Login() {
  const { user, role, loading } = useAuth();
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;

  if (user && role) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "motorista") return <Navigate to="/motorista" replace />;
    if (role === "comprador") return <Navigate to="/comprador" replace />;
    if (role === "financeiro") return <Navigate to="/financeiro-dash" replace />;
    if (role === "entradas") return <Navigate to="/entradas-dash" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const loginEmail = nome.includes("@") ? nome.trim() : `${sanitizeName(nome)}@interno.app`;
    const { error } = await signIn(loginEmail, password);
    if (error) {
      toast({ title: "Erro ao entrar", description: "Nome ou senha incorretos", variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "linear-gradient(135deg, hsl(142 50% 92%), hsl(142 40% 85%), hsl(160 30% 90%))" }}>
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <img src="/logo-ilha-verde.png" alt="Ilha Verde" className="mx-auto h-24 w-auto mb-3" />
          <CardTitle className="text-2xl font-bold">Controle de Pedidos</CardTitle>
          <p className="text-sm text-muted-foreground">Entre com suas credenciais</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} required placeholder="Seu nome de acesso" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <LogIn className="mr-2 h-4 w-4" /> {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
