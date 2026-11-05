-- Usuários: a tela de login (inicial.html) usa um campo "Login", não e-mail, então o
-- identificador de acesso é um login/usuário simples, não um endereço de e-mail.
CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  login         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  papel         TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('usuario', 'admin')),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessões de login. Só o hash do token fica salvo (igual a um cofre: perder o banco não
-- expõe sessões ativas).
CREATE TABLE sessoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  criada_em     TEXT NOT NULL,
  ultimo_uso_em TEXT NOT NULL,
  expira_em     TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX idx_sessoes_usuario ON sessoes (usuario_id);

-- Controle de tentativas de login (força bruta), por chave: 'login:fulano' ou 'ip:1.2.3.4'.
CREATE TABLE tentativas_login (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chave     TEXT NOT NULL,
  criada_em TEXT NOT NULL
);
CREATE INDEX idx_tentativas_chave ON tentativas_login (chave, criada_em);

-- Chamados: corresponde direto às colunas da tabela em home.html (Nro, Usuário, Abertura,
-- Tipo, Hora da Abertura, Status, Data/Hora do Fechamento, Atendente, Restrito?).
-- "criado_em"/"fechado_em" guardam data+hora juntas; o front-end separa na exibição.
CREATE TABLE chamados (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descricao     TEXT NOT NULL,                 -- campo "Nchamado" do formulário (Chamado)
  tipo          TEXT NOT NULL,                 -- "Manutenção" | "T.I" (campo "Tipo")
  evento        TEXT,                          -- campo "Evento" — significado real ainda não definido
  solicitacao   TEXT,                          -- campo "Solicitação"
  imagem1_path  TEXT,
  imagem2_path  TEXT,
  status        TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'fechado')),
  atendente_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  restrito      INTEGER NOT NULL DEFAULT 0 CHECK (restrito IN (0, 1)),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  fechado_em    TEXT
);
CREATE INDEX idx_chamados_usuario ON chamados (usuario_id);
CREATE INDEX idx_chamados_tipo ON chamados (tipo);
CREATE INDEX idx_chamados_status ON chamados (status);
