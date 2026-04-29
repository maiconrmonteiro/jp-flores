import { supabase } from "@/integrations/supabase/client";
import type { CochoData } from "@/components/CochoButton";

/**
 * Soma os cochos do pedido ao saldo do cliente (cochos_cliente).
 * Usado quando o cliente paga a nota à vista mas os cochos ficam para serem buscados depois.
 */
export async function mergeCochoIntoCliente(clienteId: string, cocho: CochoData): Promise<void> {
  if (!clienteId) return;
  if (cocho.preto <= 0 && cocho.velling <= 0 && cocho.quebrado <= 0) return;

  const { data: existing } = await supabase
    .from("cochos_cliente")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();

  if (existing) {
    const merged = {
      preto: Number(existing.preto || 0) + cocho.preto,
      velling: Number(existing.velling || 0) + cocho.velling,
      quebrado: Number(existing.quebrado || 0) + cocho.quebrado,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("cochos_cliente").update(merged).eq("cliente_id", clienteId);
  } else {
    await supabase.from("cochos_cliente").insert({
      cliente_id: clienteId,
      preto: cocho.preto,
      velling: cocho.velling,
      quebrado: cocho.quebrado,
    } as any);
  }
}
