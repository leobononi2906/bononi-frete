import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET='faturas-frete'
function norm(s:string){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()}
function safeName(s:string){return String(s||'item').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'item'}
function carrier(all:string){
  const u=norm(all)
  if(u.includes('RODONAVES')||u.includes('RTE.COM.BR'))return 'RODONAVES'
  if(u.includes('EXPRESSO SAO MIGUEL')||u.includes('EXPRESSOSAOMIGUEL'))return 'EXPRESSO SAO MIGUEL'
  if(u.includes('BRASPRESS'))return 'BRASPRESS'
  if(u.includes('TRANSPORTE GENEROSO')||u.includes('GENEROSO'))return 'TRANSPORTE GENEROSO'
  if(u.includes('AGEX TRANSPORTES'))return 'AGEX TRANSPORTES URGENTES LTDA'
  if(u.includes('SUDOESTE TRANSPORTES')||u.includes('SUDOESTE.LOG.BR'))return 'SUDOESTE TRANSPORTES'
  const m=String(all||'').match(/(?:De|From):\s*([^<\n]{2,80})<([^>\s]+@[^>\s]+)>/i)
  if(m?.[1])return m[1].trim().toUpperCase().replace(/\s+/g,' ').slice(0,100)
  const em=String(all||'').match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i)
  if(em){
    const d=em[1].toLowerCase()
    if(!d.endsWith('bononiacessorios.com.br')){
      if(d==='sudoeste.log.br'||d.endsWith('.sudoeste.log.br'))return 'SUDOESTE TRANSPORTES'
      const p=d.split('.').filter(Boolean)
      return (p.length>1?p[p.length-2]:d).replace(/[-_]+/g,' ').toUpperCase()
    }
  }
  return 'TRANSPORTADORA NAO IDENTIFICADA'
}
function invoice(all:string,messageId:string,fileName:string){
  let m=String(all||'').match(/Fatura\s*-\s*([0-9]+-[0-9]{2})/i)
  if(!m)m=String(all||'').match(/Fatura\s+Expresso\s+S[aã]o\s+Miguel\s*-\s*([0-9]+)/i)
  if(!m)m=String(all||'').match(/\bFatura\s*(?:N[º°o.]?\s*)?:?\s*([0-9]+(?:-[0-9]{2})?)\b/i)
  if(m)return m[1]
  const stem=String(fileName||'').replace(/\.pdf$/i,'').trim()
  if(/^\d{6,}$/.test(stem))return stem
  const fm=stem.match(/(?:boleto|fatura|titulo)[-_ ]*(\d{5,})/i)
  if(fm)return fm[1]
  const t=String(messageId||'').replace(/[^a-z0-9]/gi,'').slice(0,18).toUpperCase()
  return `EMAIL-${t||Date.now()}`
}
function parseDate(text:string){
  const m=String(text||'').match(/Vencimento\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/i)
  if(!m)return null
  const y=m[3].length===2?`20${m[3]}`:m[3]
  return `${y}-${m[2]}-${m[1]}`
}
function parseValue(text:string){
  let m=String(text||'').match(/Valor(?:\s+do)?\s+Documento\s*R?\$?\s*([\d.]+,\d{2})/i)
  if(!m)m=String(text||'').match(/Boleto(?:\s+Pix)?\s*R\$\s*([\d.]+,\d{2})/i)
  if(!m)m=String(text||'').match(/\bVALOR\s*R\$\s*([\d.]+,\d{2})/i)
  if(!m)return null
  const n=Number(m[1].replace(/\./g,'').replace(',','.'))
  return Number.isFinite(n)?n:null
}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return new Response('Method not allowed',{status:405})
    const p=await req.json()
    const rawPdfText=String(p.pdfText||'')
    const pdfText=['{}','[object Object]','null','undefined'].includes(rawPdfText.trim())?'':rawPdfText
    const subject=String(p.assunto||''),html=String(p.html||''),from=String(p.remetente||''),fileUrl=String(p.fileUrl||''),fileName=String(p.fileName||'')
    if(!/\bFATURAS?\b/.test(norm(subject)))return Response.json({ok:true,ignored:true,reason:'NAO_E_FATURA'})
    if(!/\.pdf$/i.test(fileName)&&String(p.mimeType||'').toLowerCase()!=='application/pdf')return Response.json({ok:true,ignored:true,reason:'NAO_E_PDF'})

    const fn=norm(fileName)
    const tx=norm(pdfText)
    const obviousCteName=/^CTRC/.test(fn)||/(^|[^A-Z0-9])(CTE|CT-E|DACTE|CTRC|CONHECIMENTO)([^A-Z0-9]|$)/.test(fn)
    const financialText=['BOLETO','FICHA DE COMPENSACAO','VALOR DO DOCUMENTO','NOSSO NUMERO','PAGAVEL EM QUALQUER BANCO','BENEFICIARIO','FATURA','DUPLICATA','COBRANCA'].some(x=>tx.includes(x))
    const cteText=['DACTE','CONHECIMENTO DE TRANSPORTE','CHAVE DE ACESSO','CT-E'].some(x=>tx.includes(x))
    if(obviousCteName||(cteText&&!financialText))return Response.json({ok:true,ignored:true,reason:'ANEXO_CTE_CONHECIMENTO',fileName})
    if(pdfText.trim()&&!financialText)return Response.json({ok:true,ignored:true,reason:'PDF_NAO_FINANCEIRO',fileName})
    if(!pdfText.trim()){
      const financialName=/(BOLETO|FATURA|DUPLICATA|TITULO|COBRANCA)/.test(fn)
      const numeric=/^\d{6,}\.PDF$/.test(fn)
      const mailFinancial=/\b(BOLETO|FATURA|COBRANCA|TITULO)\b/.test(norm(`${subject}\n${html}`))
      if(!financialName&&!(numeric&&mailFinancial))return Response.json({ok:true,ignored:true,reason:'PDF_AMBIGUO_SEM_TEXTO',fileName})
    }

    const tr=carrier(`${subject}\n${html}\n${from}`)
    if(['RODONAVES','BRASPRESS'].includes(tr))return Response.json({ok:true,ignored:true,reason:'TRANSPORTADORA_JA_MAPEADA',transportadora:tr})
    const url=new URL(fileUrl)
    if(url.protocol!=='https:'||url.hostname!=='cloud.activepieces.com')throw new Error('Origem do anexo nao permitida')
    const res=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(20000)})
    if(!res.ok)throw new Error(`Anexo HTTP ${res.status}`)
    const len=Number(res.headers.get('content-length')||0)
    if(len>30*1024*1024)throw new Error('Anexo acima de 30 MB')
    const bytes=new Uint8Array(await res.arrayBuffer())
    if(bytes.length>30*1024*1024)throw new Error('Anexo acima de 30 MB')
    if(!(bytes.length>=4&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46))throw new Error('Anexo nao e PDF valido')

    const num=invoice(`${subject}\n${html}`,String(p.messageId||''),fileName)
    const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:existing}=await sb.from('frt_faturas').select('id,status,arquivo_status,arquivo_path').eq('transportadora',tr).eq('num_fatura',num).maybeSingle()
    if(existing?.arquivo_status==='CAPTURADO')return Response.json({ok:true,duplicate:true,data:existing})
    const path=`${safeName(tr)}/${safeName(num)}/fatura.pdf`
    const {error:ue}=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'application/pdf',upsert:true})
    if(ue)throw ue
    const now=new Date().toISOString()
    const vencimento=parseDate(pdfText)
    const valor_total=parseValue(pdfText)
    const row={transportadora:tr,num_fatura:num,status:'PDF_CAPTURADO',origem:'GMAIL_E5B_ANEXO',email_id:p.messageId||null,email_subject:subject||null,remetente_original:from||null,link_fatura:null,arquivo_path:path,arquivo_status:'CAPTURADO',erro_captura:null,capturado_em:now,atualizado_em:now,...(vencimento?{vencimento}:{}),...(valor_total!==null?{valor_total}:{})}
    const {data,error}=await sb.from('frt_faturas').upsert(row,{onConflict:'transportadora,num_fatura'}).select('id,transportadora,num_fatura,status,arquivo_status,arquivo_path,vencimento,valor_total').single()
    if(error)throw error
    return Response.json({ok:true,captured:true,data,size:bytes.length})
  }catch(e:any){
    console.error(e)
    return Response.json({ok:false,error:String(e?.message||e)},{status:500})
  }
})