import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function sha256Hex(input:string){
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const agentName = req.headers.get('x-agent-name') || ''
    const agentSecret = req.headers.get('x-agent-secret') || ''
    const agentClient = req.headers.get('x-agent-client') || ''
    const batchClient = agentClient === 'bononi-batch-v2'

    if (!agentName || !agentSecret) {
      return Response.json({error:'agent auth required'},{status:401})
    }

    const secretHash = await sha256Hex(agentSecret)
    const { data: agent, error: agentErr } = await supabase
      .from('frt_print_agents')
      .select('id,nome,secret_hash,impressora,ativo')
      .eq('nome',agentName)
      .eq('ativo',true)
      .maybeSingle()

    if (agentErr || !agent || agent.secret_hash !== secretHash) {
      return Response.json({error:'agent unauthorized'},{status:401})
    }

    const now = new Date().toISOString()
    await supabase
      .from('frt_print_agents')
      .update({last_seen:now,atualizado_em:now})
      .eq('id',agent.id)

    const u = new URL(req.url)
    const action = u.searchParams.get('action') || 'claim'

    // Consulta autenticada: nao reserva jobs nem inicia impressao.
    if (req.method === 'GET' && action === 'status') {
      if (!batchClient) return Response.json({error:'batch client required'},{status:403})
      const counts: Record<string, number> = {}
      for (const status of ['PENDENTE','PROCESSANDO','ERRO']) {
        const { count, error } = await supabase.from('frt_fila_impressao')
          .select('id',{count:'exact',head:true}).eq('status',status)
        if (error) throw error
        counts[status] = count || 0
      }
      const cutoff = new Date(Date.now()-7*24*60*60*1000).toISOString()
      const { data: olderErrors, error } = await supabase.from('frt_fila_impressao')
        .select('id,transportadora,num_fatura,criado_em')
        .eq('status','ERRO').lt('atualizado_em',cutoff)
        .not('arquivo_path','is',null).order('criado_em',{ascending:true}).limit(100)
      if (error) throw error
      return Response.json({ok:true,mode:'MANUAL_BUTTON',pending:counts.PENDENTE,
        processing:counts.PROCESSANDO,errors:counts.ERRO,older_errors:olderErrors || []})
    }

    // Modo manual: o agente antigo continua podendo dar heartbeat,
    // mas nao pode mais puxar trabalhos sozinho.
    if (req.method === 'GET' && action === 'claim' && !batchClient) {
      const { count } = await supabase
        .from('frt_fila_impressao')
        .select('id', { count:'exact', head:true })
        .eq('status','PENDENTE')
      return Response.json({
        job:null,
        mode:'MANUAL_BUTTON',
        pending:count || 0
      })
    }

    // Botao "Imprimir faturas e pendencias":
    // reabre somente erros de impressao que ja possuem PDF e informa o total a imprimir.
    if (req.method === 'POST' && action === 'prepare_batch') {
      if (!batchClient) {
        return Response.json({error:'batch client required'},{status:403})
      }

      const body = await req.json()
      const includeOlderErrors = body?.include_older_errors === true
      const resetPatch = {
        status:'PENDENTE',
        erro:null,
        processando_em:null,
        impresso_em:null,
        atualizado_em:new Date().toISOString()
      }

      let retryQuery = supabase
        .from('frt_fila_impressao')
        .update(resetPatch)
        .eq('status','ERRO')
        .not('arquivo_path','is',null)
        .select('id')
      if (!includeOlderErrors) retryQuery = retryQuery.gte('atualizado_em', new Date(Date.now()-7*24*60*60*1000).toISOString())
      const { data: retried, error: retryErr } = await retryQuery

      if (retryErr) throw retryErr

      const staleCutoff = new Date(Date.now()-10*60*1000).toISOString()
      const { data: released, error: releaseErr } = await supabase
        .from('frt_fila_impressao')
        .update(resetPatch)
        .eq('status','PROCESSANDO')
        .lt('processando_em', staleCutoff)
        .not('arquivo_path','is',null)
        .select('id')

      if (releaseErr) throw releaseErr

      const { count, error: countErr } = await supabase
        .from('frt_fila_impressao')
        .select('id', { count:'exact', head:true })
        .eq('status','PENDENTE')

      if (countErr) throw countErr

      return Response.json({
        ok:true,
        mode:'MANUAL_BUTTON',
        retried_errors:retried?.length || 0,
        released_stale:released?.length || 0,
        pending:count || 0
      })
    }

    if (req.method === 'GET' && action === 'claim') {
      if (!batchClient) {
        return Response.json({error:'batch client required'},{status:403})
      }

      const { data: rows, error } = await supabase
        .from('frt_fila_impressao')
        .select('id,transportadora,num_fatura,empresa,arquivo_path,status,tentativas,prioridade,criado_em,tipo_documento,assunto')
        .eq('status','PENDENTE')
        .order('prioridade',{ascending:false})
        .order('criado_em',{ascending:true})
        .limit(1)

      if (error) throw error
      if (!rows?.length) return Response.json({job:null,done:true})

      const job = rows[0]
      const claimTime = new Date().toISOString()

      const { data: claimed, error: claimErr } = await supabase
        .from('frt_fila_impressao')
        .update({
          status:'PROCESSANDO',
          processando_em:claimTime,
          atualizado_em:claimTime,
          tentativas:(job.tentativas||0)+1,
          impressora:agent.impressora||null,
          erro:null
        })
        .eq('id',job.id)
        .eq('status','PENDENTE')
        .select('id,transportadora,num_fatura,empresa,arquivo_path,status,tentativas,tipo_documento,assunto')
        .maybeSingle()

      if (claimErr) throw claimErr
      if (!claimed) return Response.json({job:null})

      const { data: signed, error: signErr } = await supabase
        .storage
        .from('faturas-frete')
        .createSignedUrl(claimed.arquivo_path,300)

      if (signErr || !signed?.signedUrl) {
        await supabase
          .from('frt_fila_impressao')
          .update({
            status:'ERRO',
            erro:'Falha ao gerar URL temporaria',
            atualizado_em:new Date().toISOString()
          })
          .eq('id',claimed.id)
        throw signErr || new Error('Falha ao gerar URL temporaria')
      }

      return Response.json({
        job:{
          ...claimed,
          download_url:signed.signedUrl,
          impressora:agent.impressora||null
        }
      })
    }

    if (req.method === 'POST' && action === 'ack') {
      if (!batchClient) {
        return Response.json({error:'batch client required'},{status:403})
      }

      const body = await req.json()
      const id = Number(body?.id)
      if (!Number.isSafeInteger(id) || id <= 0) return Response.json({error:'id required'},{status:400})

      const status = String(body?.status || '').toUpperCase()
      if (!['IMPRESSO','ERRO'].includes(status)) {
        return Response.json({error:'invalid status'},{status:400})
      }
      const ackTime = new Date().toISOString()

      const patch:any = {
        status,
        impressora:body?.impressora||agent.impressora||null,
        erro:status==='ERRO' ? String(body?.erro||'Erro de impressao') : null,
        atualizado_em:ackTime
      }
      if (status==='IMPRESSO') patch.impresso_em = ackTime

      const { data, error } = await supabase
        .from('frt_fila_impressao')
        .update(patch)
        .eq('id',id)
        .eq('status','PROCESSANDO')
        .select('id,status,impressora,impresso_em,erro')
        .maybeSingle()

      if (error) throw error
      if (!data) {
        // Repetir a confirmacao depois de um timeout nao gera nova impressao.
        const { data: existing, error: readErr } = await supabase.from('frt_fila_impressao')
          .select('id,status,impressora,impresso_em,erro').eq('id',id).maybeSingle()
        if (readErr) throw readErr
        if (existing?.status === status) return Response.json({ok:true,data:existing,replayed:true})
        return Response.json({error:'job not processing',id,status:existing?.status || null},{status:409})
      }
      return Response.json({ok:true,data,confirmation:'print_command_accepted'})
    }

    return Response.json({error:'not found'},{status:404})
  } catch(e:any) {
    console.error(e)
    return Response.json({error:String(e?.message||e)},{status:500})
  }
})
