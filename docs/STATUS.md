# STATUS — Frete (cotação + auditoria de CTe)

> Atualizado: 2026-09-15

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
- **Auditoria CTe:** `capturar-ctes` (email/XML) + `capturar-ctes-api` (Braspress) → `frt_conhecimentos`. RPC de casamento `frt_buscar_dados_nf_para_cte` **company-safe**. Rastreio: `rastrear-ctes` + `rastrear-saomiguel` → `frt_rastreio`.

## Estado atual
- **Cotação corrigida (v111, 06/08):** Braspress e Rodonaves agora mandam **peso REAL** (helper `pesoRealTotal`) e deixam a transportadora cubar — antes mandavam pré-cubado a 300 e **inflavam 24–47%**, chegando a mudar a decisão (escolhia AGEX quando Braspress real era mais barata). Rodonaves propaga erro em vez de R$0 mudo. Validado ao vivo.
- **Auditoria company-safe:** 651 CTes, 425 com vendedor (todos empresa-safe), 226 sem vínculo (transferência/remessa/frete-entrada, não estão na `vw_comercial_docs_faturados`). `capturar-ctes-api` v17 enriquece por empresa.

## Pendências / próximos passos
- [ ] **Edge ler as tabelas de config** (`frt_locais_expedicao`, `frt_transportadoras`, `frt_catalogo_produtos` já populadas em 05/08) em vez do cálculo hardcoded (LOCAIS, fator 300, OriginCityId RTE) — **maior alavanca**.
- [ ] **Trocar `DOC_PJ_PADRAO`** do front (08827440000106 tem DV inválido → quebra São Miguel).
- [ ] **Achatar a resposta da edge + remover o `salvarCotacao()`** morto do front (Rota A do `MIGRACAO.md`): front lê `valor_total/pedagio/gris` no topo mas a edge só devolve em `detalhes{}` aninhado.
- [ ] Implementar auth do módulo `frete` no front (README promete, não implementa).
- [ ] Ampliar replicação Firebird p/ os 226 CTes sem vínculo (ou Leo apontar a tabela).

## Dívidas e armadilhas conhecidas
- **`num_nf` NÃO é único no grupo** — casar CTe só por número casa cross-company (vendedor errado). Casar por (empresa+num) ou chave completa. Mapa CNPJ→empresa está no `AUDITORIA.md`.
- Descompassos front×edge v109: front manda `tipo_destinatario` (edge ignora), trata NDJSON streaming (edge devolve JSON único).
- PDF São Miguel WS JAVA (cotação) está preso no projeto claude.ai "Dash Fretes", fora do alcance da sessão CLI.

## Dev-log
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
