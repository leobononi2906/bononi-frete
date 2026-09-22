-- aplicada em produção em 2026-09-22
-- Fase 1 do plano de auditoria de frete (2026-09-22).
-- Faz: remove a sobrecarga ambigua de buscar_dados_nf_para_cte(text,text) que colide com a
--      versao company-safe de 3 argumentos (erro 42725 em qualquer chamada de 2 argumentos,
--      PGRST203 via PostgREST); documenta com COMMENT ON COLUMN o significado real de
--      valor_frete_cte, valor_frete_nf e valor_cotado em frt_conhecimentos.
-- Nao faz: nao apaga nenhuma linha de frt_conhecimentos nem de nenhuma outra tabela; nao altera
--      a versao de 3 argumentos (a que roda de verdade hoje, company-safe).
-- Por que: a versao de 2 argumentos nunca executa com sucesso hoje -- a ambiguidade barra toda
--      chamada antes da logica dela rodar. E quando rodava (antes de existir a de 3 argumentos),
--      essa logica casava CT-e a NF-e so pelo numero, sem empresa -- o risco ja documentado de
--      cruzar empresa errada, ja que numero de NF-e se repete entre as empresas do grupo.
--      Recriar essa funcao exatamente como estava reintroduziria a mesma ambiguidade. Se um dia
--      for preciso um atalho de 2 argumentos, crie com outro nome (ex.:
--      buscar_dados_nf_para_cte_legado), nunca sobrecarregando o nome atual.

drop function if exists public.buscar_dados_nf_para_cte(p_num_nf text, p_slug_transp text);

comment on column public.frt_conhecimentos.valor_frete_cte is
  'Frete cobrado pela transportadora no CT-e (componente isolado). A auditoria usa valor_total_cte, nao este campo sozinho.';

comment on column public.frt_conhecimentos.valor_frete_nf is
  'Frete destacado na NOSSA NF-e de venda, vindo de vw_comercial_docs_faturados via buscar_dados_nf_para_cte (versao de 3 argumentos). E a regua de "quanto cobramos do cliente" usada pela auditoria (divergencia = valor_total_cte - valor_frete_nf). NAO e o valor da cotacao.';

comment on column public.frt_conhecimentos.valor_cotado is
  'Valor calculado na tela Cotar Frete. Sem vinculo estrutural com o CT-e hoje e nunca foi gravado (0 de 922 em 22/09/2026) -- nao usar na auditoria ate esse vinculo existir.';
