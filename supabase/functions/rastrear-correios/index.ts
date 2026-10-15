import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rastrearCorreios } from "../_shared/correios.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = { ...CORS, "Content-Type": "application/json" };

// Só leitura: consulta o rastro no CWS e devolve os eventos. Não grava nada no banco.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ erro: "Metodo nao permitido" }), { status: 405, headers: J });
  try {
    const { codigo } = await req.json();
    if (!codigo) return new Response(JSON.stringify({ erro: "Informe o codigo de rastreio" }), { status: 400, headers: J });
    return new Response(JSON.stringify(await rastrearCorreios(String(codigo))), { status: 200, headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error)?.message ?? e) }), { status: 422, headers: J });
  }
});
