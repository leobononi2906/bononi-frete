// Correios (CWS, api.correios.com.br): cotação de preço/prazo e rastreio do contrato.
// Secrets: CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CARTAO_POSTAGEM,
// CORREIOS_SERVICOS (opcional, "03220:SEDEX,03298:PAC").

const BASE = "https://api.correios.com.br";
const SERVICOS_PADRAO = "03220:SEDEX,03298:PAC";

// Limites de objeto dos Correios (caixa/pacote): 30 kg, 100 cm no maior lado, soma dos lados 200 cm.
const MAX_KG = 30, MAX_LADO_CM = 100, MAX_SOMA_CM = 200;

let tokenCache: { token: string; expira: number } | null = null;

async function tokenCorreios(): Promise<string> {
  if (tokenCache && tokenCache.expira - Date.now() > 10 * 60 * 1000) return tokenCache.token;
  const usuario = Deno.env.get("CORREIOS_USUARIO") ?? "";
  const codigo = Deno.env.get("CORREIOS_CODIGO_ACESSO") ?? "";
  const cartao = Deno.env.get("CORREIOS_CARTAO_POSTAGEM") ?? "";
  if (!usuario || !codigo || !cartao) throw new Error("Credenciais dos Correios nao configuradas");
  const r = await fetch(`${BASE}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${usuario}:${codigo}`)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ numero: cartao }),
  });
  if (!r.ok) throw new Error(`Token Correios HTTP ${r.status}`);
  const d = await r.json();
  if (!d?.token) throw new Error("Token Correios ausente na resposta");
  const expira = d.expiraEm ? new Date(d.expiraEm).getTime() : Date.now() + 60 * 60 * 1000;
  tokenCache = { token: d.token, expira: isNaN(expira) ? Date.now() + 60 * 60 * 1000 : expira };
  return d.token;
}

async function getJson(url: string, token: string): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  let data: any = null;
  try { data = await r.json(); } catch { /* corpo vazio */ }
  return { ok: r.ok, status: r.status, data };
}

function msgErro(res: { status: number; data: any }): string {
  const d = res.data;
  const txt = d?.msgs?.join?.("; ") ?? d?.mensagem ?? d?.message ?? "";
  return `Correios HTTP ${res.status}${txt ? `: ${String(txt).slice(0, 160)}` : ""}`;
}

function servicosConfigurados(): Array<{ cod: string; nome: string }> {
  return (Deno.env.get("CORREIOS_SERVICOS") || SERVICOS_PADRAO).split(",").map((s) => {
    const [cod, nome] = s.split(":").map((x) => x.trim());
    return { cod, nome: nome || cod };
  }).filter((s) => s.cod);
}

function foraDoLimite(p: any): boolean {
  const lados = [p.altura_cm, p.largura_cm, p.comprimento_cm];
  return p.peso_kg > MAX_KG || Math.max(...lados) > MAX_LADO_CM || lados.reduce((a, b) => a + b, 0) > MAX_SOMA_CM;
}

async function cotarServico(token: string, svc: { cod: string; nome: string }, pacotes: any[], cepOrigem: string, cepDestino: string) {
  const transportadora = `Correios ${svc.nome}`;
  const falha = (erro: string) => ({ transportadora, prazo_dias: null, valor_frete: null, id_cotacao: null, erro });
  try {
    // Preço: um objeto por pacote, multiplicado pela quantidade. Prazo: o maior entre os pacotes (depende só do CEP).
    const precos = await Promise.all(pacotes.map(async (p) => {
      const q = new URLSearchParams({
        cepOrigem, cepDestino, tpObjeto: "2",
        psObjeto: String(Math.max(1, Math.round(p.peso_kg * 1000))),
        comprimento: String(Math.ceil(p.comprimento_cm)), largura: String(Math.ceil(p.largura_cm)), altura: String(Math.ceil(p.altura_cm)),
      });
      const res = await getJson(`${BASE}/preco/v1/nacional/${svc.cod}?${q}`, token);
      if (!res.ok) throw new Error(msgErro(res));
      const v = parseFloat(String(res.data?.pcFinal ?? "").replace(/\./g, "").replace(",", "."));
      if (isNaN(v)) throw new Error("Correios sem preco na resposta");
      return v * (p.quantidade ?? 1);
    }));
    const prazoRes = await getJson(`${BASE}/prazo/v1/nacional/${svc.cod}?${new URLSearchParams({ cepOrigem, cepDestino })}`, token);
    const prazo = prazoRes.ok ? Number(prazoRes.data?.prazoEntrega) : NaN;
    return {
      transportadora,
      prazo_dias: isNaN(prazo) ? null : prazo,
      valor_frete: Math.round(precos.reduce((a, b) => a + b, 0) * 100) / 100,
      id_cotacao: null,
      erro: null,
    };
  } catch (e) {
    return falha(String((e as Error)?.message ?? e));
  }
}

// Uma linha por serviço (SEDEX, PAC...). Nunca lança erro: falha vira `erro` na linha.
export async function cotarCorreios(input: any, cepOrigem: string, cepDestino: string) {
  const servicos = servicosConfigurados();
  const todas = (erro: string) => servicos.map((s) => ({ transportadora: `Correios ${s.nome}`, prazo_dias: null, valor_frete: null, id_cotacao: null, erro }));
  if (input.pacotes.some(foraDoLimite)) return todas("Volume fora do limite dos Correios (30 kg, 100 cm por lado, soma 200 cm)");
  try {
    return await Promise.race([
      (async () => {
        const token = await tokenCorreios();
        return await Promise.all(servicos.map((s) => cotarServico(token, s, input.pacotes, cepOrigem, cepDestino)));
      })(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), 20000)),
    ]);
  } catch (e) {
    return todas(String((e as Error)?.message ?? e));
  }
}

export async function rastrearCorreios(codigo: string) {
  const cod = codigo.trim().toUpperCase();
  if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod)) throw new Error("Codigo de rastreio invalido (ex.: AB123456789BR)");
  const token = await tokenCorreios();
  const res = await getJson(`${BASE}/srorastro/v1/objetos/${cod}?resultado=T`, token);
  if (!res.ok) throw new Error(msgErro(res));
  const obj = res.data?.objetos?.[0];
  if (!obj) throw new Error("Objeto nao encontrado");
  if (obj.mensagem && !obj.eventos?.length) throw new Error(String(obj.mensagem));
  const eventos = (obj.eventos ?? []).map((e: any) => ({
    data_hora: e.dtHrCriado ?? null,
    descricao: e.descricao ?? "",
    local: [e.unidade?.endereco?.cidade ?? e.unidade?.nome, e.unidade?.endereco?.uf].filter(Boolean).join(" / "),
    destino: e.unidadeDestino ? [e.unidadeDestino.endereco?.cidade ?? e.unidadeDestino.nome, e.unidadeDestino.endereco?.uf].filter(Boolean).join(" / ") : null,
  }));
  return { codigo: cod, eventos };
}
