import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const callerId = claimsData.claims.sub;
    const { pagamento_id } = await req.json();
    if (!pagamento_id) {
      return new Response(JSON.stringify({ error: "pagamento_id obrigatório" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: isAdmin }, { data: isFinanceiro }, { data: isMotorista }] = await Promise.all([
      supabaseClient.rpc("has_role", { _user_id: callerId, _role: "admin" }),
      supabaseClient.rpc("has_role", { _user_id: callerId, _role: "financeiro" }),
      supabaseClient.rpc("has_role", { _user_id: callerId, _role: "motorista" }),
    ]);

    if (!isAdmin && !isFinanceiro && !isMotorista) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { data: pagamento, error: pagamentoError } = await adminClient
      .from("pagamentos")
      .select("id, cliente_id, valor")
      .eq("id", pagamento_id)
      .single();

    if (pagamentoError || !pagamento) {
      return new Response(JSON.stringify({ error: "Pagamento não encontrado" }), { status: 404, headers: corsHeaders });
    }

    const { data: alocacoes, error: alocacoesError } = await adminClient
      .from("pagamento_alocacoes")
      .select("id, financeiro_id, valor_alocado")
      .eq("pagamento_id", pagamento_id);

    if (alocacoesError) {
      return new Response(JSON.stringify({ error: alocacoesError.message }), { status: 400, headers: corsHeaders });
    }

    const financeiroIds = [...new Set((alocacoes || []).map((item) => item.financeiro_id))];

    const { data: recebiveis, error: recebiveisError } = financeiroIds.length
      ? await adminClient
          .from("financeiro_receber")
          .select("id, motorista_id, pedido_saida_id, valor_total, valor_pago, status")
          .in("id", financeiroIds)
      : { data: [], error: null };

    if (recebiveisError) {
      return new Response(JSON.stringify({ error: recebiveisError.message }), { status: 400, headers: corsHeaders });
    }

    if (isMotorista && !isAdmin && !isFinanceiro) {
      const { data: motorista } = await adminClient
        .from("motoristas")
        .select("id")
        .eq("user_id", callerId)
        .maybeSingle();

      const motoristaId = motorista?.id;
      const ownsAllReceivables = !!motoristaId && (recebiveis || []).every((rec) => rec.motorista_id === motoristaId);
      if (!ownsAllReceivables) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }
    }

    const alocacoesPorRecebivel = new Map<string, number>();
    for (const aloc of alocacoes || []) {
      alocacoesPorRecebivel.set(
        aloc.financeiro_id,
        (alocacoesPorRecebivel.get(aloc.financeiro_id) || 0) + Number(aloc.valor_alocado)
      );
    }

    const updatedReceivables: Array<{ id: string; valor_pago: number; status: string }> = [];
    const pedidosParaReabrir: string[] = [];

    for (const rec of recebiveis || []) {
      const valorEstornado = alocacoesPorRecebivel.get(rec.id) || 0;
      const novoPago = Math.max(0, Number(rec.valor_pago) - valorEstornado);
      const novoStatus = novoPago <= 0 ? "aberto" : novoPago >= Number(rec.valor_total) ? "pago" : "parcial";

      const { error: updateError } = await adminClient
        .from("financeiro_receber")
        .update({ valor_pago: novoPago, status: novoStatus })
        .eq("id", rec.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: corsHeaders });
      }

      updatedReceivables.push({ id: rec.id, valor_pago: novoPago, status: novoStatus });

      if (rec.status === "pago" && novoStatus !== "pago" && rec.pedido_saida_id) {
        pedidosParaReabrir.push(rec.pedido_saida_id);
      }
    }

    if (pedidosParaReabrir.length > 0) {
      const { error: pedidoError } = await adminClient
        .from("pedidos_saida")
        .update({ archived: false })
        .in("id", pedidosParaReabrir);

      if (pedidoError) {
        return new Response(JSON.stringify({ error: pedidoError.message }), { status: 400, headers: corsHeaders });
      }
    }

    if ((alocacoes || []).length > 0) {
      const { error: deleteAllocError } = await adminClient
        .from("pagamento_alocacoes")
        .delete()
        .eq("pagamento_id", pagamento_id);

      if (deleteAllocError) {
        return new Response(JSON.stringify({ error: deleteAllocError.message }), { status: 400, headers: corsHeaders });
      }
    }

    const { error: deletePagamentoError } = await adminClient
      .from("pagamentos")
      .delete()
      .eq("id", pagamento_id);

    if (deletePagamentoError) {
      return new Response(JSON.stringify({ error: deletePagamentoError.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_pagamento_id: pagamento_id,
        deleted_allocation_ids: (alocacoes || []).map((item) => item.id),
        updated_receivables: updatedReceivables,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});