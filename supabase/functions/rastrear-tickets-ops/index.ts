import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function isEntregue(txt: string) {
  const u = txt.toUpperCase();
  return u.includes("ENTREGUE") || u.includes("ENTREGA REALIZADA") ||
    u.includes("ENTREGA FINALIZADA") || u.includes("MERCADORIA ENTREGUE") ||
    u.includes("FINALIZADO") || u.includes("DELIVERED");
}

function parseDateISO(d: string | null): string | null {
  if (!d) return null;
  try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
}

function parseDateBR(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}` : null;
}

// ── RODONAVES ── rastreia por número de CTe
async function getRteToken(): Promise<string | null> {
  try {
    const r = await fetchWithTimeout("https://quotation-apigateway.rte.com.br/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        username: Deno.env.get("RODONAVES_USER") ?? "",
        password: Deno.env.get("RODONAVES_PASS") ?? "",
        auth_type: "DEV",
        companyId: "1",
      }).toString(),
    }, 10000);
    if (!r.ok) return null;
    return (await r.json()).access_token ?? null;
  } catch { return null; }
}

async function rastrearRodonavesCte(numCte: string, token: string): Promise<any> {
  try {
    // Rodonaves tracking por número de CTe
    const r = await fetchWithTimeout(
      `https://tracking-apigateway.rte.com.br/api/v1/tracking?DocumentNumber=${encodeURIComponent(numCte)}`,
      { headers: { Authorization: `Bearer ${token}` } },
      12000
    );
    if (!r.ok) { console.warn(`Rodonaves CTe ${numCte} HTTP ${r.status}`); return null; }
    const raw = await r.json();
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    const events: any[] = item.Events ?? item.events ?? [];
    const ultimo = events.length > 0 ? events[events.length - 1] : null;
    const desc = ultimo?.Description ?? ultimo?.EventDescription ?? null;
    const txt = [item.Status ?? "", ...events.map((e: any) => e.Description ?? e.EventDescription ?? "")].join(" ");
    const entregue = isEntregue(txt);
    return {
      status: entregue ? "entregue" : (txt.toUpperCase().includes("COLET") ? "coletado" : "em_transito"),
      entregue,
      ultimo_evento: desc,
      data_previsao: item.ExpectedDeliveryDate ? parseDateISO(item.ExpectedDeliveryDate) : null,
      data_entrega: entregue && ultimo?.EventDateTime ? parseDateISO(ultimo.EventDateTime) : null,
      cidade_destino: item.RecipientCity ?? null,
      uf_destino: item.RecipientState ?? null,
      resposta_api: raw,
    };
  } catch (e) { console.error(`Rodonaves CTe ${numCte}:`, String(e)); return null; }
}

