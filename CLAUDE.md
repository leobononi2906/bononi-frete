# Frete (bononi-frete) — guia do projeto

> **Estado atual, pendências e dev-log: `docs/STATUS.md`.** Este arquivo é só o que é estável.
> Contexto do grupo e regras de banco: skill `bononi-contexto`. Consultar o banco:
> `consultar-banco`. Publicar: `publicar-e-conferir`. Registrar: `registrar-status`.

## O que é

Subsistema de frete: **cotação** de 4 transportadoras em paralelo, **auditoria de CTe** (casar o
conhecimento de transporte com a NF e o vendedor) e rastreio.

## Onde está

- **Clone nesta máquina (`ecommerce06`):** `C:\Aplicações da bononi\bononi-frete`.
  Na máquina do Leo o clone é aninhado (`bononi-frete\bononi-frete`) e a pasta externa é wrapper.
- **Remote:** `leobononi2906/bononi-frete`, branch `main`. Push na `main` = produção.
- **Supabase:** `vishxwdxqiygbxmtpfoy`, prefixo `frt_`.
- **Base de conhecimento fora do git:** `C:\CLAUDE\frete-kb\` (`DIVERGENCIAS.md`, `AUDITORIA.md`,
  `MIGRACAO.md`, `TESTES`) — existe só na máquina do Leo. Se um doc citado não aparecer aqui, é
  isso.

## Stack

HTML + JS puro, `index.html` único (~99 KB), sem build. `vercel.json` na raiz.
`setup_frt_logs.sql` é o script de criação da tabela de logs.

## Armadilhas deste repo

- **Auditoria de CTe é dinheiro**: a conferência casa conhecimento de transporte com nota e
  vendedor, e um casamento errado vira cobrança errada. Mudança na regra de casamento pede
  conferência com dado real antes de publicar, não só teste de tela.
- **Cotação chama 4 transportadoras em paralelo** — uma que demora ou cai não pode travar a tela
  nem contaminar o resultado das outras. Ao mexer, teste o caminho de falha, não só o feliz.
- **Toda `render*`/`load*` em `try/catch`** com estado de erro visível: aqui o app é arquivo único
  e uma exceção não tratada leva a tela inteira junto.
- Função chamada por `onclick` precisa estar exposta em `window.*` — senão é `ReferenceError`
  mudo: a tela abre e o botão não faz nada.
- Nunca alterar `vw_*` (espelho do Firebird).
