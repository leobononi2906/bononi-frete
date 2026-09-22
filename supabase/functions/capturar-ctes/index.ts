import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import JSZip from "npm:jszip@3.10.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRASPRESS_CNPJS = new Set(["00276567000195"]);
const BRASPRESS_NOME_KEYWORDS = ["BRASPRESS"];

function isBraspress(nomeTransportadora: string, cnpj?: string): boolean {
  if (cnpj && BRASPRESS_CNPJS.has(cnpj.replace(/\D/g, ""))) return true;
  const nome = (nomeTransportadora ?? "").toUpperCase();
  return BRASPRESS_NOME_KEYWORDS.some(k => nome.includes(k));
}

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

// CORREÇÃO 22/09/2026: a Rodonaves parou de anexar o XML direto no e-mail e passou a
// mandar link pro portal (gateway email-apigateway.rte.com.br, Type=3 -> zip de XMLs
// no S3). A busca antiga (`has:attachment filename:xml`) parou de achar qualquer
// e-mail dela — 12-13/09 em diante ficou em 0. Agora cobre os dois casos: anexo direto
// (carriers que ainda anexam) OU e-mail que menciona o gateway da Rodonaves.
// "(has:attachment filename:xml OR from:...)" com parenteses+OR devolve 0 resultados
// no Gmail — confirmado testando ao vivo (22/09/2026). Buscas simples e deduplicadas
// em código, em vez de um OR que o parser do Gmail não resolve direito junto com "has:".
//
// AGEX 22/09/2026: o e-mail original de despacho (no-reply@ssw.log.br, achado só no
// histórico de frt_conhecimentos) não aparece mais em nenhum lugar da caixa, nem em
// spam/lixeira -- não é caso de reconhecer formato novo, é o e-mail simplesmente não
// chegando aqui por enquanto. O "Lembrete de Vencimento da Fatura" (no-reply@
// sswsistemas.com.br, mesmo grupo SSW, chega normalmente) tem link direto sem login
// pro zip de XMLs -- usa esse como caminho alternativo (ver extrairLinkAgexXml).
//
// SAO MIGUEL 22/09/2026: mesmo problema de e-mail original sumido (edocesmcte@
// nfendd.com.br, zero resultado até com in:anywhere). O link alternativo que existe
// (fatura -> "Download documentos") cai num portal com captcha (soma) antes de liberar
// o arquivo -- não dá pra automatizar isso, é bloqueio de bot deliberado. Segue sem
// captura automática até alguém achar outro caminho ou confirmar com a transportadora
// se o e-mail de despacho mudou de destino.
async function buscarUmaQuery(token: string, q: string): Promise<any[]> {
  const query = encodeURIComponent(q);
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return data.messages ?? [];
}

async function buscarEmails(token: string): Promise<any[]> {
  const [porAnexo, porRodonaves, porAgex] = await Promise.all([
    buscarUmaQuery(token, "in:anywhere has:attachment filename:xml -label:cte-processado"),
    buscarUmaQuery(token, "in:anywhere from:e-doc@rte.com.br -label:cte-processado"),
    buscarUmaQuery(token, "in:anywhere from:sswsistemas.com.br -label:cte-processado"),
  ]);
  const vistos = new Set<string>();
  const combinados: any[] = [];
  for (const m of [...porAnexo, ...porRodonaves, ...porAgex]) {
    if (!vistos.has(m.id)) {
      vistos.add(m.id);
      combinados.push(m);
    }
  }
  return combinados;
}

async function baixarAnexo(token: string, messageId: string, attachmentId: string): Promise<string> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
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
  const existente = (data.labels ?? []).find((l: any) => l.name === "cte-processado");
  if (existente) return existente.id;
  const criar = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "cte-processado" }),
    }
  );
  const novoLabel = await criar.json();
  return novoLabel.id;
}

// Busca partes aninhadas do payload (attachments podem estar em multipart aninhado)
function extrairPartes(p: any): any[] {
  if (!p) return [];
  if (p.parts) return p.parts.flatMap((sub: any) => extrairPartes(sub));
  return [p];
}

function decodeBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

// HTML de e-mail escreve "&" dentro de link como "&amp;" — sem isso o regex do link
// captura a entidade literal e quebra a URL assinada (S3 rejeita silenciosamente).
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

// NOVO: texto/HTML do corpo do e-mail, pra procurar o link da Rodonaves nele.
function extrairCorpo(partes: any[]): string {
  let out = "";
  for (const p of partes) {
    const mime = (p.mimeType ?? "").toLowerCase();
    if ((mime === "text/plain" || mime === "text/html") && p.body?.data) {
      out += decodeHtmlEntities(decodeBase64Url(p.body.data)) + "\n";
    }
  }
  return out;
}

