# STATUS — Frete (cotação + auditoria de CTe)

> Atualizado: 2026-08-11

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
- 2026-08-06 — Edge v111 (peso real BP/RTE); RPC de casamento company-safe + backfill (425 com vendedor).
- 2026-08-05 — Testes ao vivo confirmaram o pré-cubado inflando (debug BP/RTE); config populada mas ainda não lida pela edge; multi-volume OK nas 4.