// ── BRASPRESS ── rastreia por número de CTe
async function rastrearBrapressCte(numCte: string): Promise<any> {
  const user = Deno.env.get("BRASPRESS_USER");
  const pass = Deno.env.get("BRASPRESS_PASS");
  const cnpj = Deno.env.get("BRASPRESS_CNPJ_REMETENTE") ?? "05864790000177";
  if (!user || !pass) return null;
  try {
    // Braspress tracking por CTe
    const r = await fetchWithTimeout(
      `https://api.braspress.com/v3/tracking/byCte/${cnpj}/${numCte}/json`,
      { headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` } },
      12000
    );
    if (!r.ok) {
      // fallback: tenta pelo número como NF (algumas reversas vêm assim)
      const r2 = await fetchWithTimeout(
        `https://api.braspress.com/v3/tracking/byNf/${cnpj}/${numCte}/json`,
        { headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` } },
        12000
      );
      if (!r2.ok) { console.warn(`Braspress CTe ${numCte} HTTP ${r.status}/${r2.status}`); return null; }
      const raw2 = await r2.json();
      return parseBraspressRaw(raw2);
    }
    const raw = await r.json();
    return parseBraspressRaw(raw);
  } catch (e) { console.error(`Braspress CTe ${numCte}:`, String(e)); return null; }
}

function parseBraspressRaw(raw: any): any | null {
  const c = raw?.conhecimentos?.[0];
  if (!c) return null;
  const txt = [c.statusEntrega ?? "", c.status ?? "", c.ultimaOcorrencia ?? ""].join(" ");
  const entregue = isEntregue(txt);
  return {
    status: entregue ? "entregue" : (txt.toUpperCase().includes("COLET") ? "coletado" : "em_transito"),
    entregue,
    ultimo_evento: c.ultimaOcorrencia ?? null,
    data_previsao: parseDateBR(c.previsaoEntrega),
    data_entrega: parseDateBR(c.dataEntrega),
    cidade_destino: c.cidade ?? null,
    uf_destino: c.uf ?? null,
    resposta_api: raw,
  };
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Busca tickets abertos com rastreio preenchido
  const { data: tickets, error } = await supabase
    .from("ops_tickets")
    .select("id, nf, codigo_rastreio, transportadora_nome, cliente")
    .eq("concluido", false)
    .not("codigo_rastreio", "is", null)
    .neq("codigo_rastreio", "")
    .range(0, 199);

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  const lista = tickets ?? [];
  console.log(`Tickets com rastreio: ${lista.length}`);

  // Token Rodonaves uma vez
  const temRodonaves = lista.some(t =>
    (t.transportadora_nome ?? "").toUpperCase().includes("RODONAVES"));
  let rteToken: string | null = null;
  if (temRodonaves) {
    rteToken = await getRteToken();
    if (!rteToken) console.warn("Rodonaves token indisponível — tickets Rodonaves ficarão sem_info");
  }

  let sucesso = 0, falha = 0, ignorado = 0;
  const resultados: any[] = [];

  for (const t of lista) {
    const transp = (t.transportadora_nome ?? "").toUpperCase();
    const numCte = t.codigo_rastreio as string;
    const numNf  = t.nf || null;

    let rastreio: any = null;

    if (transp.includes("BRASPRESS")) {
      rastreio = await rastrearBrapressCte(numCte);
    } else if (transp.includes("RODONAVES") && rteToken) {
      rastreio = await rastrearRodonavesCte(numCte, rteToken);
    } else {
      // São Miguel e outras: sem API de rastreio por CTe disponível
      ignorado++;
      continue;
    }

    const row: any = {
      // Usa num_nf do ticket como chave de vínculo no frt_rastreio
      // chave_nfe fica vazia pois não temos o XML da reversa
      chave_nfe: `ops_ticket_${t.id}`, // chave única artificial para upsert
      num_nf: numNf,
      nome_transportadora: t.transportadora_nome,
      transportadora_slug: transp.includes("BRASPRESS") ? "braspress" : "rodonaves",
      nome_cliente: t.cliente,
      atualizado_em: new Date().toISOString(),
    };

    if (rastreio) {
      Object.assign(row, {
        status: rastreio.status,
        ultimo_evento: rastreio.ultimo_evento,
        ultima_ocorrencia: rastreio.ultimo_evento,
        data_previsao: rastreio.data_previsao,
        data_entrega: rastreio.data_entrega,
        cidade_destino: rastreio.cidade_destino,
        uf_destino: rastreio.uf_destino,
        entregue: rastreio.entregue,
        resposta_api: rastreio.resposta_api,
      });
      sucesso++;
      resultados.push({ ticket_id: t.id, nf: numNf, cte: numCte, transportadora: transp.includes("BRASPRESS") ? "braspress" : "rodonaves", status: rastreio.status, ocorrencia: rastreio.ultimo_evento });
    } else {
      row.status = "sem_info";
      row.entregue = false;
      falha++;
      resultados.push({ ticket_id: t.id, nf: numNf, cte: numCte, status: "sem_info" });
    }

    await supabase.from("frt_rastreio").upsert(row, { onConflict: "chave_nfe" });
  }

  return new Response(JSON.stringify({
    total: lista.length, sucesso, falha, ignorado,
    resultados
  }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