// NOVO: link do gateway RTE/Rodonaves (Type=3 = zip de XMLs). O alvo real já vem
// dentro do parâmetro RedirectLink, assinado (AWSAccessKeyId/Expires) — não precisa
// seguir redirecionamento.
function extrairLinkRodonavesXml(corpo: string): string | null {
  const m = corpo.match(/https:\/\/email-apigateway\.rte\.com\.br\/webapi\/v1\/event\?Type=3[^\s"'<>]*/i);
  if (!m) return null;
  const gateway = m[0];
  const idx = gateway.indexOf("RedirectLink=");
  if (idx < 0) return null;
  const resto = gateway.slice(idx + "RedirectLink=".length);
  const fim = resto.indexOf("&CompanyId=");
  const codificado = fim >= 0 ? resto.slice(0, fim) : resto;
  try { return decodeURIComponent(codificado); } catch { return codificado; }
}

// NOVO: link do "Lembrete de Vencimento da Fatura" da AGEX (portal ssw.inf.br). O
// e-mail traz 3 links iguais na forma ssw1188?id=<hex> -- um pro DACTE em pdf, um pro
// CSV e um pro XML -- e o id decodificado não tem prefixo de tipo visível; só dá pra
// saber qual é qual pelo texto que vem escrito antes de cada um. Por isso procura a
// âncora "XML dos CT-e" primeiro e pega o link mais próximo depois dela.
function extrairLinkAgexXml(corpo: string): string | null {
  const idx = corpo.search(/XML\s+dos\s+CT-?e/i);
  if (idx < 0) return null;
  const trecho = corpo.slice(idx, idx + 500);
  const m = trecho.match(/https:\/\/ssw\.inf\.br\/cgi-local\/ssw1188\?id=[^\s"'<>]+/i);
  return m ? m[0] : null;
}

// NOVO: baixa um .zip e devolve o texto de cada .xml dentro dele.
async function baixarXmlsDoZip(url: string): Promise<string[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar zip (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xmls: string[] = [];
  for (const nome of Object.keys(zip.files)) {
    const arq = zip.files[nome];
    if (!arq.dir && nome.toLowerCase().endsWith(".xml")) {
      xmls.push(await arq.async("string"));
    }
  }
  return xmls;
}

function parseCTe(xml: string): Record<string, any> | null {
  try {
    const get = (tag: string) => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
      return m ? m[1].trim() : null;
    };
    const chave = xml.match(/chCTe>([^<]+)</)?.[1]?.trim()
               ?? xml.match(/Id="CTe(\d{44})"/)?.[1];
    return {
      chave_cte:           chave,
      num_cte:             get("nCT"),
      serie_cte:           get("serie"),
      data_emissao:        get("dhEmi")?.substring(0, 10) ?? get("dEmi"),
      cnpj_transportadora: get("CNPJ") ?? get("emit>CNPJ"),
      nome_transportadora: get("xNome"),
      cnpj_remetente:      xml.match(/rem>[\s\S]*?CNPJ>([^<]+)/)?.[1]?.trim(),
      cnpj_destinatario:   xml.match(/dest>[\s\S]*?CNPJ>([^<]+)/)?.[1]?.trim()
                        ?? xml.match(/dest>[\s\S]*?CPF>([^<]+)/)?.[1]?.trim(),
      nome_destinatario:   xml.match(/dest>[\s\S]*?xNome>([^<]+)/)?.[1]?.trim(),
      cep_destino:         xml.match(/dest>[\s\S]*?CEP>([^<]+)/)?.[1]?.trim(),
      uf_destino:          xml.match(/dest>[\s\S]*?UF>([^<]+)/)?.[1]?.trim(),
      cidade_destino:      xml.match(/dest>[\s\S]*?xMun>([^<]+)/)?.[1]?.trim(),
      peso_kg:          parseFloat(get("qCarga") ?? "0"),
      valor_mercadoria: parseFloat(get("vCarga") ?? get("vMerc") ?? "0"),
      valor_frete_cte:  parseFloat(get("vTPrest") ?? get("vRec") ?? "0"),
      valor_pedagio:    parseFloat(get("vPedAgio") ?? "0"),
      notas_fiscais: (() => {
        const nfs: any[] = [];
        const regex = /<chave>([^<]{44})<\/chave>/g;
        let m;
        while ((m = regex.exec(xml)) !== null) {
          const chaveNfe = m[1];
          const numNf = parseInt(chaveNfe.substring(25, 34), 10);
          nfs.push({ chave_nfe: chaveNfe, num_nf: numNf });
        }
        return nfs.length > 0 ? nfs : null;
      })(),
      xml_raw: xml,
    };
  } catch (e) {
    console.error("Erro parse CTe:", e);
    return null;
  }
}

function slugTransportadora(nome: string): string {
  const n = nome.toUpperCase();
  if (n.includes("RODONAVES")) return "RODONAVES";
  if (n.includes("BRASPRESS")) return "BRASPRESS";
  if (n.includes("SAO MIGUEL") || n.includes("EXPRESSO SAO")) return "SAO MIGUEL";
  if (n.includes("AGEX")) return "AGEX";
  return n.split(" ")[0];
}

async function buscarDadosNF(
  supabase: any,
  numNf: string,
  chaveNfe: string | null,
  nomeTransportadoraCte: string
): Promise<{ id_vendedor: number|null, nome_vendedor: string|null, departamento: string|null, faturamento_doc: number|null, valor_frete_nf: number|null }> {
  try {
    const slugCte = slugTransportadora(nomeTransportadoraCte);
    const { data: rows } = await supabase.rpc("buscar_dados_nf_para_cte", {
      p_num_nf:      numNf,
      p_slug_transp: slugCte,
      p_chave_nfe:   chaveNfe ?? null,
    });
    if (!rows || rows.length === 0) {
      return { id_vendedor: null, nome_vendedor: null, departamento: null, faturamento_doc: null, valor_frete_nf: null };
    }
    const best = rows[0];
    return {
      id_vendedor:     best.id_vendedor,
      nome_vendedor:   best.nome_vendedor,
      departamento:    best.departamento,
      faturamento_doc: best.faturamento_doc,
      valor_frete_nf:  best.valor_frete,
    };
  } catch (e) {
    console.error("buscarDadosNF erro:", e);
    return { id_vendedor: null, nome_vendedor: null, departamento: null, faturamento_doc: null, valor_frete_nf: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token   = await getAccessToken();
    const labelId = await garantirLabel(token);

    const mensagens = await buscarEmails(token);
    console.log(`[capturar-ctes] Encontrados ${mensagens.length} e-mails (inbox + spam + lixeira)`);

    let processados = 0, ignorados_braspress = 0, erros = 0, sem_xml = 0, spam_count = 0;
    const detalhes: any[] = [];

    for (const msg of mensagens) {
      try {
        const detalhe = await buscarMensagem(token, msg.id);
        const labels  = detalhe.labelIds ?? [];
        const isSpam  = labels.includes("SPAM");
        const isTrash = labels.includes("TRASH");
        const fromHeader = detalhe.payload?.headers?.find((h: any) => h.name === "From")?.value ?? "";
        const subjectHeader = detalhe.payload?.headers?.find((h: any) => h.name === "Subject")?.value ?? "";

        if (isSpam) spam_count++;

        const partes = detalhe.payload?.parts ?? [detalhe.payload];
        const todasPartes = partes.flatMap((p: any) => extrairPartes(p));

        // 1) anexo XML direto (carriers que ainda anexam assim)
        const xmlsDaMensagem: string[] = [];
        for (const parte of todasPartes) {
          const fname = (parte.filename ?? "").toLowerCase();
          const mime  = parte.mimeType ?? "";
          if (fname.endsWith(".xml") || mime === "application/xml" || mime === "text/xml") {
            const attachId = parte.body?.attachmentId;
            if (attachId) {
              xmlsDaMensagem.push(await baixarAnexo(token, msg.id, attachId));
            } else if (parte.body?.data) {
              xmlsDaMensagem.push(decodeBase64Url(parte.body.data));
            }
          }
        }

        // 2) NOVO: link pro portal do transportador -> zip de XMLs (Rodonaves e AGEX
        // pararam de anexar o XML direto e passaram a linkar pra um portal).
        if (xmlsDaMensagem.length === 0) {
          const corpo = extrairCorpo(todasPartes);
          const linkRodonaves = extrairLinkRodonavesXml(corpo);
          const linkAgex = linkRodonaves ? null : extrairLinkAgexXml(corpo);
          const linkZip = linkRodonaves ?? linkAgex;
          const origemLink = linkRodonaves ? "rodonaves" : "agex";
          if (linkZip) {
            try {
              const doZip = await baixarXmlsDoZip(linkZip);
              xmlsDaMensagem.push(...doZip);
              console.log(`[${origemLink}] ${msg.id} — ${doZip.length} XML(s) extraídos do zip`);
            } catch (e) {
              console.error(`[${origemLink}] ${msg.id} — falha ao baixar/extrair zip:`, e);
            }
          }
        }

        if (xmlsDaMensagem.length === 0) {
          console.log(`[skip] ${msg.id} — sem XML válido | from: ${fromHeader.slice(0,60)}`);
          sem_xml++;
          continue;
        }

        let algumProcessado = false;

        for (const xmlContent of xmlsDaMensagem) {
          if (!xmlContent.includes("cteProc") && !xmlContent.includes("CTe")) {
            console.log(`[skip] ${msg.id} — XML não é CTe`);
            sem_xml++;
            continue;
          }

          const dados = parseCTe(xmlContent);
          if (!dados || !dados.chave_cte) {
            console.log(`[erro] ${msg.id} — falhou no parse do CTe`);
            erros++;
            continue;
          }

          // Braspress — captura via API separada
          if (isBraspress(dados.nome_transportadora ?? "", dados.cnpj_transportadora ?? "")) {
            console.log(`[braspress] CTe ${dados.num_cte} ignorado — captura via API`);
            ignorados_braspress++;
            algumProcessado = true;
            continue;
          }

          let dadosNF = { id_vendedor: null as any, nome_vendedor: null as any, departamento: null as any, faturamento_doc: null as any, valor_frete_nf: null as any };
          if (dados.notas_fiscais?.length > 0) {
            const numNf    = String(dados.notas_fiscais[0].num_nf);
            const chaveNfe = dados.notas_fiscais[0].chave_nfe ?? null;
            if (numNf) {
              dadosNF = await buscarDadosNF(supabase, numNf, chaveNfe, dados.nome_transportadora ?? "");
              if (dadosNF.nome_vendedor) {
                console.log(`[nf] NF ${numNf}: vendedor=${dadosNF.nome_vendedor}, frete_nf=${dadosNF.valor_frete_nf}`);
              } else {
                console.log(`[nf] NF ${numNf}: não encontrada na vw_comercial_docs_faturados (chave: ${chaveNfe?.slice(0,20) ?? 'n/a'})`);
              }
            }
          }

          const valorTotalCte = (dados.valor_frete_cte ?? 0) + (dados.valor_pedagio ?? 0);

          const { error } = await supabase
            .from("frt_conhecimentos")
            .upsert(
              {
                chave_cte:           dados.chave_cte,
                num_cte:             dados.num_cte,
                serie_cte:           dados.serie_cte,
                data_emissao:        dados.data_emissao,
                data_recebimento:    new Date().toISOString().substring(0, 10),
                cnpj_transportadora: dados.cnpj_transportadora,
                nome_transportadora: dados.nome_transportadora,
                cnpj_remetente:      dados.cnpj_remetente,
                cnpj_destinatario:   dados.cnpj_destinatario,
                nome_destinatario:   dados.nome_destinatario,
                cep_destino:         dados.cep_destino,
                uf_destino:          dados.uf_destino,
                cidade_destino:      dados.cidade_destino,
                peso_kg:             dados.peso_kg,
                valor_mercadoria:    dadosNF.faturamento_doc ?? dados.valor_mercadoria,
                valor_frete_cte:     dados.valor_frete_cte,
                valor_total_cte:     valorTotalCte,
                valor_frete_nf:      dadosNF.valor_frete_nf,
                valor_pedagio:       dados.valor_pedagio,
                notas_fiscais:       dados.notas_fiscais,
                email_origem:        fromHeader,
                email_subject:       subjectHeader,
                veio_do_spam:        isSpam,
                xml_raw:             dados.xml_raw,
                status_auditoria:    "pendente",
                id_vendedor:         dadosNF.id_vendedor,
                nome_vendedor:       dadosNF.nome_vendedor,
                departamento:        dadosNF.departamento,
              },
              { onConflict: "chave_cte" }
            );

          if (error) {
            console.error(`[erro] CTe ${dados.chave_cte}:`, JSON.stringify(error));
            erros++;
          } else {
            processados++;
            algumProcessado = true;
            const origem = isSpam ? "SPAM" : isTrash ? "LIXEIRA" : "INBOX";
            console.log(`[ok] CTe ${dados.num_cte} (${dados.nome_transportadora}) — ${origem}`);
            detalhes.push({
              num_cte: dados.num_cte,
              transportadora: dados.nome_transportadora,
              origem,
              data_emissao: dados.data_emissao,
            });
          }
        }

        if (algumProcessado) {
          await marcarProcessado(token, msg.id, labelId);
        }
      } catch (e) {
        console.error(`[erro] Mensagem ${msg.id}:`, e);
        erros++;
      }
    }

    const resultado = {
      sucesso: true,
      total_encontrados: mensagens.length,
      processados,
      ignorados_braspress,
      sem_xml,
      do_spam: spam_count,
      erros,
      detalhes,
    };
    console.log("[resultado]", JSON.stringify(resultado));

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[erro geral]", e);
    return new Response(JSON.stringify({ sucesso: false, erro: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
