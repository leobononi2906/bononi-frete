import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCAIS: Record<number, { cep: string; cidade: string; uf: string; cnpj: string }> = {
  1: { cep: "87507015", cidade: "UMUARAMA", uf: "PR", cnpj: "05864790000177" },
  2: { cep: "89211710", cidade: "JOINVILLE", uf: "SC", cnpj: "05864790000258" },
  3: { cep: "02960000", cidade: "SAO PAULO", uf: "SP", cnpj: "05864790000339" },
};

const AGEX_LOCAIS: Record<number, boolean> = { 1: true };

const RTE = {
  urlQuotation:  "https://quotation-apigateway.rte.com.br",
  urlUnitToCity: "https://unittocity-apigateway.rte.com.br",
  urlPrazo:      "https://01wapi.rte.com.br",
  urlDne:        "https://dne-api.rte.com.br",
};

function semAcento(str: string) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

// Peso real bruto (soma peso_kg * quantidade). As transportadoras cubam sozinhas.
function pesoRealTotal(pacotes: any[]): number {
  return pacotes.reduce((s: number, p: any) => s + p.peso_kg * (p.quantidade ?? 1), 0);
}

async function buscarCepViaCep(cep: string) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.erro) return null;
    return { cidade: d.localidade ?? "", uf: d.uf ?? "", bairro: d.bairro || "Centro", ibge: parseInt(d.ibge) };
  } catch { return null; }
}

// ViaCEP não tem alguns CEPs gerais de cidade (14640-000 Morro Agudo, 78455-000
// Lucas do Rio Verde: 422 "CEP nao encontrado" no frt_logs em set/2026). A
// BrasilAPI consulta outras bases e devolve o IBGE que a São Miguel precisa.
async function buscarCepBrasilApi(cep: string) {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.city || !d?.state) return null;
    return { cidade: d.city, uf: d.state, bairro: d.neighborhood || "Centro", ibge: parseInt(d.ibge?.city) };
  } catch { return null; }
}

async function buscarCep(cep: string) {
  return (await buscarCepViaCep(cep)) ?? (await buscarCepBrasilApi(cep));
}

function calcularPesoTaxado(pacotes: any[], fatorCubagem = 300): number {
  let pesoTotal = 0;
  for (const p of pacotes) {
    const qtd = p.quantidade ?? 1;
    const pesoRealUnit = p.peso_kg;
    const volumeUnit = (p.altura_cm / 100) * (p.largura_cm / 100) * (p.comprimento_cm / 100);
    const pesoCubadoUnit = volumeUnit * fatorCubagem;
    pesoTotal += Math.max(pesoRealUnit, pesoCubadoUnit) * qtd;
  }
  return pesoTotal;
}

