# STATUS — Frete (cotação + auditoria de CTe)

> Atualizado: 2026-09-24

## O que é
Subsistema de frete: **cotação** de 4 transportadoras em paralelo + **auditoria de CTe** (casar conhecimento de transporte com a NF/vendedor) + rastreio.

## Onde está
- **Front novo (git):** `C:\CLAUDE\Projetos GitHub\bononi-frete\bononi-frete` (remote `leobononi2906/bononi-frete`, branch `main`) — HTML/JS puro, `index.html` (~1417 linhas), já em produção no Vercel.
  ⚠️ A pasta externa `bononi-frete\` é wrapper (só README) — editar no clone aninhado.
- **Base de conhecimento (fora do git):** `C:\CLAUDE\frete-kb\` — README, `DIVERGENCIAS.md`, `AUDITORIA.md`, `MIGRACAO.md`, `TESTES-COTACAO.md`, `edge-functions/`, `tabelas/`, `referencias-api/`. É a documentação viva do subsistema.
- **Front antigo:** `bononifrete` (TS, privado) — ambos chamam a MESMA edge.
- **Supabase:** `vishxwdxqiygbxmtpfoy` (tabelas/views `frt_*`).

## Núcleo técnico
- **Cotação:** edge `cotar-frete-index` (**v111**, verify_jwt=false) cota Braspress, São Miguel, AGEX (SSW, só Umuarama), Rodonaves/RTE em paralelo → `frt_cotacoes`→`frt_cotacoes_pacotes`→`frt_cotacoes_respostas`. ("Jex" = AGEX, não é 5ª transportadora.)
- **Auditoria CTe:** `capturar-ctes` (email/XML) + `capturar-ctes-api` (Braspress) → `frt_conhecimentos`. RPC de casamento `buscar_dados_nf_para_cte` (sem prefixo `frt_` — nome corrigido em 22/09) **company-safe**, única versão desde 22/09 (a sobrecarga de 2 argumentos, ambígua, foi removida). Rastreio: `rastrear-ctes` + `rastrear-saomiguel` → `frt_rastreio`.

## Estado atual
- **Cotação corrigida (v111, 06/08):** Braspress e Rodonaves agora mandam **peso REAL** (helper `pesoRealTotal`) e deixam a transportadora cubar — antes mandavam pré-cubado a 300 e **inflavam 24–47%**, chegando a mudar a decisão (escolhia AGEX quando Braspress real era mais barata). Rodonaves propaga erro em vez de R$0 mudo. Validado ao vivo.
- **Auditoria company-safe:** 651 CTes, 425 com vendedor (todos empresa-safe), 226 sem vínculo (transferência/remessa/frete-entrada, não estão na `vw_comercial_docs_faturados`). `capturar-ctes-api` v17 enriquece por empresa.

## Pendências / próximos passos
- [ ] **Expresso São Miguel sem captura automática de CTe.** O e-mail de despacho direto
      sumiu da caixa (mesma classe de problema que tinha Rodonaves e AGEX), e a única
      alternativa achada (link "Download documentos" da fatura) exige resolver captcha —
      não automatizável. Falta achar outro tipo de e-mail dela que ainda chegue sem
      captcha, ou confirmar com a transportadora se o cadastro de e-mail de despacho
      mudou (a fatura chega normal — só o CTe que sumiu). Ver dev-log 22/09.
- [ ] Verificar se `capturar-ctes` precisa de paginação/lote — o teste manual de hoje deu
      `IDLE_TIMEOUT` (150s) tanto pra Rodonaves quanto pra AGEX, mas cada gravação commita
      sozinha (confirmado pelo banco) e 2 execuções seguidas já limparam boa parte do
      atraso acumulado. Não confirmado se o cron (6/6h) sozinho dá conta do que falta.
- [ ] Incluir CNPJ `57.129.987/0001-66` (TRUCKPREST) nos remetentes que `capturar-ctes-api`
      (Braspress) cobre — hoje só cobre 4 CNPJs fixos e esse não está entre eles.
- [ ] AGEX tem CTe ausente **dentro** de lotes que funcionaram (ex.: 534498/534500 faltando ao
      lado de 534497/534499, capturados no mesmo minuto) — precisa do log da function pra achar a
      causa desses e-mails específicos.
- [ ] **Edge ler as tabelas de config** (`frt_locais_expedicao`, `frt_transportadoras`, `frt_catalogo_produtos` já populadas em 05/08) em vez do cálculo hardcoded (LOCAIS, fator 300, OriginCityId RTE) — **maior alavanca**.
- [ ] **Trocar `DOC_PJ_PADRAO`** do front (08827440000106 tem DV inválido → quebra São Miguel).
- [ ] **Achatar a resposta da edge + remover o `salvarCotacao()`** morto do front (Rota A do `MIGRACAO.md`): front lê `valor_total/pedagio/gris` no topo mas a edge só devolve em `detalhes{}` aninhado.
- [ ] Implementar auth do módulo `frete` no front (README promete, não implementa).
- [ ] Ampliar replicação Firebird p/ os 226 CTes sem vínculo (ou Leo apontar a tabela).

## Dívidas e armadilhas conhecidas
- **`valor_frete_nf` é a régua de "quanto cobramos do cliente"; `valor_cotado` não é usado.**
  `valor_frete_nf` vem de `vw_comercial_docs_faturados` via `buscar_dados_nf_para_cte` — é o
  frete que sai na NOSSA NF-e de venda (confirmado por dado em 22/09). `valor_cotado` (da tela
  Cotar Frete) nunca foi gravado em nenhum CTe — 0 de 922, desde maio — e não tem coluna de
  vínculo com o CTe; **não backfillar por heurística** (CNPJ+data só acerta ~12,7% dos casos, e
  errado é pior que vazio). `divergencia` (coluna gerada) = `valor_total_cte - valor_frete_nf`,
  não usa `valor_frete_cte` isolado.
- **Sem `chave_nfe` de 44 dígitos, a RPC não enriquece** — devolve 0 linhas quando a chave é
  nula. 122 dos 927 itens de NF vinculados a CTe estão nessa situação (medido 22/09) e ficam sem
  vendedor/faturamento até terem uma chave.
- **`valor_frete_nf` só está preenchido em 44% dos CTe (407/922)** — hipótese ainda não
  confirmada: o resto são notas de transferência/remessa entre empresas do grupo, sem cliente
  final por trás (mesma família dos "226 sem vínculo" já registrados abaixo), não erro de
  captura.
- **`num_nf` NÃO é único no grupo** — casar CTe só por número casa cross-company (vendedor errado). Casar por (empresa+num) ou chave completa. Mapa CNPJ→empresa está no `AUDITORIA.md`.
- **O e-mail "de despacho direto" de uma transportadora pode simplesmente parar de chegar**,
  sem trocar de formato — não é sempre "reconhecer um padrão novo" no mesmo e-mail. Rodonaves
  e AGEX tinham alternativa (link de portal num OUTRO tipo de e-mail, achado comparando
  `frt_conhecimentos.email_origem` histórico com busca `in:anywhere` ao vivo no Gmail); São
  Miguel não tem nenhuma sem captcha. Confirmar primeiro que o e-mail original realmente
  sumiu (busca `in:anywhere from:<endereço-antigo>` vazia) antes de tentar consertar o parser.
- Descompassos front×edge v109: front manda `tipo_destinatario` (edge ignora), trata NDJSON streaming (edge devolve JSON único).
- PDF São Miguel WS JAVA (cotação) está preso no projeto claude.ai "Dash Fretes", fora do alcance da sessão CLI.

## Dev-log
- 2026-09-24 — **Auditoria/Conferência não mente mais sucesso.** `updCTE`, `confToggle` e
  `confMarcarGrupo` usavam `return=minimal` e só olhavam `r.ok` — PATCH que não casa linha
  (RLS, id sumido) responde 200 igual, e a tela marcava "lançado" sem nada no banco. Agora usam
  `return=representation` e exigem linha devolvida; no lote, só marca na tela o CTe confirmado
  e avisa quantos falharam (antes o lote nem conferia `r.ok`). Achado do pente fino de 24/09.
- 2026-09-22 — **Investigação da auditoria de frete (a pedido: cruzar quanto cobramos do
  cliente vs. quanto a transportadora cobra, a partir de 4 documentos reais recebidos por
  e-mail — AGEX, Rodonaves, Braspress, Expresso São Miguel).** A feature já existia (telas
  "Auditoria CTe" e "Conferência de Frete", tabela `frt_conhecimentos`); o achado real foi
  operacional, confirmado por SQL somente-leitura em produção:
  - **A captura por e-mail está parada desde ~12-13/09.** `capturar-ctes` roda a cada 6h, cron
    "succeeded", mas a resposta HTTP real é `total_encontrados: 0` — não acha e-mail nenhum, pra
    nenhuma transportadora. Só Braspress continua entrando, via `capturar-ctes-api` (API direta,
    não e-mail). `capturar-faturas-frete` acha e-mail (20 na última execução) mas grava 0 —
    "sem_dados: 20". Dos 9 CTe dos 4 documentos anexados, 5 não existem em `frt_conhecimentos` —
    exatamente os mais recentes. **Causa raiz não diagnosticada** — código das 3 Edge Functions
    não está em repo nenhum acessível desta máquina; precisa de Supabase Dashboard → Edge
    Functions → Logs (hipótese mais provável: OAuth do Gmail expirado). Ver pendências.
  - Braspress nunca captura CNPJ `57.129.987/0001-66` (TRUCKPREST) — API só cobre 4 CNPJs fixos.
  - AGEX tem buracos dentro de lote que funcionou (534498/534500 ausentes ao lado de
    534497/534499, capturados no mesmo minuto) — precisa de log pra diagnosticar.
  - **Aplicado — migration `supabase/migrations/20260922081236_frt_rpc_comments.sql`** (pré-voo +
    ensaio + revisão em `docs/sql/2026-09-22_*`): removida a sobrecarga
    `buscar_dados_nf_para_cte(text, text)`, ambígua com a de 3 argumentos — qualquer chamada de 2
    argumentos dava `ERROR 42725 function is not unique` (por acidente isso travava a versão
    insegura, que casava CTe↔NF só pelo número, sem separar empresa — mas era bug, não proteção).
    Documentadas com `COMMENT ON COLUMN` as 3 colunas mais confundidas — ver "Dívidas" abaixo.
    0 linhas de dado tocadas; pós-conferência confirmou `frt_conhecimentos` em 922 antes e depois.
  - Decisão de escopo: `valor_cotado` fica de fora da régua de auditoria por enquanto (nunca foi
    gravado e não tem vínculo com CTe — construir isso é projeto à parte, não entrou neste).
  - Próximo: destravar a captura (pendência urgente acima) e então ligar a view órfã
    `frt_auditoria_kpi` como cabeçalho de KPI da tela "Auditoria CTe".
- 2026-09-22 (2) — **Destravada a captura de CTe por e-mail da Rodonaves e da AGEX; São
  Miguel segue bloqueada.** Causa raiz da pendência urgente acima: não era OAuth expirado —
  cada transportadora parou de anexar o XML direto no e-mail (todas por volta de 12-13/09) e
  passou a linkar pra um portal próprio, um padrão diferente por transportadora.
  - **Activepieces "FRETES - Reconciliação horária v2" também corrigido.** A última linha
    (`if(errors.length) throw new Error(...)`) derrubava a execução inteira quando 1 de 44
    e-mails dava erro — o Activepieces marca a execução inteira como falha e não grava nada,
    nem os 43 bons. Trocado por `return {ok: errors.length===0, ...summary}`. Testado ao
    vivo: `{"ok":true,"scanned":44,"processed":44,"errors":0}`.
  - **Rodonaves:** e-mail de despacho continua chegando, mas linka pro gateway
    `email-apigateway.rte.com.br` (`Type=3` = zip de XMLs assinado no S3) em vez de anexar.
    `capturar-ctes` ganhou `extrairLinkRodonavesXml` + `baixarXmlsDoZip` (JSZip). De quebra,
    achado um bug real de sintaxe do Gmail: `(has:attachment filename:xml OR from:X)` com
    parênteses+OR devolve **0 resultados** nessa caixa mesmo com cada termo funcionando
    isolado — confirmado testando ao vivo no Gmail — trocado por duas buscas simples
    deduplicadas em código. **141 CTe novos capturados** (528→669, somando os dois nomes que
    a Rodonaves usa em `nome_transportadora`).
  - **AGEX:** o e-mail de despacho original (`no-reply@ssw.log.br`, só achado no histórico
    de `email_origem`) sumiu da caixa por completo — zero resultado mesmo com
    `in:anywhere` (inbox+spam+lixeira). Alternativa: o "Lembrete de Vencimento da Fatura"
    (`no-reply@sswsistemas.com.br`, mesmo grupo SSW, esse continua chegando normal) traz 3
    links pro portal `ssw.inf.br/cgi-local/ssw1188` (DACTE pdf / CSV / XML) sem exigir
    login — só dá pra saber qual dos 3 é o XML pelo texto que vem escrito antes de cada um
    (os ids não têm prefixo de tipo visível). `extrairLinkAgexXml` ancora no texto "XML dos
    CT-e" e pega o link mais próximo depois. **53 CTe novos capturados**, zero antes.
    Latência maior que o ideal — o lembrete sai perto do vencimento da fatura, não na
    emissão do CTe (~11 dias de atraso no exemplo testado), mas cobre 100% das faturas
    eventualmente.
  - **São Miguel: segue sem captura automática.** Mesmo padrão de e-mail de despacho
    sumido (`edocesmcte@nfendd.com.br`, zero resultado mesmo com `in:anywhere`). A única
    alternativa achada (fatura → "Download documentos") cai num portal
    (`faturas.expressosaomiguel.com.br/serverdoc-2.0`) que exige resolver um **captcha**
    (soma matemática) antes de liberar o arquivo — bloqueio de bot deliberado, fora de
    cogitação automatizar isso. Falta achar outro tipo de e-mail dela sem captcha, ou
    confirmar com a transportadora se o cadastro de e-mail de despacho mudou.
  - Deploy por CLI: `npx supabase functions deploy capturar-ctes --project-ref
    vishxwdxqiygbxmtpfoy --no-verify-jwt`. Código local de `capturar-ctes` agora existe
    pela primeira vez em `supabase/functions/capturar-ctes/index.ts` — antes só existia no
    painel do Supabase, sem histórico em repo nenhum.
- 2026-09-17 — **A marca passou a aparecer na aba do navegador.** Não tinha favicon nenhum.
  Adicionado `assets/favicon-32.png` e `assets/favicon-64.png`, gerados do símbolo isolado
  (`mark-bononi.png`), na aba junto com o logo que já existia na sidebar. Conferido: as duas tags
  resolvem com 200.
- 2026-09-16 — **O `limit=9999` que o `db()` grudava em toda consulta cortava o comparativo de cotações.** Não era limite de segurança, era teto: `frt_cotacoes_respostas` tem **12.928 linhas** (medido em produção) e a tela de cotações recebia **9.999** — faltava resposta de transportadora no comparativo, sempre para menos, com **HTTP 200** e nada na tela dizendo isso. Como o `limit` morava no helper, o teto valia para as 13 consultas do app de uma vez; e como valia para todas, arrumar o helper arrumou todas.
  - **O `db()` agora pagina.** Página de **5.000** (medido contra os 21.727 leads do e-commerce: 1.000 → 14.450 ms, 5.000 → 5.462 ms; paginar re-executa a consulta a cada página, então página pequena é cara), paginação por cabeçalho `Range` — não por query string —, e **avanço pelo que a resposta trouxe**, não por `página × tamanho`, então continua correta se o servidor tiver teto por requisição menor que a página.
  - **A parte que não era óbvia: a ordem.** Sem ordenação garantida o Postgres pode repetir uma linha numa página e pular outra na seguinte — erro pior que o truncamento, porque a contagem fecha e nada denuncia. Vários chamadores daqui ordenavam por campo que repete (`order=nome`, `order=descricao`), e um (`frt_locais_expedicao`) não ordenava nada. O `db()` passou a **acrescentar `id` como último critério de desempate** na `order=` que já existir, ou a criar `order=id` quando não houver. Assim nenhum dos 13 chamadores precisou mudar.
  - **Escapes previstos:** escrita (POST/PATCH/DELETE) passa direto, sem paginar; consulta que já traga `limit=` explícito é respeitada como intenção do chamador; e `opts.chave` cobre view **sem `id`** — existem 7 em `frt_*` (`frt_nf_sem_cte`, `frt_painel_impressao`, `frt_produtos_nf`, `frt_alertas_hoje`, `frt_auditoria_kpi`, `frt_cotacoes_seq`, `frt_email_reconcile`), onde ordenar por `id` daria **400**. Nenhuma delas é chamada pelo `db()` hoje, mas o helper não podia assumir isso. `opts.chave = null` desliga a paginação.
  - **Provado pelo número:** `frt_cotacoes_respostas` conferida contra `count(*)` de produção — **12.928 = 12.928**, em 3 requisições, 1,53 s (antes: 9.999).
- 2026-09-15 — **Design system Bononi aplicado, e com ele uma passada de acessibilidade e mobile** (`3860964`). Cinco blocos, **sem tocar em query, RPC, regra de casamento CTe/NF ou fluxo de cotação** — só camada visual, marcação, e um punhado de bug de CSS que não dava erro nenhum.
  - **Acessibilidade que estava quebrando uso real:** `maximum-scale=1.0` bloqueava pinch-zoom (WCAG 1.4.4), e `.log-detail` era `#a5b4fc` sobre fundo claro — **1,79:1**, ou seja, o JSON de todo log era ilegível. Sobra de tema escuro, junto com a borda quase preta de `.cte-row`.
  - **Barra fixa e topbar:** `#sticky-cotar` ia de `min-width:768px` — em exatamente 768px a barra ficava deslocada 220px sem sidebar nenhuma; virou 769px. A topbar caiu de 112px para 56px em 375px (o filtro de mês era `flex-shrink:0` com 230px e sobravam 61px para o título, que quebrava em 5 linhas). O espaçador mágico `<div style="height:90px">` virou padding de verdade.
  - **Campos e teclado:** 223 campos abaixo de 16px voltaram a 16px (senão o Safari iOS dá zoom ao focar). Alvos de toque a 44px — o hambúrguer era 32×42, `.btn-sm`/`.tab` 33px, `.btn-sel` 21px. A navegação virou `<button>` com `aria-current`; era `<div onclick>`, **fora do alcance do teclado**.
  - **O DS em si:** `ds/bononi-ds.css` gerado do pacote da skill `bononi-design`, com ponte de variáveis no `:root` para os 153 `style=` inline herdarem a paleta. **Ação primária virou tinta `#14161a`**, não o azul-marinho de antes. 77 emoji viraram Lucide por CSS mask, 52 hex/rgba crus viraram token, 18 tamanhos de fonte entraram na escala, 11 raios viraram 3.
  - ⚠️ **O par colorido de badge do DS não fecha 4,5:1 em 4 dos 6 variantes** — o âmbar dá 3,3:1, não os ~4,6:1 que o `03-visual.md` do pacote afirma. Aqui os badges ficaram com texto em tinta e ponto de status, e passam de 12:1. Vale para os outros apps: **conferir o contraste em vez de confiar na tabela do pacote.**
  - ⚠️ **`vercel.json` precisou de `handle: filesystem` antes do catch-all** — sem isso `ds/` e `assets/` voltariam com o HTML do app, ou seja, CSS que não aplica e **nenhum erro em lugar nenhum**.
  - **Cartões no celular** para Auditoria, Conferência e Dimensões, seguindo o que o Histórico já fazia: a tabela da Auditoria tinha 1243px numa janela de 309px — 11 colunas, 2 visíveis, e Status/Observação a quatro telas de rolagem. Ids próprios (`stm-`, `obsm-`, `ctem-`, `confm-`) porque as duas versões coexistem no DOM e id repetido faria o botão salvar ler o campo escondido do desktop.
  - **Três bugs pré-existentes achados no caminho:** `var(--red)` na mensagem "CEP não encontrado" (`--red` nunca existiu no arquivo), `.mono` usada 12× na Conferência e **nunca definida** — número de CTe, NF e valor saíam em fonte proporcional — e `.btn-purple`, que era CSS morto.
  - Conferido: `auditar-tokens.py` passa nas cinco checagens de falha silenciosa, `node --check` OK, oxlint sem erro novo, 375px sem rolagem horizontal.
