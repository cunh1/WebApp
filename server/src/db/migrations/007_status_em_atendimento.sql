-- Padroniza o status operacional para "em_atendimento".
-- Converte registros existentes sem perder chamados, responsáveis ou histórico.
CREATE TABLE chamados_novo (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
  descricao           TEXT NOT NULL,
  tipo                TEXT NOT NULL,
  evento              TEXT,
  solicitacao         TEXT,
  imagem1_path        TEXT,
  imagem2_path        TEXT,
  status              TEXT NOT NULL DEFAULT 'aberto'
                      CHECK (status IN ('aberto', 'em_atendimento', 'fechado')),
  atendente_id        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  restrito            INTEGER NOT NULL DEFAULT 0 CHECK (restrito IN (0, 1)),
  criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  fechado_em          TEXT,
  setor_responsavel   TEXT CHECK (setor_responsavel IS NULL OR setor_responsavel IN ('TI', 'Manutenção')),
  solucao_fechamento  TEXT,
  fechado_por_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_cancelamento TEXT,
  cancelado_em        TEXT,
  cancelado_por_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

INSERT INTO chamados_novo (
  id, usuario_id, descricao, tipo, evento, solicitacao, imagem1_path, imagem2_path,
  status, atendente_id, restrito, criado_em, atualizado_em, fechado_em,
  setor_responsavel, solucao_fechamento, fechado_por_id, motivo_cancelamento,
  cancelado_em, cancelado_por_id
)
SELECT
  id, usuario_id, descricao, tipo, evento, solicitacao, imagem1_path, imagem2_path,
  CASE WHEN status = 'em_andamento' THEN 'em_atendimento' ELSE status END,
  atendente_id, restrito, criado_em, atualizado_em, fechado_em,
  setor_responsavel, solucao_fechamento, fechado_por_id, motivo_cancelamento,
  cancelado_em, cancelado_por_id
FROM chamados;

DROP TABLE chamados;
ALTER TABLE chamados_novo RENAME TO chamados;

CREATE INDEX idx_chamados_usuario ON chamados(usuario_id);
CREATE INDEX idx_chamados_tipo ON chamados(tipo);
CREATE INDEX idx_chamados_status ON chamados(status);
CREATE INDEX idx_chamados_setor_responsavel ON chamados(setor_responsavel);
CREATE INDEX idx_chamados_cancelado_em ON chamados(cancelado_em);
