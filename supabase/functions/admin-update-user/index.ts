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

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const callerId = claimsData.claims.sub;
    const { data: isAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { action } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ACTION: create-user — creates auth user + inserts into table + assigns role
    if (action === "create-user") {
      const { email, password, nome, role, table } = body;
      if (!email || !password || !nome || !role) {
        return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
      }

      // Create auth user (auto-confirmed via admin API)
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });
      }

      const userId = newUser.user.id;

      // Insert into the relevant table (skip if no table, e.g. admin role)
      if (table) {
        const { error: insertErr } = await supabaseAdmin.from(table).insert({ nome, user_id: userId });
        if (insertErr) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return new Response(JSON.stringify({ error: insertErr.message }), { status: 400, headers: corsHeaders });
        }
      }

      // Assign role
      const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
      if (roleErr) {
        return new Response(JSON.stringify({ error: roleErr.message }), { status: 400, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: update-password
    if (action === "update-password") {
      const { user_id, password } = body;
      if (!user_id || !password) {
        return new Response(JSON.stringify({ error: "user_id and password required" }), { status: 400, headers: corsHeaders });
      }
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: update-email
    if (action === "update-email") {
      const { user_id, email } = body;
      if (!user_id || !email) {
        return new Response(JSON.stringify({ error: "user_id and email required" }), { status: 400, headers: corsHeaders });
      }
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { email, email_confirm: true });
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
