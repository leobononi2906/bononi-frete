import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rastrearCorreios } from "../_shared/correios.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = { ...CORS, "Content-Type": "application/json" };

// ── Quem pode chamar (27/10/2026) ──────────────────────────────────────────────────────────
// Antes: qualquer um com a chave anon (bundle) consultava o CWS dos Correios com a credencial da
// empresa. Agora: usuário logado com módulo `frete` em app_metadata, admin global, ou chave de serviço.
const MODULOS_PERMITIDOS = ["frete"];
async function quemChama(req: Request, modulos: string[]): Promise<{ ok: boolean; status: number; erro?: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, erro: "faça login" };
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { ok: true, status: 200 };
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!r || !r.ok) return { ok: false, status: 401, erro: "faça login" };
  const m = ((await r.json().catch(() => null)) as { app_metadata?: Record<string, unknown> } | null)?.app_metadata ?? {};
  const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const tem = [...lista(m.modulos), ...lista(m.admin_modulos)];
  if (m.admin === true || modulos.some((x) => tem.includes(x))) return { ok: true, status: 200 };
  return { ok: false, status: 403, erro: "sem acesso a este módulo" };
}

// Só leitura: consulta o rastro no CWS e devolve os eventos. Não grava nada no banco.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ erro: "Metodo nao permitido" }), { status: 405, headers: J });
  const acesso = await quemChama(req, MODULOS_PERMITIDOS);
  if (!acesso.ok) return new Response(JSON.stringify({ erro: acesso.erro }), { status: acesso.status, headers: J });
  try {
    const { codigo } = await req.json();
    if (!codigo) return new Response(JSON.stringify({ erro: "Informe o codigo de rastreio" }), { status: 400, headers: J });
    return new Response(JSON.stringify(await rastrearCorreios(String(codigo))), { status: 200, headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error)?.message ?? e) }), { status: 422, headers: J });
  }
});
