-- ============================================================
-- CRIAR TABELA frt_logs — Sistema de Logs do App de Frete
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS frt_logs (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL DEFAULT 'acao'
              CHECK (tipo IN ('acao','erro','aviso')),
  categoria   TEXT,
  descricao   TEXT NOT NULL,
  detalhe     JSONB,
  usuario     TEXT,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance nas consultas do dashboard
CREATE INDEX IF NOT EXISTS idx_frt_logs_tipo       ON frt_logs (tipo);
CREATE INDEX IF NOT EXISTS idx_frt_logs_categoria  ON frt_logs (categoria);
CREATE INDEX IF NOT EXISTS idx_frt_logs_criado_em  ON frt_logs (criado_em DESC);

-- RLS
ALTER TABLE frt_logs ENABLE ROW LEVEL SECURITY;

-- Política permissiva (anon e authenticated podem ler/gravar)
DROP POLICY IF EXISTS "frt_logs_all" ON frt_logs;
CREATE POLICY "frt_logs_all" ON frt_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grants
GRANT ALL ON frt_logs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE frt_logs_id_seq TO anon, authenticated;

-- Confirmar
SELECT 'frt_logs criada com sucesso!' AS status;