function hojeFormatado(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

async function cotarBraspress(input: any, cepDestino: string, cepOrigem: string) {
  for (let t = 1; t <= 3; t++) {
    try {
      const auth = btoa(`${Deno.env.get("BRASPRESS_USER")??""}:${Deno.env.get("BRASPRESS_PASS")??""}`)
      const cubagem = input.pacotes.map((p: any) => ({
        altura: p.altura_cm / 100,
        largura: p.largura_cm / 100,
        comprimento: p.comprimento_cm / 100,
        volumes: p.quantidade
      }));
      const body = {
        cnpjRemetente: parseInt((Deno.env.get("BRASPRESS_CNPJ_REMETENTE")??"").replace(/\D/g,"")),
        cnpjDestinatario: parseInt(input.cnpj_destinatario.replace(/\D/g,"")),
        modal: "R",
        tipoFrete: "1",
        cepOrigem: parseInt(cepOrigem),
        cepDestino: parseInt(cepDestino),
        vlrMercadoria: input.valor_nf,
        peso: pesoRealTotal(input.pacotes),
        volumes: input.pacotes.reduce((s: number, p: any) => s + p.quantidade, 0),
        cubagem
      };
      const resp = await fetch("https://api.braspress.com/v1/cotacao/calcular/json", {
        method: "POST",
        headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!resp.ok) return { transportadora: "Braspress", prazo_dias: null, valor_frete: null, erro: data?.message ?? `HTTP ${resp.status}` };
      return { transportadora: "Braspress", prazo_dias: data.prazo ?? null, valor_frete: parseFloat(data.totalFrete) ?? null, id_cotacao: data.id ? String(data.id) : null };
    } catch (e) {
      if (t === 3) return { transportadora: "Braspress", prazo_dias: null, valor_frete: null, erro: String(e) };
      await new Promise(r => setTimeout(r, 1000 * t));
    }
  }
  return { transportadora: "Braspress", prazo_dias: null, valor_frete: null, erro: "Max tentativas" };
}

async function cotarSaoMiguel(input: any, ibgeDestino: number, cidadeDestino: string, ufDestino: string) {
  const accessKey = Deno.env.get("SAO_MIGUEL_ACCESS_KEY");
  const customer  = Deno.env.get("SAO_MIGUEL_CUSTOMER");
  if (!accessKey || !customer) return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: "Credenciais nao configuradas" };
  if (!ibgeDestino) return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: "IBGE nao encontrado" };

  const pesoTotal   = input.pacotes.reduce((s: number, p: any) => s + p.peso_kg * p.quantidade, 0);
  const volumeTotal = input.pacotes.reduce((s: number, p: any) => s + (p.altura_cm/100)*(p.largura_cm/100)*(p.comprimento_cm/100)*p.quantidade, 0);
  const qtdVolumes  = input.pacotes.reduce((s: number, p: any) => s + p.quantidade, 0);
  const cnpjDest    = input.cnpj_destinatario.replace(/\D/g, "");
  const body = {
    tipoPagoPagar: "P",
    codigoCidadeDestino: ibgeDestino,
    quantidadeMercadoria: qtdVolumes,
    pesoMercadoria: pesoTotal,
    cubagemMercadoria: volumeTotal,
    valorMercadoria: input.valor_nf,
    clienteDestino: parseInt(cnpjDest),
    dataEmbarque: hojeFormatado(),
    tipoPessoaDestino: cnpjDest.length === 11 ? "F" : "J"
  };

  for (let t = 1; t <= 2; t++) {
    try {
      console.log(`Sao Miguel tentativa ${t}`);
      const response = await fetch("https://wsintegcli01.expressosaomiguel.com.br:40504/wsservernet/rest/frete/buscar/cliente",
        { method: "POST", headers: { "Content-Type": "application/json", "ACCESS_KEY": accessKey, "CUSTOMER": customer, "VERSION": "2" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const txt = await response.text();
        console.error(`Sao Miguel HTTP ${response.status} (t${t}):`, txt);
        if (response.status === 503 && t < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }
        return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: `HTTP ${response.status}` };
      }
      const data = await response.json();
      if (data.status === "error") return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: data.mensagem };
      const valorFrete = parseFloat(data.valorFrete || "0");
      if (valorFrete <= 0) return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: "Frete zerado" };
      let prazoDias = 5;
      if (data.previsaoEntrega) {
        try {
          const p = data.previsaoEntrega.split(" ")[0].split("/");
          const dt = new Date(`${p[2]}-${p[1]}-${p[0]}`); const hj = new Date(); hj.setHours(0,0,0,0);
          prazoDias = Math.max(1, Math.ceil((dt.getTime()-hj.getTime())/(1000*60*60*24)));
        } catch { prazoDias = 5; }
      }
      return { transportadora: "Sao Miguel", prazo_dias: prazoDias, valor_frete: valorFrete, id_cotacao: null, detalhes: { previsao_embarque: data.previsaoEmbarque??null, previsao_entrega: data.previsaoEntrega??null, informacao: data.informacaoEntrega??null, peso_real: pesoTotal, volume_m3: volumeTotal, cidade_destino: cidadeDestino, uf_destino: ufDestino, ibge: ibgeDestino } };
    } catch (e) {
      console.error(`Sao Miguel exception t${t}:`, e);
      if (t === 2) return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: String(e) };
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return { transportadora: "Sao Miguel", prazo_dias: null, valor_frete: null, erro: "Max tentativas" };
}

