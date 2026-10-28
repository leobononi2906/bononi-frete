import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 28/10/2026: o token saiu do código (estava literal desde a publicação fora de repo); vem do Secret
// FRETES_TOKEN, o mesmo valor que o Activepieces manda no header x-fretes-token.
const TOKEN = Deno.env.get('FRETES_TOKEN') ?? ''
const BUCKET = 'faturas-frete'

function cleanUrl(value: string) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&#38;/g, '&').replace(/&quot;/gi, '"').replace(/[\s\]\[()>,.;]+$/g, '')
}
function canonicalInvoice(transportadora:string,num:string){
  const n=String(num||'').trim()
  if(transportadora==='AGEX TRANSPORTES URGENTES LTDA' && /^\d{6}$/.test(n)) return `0${n}`
  return n
}
function isPdf(bytes: Uint8Array, contentType: string | null) {
  return (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) || String(contentType || '').toLowerCase().includes('application/pdf')
}
function allowedHost(urlStr: string, carrier: string) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase()
    if (carrier === 'RODONAVES') return host === 's3.sa-east-1.amazonaws.com' || host === 'email-apigateway.rte.com.br' || host.endsWith('.rte.com.br')
    if (carrier === 'EXPRESSO SAO MIGUEL') return host === 'faturas.expressosaomiguel.com.br' || host.endsWith('.expressosaomiguel.com.br')
    if (carrier === 'BRASPRESS') return host === 'www.braspress.com.br' || host === 'braspress.com.br' || host.endsWith('.braspress.com.br') || host === 'www.braspress.com' || host === 'braspress.com'
    return false
  } catch { return false }
}
async function fetchRodonavesPdf(url: string) {
  if (!allowedHost(url, 'RODONAVES')) throw new Error('Dominio Rodonaves nao permitido')
  const res = await fetch(cleanUrl(url), {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 Bononi-Fretes/1.0', 'Accept': 'application/pdf,*/*' },
    signal: AbortSignal.timeout(15000)
  })
  if (!res.ok) throw new Error(`Rodonaves HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > 30 * 1024 * 1024) throw new Error('Arquivo acima de 30 MB')
  if (!isPdf(bytes, res.headers.get('content-type'))) throw new Error('Resposta Rodonaves nao e PDF')
  return { bytes, finalUrl: res.url }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    if (!TOKEN || req.headers.get('x-fretes-token') !== TOKEN) return new Response('Unauthorized', { status: 401 })
    const payload = await req.json()
    const transportadora = String(payload.transportadora || '').trim()
    const numFatura = canonicalInvoice(transportadora,String(payload.numeroFatura || ''))
    if (!transportadora || transportadora === 'OUTRA' || !numFatura) return Response.json({ ok: true, ignored: true })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const linkNovo = cleanUrl(String(payload.linkFatura || '')) || null

    const [{ data: existing, error: existingError }, { data: queueJob, error: queueError }] = await Promise.all([
      supabase.from('frt_faturas')
        .select('id,transportadora,num_fatura,status,arquivo_status,arquivo_path,capturado_em,link_fatura,email_id,email_subject,remetente_original,empresa,vencimento,valor_total')
        .eq('transportadora', transportadora).eq('num_fatura', numFatura).maybeSingle(),
      supabase.from('frt_fila_impressao')
        .select('id,status,arquivo_path,impresso_em')
        .eq('transportadora', transportadora).eq('num_fatura', numFatura)
        .in('status', ['PENDENTE','PROCESSANDO','IMPRESSO'])
        .order('id', { ascending: false }).limit(1).maybeSingle()
    ])
    if (existingError) throw existingError
    if (queueError) throw queueError

    const terminal = existing?.arquivo_status === 'CAPTURADO' || existing?.status === 'PDF_CAPTURADO' || !!queueJob
    if (terminal) {
      if (existing && queueJob && existing.arquivo_status !== 'CAPTURADO') {
        const path = existing.arquivo_path || queueJob.arquivo_path || null
        if (path) {
          await supabase.from('frt_faturas').update({
            status: 'PDF_CAPTURADO', arquivo_status: 'CAPTURADO', arquivo_path: path, erro_captura: null,
            capturado_em: existing.capturado_em || queueJob.impresso_em || new Date().toISOString(), atualizado_em: new Date().toISOString()
          }).eq('id', existing.id)
        }
      }
      return Response.json({ ok: true, duplicate: true, preserved: true, captured: true, queued: true,
        data: existing || { transportadora, num_fatura: numFatura }, queue_status: queueJob?.status || null })
    }

    const linkFatura = linkNovo || existing?.link_fatura || null
    const tentativaAutomatica = transportadora === 'RODONAVES' && !!linkFatura
    const valorNovo = payload.valor === '' || payload.valor == null ? null : Number(payload.valor)
    const row:any = {
      transportadora, num_fatura: numFatura,
      status: tentativaAutomatica ? 'CAPTURANDO_PDF' : 'RECEBIDA_EMAIL', origem: 'GMAIL_E5B',
      email_id: payload.messageId || existing?.email_id || null,
      email_subject: payload.assunto || existing?.email_subject || null,
      remetente_original: payload.remetenteOriginal || existing?.remetente_original || null,
      empresa: payload.empresa || existing?.empresa || null,
      vencimento: payload.vencimento || existing?.vencimento || null,
      valor_total: Number.isFinite(valorNovo) ? valorNovo : (existing?.valor_total ?? null),
      link_fatura: linkFatura,
      arquivo_status: tentativaAutomatica ? 'CAPTURANDO' : (linkFatura ? 'AGUARDANDO_DOWNLOAD' : 'SEM_LINK'),
      erro_captura: null, atualizado_em: new Date().toISOString()
    }
    const { data: upserted, error: upsertError } = await supabase.from('frt_faturas')
      .upsert(row, { onConflict: 'transportadora,num_fatura' })
      .select('id,transportadora,num_fatura,status,arquivo_status').single()
    if (upsertError) throw upsertError
    if (!tentativaAutomatica) return Response.json({ ok: true, data: upserted, captured: false, queued: !!linkFatura })

    try {
      const pdf = await fetchRodonavesPdf(linkFatura!)
      const { data: buckets } = await supabase.storage.listBuckets()
      if (!buckets?.some((b:any) => b.name === BUCKET)) {
        const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 31457280, allowedMimeTypes: ['application/pdf'] })
        if (bucketError && !String(bucketError.message || '').toLowerCase().includes('already')) throw bucketError
      }
      const path = `rodonaves/${numFatura}/fatura.pdf`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, pdf.bytes, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError
      const now = new Date().toISOString()
      await supabase.from('frt_faturas').update({ arquivo_path: path, arquivo_status: 'CAPTURADO', status: 'PDF_CAPTURADO', erro_captura: null, capturado_em: now, link_fatura: pdf.finalUrl, atualizado_em: now }).eq('id', upserted.id)
      return Response.json({ ok: true, data: upserted, captured: true, path })
    } catch (captureError:any) {
      const msg = String(captureError?.message || captureError).slice(0, 1500)
      await supabase.from('frt_faturas').update({ arquivo_status: 'ERRO', status: 'RECEBIDA_EMAIL', erro_captura: msg, atualizado_em: new Date().toISOString() }).eq('id', upserted.id)
      return Response.json({ ok: false, data: upserted, captured: false, error: msg }, { status: 502 })
    }
  } catch (e:any) {
    console.error(e)
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
})