- 2026-08-26 — **Aba Conferência: os CTes do mês agrupados para lançar no contas a pagar** (`6c3bae8`, `96f9ef4`, `e820665`, `4509da3`, `e7a10df`). Agrupa por transportadora com total a lançar, mostra NF, cliente, vendedor e valor de cada CTe, e permite marcar como lançado (`frt_conhecimentos.frete_lancado`) — acelera o lançamento manual no ERP e **evita lançar duas vezes**, que era o risco real.
  - Painel de faturas com vencimento e coluna **Venc.** nos CTes; vincular a fatura São Miguel aos CTes faz o **vencimento colar no CTe**.
  - O painel mostra **só fatura com dado** (vencimento captado) — fatura sem vencimento na lista sugeria informação que não existia.
  - Modal de vínculo ganhou link "abrir fatura no portal", para conferir contra a fonte sem sair da tela.
- 2026-08-14 — **Cotação: protocolo de cada transportadora, cidade pelo CEP, e o fim da cotação duplicada** (`07cf210`, `c242466`, `901881e`). O protocolo (id externo) de cada transportadora passou a aparecer, o que torna possível cobrar a transportadora citando o número dela. Junto: cidade preenchida ao digitar o CEP, código/ID na cotação e no histórico, e a correção da cotação que duplicava.
- 2026-08-06 — Edge v111 (peso real BP/RTE); RPC de casamento company-safe + backfill (425 com vendedor).
- 2026-08-05 — Testes ao vivo confirmaram o pré-cubado inflando (debug BP/RTE); config populada mas ainda não lida pela edge; multi-volume OK nas 4.
