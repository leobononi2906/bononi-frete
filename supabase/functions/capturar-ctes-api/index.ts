import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CNPJ_POR_EMPRESA: Record<number, string> = {
  1: "57129987000166", // TRUCKPREST
  2: "05864790000177", // MLB PR
  3: "05864790000258", // MLB SC
  4: "05864790000339", // MLB SP
  6: "51054503000180", // BATTOGO
  8: "15090647000200", // BONONI SC
};

function getCnpjByEmpresa(idEmpresa: number): string {
  const secret = Deno.env.get(`BRASPRESS_CNPJ_EMPRESA_${idEmpresa}`);
  if (secret) return secret.replace(/\D/g, "");
  return CNPJ_POR_EMPRESA[idEmpresa] ?? "";
}

function parseDataBraspress(data: string | null | undefined): string | null {
  if (!data) return null;
  const s = String(data).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return null;
}

async function buscarCTeBraspress(cnpjRemetente: string, numNf: string, auth: string): Promise<any[] | null> {
  try {
    const url = `https://api.braspress.com/v3/tracking/byNf/${cnpjRemetente}/${numNf}/json`;
    const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn(`Braspress NF ${numNf} CNPJ ${cnpjRemetente} → HTTP ${resp.status}: ${txt.substring(0, 300)}`);
      return null;
    }
    const data = await resp.json();
    return data?.conhecimentos ?? null;
  } catch (e) {
    console.error(`Erro buscarCTeBraspress NF ${numNf}:`, e);
    return null;
  }
}

