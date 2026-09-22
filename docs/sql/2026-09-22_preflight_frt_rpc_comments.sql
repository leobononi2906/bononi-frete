-- Pre-voo (somente SELECT) para 20260922081236_frt_rpc_comments.sql
-- Roda contra producao: python sql.py prod docs/sql/2026-09-22_preflight_frt_rpc_comments.sql
--
-- Bloco A: confirma que as DUAS sobrecargas de buscar_dados_nf_para_cte existem hoje (a de 2
--   argumentos, que a migration remove, e a de 3, que fica intacta).
-- Bloco B: procura qualquer function ou view do banco que referencie o nome da function --
--   se aparecer alguma linha aqui, PARE antes de aplicar e investigue a dependencia.
--   (Nao cobre Edge Function: o codigo delas nao mora no banco nem neste repo.)
-- Bloco C: estado atual do comentario nas 3 colunas (esperado: sem comentario nas 3).
-- Bloco G: impressao digital do banco (projeto + contagem de frt_conhecimentos), para conferir
--   que a leitura foi mesmo contra producao.

with alvo as (
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'buscar_dados_nf_para_cte'
),
deps as (
  select p.proname as quem, pg_get_function_identity_arguments(p.oid) as args_quem
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname <> 'buscar_dados_nf_para_cte'
    and p.prosrc ilike '%buscar_dados_nf_para_cte%'
),
views_dep as (
  select viewname from pg_views
  where schemaname = 'public' and definition ilike '%buscar_dados_nf_para_cte%'
),
colunas as (
  select a.attname as coluna,
         col_description('public.frt_conhecimentos'::regclass, a.attnum) as comentario_atual
  from pg_attribute a
  where a.attrelid = 'public.frt_conhecimentos'::regclass
    and a.attname in ('valor_frete_cte', 'valor_frete_nf', 'valor_cotado')
    and a.attnum > 0 and not a.attisdropped
)
select 'A-func-existe' as bloco, proname || '(' || args || ')' as chave, null as detalhe from alvo
union all
select 'B-dep-func-interna', quem, args_quem from deps
union all
select 'B-dep-view', viewname, null from views_dep
union all
select 'C-coluna-comentario', coluna, coalesce(comentario_atual, '(sem comentario)') from colunas
union all
select 'G-fingerprint', current_database(), (select count(*)::text from frt_conhecimentos)
order by 1;
