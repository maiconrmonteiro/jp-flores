import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Auto-recover from DOM manipulation errors caused by browser extensions
    const msg = error?.message || "";
    if (
      msg.includes("insertBefore") ||
      msg.includes("removeChild") ||
      msg.includes("not a child of this node") ||
      msg.includes("Failed to execute") && msg.includes("on 'Node'")
    ) {
      console.warn("[ErrorBoundary] Erro de DOM externo (extensão do navegador?) – auto-recuperando:", msg);
      return { hasError: false, error: null, errorInfo: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const msg = error?.message || "";
    // If it's a browser-extension DOM error, don't show the error screen
    if (
      msg.includes("insertBefore") ||
      msg.includes("removeChild") ||
      msg.includes("not a child of this node")
    ) {
      console.warn("[ErrorBoundary] Erro de DOM externo ignorado:", msg);
      this.setState({ hasError: false, error: null, errorInfo: null });
      return;
    }
    console.error("[ErrorBoundary] Erro capturado:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRecover = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || "Erro desconhecido";
      const errorStack = this.state.error?.stack || "";
      const componentStack = this.state.errorInfo?.componentStack || "";
      
      // Extract short useful info
      const shortStack = errorStack.split("\n").slice(0, 5).join("\n");

      return (
        <div style={{ padding: "24px", fontFamily: "system-ui, sans-serif", maxWidth: "500px", margin: "40px auto" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "12px" }}>Ops, algo deu errado</h2>
          <p style={{ fontSize: "14px", color: "#666", marginBottom: "16px" }}>
            Ocorreu um erro inesperado. Por favor, tire um print desta tela e envie para o administrador.
          </p>
          
          <div style={{ 
            background: "#fef2f2", 
            border: "1px solid #fca5a5", 
            borderRadius: "8px", 
            padding: "12px", 
            marginBottom: "16px",
            fontSize: "12px",
            fontFamily: "monospace",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
            maxHeight: "200px",
            overflow: "auto"
          }}>
            <strong>Erro:</strong> {errorMsg}
            {"\n\n"}
            <strong>Stack:</strong>{"\n"}{shortStack}
            {componentStack && (
              <>
                {"\n\n"}
                <strong>Componente:</strong>{"\n"}{componentStack.split("\n").slice(0, 5).join("\n")}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={this.handleRecover}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #ddd",
                background: "white",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Tentar Recuperar
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                background: "#22c55e",
                color: "white",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
