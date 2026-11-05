-- Cargos separados do papel legado e setor explícito do chamado.
ALTER TABLE usuarios ADD COLUMN cargo TEXT NOT NULL DEFAULT 'usuario'
  CHECK (cargo IN ('admin', 'usuario', 'ti', 'manutencao'));
ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1));
ALTER TABLE usuarios ADD COLUMN setor TEXT
  CHECK (setor IS NULL OR setor IN ('TI', 'Manutenção'));
UPDATE usuarios SET cargo = papel, setor = NULL;

ALTER TABLE chamados ADD COLUMN setor_responsavel TEXT
  CHECK (setor_responsavel IS NULL OR setor_responsavel IN ('TI', 'Manutenção'));
-- tipo é um campo já existente e padronizado que identifica o setor em registros antigos.
-- Somente valores reconhecidos são migrados; os demais permanecem sem classificação.
UPDATE chamados
   SET setor_responsavel = CASE
     WHEN tipo IN ('T.I', 'TI', 'T.I.') THEN 'TI'
     WHEN tipo = 'Manutenção' THEN 'Manutenção'
     ELSE NULL
   END;

CREATE INDEX idx_chamados_setor_responsavel ON chamados(setor_responsavel);
