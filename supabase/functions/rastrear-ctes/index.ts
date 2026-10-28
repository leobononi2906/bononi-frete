import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// === FIX: todo fetch externo com timeout, para uma transportadora travada
// nao matar o lote inteiro (causa-raiz da parada de Braspress+Rodonaves em maio/2026).
async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function cnpjDaChave(c: string) { return c?.length >= 20 ? c.substring(6,20) : ""; }
function resolveSlug(nome: string): string | null {
  const n = nome.toUpperCase();
  if (n.includes("BRASPRESS")) return "braspress";
  if (n.includes("RODONAVES") || n.includes("RTE")) return "rodonaves";
  if (n.includes("SAO MIGUEL") || n.includes("S\u00c3O MIGUEL") || n.includes("EXPRESSO SAO") || n.includes("EXPRESSO S\u00c3O")) return "saomiguel";
  if (n.includes("AGEX")) return "agex";
  return null;
}
function parseDateBR(d: string): string | null {
  if (!d) return null;
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}` : null;
}
function parseDateISO(d: string): string | null {
  if (!d) return null;
  try { return new Date(d).toISOString().slice(0,10); } catch { return null; }
}
function diasDesde(d: string | null) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function isEntregue(t: string) {
  const u = t.toUpperCase();
  return u.includes("ENTREGUE") || u.includes("DELIVERED") || u.includes("ENTREGA REALIZADA")
      || u.includes("ENTREGA FINALIZADA") || u.includes("MERCADORIA ENTREGUE") || u.includes("FINALIZADO");
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Resolve ACCESS_KEY e CUSTOMER para cada CNPJ emitente
// Padrao de secrets: SAO_MIGUEL_ACCESS_KEY_[CNPJ] e SAO_MIGUEL_CUSTOMER_[CNPJ]
// Fallback: SAO_MIGUEL_ACCESS_KEY e SAO_MIGUEL_CUSTOMER (key generica)
function getSaoMiguelCreds(cnpjEmitente: string): { accessKey: string; customer: string } | null {
  const specificKey  = Deno.env.get(`SAO_MIGUEL_ACCESS_KEY_${cnpjEmitente}`);
  const specificCust = Deno.env.get(`SAO_MIGUEL_CUSTOMER_${cnpjEmitente}`);
  if (specificKey && specificCust) return { accessKey: specificKey, customer: specificCust };
  const genericKey  = Deno.env.get("SAO_MIGUEL_ACCESS_KEY");
  const genericCust = Deno.env.get("SAO_MIGUEL_CUSTOMER");
  if (genericKey && genericCust) return { accessKey: genericKey, customer: genericCust };
  return null;
}

async function getRteToken(): Promise<string | null> {
  try {
    const r = await fetchWithTimeout("https://quotation-apigateway.rte.com.br/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type:"password", username: Deno.env.get("RODONAVES_USER")??"", password: Deno.env.get("RODONAVES_PASS")??"", auth_type:"DEV", companyId:"1" }).toString(),
    }, 10000);
    if (!r.ok) { console.error(`Rodonaves token HTTP ${r.status}`); return null; }
    return (await r.json()).access_token ?? null;
  } catch (e) { console.error("Rodonaves token erro:", String(e)); return null; }
}

async function rastrearRodonaves(chaveNfe: string, token: string) {
  try {
    const r = await fetchWithTimeout(`https://tracking-apigateway.rte.com.br/api/v1/tracking?InvoiceKey=${encodeURIComponent(chaveNfe)}`, { headers: { Authorization: `Bearer ${token}` } }, 12000);
    if (!r.ok) return null;
    const raw = await r.json();
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    const events: any[] = item.Events ?? item.events ?? [];
    const ultimo = events.length > 0 ? events[events.length-1] : null;
    const desc = ultimo?.Description ?? ultimo?.EventDescription ?? null;
    const txt = [item.Status??"", desc??"", ...events.map((e:any)=>e.Description??e.EventDescription??"")].join(" ");
    const entregue = isEntregue(txt);
    return { status: entregue?"entregue":(txt.toUpperCase().includes("COLET")?"coletado":"em_transito"), entregue,
      ultimo_evento: desc, data_previsao: item.ExpectedDeliveryDate ? parseDateISO(item.ExpectedDeliveryDate) : null,
      data_entrega: entregue && ultimo?.EventDateTime ? parseDateISO(ultimo.EventDateTime) : null,
      cidade_destino: item.RecipientCity??null, uf_destino: item.RecipientState??null, resposta_api: raw };
  } catch(e) { console.error("Rodonaves:",String(e)); return null; }
}