async function cotarAgex(input: any, idLocal: number, cepDestino: string) {
  try {
    if (!AGEX_LOCAIS[idLocal]) return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: "Sem contrato AGEX para este local" };
    const dominio = Deno.env.get("AGEX_DOMINIO");
    const login = Deno.env.get("AGEX_LOGIN");
    const senha = Deno.env.get("AGEX_SENHA");
    const cnpjPagador = Deno.env.get("AGEX_CNPJ_PAGADOR");
    if (!dominio || !login || !senha || !cnpjPagador) return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: "Credenciais AGEX nao configuradas" };
    const cepOrigem = LOCAIS[idLocal].cep;

    const pesoReal    = input.pacotes.reduce((s: number, p: any) => s + p.peso_kg * p.quantidade, 0);
    const qtdVolumes  = input.pacotes.reduce((s: number, p: any) => s + p.quantidade, 0);
    const volumeTotal = input.pacotes.reduce((s: number, p: any) =>
      s + (p.altura_cm / 100) * (p.largura_cm / 100) * (p.comprimento_cm / 100) * p.quantidade, 0);

    const maiorPacote = input.pacotes.reduce((best: any, p: any) => {
      const vol = (p.altura_cm / 100) * (p.largura_cm / 100) * (p.comprimento_cm / 100);
      const bestVol = (best.altura_cm / 100) * (best.largura_cm / 100) * (best.comprimento_cm / 100);
      return vol > bestVol ? p : best;
    }, input.pacotes[0]);

    const alturaM     = maiorPacote.altura_cm / 100;
    const larguraM    = maiorPacote.largura_cm / 100;
    const comprimentoM = maiorPacote.comprimento_cm / 100;

    const soap = `<?xml version="1.0" encoding="utf-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" xmlns:tns="urn:sswinfbr.sswCotacao" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body><tns:cotar><dominio>${dominio}</dominio><login>${login}</login><senha>${senha}</senha><cnpjPagador>${cnpjPagador}</cnpjPagador><cepOrigem>${cepOrigem}</cepOrigem><cepDestino>${cepDestino}</cepDestino><valorNF>${input.valor_nf.toFixed(2)}</valorNF><quantidade>${qtdVolumes}</quantidade><peso>${pesoReal.toFixed(3)}</peso><volume>${volumeTotal.toFixed(4)}</volume><mercadoria>1</mercadoria><cnpjDestinatario></cnpjDestinatario><coletar>N</coletar><entDificil>N</entDificil><destContribuinte>N</destContribuinte><altura>${alturaM.toFixed(4)}</altura><largura>${larguraM.toFixed(4)}</largura><comprimento>${comprimentoM.toFixed(4)}</comprimento></tns:cotar></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

    const resp = await fetch("https://ssw.inf.br/ws/sswCotacao/index.php", {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "urn:sswinfbr.sswCotacao#cotacao" },
      body: soap
    });
    if (!resp.ok) return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: `HTTP ${resp.status}` };
    const txt = await resp.text();
    const rm = txt.match(/<return[^>]*>([\s\S]*?)<\/return>/);
    if (!rm) return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: "Resposta SOAP invalida" };
    const xml = rm[1].replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    const gt = (tag: string) => { const m = xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`)); return m ? m[1].trim() : "0"; };
    const erro = gt("erro"), mensagem = gt("mensagem");
    if (erro === "-2") return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: `Login invalido: ${mensagem}` };
    if (erro === "-1") return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: mensagem || "CEP invalido" };
    // Rota fora da cobertura: o SSW nao da erro, devolve preco pela tabela "Generica" com o
    // aviso so na mensagem (HTML com entidades). 07/10/2026: 65 cotacoes sairam assim com preco.
    const msgTexto = mensagem.replace(/&amp;/g, "&").replace(/&lt;br&gt;|<br>/gi, " ").replace(/&nbsp;/g, " ")
      .replace(/&([A-Za-z])(acute|tilde|cedil|circ|grave);/g, "$1").toUpperCase();
    if (/NAO (E )?ATENDID|NAO ATENDE/.test(msgTexto)) return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: "Rota nao atendida pela AGEX" };
    const totalFrete = parseFloat(gt("totalFrete")), prazo = parseInt(gt("prazo")) || 5, pesoCalculo = parseFloat(gt("pesoCalculo"));
    if (totalFrete <= 0) return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: "Frete zerado" };
    return { transportadora: "AGEX", prazo_dias: prazo, valor_frete: totalFrete, id_cotacao: gt("nroCotacao") !== "0" ? gt("nroCotacao") : null, detalhes: { peso_calculo: pesoCalculo, peso_real: pesoReal, volume_m3: volumeTotal, frete_peso: parseFloat(gt("fretePeso")), frete_valor: parseFloat(gt("freteValor")), gris: parseFloat(gt("gris")), pedagio: parseFloat(gt("pedagio")), pos: parseFloat(gt("pos")), adic_frete: parseFloat(gt("adicFrete")), impostos: parseFloat(gt("impostos")), tab_calculo: gt("tabCalculo"), alerta: mensagem || null } };
  } catch (e) { return { transportadora: "AGEX", prazo_dias: null, valor_frete: null, erro: String(e) }; }
}

