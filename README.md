# 🚚 Bononi Frete

Dashboard de cotação e auditoria de frete do Grupo Bononi Acessórios.

## Módulos

- **Cotar Frete** — Multi-transportadora em tempo real (Braspress, AGEX, São Miguel, Rodonaves)
- **Auditoria CTe** — Conferência de conhecimentos de transporte com atualização de status
- **Histórico** — Todas as cotações realizadas
- **Logs do Sistema** — Rastreamento de ações e erros

## Setup Supabase

Execute o arquivo `setup_frt_logs.sql` no SQL Editor do Supabase antes de usar o módulo de Logs.

## Stack

- HTML/JS vanilla
- Supabase (banco + auth + edge functions)
- Vercel (hosting estático)

## Auth

Login via Supabase Auth. Requer `user_metadata.admin = true` ou `user_metadata.modulos` contendo `"frete"`.
