import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LABEL = "fatura-processada";

// CNPJ -> [id_empresa, nome] (grupo Bononi)
const EMPRESAS: Record<string, [number, string]> = {
  "57129987000166": [1, "TRUCKPREST"],
  "05864790000177": [2, "MLB PR"],
  "05864790000258": [3, "MLB SC"],
  "05864790000339": [4, "MLB SP"],
  "73403826000175": [5, "SANTA TEREZA"],
  "51054503000180": [6, "BATTOGO"],
  "15090647000200": [8, "BONONI SC"],
  "15090647000119": [7, "BONONI PR"],
};

async function getAccessToken(): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     Deno.env.get("GMAIL_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET") ?? "",
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "",
      grant_type:    "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Falha ao obter access token: " + JSON.stringify(data));
  return data.access_token;
}

async function buscarEmails(token: string, reprocessar: boolean): Promise<any[]> {
  const filtro = reprocessar ? "" : (" -label:" + LABEL);
  const query = encodeURIComponent("in:anywhere from:faturas@expressosaomiguel.com" + filtro);
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return data.messages ?? [];
}

async function buscarMensagem(token: string, messageId: string): Promise<any> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return await resp.json();
}

async function marcarProcessado(token: string, messageId: string, labelId: string) {
  await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds: [labelId] }),
    }
  );
}

async function garantirLabel(token: string): Promise<string> {
  const resp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  const existente = (data.labels ?? []).find((l: any) => l.name === LABEL);
  if (existente) return existente.id;
  const criar = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: LABEL }),
    }
  );
  const novo = await criar.json();
  return novo.id;
}

function b64urlDecode(s: string): string {
  try { return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))); }
  catch { try { return atob(s.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; } }
}

function extrairTexto(payload: any): string {
  let plain = "", html = "";
  function walk(p: any) {
    if (!p) return;
    const mime = p.mimeType ?? "";
    if (mime === "text/plain" && p.body?.data) plain += b64urlDecode(p.body.data) + "\n";
    else if (mime === "text/html" && p.body?.data) html += b64urlDecode(p.body.data) + "\n";
    if (p.parts) p.parts.forEach(walk);
  }
  walk(payload);
  // Preserva os href do HTML (o link da fatura carrega o CNPJ da empresa)
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]).join(" ");
  const base = plain || html.replace(/<[^>]+>/g, " ");
  return (base + " " + hrefs).replace(/\s+/g, " ").trim();
}

function parseFatura(subject: string, body: string) {
  const hay = subject + "\n" + body;
  const num = (subject.match(/-\s*(\d{5,})\s*-/) || hay.match(/Fatura\s*n[º°o]?\s*(\d{5,})/i))?.[1] ?? null;
  const v = hay.match(/vencimento\s*(?:em|:)?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const vencimento = v ? `${v[3]}-${v[2]}-${v[1]}` : null;
  const vm = hay.match(/valor\s*(?:de|:)?\s*R\$\s*([\d.]+,\d{2})/i);
  const valor = vm ? Number(vm[1].replace(/\./g, "").replace(",", ".")) : null;
  const cli = body.match(/cliente\s+(.+?)\s*,/i)?.[1]?.trim() ?? null;
  const cnpj = hay.match(/\/email\/(\d{14})\//)?.[1] ?? null;
  const link = hay.match(/https?:\/\/faturas\.expressosaomiguel\.com\.br\/[^\s"'<>)]+/i)?.[0] ?? null;
  return { num, vencimento, valor, cli, cnpj, link };
}

// 28/10/2026: só o cron (header x-cron-chave = segredo `geral_cron_chave` do Vault, conferido pela RPC
// geral_cron_chave_confere, Hub 0078) ou a chave de serviço. Antes qualquer um com a URL disparava a função.
async function chamadaAutorizada(req: Request): Promise<boolean> {
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (servico && token === servico) return true;
  const chave = req.headers.get("x-cron-chave") ?? "";
  if (chave.length < 32) return false;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/geral_cron_chave_confere`, {
    method: "POST",
    headers: { apikey: servico, Authorization: `Bearer ${servico}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_chave: chave }),
  }).catch(() => null);
  return !!r && r.ok && (await r.json().catch(() => false)) === true;
}

serve(async (req) => {
  if (req.method !== "OPTIONS" && !(await chamadaAutorizada(req))) {
    return new Response(JSON.stringify({ erro: "não autorizado" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const reprocessar = new URL(req.url).searchParams.get("reprocessar") === "1";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const token = await getAccessToken();
    const labelId = await garantirLabel(token);
    const mensagens = await buscarEmails(token, reprocessar);
    console.log(`[faturas] ${mensagens.length} e-mails de fatura (São Miguel) reprocessar=${reprocessar}`);

    let gravadas = 0, semDados = 0, erros = 0;
    const detalhes: any[] = [];

    for (const msg of mensagens) {
      try {
        const det = await buscarMensagem(token, msg.id);
        const headers = det.payload?.headers ?? [];
        const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
        const body = extrairTexto(det.payload);
        const f = parseFatura(subject, body);

        if (!f.num || !f.vencimento) {
          console.log(`[skip] ${msg.id} — não achou num/vencimento | ${subject.slice(0,60)}`);
          semDados++;
          continue;
        }
        const emp = f.cnpj ? EMPRESAS[f.cnpj] : undefined;

        const { error } = await supabase
          .from("frt_faturas")
          .upsert(
            {
              transportadora: "EXPRESSO SAO MIGUEL",
              cnpj_transportadora: null,
              id_empresa:    emp?.[0] ?? null,
              empresa:       emp?.[1] ?? f.cli,
              num_fatura:    f.num,
              vencimento:    f.vencimento,
              valor_total:   f.valor,
              origem:        "email_saomiguel",
              link_fatura:   f.link,
              email_id:      msg.id,
              email_subject: subject,
              atualizado_em: new Date().toISOString(),
            },
            { onConflict: "transportadora,num_fatura" }
          );

        if (error) {
          console.error(`[erro] fatura ${f.num}:`, JSON.stringify(error));
          erros++;
        } else {
          if (!reprocessar) await marcarProcessado(token, msg.id, labelId);
          gravadas++;
          detalhes.push({ num_fatura: f.num, vencimento: f.vencimento, valor: f.valor, empresa: emp?.[1] ?? f.cli, id_empresa: emp?.[0] ?? null });
          console.log(`[ok] fatura ${f.num} venc ${f.vencimento} R$ ${f.valor} (${emp?.[1] ?? f.cli})`);
        }
      } catch (e) {
        console.error(`[erro] msg ${msg.id}:`, e);
        erros++;
      }
    }

    const resultado = { sucesso: true, total_encontrados: mensagens.length, gravadas, sem_dados: semDados, erros, detalhes };
    console.log("[resultado]", JSON.stringify(resultado));
    return new Response(JSON.stringify(resultado), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[erro geral]", e);
    return new Response(JSON.stringify({ sucesso: false, erro: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
