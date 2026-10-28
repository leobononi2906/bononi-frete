import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 28/10/2026: o token saiu do código (estava literal desde a publicação fora de repo); vem do Secret
// FRETES_TOKEN, o mesmo valor que o Activepieces manda no header x-fretes-token.
const TOKEN = Deno.env.get('FRETES_TOKEN') ?? ''
const BUCKET = 'faturas-frete'
const MAX_BYTES = 30 * 1024 * 1024

function allowed(urlStr:string){
  try {
    const u = new URL(urlStr)
    const h = u.hostname.toLowerCase()
    return u.protocol === 'https:' && (h === 'braspress.com.br' || h === 'www.braspress.com.br' || h.endsWith('.braspress.com.br'))
  } catch { return false }
}

function isPdf(bytes:Uint8Array, contentType:string|null){
  return bytes.length >= 4 && bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46 && String(contentType||'').toLowerCase().includes('application/pdf')
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed',{status:405})
    if (!TOKEN || req.headers.get('x-fretes-token') !== TOKEN) return new Response('Unauthorized',{status:401})

    const p = await req.json()
    const transportadora = String(p.transportadora || 'BRASPRESS').trim().toUpperCase()
    const numFatura = String(p.numFatura || p.numeroFatura || '').trim()
    const linkFatura = String(p.linkFatura || '').trim()
    if (transportadora !== 'BRASPRESS' || !numFatura || !linkFatura) throw new Error('Campos obrigatorios ausentes')
    if (!allowed(linkFatura)) throw new Error('Dominio Braspress nao permitido')

    const protocolUrl = new URL(linkFatura)
    const protocolo = protocolUrl.searchParams.get('protocolo') || ''
    if (!/^[A-Za-z0-9]{8,64}$/.test(protocolo)) throw new Error('Protocolo Braspress invalido')

    const pageRes = await fetch(protocolUrl.toString(), {
      redirect:'follow',
      headers:{'User-Agent':'Mozilla/5.0 Bononi-Fretes/2.0','Accept':'text/html,*/*'},
      signal:AbortSignal.timeout(15000)
    })
    if (!pageRes.ok) throw new Error(`Braspress pagina HTTP ${pageRes.status}`)
    const html = await pageRes.text()

    const cookie = pageRes.headers.get('set-cookie') || ''
    const sid = cookie.match(/JSESSIONID=([^;]+)/i)?.[1] || html.match(/jsessionid=([A-Za-z0-9]+)/i)?.[1] || ''
    if (!sid) throw new Error('Sessao Braspress nao encontrada')

    const pdfUrl = new URL(`/fatura/download;jsessionid=${encodeURIComponent(sid)}?protocolo=${encodeURIComponent(protocolo)}&protocoloWeb=true`, protocolUrl.origin)
    const pdfRes = await fetch(pdfUrl.toString(), {
      redirect:'follow',
      headers:{
        'User-Agent':'Mozilla/5.0 Bononi-Fretes/2.0',
        'Accept':'application/pdf,*/*',
        'Cookie':`JSESSIONID=${sid}`,
        'Referer':protocolUrl.toString()
      },
      signal:AbortSignal.timeout(20000)
    })
    if (!pdfRes.ok) throw new Error(`Braspress PDF HTTP ${pdfRes.status}`)
    const buf = await pdfRes.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw new Error('PDF acima do limite')
    const bytes = new Uint8Array(buf)
    if (!isPdf(bytes,pdfRes.headers.get('content-type'))) throw new Error('Resposta Braspress nao e PDF')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const path = `braspress/${numFatura}/fatura.pdf`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path,bytes,{contentType:'application/pdf',upsert:true})
    if (upErr) throw upErr

    const now = new Date().toISOString()
    const { data, error: dbErr } = await supabase.from('frt_faturas')
      .update({arquivo_path:path,arquivo_status:'CAPTURADO',status:'PDF_CAPTURADO',erro_captura:null,capturado_em:now,atualizado_em:now})
      .eq('transportadora','BRASPRESS').eq('num_fatura',numFatura)
      .select('id,transportadora,num_fatura,status,arquivo_status,arquivo_path').maybeSingle()
    if (dbErr) throw dbErr
    if (!data) throw new Error('Fatura nao encontrada no Supabase')

    return Response.json({ok:true,data,size:bytes.length})
  } catch(e:any){
    return Response.json({ok:false,error:String(e?.message||e).slice(0,800)},{status:500})
  }
})