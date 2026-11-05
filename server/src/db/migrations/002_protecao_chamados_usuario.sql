-- A migração 001 criou chamados.usuario_id com ON DELETE CASCADE: excluir um usuário
-- apagaria junto, automaticamente, todo o histórico de chamados dele. Isso não é seguro
-- (perde dados sem aviso). Esta migração reconstrói a tabela sem o CASCADE nesse campo:
-- agora o banco BLOQUEIA a exclusão de um usuário que ainda tenha chamados vinculados
-- (o backend trata isso e devolve uma mensagem clara, em vez de apagar tudo em silêncio).
-- SQLite não permite "ALTER TABLE ... DROP CONSTRAINT", então é preciso recriar a tabela.

CREATE TABLE chamados_novo (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),  -- sem ON DELETE CASCADE agora
  descricao     TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  evento        TEXT,
  solicitacao   TEXT,
  imagem1_path  TEXT,
  imagem2_path  TEXT,
  status        TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'fechado')),
  atendente_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  restrito      INTEGER NOT NULL DEFAULT 0 CHECK (restrito IN (0, 1)),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  fechado_em    TEXT
);

INSERT INTO chamados_novo SELECT * FROM chamados;
DROP TABLE chamados;
ALTER TABLE chamados_novo RENAME TO chamados;

CREATE INDEX idx_chamados_usuario ON chamados (usuario_id);
CREATE INDEX idx_chamados_tipo ON chamados (tipo);
CREATE INDEX idx_chamados_status ON chamados (status);
