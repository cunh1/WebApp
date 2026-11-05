# WebApp Seiren — Sistema de gerenciamento de chamados

Aplicação existente em HTML/CSS/JavaScript, com backend Node.js + Express e banco SQLite (`better-sqlite3`). O servidor local serve a API e o frontend na mesma origem.

## Requisitos

- Node.js 22 ou superior
- npm
- Em plataformas compatíveis, ferramentas de compilação necessárias para instalar `better-sqlite3` caso não haja binário pré-compilado para o ambiente

## Executar localmente

1. Abra um terminal na pasta `server`.
2. Instale as dependências:
   ```bash
   npm ci
   ```
3. Copie `.env.example` para `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`).
4. Crie o primeiro administrador:
   ```bash
   npm run criar-usuario -- gerente "umaSenhaForte123" "Nome do Gerente" --admin
   ```
   Se já houver um administrador cadastrado, não execute o comando com um login existente sem intenção de redefinir essa conta.
5. Inicie o servidor:
   ```bash
   npm start
   ```
6. Abra `http://localhost:3000` no navegador.

O SQLite e os anexos são criados/localizados por padrão em `server/data/app.sqlite` e `server/uploads`. Faça cópias de segurança desses arquivos antes de alterações manuais. Não publique o banco, anexos ou arquivo `.env` em repositórios públicos.

## Testes

Na pasta `server`:
```bash
npm test
```

Os testes usam bancos temporários próprios e não devem substituir o banco de desenvolvimento. O resultado real do comando deve ser verificado no ambiente em que as dependências nativas forem instaladas.

## Variáveis de ambiente

Consulte `server/.env.example`. `DB_PATH` e `UPLOADS_PATH` são caminhos locais. Não são uma solução de armazenamento persistente para funções serverless.

## Implantação no Vercel: bloqueio técnico conhecido

**Esta versão não está pronta para ser publicada como aplicação funcional no Vercel.** Não foi adicionado um `vercel.json` que encaminhe as requisições para um backend que, no estado atual, depende de SQLite local e arquivos de upload no disco. Isso criaria uma implantação aparentemente funcional, mas os dados e anexos não teriam persistência confiável entre execuções serverless.

Antes do deploy é necessário escolher e configurar:
1. Um banco persistente remoto (por exemplo, PostgreSQL gerenciado) e adaptar/migrar os repositórios, autenticação, sessões e migrações para esse driver assíncrono; ou outro serviço remoto comprovadamente compatível.
2. Armazenamento persistente de objetos para anexos e adaptação de `server/src/servicos/uploads.js` e `server/src/routes/uploads.js`.
3. Migração dos dados existentes com validação de contagens, chaves e relacionamentos.
4. Variáveis de ambiente de produção configuradas no painel do provedor, sem armazenar segredos no Git.
5. Testes HTTP e de persistência no ambiente implantado.

Essas etapas exigem a escolha/credenciais de serviços externos. Nenhuma base remota foi criada, nenhuma migração de dados de produção foi executada e nenhum deploy foi feito. Mantenha o desenvolvimento local no SQLite até essa migração ser implementada e testada.

## Estrutura relevante

- `home.html`, `home.js`, `home_style.css`: listagem e detalhes dos chamados.
- `inclusao.html`, `inclusao.js`, `inclusao_style.css`: criação de chamados.
- `server/src/routes/chamados.js`: endpoints e autorização de chamados.
- `server/src/repositories/chamados.js`: consultas e persistência SQLite.
- `server/src/auth/` e `server/src/middlewares/`: autenticação, sessões e segurança.
- `server/src/db/migrations/`: migrações versionadas do banco.
- `server/test/`: testes automatizados.

## Regras de chamados

- A edição do conteúdo de chamados foi removida da interface, da API e do repositório. `PUT /chamados/:id` aceita somente a operação de fechamento.
- `DELETE /chamados/:id/excluir`: exclusão definitiva somente para autor ou administrador, apenas de chamados abertos. Chamados fechados/cancelados preservam histórico.
- `DELETE /chamados/:id`: permanece sendo cancelamento com motivo, conforme o comportamento legado; não confundir com exclusão definitiva.
- A interface esconde ações não permitidas, mas o backend é a autoridade final e responde `401`, `403`, `404` ou `409` conforme o caso.
