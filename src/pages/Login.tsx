import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

function sanitizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
}

export default function Login() {
  const { user, role, loading, signIn, signOut } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Carregando...</p></div>;

  if (user && role) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "motorista") return <Navigate to="/motorista" replace />;
    if (role === "comprador") return <Navigate to="/comprador" replace />;
    if (role === "financeiro") return <Navigate to="/financeiro-dash" replace />;
    if (role === "entradas") return <Navigate to="/entradas-dash" replace />;
  }

  if (user && !role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #ff5c8d 0%, #ff9a63 50%, #ffcc33 100%)" }}>
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <img src="/logo-jp-flores.png" alt="JP Flores" className="mx-auto h-24 w-auto mb-3" />
            <CardTitle className="text-2xl font-bold">Aguardando Aprovação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground">Você está logado, mas ainda não possui um perfil de acesso atribuído. Peça a um administrador para liberar seu acesso.</p>
            <Button onClick={() => signOut()} variant="outline" className="w-full">
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const loginEmail = nome.includes("@") ? nome.trim() : `${sanitizeName(nome)}@interno.app`;
    
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email: loginEmail,
        password: password,
        options: {
          data: {
            nome: nome
          }
        }
      });
      if (error) {
        toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Conta criada!", description: "Sua conta foi criada. Por favor, faça login.", variant: "default" });
        setIsSignUp(false);
      }
    } else {
      const { error } = await signIn(loginEmail, password);
      if (error) {
        toast({ title: "Erro ao entrar", description: "Nome ou senha incorretos", variant: "destructive" });
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #ff5c8d 0%, #ff9a63 50%, #ffcc33 100%)" }}>
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <img src="/logo-jp-flores.png" alt="JP Flores" className="mx-auto h-24 w-auto mb-3" />
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
            <Button type="submit" className="w-full bg-[#820ad1] hover:bg-[#6a08ab] text-white border-0" disabled={submitting}>
              <LogIn className="mr-2 h-4 w-4" /> {submitting ? "Processando..." : isSignUp ? "Criar Conta" : "Entrar"}
            </Button>
            
            <div className="text-center mt-4">
              <Button type="button" variant="link" onClick={() => setIsSignUp(!isSignUp)} className="text-sm">
                {isSignUp ? "Já tem uma conta? Entrar" : "Primeiro acesso? Criar conta"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