async function getRteToken(baseUrl: string) {
  const params = new URLSearchParams({ grant_type: "password", username: Deno.env.get("RODONAVES_USER") ?? "", password: Deno.env.get("RODONAVES_PASS") ?? "", auth_type: "DEV", companyId: "1" });
  const r = await fetch(`${baseUrl}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!r.ok) throw new Error(`Token falhou ${baseUrl}: HTTP ${r.status}`);
  const data = await r.json(); if (!data.access_token) throw new Error("access_token vazio"); return data.access_token;
}
async function getRteTokenOpcional(baseUrl: string): Promise<string|null> { try { return await getRteToken(baseUrl); } catch { return null; } }

async function buscarCityId(supabase: any, token: string, cep: string): Promise<number> {
  try { const {data:c} = await supabase.from("frt_rte_cidades").select("city_id").eq("cep", cep).single(); if (c?.city_id) return c.city_id; } catch {}
  try { const r = await fetch(`${RTE.urlDne}/api/cities/byzipcode?zipCode=${cep}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return 0; const d = await r.json(); const id = d?.Id ?? 0; if (id > 0) await supabase.from("frt_rte_cidades").upsert({ cep, city_id: id, descricao: d.Description, uf: d.UnitFederation }); return id; } catch { return 0; }
}

