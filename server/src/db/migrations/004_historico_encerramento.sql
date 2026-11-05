-- Mantém histórico de encerramento e cancelamento sem apagar chamados antigos.
ALTER TABLE chamados ADD COLUMN solucao_fechamento TEXT;
ALTER TABLE chamados ADD COLUMN fechado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE chamados ADD COLUMN motivo_cancelamento TEXT;
ALTER TABLE chamados ADD COLUMN cancelado_em TEXT;
ALTER TABLE chamados ADD COLUMN cancelado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX idx_chamados_cancelado_em ON chamados(cancelado_em);