async function rastrearSaoMiguel(numNf: string, chaveNfe: string) {
  const cnpj = cnpjDaChave(chaveNfe);
  if (!cnpj) return null;

  const creds = getSaoMiguelCreds(cnpj);
  if (!creds) { console.warn(`Sao Miguel: sem credencial para CNPJ ${cnpj}`); return null; }

  const { accessKey, customer } = creds;

  // Rate limit: max 20 req/min. Com delay de 3s = ~20/min exato
  await sleep(3000);

  for (let t=1; t<=2; t++) {
    try {
      const r = await fetchWithTimeout("https://wsintegcli02.expressosaomiguel.com.br:40504/wsservernet/api/tracking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ACCESS_KEY": accessKey,
          "CUSTOMER": customer,
          "MODELO_CONSULTA": "TRACKING_COMPLETO_POR_NOTA_FISCAL_E_COMPROVANTE",
        },
        body: JSON.stringify({ valoresParametros: [cnpj, numNf, "1"] }),
      }, 15000);

      if (r.status === 429 || r.status === 401) {
        if (t < 2) { await sleep(8000); continue; }
        console.error(`Sao Miguel ${r.status} NF ${numNf} CNPJ ${cnpj} customer ${customer}`);
        return null;
      }
      if (!r.ok) {
        if (r.status === 503 && t < 2) { await sleep(2000); continue; }
        console.error(`Sao Miguel HTTP ${r.status} NF ${numNf}`);
        return null;
      }

      const raw = await r.json();
      const item = Array.isArray(raw) ? raw[0] : raw;
      if (!item) return null;
      const ocorrencias: any[] = item.ocorrencias??[];
      const ultima = ocorrencias.length > 0 ? ocorrencias[ocorrencias.length-1] : null;
      const desc = ultima?.descricaoOcorrencia ?? null;
      const txt = ocorrencias.map((o:any)=>o.descricaoOcorrencia??"").join(" ");
      const entregue = isEntregue(txt);
      console.log(`Sao Miguel NF ${numNf} CNPJ ${cnpj}: ${entregue?"entregue":desc??"sem ocorrencia"}`);
      return {
        status: entregue?"entregue":((desc??" ").toUpperCase().includes("COLET")?"coletado":"em_transito"),
        entregue,
        ultimo_evento: desc,
        data_previsao: item.prevEntrega ? parseDateISO(item.prevEntrega) : null,
        data_entrega: entregue && ultima?.dataRegistro ? parseDateISO(ultima.dataRegistro) : null,
        cidade_destino: item.unidadeDestino?.cidade?.nome??null,
        uf_destino: item.unidadeDestino?.cidade?.uf??null,
        resposta_api: raw,
      };
    } catch(e) { if(t===2) { console.error("Sao Miguel:",String(e)); return null; } await sleep(2000); }
  }
  return null;
}

async function rastrearAgex(chaveNfe: string) {
  try {
    const r = await fetchWithTimeout("https://ssw.inf.br/api/trackingdanfe", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({chave_nfe:chaveNfe}) }, 12000);
    if (!r.ok) return null;
    const raw = await r.json();
    const eventos: any[] = raw.eventos??raw.ocorrencias??[];
    const ultimo = eventos.length > 0 ? eventos[eventos.length-1] : null;
    const desc = ultimo?.ocorrencia??ultimo?.descricao??null;
    const txt = [raw.situacao??"", ...eventos.map((e:any)=>e.ocorrencia??e.descricao??"")].join(" ");
    const entregue = isEntregue(txt);
    return { status: entregue?"entregue":"em_transito", entregue, ultimo_evento: desc,
      data_previsao: raw.prevEntrega ? parseDateBR(raw.prevEntrega) : null,
      data_entrega: entregue && ultimo?.data ? parseDateBR(ultimo.data) : null,
      cidade_destino: ultimo?.cidade??null, uf_destino: ultimo?.uf??null, resposta_api: raw };
  } catch(e) { console.error("Agex:",String(e)); return null; }
}