// Cache de malha: positivo e confiavel; negativo so se recente (<30 dias).
// NAO cacheia negativo em falha de API (transitorio) -> evita travar CEP por instabilidade momentanea.
async function validarMalha(supabase: any, token: string, cep: string, bairro: string, cidade: string, uf: string) {
  try {
    const { data: c } = await supabase.from("frt_rte_malha").select("cidade,uf,atendido,criado_em").eq("cep", cep).single();
    if (c) {
      if (c.atendido) return { cityDescription: semAcento(c.cidade), uf: c.uf };
      const idadeDias = c.criado_em ? (Date.now() - new Date(c.criado_em).getTime()) / 86400000 : 999;
      if (idadeDias < 30) return null; // negativo recente: confia (rapido). Antigo: reconsulta abaixo.
    }
  } catch {}
  let r: any;
  try {
    const params = new URLSearchParams({ ReceiverCustomerTaxIdRegistration: Deno.env.get("RODONAVES_CNPJ_REMETENTE") ?? "", SenderCustomerTaxIdRegistration: Deno.env.get("RODONAVES_CNPJ_REMETENTE") ?? "", ZipCode: cep, District: bairro || "Centro", CityDescription: cidade, UnitFederation: uf });
    r = await fetch(`${RTE.urlUnitToCity}/api/v1/unittocity/getWithHallsByDestinationAddressAndCustomers?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch { return null; } // erro de rede: NAO cacheia (transitorio)
  if (!r.ok) return null;   // erro de API (timeout/500/token): NAO cacheia negativo permanente
  let d: any; try { d = JSON.parse(await r.text()); } catch { return null; }
  const item = d?.Data?.[0] ?? d; const cd = item?.City ?? item;
  if (!cd?.Description) { await supabase.from("frt_rte_malha").upsert({ cep, atendido: false, cidade, uf, criado_em: new Date().toISOString() }); return null; }
  const cn = semAcento(cd.Description), un = cd.UnitFederation ?? uf;
  await supabase.from("frt_rte_malha").upsert({ cep, cidade: cn, uf: un, atendido: true, criado_em: new Date().toISOString() });
  return { cityDescription: cn, uf: un };
}

async function getValorRte(token: string, input: any, cepDest: string, cepOrig: string, cnpj: string, origId: number, destId: number) {
  try {
    const body = {
      OriginZipCode: cepOrig, OriginCityId: origId, DestinationZipCode: cepDest, DestinationCityId: destId,
      TotalWeight: pesoRealTotal(input.pacotes),
      EletronicInvoiceValue: input.valor_nf,
      CustomerTaxIdRegistration: cnpj,
      ReceiverCpfcnp: input.cnpj_destinatario.replace(/\D/g, ""),
      ContactName: input.contato_nome ?? "Cotacao",
      ContactPhoneNumber: input.contato_telefone ?? "00000000000",
      TotalPackages: input.pacotes.reduce((s: number, p: any) => s + p.quantidade, 0),
      Packs: input.pacotes.map((p: any) => ({ AmountPackages: p.quantidade, Weight: p.peso_kg, Length: p.comprimento_cm, Height: p.altura_cm, Width: p.largura_cm }))
    };
    const r = await fetch(`${RTE.urlQuotation}/api/v1/gera-cotacao`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) return { valor: null, id: null, deliveryTime: null, erro: `HTTP ${r.status}: ${txt.slice(0,200)}` };
    const d = JSON.parse(txt);
    const valor = parseFloat(String(d?.Value ?? d?.FreightValue ?? "0").replace(",", ".")) || null;
    return { valor, id: d?.ProtocolNumber ? String(d.ProtocolNumber) : null, deliveryTime: d?.DeliveryTime ?? null, erro: valor == null ? (d?.Message ?? "RTE retornou sem valor") : null };
  } catch (e) { return { valor: null, id: null, deliveryTime: null, erro: String(e) }; }
}

async function getPrazoRte(token: string, cOrig: string, uOrig: string, cDest: string, uDest: string) {
  try {
    const r = await fetch(`${RTE.urlPrazo}/api/v1/prazo-entrega`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ OriginCityDescription: semAcento(cOrig), OriginUFDescription: uOrig.toUpperCase(), DestinationCityDescription: semAcento(cDest), DestinationUFDescription: uDest.toUpperCase() }) });
    if (!r.ok) return null; const d = await r.json(); return d?.DeliveryTime ?? null;
  } catch { return null; }
}

async function cotarRodonaves(supabase: any, input: any, cepDest: string, cepOrig: string, cOrig: string, uOrig: string, dadosCep: any, cnpj: string) {
  try {
    return await Promise.race([
      (async () => {
        const [tUTC, tQuo, tDne, tPrazo] = await Promise.all([getRteToken(RTE.urlUnitToCity), getRteToken(RTE.urlQuotation), getRteToken(RTE.urlDne), getRteTokenOpcional(RTE.urlPrazo)]);
        const IDS: Record<string, number> = { "87507015": 6794, "89211710": 0, "02960000": 0 };
        const origFixo = IDS[cepOrig] ?? 0;
        const [cidade, destId, origDne] = await Promise.all([validarMalha(supabase, tUTC, cepDest, dadosCep.bairro, dadosCep.cidade, dadosCep.uf), buscarCityId(supabase, tDne, cepDest), origFixo > 0 ? Promise.resolve(origFixo) : buscarCityId(supabase, tDne, cepOrig)]);
        const origId = origFixo > 0 ? origFixo : origDne;
        if (!cidade) return { transportadora: "Rodonaves", prazo_dias: null, valor_frete: null, erro: "CEP fora da malha" };
        const [cot, prazo] = await Promise.all([getValorRte(tQuo, input, cepDest, cepOrig, cnpj, origId, destId), tPrazo ? getPrazoRte(tPrazo, cOrig, uOrig, cidade.cityDescription, cidade.uf) : Promise.resolve(null)]);
        return { transportadora: "Rodonaves", prazo_dias: cot?.deliveryTime ?? prazo, valor_frete: cot?.valor ?? null, id_cotacao: cot?.id ?? null, erro: (cot?.valor == null ? (cot?.erro ?? "Sem retorno da RTE") : null) };
      })(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), 25000))
    ]);
  } catch (e) { return { transportadora: "Rodonaves", prazo_dias: null, valor_frete: null, erro: String(e) }; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ erro: "Metodo nao permitido" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const input = await req.json();
    const idLocal = input.id_local ?? 1;
    const local = LOCAIS[idLocal];
    if (!local) return new Response(JSON.stringify({ erro: `Local ${idLocal} nao encontrado` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    if (!input.cep_destino || !input.cnpj_destinatario || !input.valor_nf || !input.pacotes?.length) return new Response(JSON.stringify({ erro: "Campos obrigatorios faltando" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    const cepDest = input.cep_destino.replace(/\D/g, "");
    const dadosCep = await buscarCep(cepDest);
    if (!dadosCep) return new Response(JSON.stringify({ erro: `CEP ${cepDest} nao encontrado` }), { status: 422, headers: { ...CORS, "Content-Type": "application/json" } });
    const cidadeDest = semAcento(dadosCep.cidade), ufDest = dadosCep.uf, ibge = dadosCep.ibge ?? 0;
    const pesoTotal  = input.pacotes.reduce((s: number, p: any) => s + p.peso_kg * p.quantidade, 0);
    const volTotal   = input.pacotes.reduce((s: number, p: any) => s + (p.altura_cm/100)*(p.largura_cm/100)*(p.comprimento_cm/100)*p.quantidade, 0);
    const pesoTaxado = calcularPesoTaxado(input.pacotes);
    const qtdVol     = input.pacotes.reduce((s: number, p: any) => s + p.quantidade, 0);
    const { data: codigoData, error: codigoErro } = await supabase.rpc("frt_gerar_codigo_cotacao");
    if (codigoErro) throw new Error(`Erro ao gerar codigo: ${codigoErro.message}`);
    const codigo = codigoData as string;
    const { data: cot, error: cotErro } = await supabase.from("frt_cotacoes").insert({ codigo, id_local: idLocal, cep_destino: cepDest, cidade_destino: dadosCep.cidade, uf_destino: ufDest, cnpj_destinatario: input.cnpj_destinatario, valor_nf: input.valor_nf, peso_total: pesoTotal, volume_total: volTotal, peso_taxado: pesoTaxado, qtd_volumes: qtdVol, criado_por: input.criado_por ?? null }).select("id").single();
    if (cotErro) throw new Error(`Erro ao salvar cotacao: ${cotErro.message}`);
    const idCot = cot.id;
    if (input.pacotes?.length) await supabase.from("frt_cotacoes_pacotes").insert(input.pacotes.map((p: any) => ({ id_cotacao: idCot, id_produto: p.id_produto ?? null, descricao: p.descricao ?? null, quantidade: p.quantidade, peso_kg: p.peso_kg, altura_cm: p.altura_cm, largura_cm: p.largura_cm, comprimento_cm: p.comprimento_cm })));
    const [rBP, rSM, rAG, rRD] = await Promise.all([cotarBraspress(input, cepDest, local.cep), cotarSaoMiguel(input, ibge, cidadeDest, ufDest), cotarAgex(input, idLocal, cepDest), cotarRodonaves(supabase, input, cepDest, local.cep, local.cidade, local.uf, dadosCep, local.cnpj)]);
    const resultados = [rBP, rSM, rAG, rRD].sort((a, b) => { if (a.valor_frete === null) return 1; if (b.valor_frete === null) return -1; return a.valor_frete - b.valor_frete; });
    await supabase.from("frt_cotacoes_respostas").insert(resultados.map((r: any) => ({ id_cotacao: idCot, transportadora: r.transportadora, valor_frete: r.valor_frete ?? null, prazo_dias: r.prazo_dias ?? null, id_cotacao_ext: r.id_cotacao ?? null, detalhes: r.detalhes ?? null, erro: r.erro ?? null })));
    const melhor = resultados.find((r: any) => r.valor_frete !== null);
    return new Response(JSON.stringify({ codigo, id_cotacao: idCot, cep_destino: cepDest, cidade: dadosCep.cidade, uf: ufDest, local, peso_taxado: pesoTaxado, mais_barata: melhor?.transportadora ?? null, resultados }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: "Erro interno", detalhe: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
