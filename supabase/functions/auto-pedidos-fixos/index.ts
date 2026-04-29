import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Current time in Brasília (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);
    
    const dayOfWeek = brasiliaTime.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const hour = brasiliaTime.getHours();

    console.log(`Auto-pedidos check: day=${dayOfWeek}, hour=${hour}, brasilia=${brasiliaTime.toISOString()}`);

    // Determine which templates to process:
    // Thursday 12:00+ → create orders for next Tuesday (dia_semana='terca')
    // Monday 18:00+ → create orders for this Thursday (dia_semana='quinta')
    let targetDiaSemana: string | null = null;
    let targetDate: string | null = null;

    if (dayOfWeek === 4 && hour >= 12) {
      // Thursday after 12h → next Tuesday (5 days ahead)
      targetDiaSemana = "terca";
      const target = new Date(brasiliaTime);
      target.setDate(target.getDate() + 5);
      targetDate = target.toISOString().split("T")[0];
    } else if (dayOfWeek === 1 && hour >= 12) {
      // Monday after 12h → this Thursday (3 days ahead)
      targetDiaSemana = "quinta";
      const target = new Date(brasiliaTime);
      target.setDate(target.getDate() + 3);
      targetDate = target.toISOString().split("T")[0];
    }

    if (!targetDiaSemana || !targetDate) {
      return new Response(
        JSON.stringify({ message: "Not a trigger time", day: dayOfWeek, hour }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Target: dia_semana=${targetDiaSemana}, date=${targetDate}`);

    // Check if we already created orders for this targetDate (avoid duplicates)
    const { data: alreadyRan } = await supabase
      .from("pedidos_saida")
      .select("id")
      .eq("data", targetDate)
      .like("observacao", "Pedido fixo automático%")
      .limit(1);

    if (alreadyRan && alreadyRan.length > 0) {
      return new Response(
        JSON.stringify({ message: "Already created orders for " + targetDate, count: alreadyRan.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all cliente_templates for this dia_semana with items
    const { data: templates, error: tplErr } = await supabase
      .from("cliente_templates")
      .select("*, clientes(nome), itens_cliente_template(*)")
      .eq("dia_semana", targetDiaSemana);

    if (tplErr) throw tplErr;
    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ message: "No templates for " + targetDiaSemana }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let createdCount = 0;

    for (const tpl of templates) {
      const items = tpl.itens_cliente_template || [];
      if (items.length === 0) continue;

      // Create pedido_saida
      const { data: pedido, error: pedErr } = await supabase
        .from("pedidos_saida")
        .insert({
          motorista_id: tpl.motorista_id,
          cliente_id: tpl.cliente_id,
          data: targetDate,
          observacao: `Pedido fixo automático - ${tpl.nome}`,
          tipo_pagamento: "pendente",
        })
        .select()
        .single();

      if (pedErr) {
        console.error("Error creating pedido:", pedErr);
        continue;
      }

      // Insert items
      const itensSaida = items.map((item: any) => ({
        pedido_id: pedido.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco: item.preco || 0,
      }));

      const { error: itemErr } = await supabase
        .from("itens_saida")
        .insert(itensSaida);

      if (itemErr) {
        console.error("Error inserting items:", itemErr);
        continue;
      }

      // Log for motorista popup
      await supabase.from("auto_pedidos_log").insert({
        motorista_id: tpl.motorista_id,
        pedido_saida_id: pedido.id,
        template_id: tpl.id,
        cliente_nome: tpl.clientes?.nome || "",
      });

      createdCount++;
    }

    return new Response(
      JSON.stringify({ message: `Created ${createdCount} orders for ${targetDate}`, targetDiaSemana }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
