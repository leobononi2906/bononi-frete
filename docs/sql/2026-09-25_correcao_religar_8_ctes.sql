-- Correção pontual: religar 8 CTes que ficaram "sem vínculo" embora a NF-e de VENDA deles já
-- esteja na vw_comercial_docs_faturados (a NF chegou à réplica depois da captura do CTe, e a
-- captura não tenta de novo).
-- Ids afetados: 2259, 2260, 2268, 2275, 2278, 2281, 2283, 2284  (8 linhas)
-- Faz: preenche id_vendedor, nome_vendedor, departamento, valor_frete_nf com o que a própria
--      buscar_dados_nf_para_cte devolve, usando a 1ª NF do CTe, igual à capturar-ctes.
-- Não faz: não mexe em CTe que já tem vendedor (guarda nome_vendedor is null), não apaga nada,
--          não toca em outras colunas. divergencia é coluna gerada e se recalcula sozinha.
-- Volta: update frt_conhecimentos set id_vendedor=null, nome_vendedor=null, departamento=null,
--        valor_frete_nf=null where id in (2259,2260,2268,2275,2278,2281,2283,2284);
-- aplicada em produção em 2026-09-25 (8 linhas)
update frt_conhecimentos c
set id_vendedor    = r.id_vendedor,
    nome_vendedor  = r.nome_vendedor,
    departamento   = r.departamento,
    valor_frete_nf = r.valor_frete
from frt_conhecimentos c0
cross join lateral buscar_dados_nf_para_cte(
  substring(c0.notas_fiscais->0->>'chave_nfe' from 26 for 9)::int::text, '',
  c0.notas_fiscais->0->>'chave_nfe') r
where c.id = c0.id
  and c.id in (2259, 2260, 2268, 2275, 2278, 2281, 2283, 2284)
  and c.nome_vendedor is null
  and r.nome_vendedor is not null
returning c.id, c.num_cte, c.nome_vendedor, c.departamento, c.valor_frete_nf, c.divergencia;