function brasspressParaConhecimento(c: any, numNfOrigem: string, idEmpresa: number, cnpjRemetente: string): Record<string, any> {
  const notas = (c.notasFiscais ?? []).map((nf: any) => ({ num_nf: String(nf.numero), chave_nfe: null }));
  if (notas.length === 0 && numNfOrigem) notas.push({ num_nf: numNfOrigem, chave_nfe: null });

  const numCte = String(c.numero ?? "");
  const chaveCte = `BP-${cnpjRemetente}-${numCte}`;
  const dataEmissao = parseDataBraspress(c.emissao) ?? new Date().toISOString().substring(0, 10);

  return {
    chave_cte:           chaveCte,
    num_cte:             numCte,
    serie_cte:           null,
    data_emissao:        dataEmissao,
    data_recebimento:    new Date().toISOString().substring(0, 10),
    cnpj_transportadora: "00276567000195",
    nome_transportadora: "BRASPRESS TRANSPORTES URGENTES LTDA",
    cnpj_remetente:      cnpjRemetente,
    cnpj_destinatario:   null,
    nome_destinatario:   c.destinatario ?? null,
    cep_destino:         null,
    uf_destino:          c.uf ?? null,
    cidade_destino:      c.cidade ?? null,
    peso_kg:             parseFloat(c.peso ?? "0") || 0,
    valor_mercadoria:    parseFloat(c.valorMercantil ?? "0") || 0,
    valor_frete_cte:     parseFloat(c.totalFrete ?? "0") || 0,
    valor_total_cte:     parseFloat(c.totalFrete ?? "0") || 0,
    valor_frete_nf:      null,
    valor_pedagio:       0,
    notas_fiscais:       notas,
    email_origem:        "api-braspress",
    xml_raw:             JSON.stringify(c),
    status_auditoria:    "pendente",
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

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const bpUser = Deno.env.get("BRASPRESS_USER") ?? "";
    const bpPass = Deno.env.get("BRASPRESS_PASS") ?? "";
    const bpAuth = btoa(`${bpUser}:${bpPass}`);

    if (!bpUser || !bpPass) {
      return new Response(JSON.stringify({ sucesso: false, erro: "BRASPRESS_USER / BRASPRESS_PASS não configurados" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    let diasBusca = 7;
    try { const body = await req.json(); if (body?.dias) diasBusca = Number(body.dias); } catch (_) {}

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasBusca);
    const dataInicioStr = dataInicio.toISOString().substring(0, 10);

    console.log(`Buscando NFs Braspress sem CTe desde ${dataInicioStr} (${diasBusca} dias)`);

    const { data: nfsSemCte, error: errNfs } = await supabase
      .from("frt_nf_sem_cte")
      .select("num_nf, data_faturamento, nome_cliente, id_empresa, empresa")
      .ilike("nome_transportadora", "%BRASPRESS%")
      .gte("data_faturamento", dataInicioStr)
      .order("data_faturamento", { ascending: false });

    if (errNfs) throw new Error(`Erro ao buscar NFs: ${errNfs.message}`);

    console.log(`Encontradas ${nfsSemCte?.length ?? 0} NFs Braspress sem CTe`);

    let processados = 0, naoEncontrados = 0, erros = 0, enriquecidos = 0;
    const detalhes: any[] = [];

    for (const nf of (nfsSemCte ?? [])) {
      try {
        const cnpjRemetente = getCnpjByEmpresa(nf.id_empresa);
        if (!cnpjRemetente) {
          console.warn(`Empresa ${nf.id_empresa} (${nf.empresa}) sem CNPJ — pulando NF ${nf.num_nf}`);
          detalhes.push({ num_nf: nf.num_nf, empresa: nf.empresa, status: "sem_cnpj" });
          erros++;
          continue;
        }

        const conhecimentos = await buscarCTeBraspress(cnpjRemetente, nf.num_nf, bpAuth);
        if (!conhecimentos || conhecimentos.length === 0) {
          detalhes.push({ num_nf: nf.num_nf, empresa: nf.empresa, status: "nao_encontrado" });
          naoEncontrados++;
          continue;
        }

        // ENRIQUECIMENTO company-safe: vendedor/frete_nf da NF de venda (por empresa + numero)
        let dadosNF: any = null;
        try {
          const { data: nfRows } = await supabase.rpc("buscar_dados_nf_para_cte_por_empresa", {
            p_num_nf: String(nf.num_nf), p_id_empresa: nf.id_empresa,
          });
          if (nfRows && nfRows.length > 0) dadosNF = nfRows[0];
        } catch (e) { console.error(`Enriquecimento NF ${nf.num_nf} falhou:`, e); }

        for (const c of conhecimentos) {
          const registro = brasspressParaConhecimento(c, nf.num_nf, nf.id_empresa, cnpjRemetente);

          if (dadosNF) {
            registro.id_vendedor    = dadosNF.id_vendedor ?? null;
            registro.nome_vendedor  = dadosNF.nome_vendedor ?? null;
            registro.departamento   = dadosNF.departamento ?? null;
            registro.valor_frete_nf = dadosNF.valor_frete ?? null;
            if (dadosNF.faturamento_doc != null) registro.valor_mercadoria = dadosNF.faturamento_doc;
            enriquecidos++;
          }

          const { error: errUpsert } = await supabase.from("frt_conhecimentos").upsert(registro, { onConflict: "chave_cte" });

          if (errUpsert) {
            console.error(`Erro ao salvar CTe ${registro.num_cte}:`, errUpsert.message);
            detalhes.push({ num_nf: nf.num_nf, num_cte: registro.num_cte, status: "erro_salvar", erro: errUpsert.message });
            erros++;
          } else {
            detalhes.push({ num_nf: nf.num_nf, num_cte: registro.num_cte, empresa: nf.empresa, status: "salvo", valor_frete: registro.valor_frete_cte, vendedor: registro.nome_vendedor ?? null });
            processados++;
          }
        }
      } catch (e) {
        console.error(`Erro NF ${nf.num_nf}:`, e);
        detalhes.push({ num_nf: nf.num_nf, status: "erro", erro: String(e) });
        erros++;
      }
    }

    return new Response(
      JSON.stringify({ sucesso: true, periodo_dias: diasBusca, total_nfs: nfsSemCte?.length ?? 0, processados, enriquecidos, nao_encontrados: naoEncontrados, erros, detalhes }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erro geral:", e);
    return new Response(JSON.stringify({ sucesso: false, erro: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
