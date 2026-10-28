import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://monitor-de-fretes-bononi.bononi-1615.chatgpt.site'
function cors(origin:string|null){const allow=origin===ALLOWED_ORIGIN?ALLOWED_ORIGIN:ALLOWED_ORIGIN;return{'Access-Control-Allow-Origin':allow,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'content-type','Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','Vary':'Origin'}}
function cleanError(value:unknown){const s=String(value??'').trim();if(!s)return null;return s.replace(/https?:\/\/\S+/gi,'[link oculto]').replace(/[A-Za-z0-9_-]{40,}/g,'[token oculto]').slice(0,300)}
function isOnOrAfter(value:string|null|undefined,start:Date){if(!value)return false;const d=new Date(value);return !Number.isNaN(d.getTime())&&d>=start}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin')
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)})
  if(req.method!=='GET')return Response.json({ok:false,error:'METHOD_NOT_ALLOWED'},{status:405,headers:cors(origin)})
  const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
  const url=new URL(req.url),range=(url.searchParams.get('range')||'today').toLowerCase(),limit=Math.min(Math.max(Number(url.searchParams.get('limit')||200),1),500)
  const now=new Date(),spNow=new Date(now.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'})),todayStartSp=new Date(spNow)
  todayStartSp.setHours(0,0,0,0)
  const offsetMs=spNow.getTime()-now.getTime(),todayStartUtc=new Date(todayStartSp.getTime()-offsetMs),sevenStartUtc=new Date(todayStartUtc.getTime()-6*24*60*60*1000)

  const [agentR,queueR,capturesR]=await Promise.all([
    supabase.from('frt_print_agents').select('nome,impressora,ativo,last_seen').eq('ativo',true).order('last_seen',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('frt_fila_impressao').select('id,tipo_documento,transportadora,num_fatura,assunto,empresa,status,tentativas,erro,criado_em,processando_em,impresso_em,atualizado_em').order('criado_em',{ascending:false}).limit(500),
    supabase.from('frt_faturas').select('id,transportadora,num_fatura,email_subject,empresa,status,arquivo_status,erro_captura,criado_em,atualizado_em').neq('arquivo_status','CAPTURADO').gte('criado_em',sevenStartUtc.toISOString()).order('atualizado_em',{ascending:false}).limit(500)
  ])
  if(agentR.error||queueR.error||capturesR.error){console.error('dashboard api error',{agentErr:agentR.error,queueErr:queueR.error,captureErr:capturesR.error});return Response.json({ok:false,error:'DATA_READ_FAILED'},{status:500,headers:cors(origin)})}
  const agent=agentR.data,queue=queueR.data||[],captures=capturesR.data||[],lastSeen=agent?.last_seen?new Date(agent.last_seen):null,agentOnline=!!(agent?.ativo&&lastSeen&&now.getTime()-lastSeen.getTime()<=2*60*1000)

  const queueRows=queue.map((r:any)=>{const created=new Date(r.criado_em),processing=r.processando_em?new Date(r.processando_em):null,stalledPending=r.status==='PENDENTE'&&now.getTime()-created.getTime()>5*60*1000,stalledProcessing=r.status==='PROCESSANDO'&&processing&&now.getTime()-processing.getTime()>5*60*1000;const alert=r.status==='ERRO'?'ERRO':stalledProcessing?'TRAVADO':stalledPending?'ATRASADO':r.status==='CANCELADO'?'CANCELADO':r.status==='IMPRESSO'?'OK':'EM_ANDAMENTO';return{id:r.id,tipo:r.tipo_documento,transportadora:r.transportadora,documento:r.num_fatura,assunto:r.assunto,empresa:r.empresa,status:r.status,alerta:alert,recebido_em:r.criado_em,processando_em:r.processando_em,impresso_em:r.impresso_em,atualizado_em:r.atualizado_em,tentativas:r.tentativas??0,erro:cleanError(r.erro)}})
  const queueKeys=new Set(queue.map((r:any)=>`${String(r.transportadora||'').toUpperCase()}|${String(r.num_fatura||'')}`))
  const captureRows=captures.filter((f:any)=>!queueKeys.has(`${String(f.transportadora||'').toUpperCase()}|${String(f.num_fatura||'')}`)).map((f:any)=>{const isError=f.arquivo_status==='ERRO',isProcessing=f.arquivo_status==='CAPTURANDO'||f.status==='CAPTURANDO_PDF',status=isError?'ERRO':isProcessing?'PROCESSANDO':'PENDENTE',updated=new Date(f.atualizado_em||f.criado_em),stalled=!isError&&now.getTime()-updated.getTime()>5*60*1000;return{id:`capture-${f.id}`,tipo:'FATURA',transportadora:f.transportadora,documento:f.num_fatura,assunto:f.email_subject,empresa:f.empresa,status,alerta:isError?'ERRO':stalled?(isProcessing?'TRAVADO':'ATRASADO'):'EM_ANDAMENTO',recebido_em:f.criado_em,processando_em:isProcessing?f.atualizado_em:null,impresso_em:null,atualizado_em:f.atualizado_em,tentativas:0,erro:cleanError(f.erro_captura||(isError?'Falha ao capturar PDF antes da fila de impressão':null))}})
  const allRows=[...queueRows,...captureRows].sort((a:any,b:any)=>new Date(b.recebido_em).getTime()-new Date(a.recebido_em).getTime())
  let rows:any[]
  if(range==='all')rows=allRows;else if(range==='7d')rows=allRows.filter((r:any)=>isOnOrAfter(r.recebido_em,sevenStartUtc));else rows=allRows.filter((r:any)=>isOnOrAfter(r.recebido_em,todayStartUtc)||isOnOrAfter(r.processando_em,todayStartUtc)||isOnOrAfter(r.impresso_em,todayStartUtc))
  rows=rows.slice(0,limit)
  const summary={recebidos_hoje:allRows.filter((r:any)=>isOnOrAfter(r.recebido_em,todayStartUtc)).length,impressos_hoje:allRows.filter((r:any)=>isOnOrAfter(r.impresso_em,todayStartUtc)).length,pendentes_agora:allRows.filter((r:any)=>r.status==='PENDENTE').length,processando_agora:allRows.filter((r:any)=>r.status==='PROCESSANDO').length,erros_agora:allRows.filter((r:any)=>r.status==='ERRO').length,parados_5m:allRows.filter((r:any)=>r.alerta==='ATRASADO'||r.alerta==='TRAVADO').length}
  return Response.json({ok:true,source:'supabase-live',generated_at:now.toISOString(),range,agent:{status:agentOnline?'ONLINE':'OFFLINE',nome:agent?.nome??null,impressora:agent?.impressora??null,last_seen:agent?.last_seen??null},summary,rows},{headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}})
})