# Revisão — remover sobrecarga ambígua de `buscar_dados_nf_para_cte` + documentar 3 colunas

Fase 1 do plano de auditoria de frete (`c-users-ecommerce06-downloads-dacte2518-immutable-quail.md`).

## 1. Por que agora

A investigação da auditoria de frete (22/09/2026) achou um bug ativo: existem duas versões de
`buscar_dados_nf_para_cte` no banco — uma com 2 argumentos (`p_num_nf, p_slug_transp`) e outra
com 3 (`p_num_nf, p_slug_transp, p_chave_nfe`, a "company-safe", que resolve a empresa pelo CNPJ
na própria chave da NF-e). Qualquer chamada com 2 argumentos hoje dá `ERROR 42725: function
buscar_dados_nf_para_cte(text, text) is not unique` (vira `PGRST203` quando chamada via
PostgREST). Por sorte isso trava a versão insegura — que casava CT-e↔NF-e só pelo número da NF,
sem separar por empresa, o risco já documentado de cruzar empresa errada (número de NF-e se
repete entre as empresas do grupo) — mas é um bug, não uma proteção desenhada; e o erro atrapalha
qualquer código (futuro ou existente) que tente chamar a função com 2 argumentos esperando que
funcione.

De caminho, nenhuma das 3 colunas de valor mais usadas em `frt_conhecimentos`
(`valor_frete_cte`, `valor_frete_nf`, `valor_cotado`) tem `COMMENT ON COLUMN` — a origem direta da
confusão que motivou boa parte da investigação (achava-se que `valor_frete_nf` seria a cotação;
na verdade é o frete da nossa própria NF-e de venda).

## 2. Resultado do pré-voo (`docs/sql/2026-09-22_preflight_frt_rpc_comments.sql`, rodado 22/09/2026)

| bloco | resultado |
|---|---|
| A — função existe | as duas sobrecargas confirmadas: `buscar_dados_nf_para_cte(p_num_nf text, p_slug_transp text)` **(será removida)** e `buscar_dados_nf_para_cte(p_num_nf text, p_slug_transp text, p_chave_nfe text)` **(fica intacta)** |
| B — dependência interna (function) | nenhuma linha — nenhuma outra function do banco referencia o nome |
| B — dependência interna (view) | nenhuma linha — nenhuma view referencia o nome |
| C — comentário atual das 3 colunas | as 3 sem comentário (`valor_frete_cte`, `valor_frete_nf`, `valor_cotado`) |
| G — impressão digital | banco `vishxwdxqiygbxmtpfoy` (nome interno `postgres`), `frt_conhecimentos` com 922 linhas |

**Limite do pré-voo**: ele só vê dependência *dentro do banco* (outra function, view, trigger).
As Edge Functions (`capturar-ctes`, `capturar-ctes-braspress-api`, `capturar-faturas-frete`) não
têm código neste repo nem em nenhum outro acessível daqui — rodam a partir do painel do Supabase.
Não dá para confirmar por aqui se alguma delas chama a versão de 2 argumentos. Mitigação: a
versão de 2 argumentos **já está quebrada agora** (qualquer chamada dá erro 42725) — então
qualquer Edge Function que dependesse dela já estaria falhando hoje, antes desta migration. Dropar
uma função que já não executa com sucesso não piora o estado atual.

## 3. O que muda no app que já está no ar, no instante em que você aplica

- Qualquer código (Edge Function, script, consulta manual) que chamar
  `buscar_dados_nf_para_cte` com exatamente 2 argumentos passa de "erro 42725 (ambíguo)" para
  "erro 42883 (function does not exist)" — a mensagem de erro muda, mas continua sendo um erro
  nos dois casos. Nenhum caminho que funciona hoje deixa de funcionar.
- Os comentários de coluna não mudam comportamento nenhum — são metadata, não afetam query,
  RLS, nem o app.

## 4. O que é escrito nos dados de produção

Nada. Zero linhas de `frt_conhecimentos` ou de qualquer outra tabela são lidas, alteradas ou
apagadas. Só metadata de schema (1 função removida, 3 comentários de coluna definidos).

## 5. O que não volta atrás sozinho

O `DROP FUNCTION` não tem `IF EXISTS` reversível automático — depois de aplicado, recriar a
função de 2 argumentos exigiria escrever o `CREATE FUNCTION` de novo. **Decisão deliberada: não
guardamos isso como "o comando de volta"**, porque recriar essa função exatamente como estava
reintroduz a mesma ambiguidade que este migration corrige. Se algum dia for necessário um atalho
de 2 argumentos, a forma seria criar sob um nome novo (ex.:
`buscar_dados_nf_para_cte_legado`), nunca sobrecarregar `buscar_dados_nf_para_cte` de novo.
`COMMENT ON COLUMN` é sempre reversível (rodar de novo com outro texto, ou `IS NULL` para limpar).

## 6. Não apaga dado — auditado termo por termo

`grep -inE 'drop|delete|truncate|cascade'` no arquivo da migration:

- Linha `drop function if exists public.buscar_dados_nf_para_cte(p_num_nf text, p_slug_transp text);`
  — remove um **objeto de schema** (função), não uma linha de dado. É a mudança central deste
  migration, coberta pelas seções 2, 3 e 5 acima.

Nenhuma outra ocorrência. Nenhum `delete`, `truncate` ou `cascade` no arquivo.

## 7. Ordem para aplicar

Só este migration, sem dependência de Edge Function nem de push de front — pode aplicar
isoladamente, em qualquer momento.

## 8. Comando

```bash
python "C:/Users/ecommerce06/Desktop/Aplicações Bononi/.claude/skills/consultar-banco/scripts/sql.py" prod "C:/Aplicações da bononi/bononi-frete/supabase/migrations/20260922081236_frt_rpc_comments.sql" --ensaio
```
(ensaiar primeiro — roda de verdade e desfaz) e, depois do "pode aplicar":
```bash
python "C:/Users/ecommerce06/Desktop/Aplicações Bononi/.claude/skills/consultar-banco/scripts/sql.py" prod "C:/Aplicações da bononi/bononi-frete/supabase/migrations/20260922081236_frt_rpc_comments.sql" --escrever --producao
```

## 9. Recomendação

Aplicar. Risco baixo (0 linhas de dado, 1 objeto de schema já quebrado sendo removido, 3
comentários novos), sem dependência interna do banco encontrada, e o principal risco residual
(Edge Function externa chamando a versão de 2 argumentos) já está inviabilizado pelo bug atual —
esta migration não piora esse cenário, só limpa o estado inconsistente.
