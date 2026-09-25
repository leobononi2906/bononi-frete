-- Só leitura. CTes sem vendedor cuja NF-e (chave de 44 dígitos) é VENDA que já está na
-- vw_comercial_docs_faturados — e o que a buscar_dados_nf_para_cte devolve para cada um.
-- As 9 chaves vieram do levantamento de 25/09/2026 (TBL_NF_2.TIPO_SAIDA='V' entre as 299 chaves sem vínculo).
with alvo as (
  select c.id, c.num_cte, c.data_emissao, c.nome_destinatario, c.nome_transportadora,
         n->>'chave_nfe' as chave, n->>'numero' as num_nf_json
  from frt_conhecimentos c, jsonb_array_elements(c.notas_fiscais) n
  where c.nome_vendedor is null
    and n->>'chave_nfe' in (
      '35260805864790000339550010000011531000239743',
      '42260815090647000200550010000084961000235904',
      '42260815090647000200550010000084971000235995',
      '42260815090647000200550010000085011000236953',
      '42260815090647000200550010000085071000237600',
      '42260815090647000200550010000085131000238116',
      '42260815090647000200550010000085221000238662',
      '42260815090647000200550010000085241000238810',
      '42260815090647000200550010000085331000239751')
)
select a.id, a.num_cte, a.data_emissao, left(a.nome_destinatario, 30) destinatario,
       substring(a.chave from 26 for 9)::int as num_nf, r.id_vendedor, r.nome_vendedor,
       r.departamento, r.valor_frete
from alvo a
left join lateral buscar_dados_nf_para_cte(substring(a.chave from 26 for 9)::int::text, '', a.chave) r on true
order by a.id;