async function rastrearBraspress(numNf: string, chaveNfe: string) {
  const user=Deno.env.get("BRASPRESS_USER"), pass=Deno.env.get("BRASPRESS_PASS");
  if(!user||!pass) return null;
  const cnpj = cnpjDaChave(chaveNfe);
  if(!cnpj) return null;
  try {
    const r = await fetchWithTimeout(`https://api.braspress.com/v3/tracking/byNf/${cnpj}/${numNf}/json`, { headers:{Authorization:`Basic ${btoa(`${user}:${pass}`)}`} }, 12000);
    if (!r.ok) return null;
    const raw = await r.json();
    const c = raw?.conhecimentos?.[0];
    if(!c) return null;
    const txt = [c.statusEntrega??"",c.status??"",c.ultimaOcorrencia??""].join(" ");
    const entregue = isEntregue(txt);
    return { status:entregue?"entregue":(txt.toUpperCase().includes("COLET")?"coletado":"em_transito"), entregue,
      ultimo_evento:c.ultimaOcorrencia??null, data_previsao:parseDateBR(c.previsaoEntrega),
      data_entrega:parseDateBR(c.dataEntrega), cidade_destino:c.cidade??null, uf_destino:c.uf??null, resposta_api:raw };
  } catch(e) { console.error("Braspress:",String(e)); return null; }
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
  if (req.method==="OPTIONS") return new Response("ok",{headers:CORS});

  let body: any = {};
  try { body = await req.json(); } catch {}
  const skipSlugs: string[] = body.skip_transportadoras ?? [];
  const onlySlug: string | null = body.only_transportadora ?? null;
  const limite: number = body.limite ?? 40;
  const reprocessar: boolean = body.reprocessar ?? false;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const dataCorte = new Date();
  dataCorte.setDate(dataCorte.getDate()-60);

  const {data:nfs, error} = await supabase
    .from("vw_comercial_docs_faturados")
    .select("id_doc,num_nf,chave_nfe,nome_transportadora,nome_cliente,empresa,data_faturamento")
    .gte("data_faturamento", dataCorte.toISOString().slice(0,10))
    .not("chave_nfe","is",null)
    .not("nome_transportadora","is",null);

  if (error) return new Response(JSON.stringify({erro:error.message}),{status:500,headers:{...CORS,"Content-Type":"application/json"}});

  const filtradas = (nfs??[]).filter((n:any) => {
    const slug = resolveSlug(n.nome_transportadora??"");
    if (!slug) return false;
    if (onlySlug) return slug === onlySlug;
    if (skipSlugs.includes(slug)) return false;
    return true;
  });

  const chaves = filtradas.map((n:any)=>n.chave_nfe).filter(Boolean);
  let jaRastreadas = new Set<string>();
  if (chaves.length>0) {
    if (!reprocessar) {
      const {data:jr} = await supabase.from("frt_rastreio").select("chave_nfe").in("chave_nfe",chaves);
      jaRastreadas = new Set((jr??[]).map((r:any)=>r.chave_nfe));
    } else {
      const {data:je} = await supabase.from("frt_rastreio").select("chave_nfe").eq("entregue",true).in("chave_nfe",chaves);
      jaRastreadas = new Set((je??[]).map((r:any)=>r.chave_nfe));
    }
  }

  const todosPendentes = filtradas.filter((n:any)=>n.chave_nfe && !jaRastreadas.has(n.chave_nfe));
  const pendentes = todosPendentes.slice(0, limite);
  const restantes = todosPendentes.length - pendentes.length;

  console.log(`Pendentes: ${todosPendentes.length} | Lote: ${pendentes.length} | Restantes: ${restantes}`);

  let rteToken: string|null = null;
  if (pendentes.some((n:any) => resolveSlug(n.nome_transportadora??"") === "rodonaves")) {
    // FIX: guarda extra. getRteToken ja trata erro e agora tem timeout,
    // entao mesmo se a Rodonaves estiver fora do ar o lote segue (Braspress etc).
    try { rteToken = await getRteToken(); } catch { rteToken = null; }
    if (!rteToken) console.warn("Rodonaves: token indisponivel; NFs Rodonaves ficarao sem_info neste lote.");
  }

  let sucesso=0, falha=0;
  const resultados: any[] = [];

  for (const nf of pendentes) {
    const slug = resolveSlug(nf.nome_transportadora??"");
    const chave = nf.chave_nfe as string;
    const numNf = nf.num_nf as string;

    let rastreio: any = null;
    try {
      if (slug==="braspress")      rastreio = await rastrearBraspress(numNf,chave);
      else if (slug==="rodonaves") rastreio = rteToken ? await rastrearRodonaves(chave,rteToken) : null;
      else if (slug==="saomiguel") rastreio = await rastrearSaoMiguel(numNf,chave);
      else if (slug==="agex")      rastreio = await rastrearAgex(chave);
    } catch(e) { console.error(`Falha NF ${numNf} (${slug}):`, String(e)); rastreio = null; }

    const row: any = { chave_nfe:chave, num_nf:numNf, nome_transportadora:nf.nome_transportadora,
      transportadora_slug:slug, nome_cliente:nf.nome_cliente, empresa:nf.empresa,
      data_emissao:nf.data_faturamento, dias_transito:diasDesde(nf.data_faturamento), atualizado_em:new Date().toISOString() };

    if (rastreio) {
      Object.assign(row, { status:rastreio.status, ultimo_evento:rastreio.ultimo_evento,
        ultima_ocorrencia:rastreio.ultimo_evento, data_previsao:rastreio.data_previsao,
        data_entrega:rastreio.data_entrega, cidade_destino:rastreio.cidade_destino,
        uf_destino:rastreio.uf_destino, entregue:rastreio.entregue, resposta_api:rastreio.resposta_api });
      sucesso++;
      resultados.push({num_nf:numNf, transportadora:slug, status:rastreio.status});
    } else {
      row.status="sem_info"; row.entregue=false; falha++;
      console.warn(`NF ${numNf} (${slug}): sem resposta`);
    }
    await supabase.from("frt_rastreio").upsert(row,{onConflict:"chave_nfe"});
  }

  return new Response(JSON.stringify({
    processados: pendentes.length, sucesso, falha,
    restantes_para_proxima_execucao: restantes,
    resultados
  }),{headers:{...CORS,"Content-Type":"application/json"}});
});
