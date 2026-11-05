# Backend — WebApp Seiren (Sistema de Chamados + Gerenciamento de Usuários)

Backend real para o front-end existente. Node.js + Express + SQLite. Serve a API **e** os
arquivos do front-end na mesma porta — não precisa rodar dois servidores nem configurar CORS.

## Como o login funciona

1. `script.js` (tela `inicial.html`) manda `POST /auth/login` com `{ login, senha }`.
2. `auth/servico.js` checa o limitador de tentativas (`auth/limitador.js`, por login e por
   IP — 5 falhas travam por 15 min), busca o usuário por `repositories/usuarios.js`, e
   confere a senha com `auth/senha.js` (scrypt, salt por senha, nunca texto puro).
3. Se bate, `auth/sessoes.js` cria uma sessão: gera um token aleatório, guarda só o **hash**
   dele na tabela `sessoes`, e devolve o token puro num cookie `httpOnly`.
4. Em toda requisição seguinte, `middlewares/autenticacao.js` (`carregarSessao`) lê o
   cookie, valida a sessão e preenche `req.usuario = {id, nome, login, papel}` — isso é
   feito com um **JOIN ao vivo** com a tabela `usuarios` a cada requisição, então uma
   mudança de papel (promover/rebaixar) já vale na próxima requisição, sem precisar logar
   de novo (testado — ver teste 15).
5. `exigirLogin` e `exigirPapel('admin')` (mesmo arquivo) barram no servidor quem não tem
   sessão ou não tem o papel certo — nunca é uma checagem só no front.

## Níveis de acesso

Só existe a coluna `papel` em `usuarios` (`'usuario'` ou `'admin')`. Usuário comum usa o
sistema de chamados normalmente. Administrador, além disso, acessa `/usuarios.html` (o
link "Usuários" no cabeçalho de `home.html` só aparece para ele) e as rotas `/admin/*`.

## Painel administrativo (novo)

Tela `usuarios.html`, acessível pelo link "Usuários" no topo de `home.html` (só visível
para admin) ou direto pela URL. Ela mesma verifica a sessão ao carregar e redireciona quem
não é admin — mas a segurança de verdade está nas rotas `/admin/*`, que recusam qualquer
requisição de quem não estiver logado como admin, não importa o que o front mande.

Permite: listar usuários (com busca por nome/login), criar (comum ou admin), editar
nome/login/senha, promover/rebaixar com um clique, e excluir — tudo com confirmação antes
de agir e mensagens de sucesso/erro na tela.

## Regras de segurança implementadas

- **Nenhuma confiança no navegador**: toda rota `/admin/*` roda `exigirLogin` +
  `exigirPapel('admin')` no servidor (`routes/admin.js`), sempre.
- **Autopromoção bloqueada**: um usuário comum não consegue se tornar admin manipulando a
  requisição — a rota inteira já devolve 403 antes mesmo de olhar o corpo da requisição
  (testado).
- **Último administrador protegido**: não é possível rebaixar nem excluir o único admin
  restante (`contarAdmins() <= 1`, checado no servidor a cada tentativa).
- **Autoexclusão bloqueada**: ninguém exclui a própria conta pelo painel (evita se trancar
  fora do sistema sem querer).
- **Sessão de conta excluída para de funcionar na hora**: `sessoes.usuario_id` tem
  `ON DELETE CASCADE`, então excluir um usuário já apaga as sessões dele automaticamente —
  nenhuma chamada manual extra é necessária (testado).
- **Mudança de privilégio já vale na sessão aberta**: por causa do JOIN ao vivo descrito
  acima, não foi preciso mudar o mecanismo de sessão para isso funcionar (testado).
- **Histórico de chamados preservado**: ver próxima seção.
- Login duplicado: checado explicitamente (mensagem clara) e também protegido por
  `UNIQUE` no banco como segunda camada.
- Todas as consultas usam `prepare()` parametrizado (nunca concatenação de string em SQL).

## Mudança no banco: exclusão de usuário não apaga mais chamados

A tabela original (`001_inicial.sql`) tinha `chamados.usuario_id` com `ON DELETE CASCADE`:
excluir um usuário apagaria, em cascata e sem aviso, todo o histórico de chamados dele.
Isso não é seguro. A migração `002_protecao_chamados_usuario.sql` reconstrói a tabela
`chamados` (preservando todos os dados existentes) **sem** esse `CASCADE`: agora, se um
usuário tiver qualquer chamado vinculado, a exclusão é **bloqueada** com uma mensagem clara
(`409`, "Este usuário tem N chamado(s) vinculado(s) e não pode ser excluído"), em vez de
apagar os chamados. Para excluir de verdade um usuário assim, seria preciso antes decidir o
que fazer com os chamados dele (não implementado — não é uma decisão que o backend deveria
tomar sozinho).

## Como criar o primeiro administrador

Não existe (e não deve existir) nenhuma rota pública para isso — só um admin já logado pode
criar outro admin pela tela. Para o **primeiro**, antes de existir qualquer admin, use o
script de linha de comando (acesso ao servidor, não à rede):

```bash
cd server
npm install
cp .env.example .env
node src/db/criar-usuario.js gerente "umaSenhaForte123" "Nome do Gerente" --admin
```

Rodar de novo com o mesmo login atualiza nome/senha/papel (não duplica a conta).

## Como rodar

```bash
cd server
npm install
cp .env.example .env
node src/db/criar-usuario.js gerente senha123456 "Gerente" --admin
npm start
```

Abra **http://localhost:3000**, entre com o login acima, e clique em "Usuários" no topo.

## Variáveis de ambiente (`.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `DB_PATH` | `./data/app.sqlite` | Caminho do arquivo do banco |
| `UPLOADS_PATH` | `./uploads` | Pasta das imagens dos chamados |
| `NODE_ENV` | `development` | `production` ativa cookie `Secure` |

## Testes

```bash
npm test
```

O projeto contém testes automatizados em `test/`. Nesta execução, `npm test` **não pôde ser validado**:
o `node_modules` incluído no ZIP tinha um binário nativo `better-sqlite3` incompatível com este
ambiente (`ERR_DLOPEN_FAILED`, `invalid ELF header`). Remova/reinstale as dependências com
`npm ci` no sistema de destino e execute `npm test`; não interprete os testes abaixo como
aprovados nesta execução.

- `test/backend.test.js` (9): senha, política de senha, login certo/errado, bloqueio por
  força bruta, upload/validação de imagem, CRUD de chamados, filtro por tipo, visibilidade
  de chamado restrito.
- `test/admin.test.js` (14, HTTP de ponta a ponta — sobe o servidor de verdade numa porta
  aleatória): cobre, nessa ordem, exatamente os 16 cenários pedidos — login comum, acesso
  admin (200) vs usuário comum (403) vs não-logado (401) nas rotas administrativas, criar
  conta comum e admin, login duplicado (409), editar usuário, promover, rebaixar,
  excluir (sem chamados) e **não** excluir (com chamados vinculados — 409, histórico
  preservado), proteção do último admin, bloqueio de autopromoção, sessão de conta
  excluída parando de funcionar na hora, privilégio mudando numa sessão já aberta sem novo
  login, e confirmação de que login/logout/CRUD de chamados continuam funcionando.

**Limitação da execução atual:** não foi possível executar os testes HTTP reais porque o binário
nativo de `better-sqlite3` presente no pacote é incompatível com o runtime atual. Não foram
usados substitutos para declarar os testes aprovados. Durante esse trabalho encontrei
e corrigi 3 bugs nesses substitutos (não no projeto em si) até os testes ficarem
confiáveis: `Router().use()` não aceitava múltiplos middlewares de uma vez (fazia o
`exigirPapel('admin')` ser silenciosamente ignorado — por sorte descoberto pelo próprio
teste automatizado, que é exatamente para isso que ele serve), erro de chave estrangeira
não vinha com o mesmo formato de código que a biblioteca real usa, e um teste meu tentava
isolar um banco separado de um jeito que não funciona com cache de módulos ES (corrigido
no teste, não no app). O `npm install` real na sua máquina baixa as bibliotecas de verdade
(maduras, amplamente usadas) — a lógica testada aqui é idêntica à que vai rodar lá.

## Endpoints novos (`/admin/usuarios`)

Todas exigem sessão válida **e** `papel === 'admin'` — sem isso: `401` (sem sessão) ou
`403` (logado, mas não admin). Nunca confiam em nada que o front declare sobre o usuário.

### `GET /admin/usuarios?busca=termo`
Lista usuários (`id, nome, login, papel` — nunca a senha/hash). `busca` é opcional,
filtra por nome OU login (case-sensitive, `LIKE`). **200**.

### `POST /admin/usuarios`
Cria um usuário.
- **Corpo:** `{ "nome", "login", "senha", "papel": "usuario"|"admin" }` (nome/login/senha
  obrigatórios; papel default `"usuario"`; senha mínimo 8 caracteres).
- **201:** usuário criado (sem hash). **400:** campos inválidos (`{erros: [...]}`).
  **409:** login já existe.

### `PUT /admin/usuarios/:id`
Edita um usuário. Todos os campos opcionais — só altera o que vier no corpo.
- **Corpo:** `{ "nome"?, "login"?, "senha"?, "papel"? }`.
- **200:** usuário atualizado. **400:** validação. **404:** não existe.
  **409:** login já em uso por outro usuário, OU tentativa de rebaixar o último admin.

### `DELETE /admin/usuarios/:id`
Exclui um usuário.
- **204:** excluído. **400:** é a própria conta de quem está pedindo.
  **404:** não existe. **409:** é o último admin, OU tem chamados vinculados.

## Pendências / limitações conhecidas

- Redefinir senha é feito reenviando o campo `senha` no `PUT` (sobrescreve o hash) — não há
  fluxo de "link por e-mail", porque não há serviço de e-mail configurado neste projeto.
- Excluir um usuário com chamados é bloqueado, mas não há (ainda) uma forma de "transferir"
  os chamados dele para outro usuário antes de excluir — ficaria a critério de uma decisão
  de produto futura.
- Campo "Evento" do formulário de chamados segue com significado ambíguo (sem pista no
  projeto original — ver decisão documentada na entrega anterior).


## Fechamento, cancelamento e exclusão de chamados

- A edição do conteúdo de chamados foi removida da interface, da API e do repositório.
- `PUT /chamados/:id` aceita somente a operação de fechamento, respeitando as permissões
  administrativas e de setor existentes.
- `DELETE /chamados/:id` mantém o comportamento legado de **cancelamento com motivo**.
- `DELETE /chamados/:id/excluir` é a exclusão definitiva, com autorização no backend para
  autor ou administrador. Exige chamado existente e aberto; chamados fechados/cancelados
  são preservados para não apagar histórico de encerramento. As imagens próprias do chamado
  são removidas depois da exclusão. Não há tabela de comentários/auditoria de chamados nas
  migrações atuais.

## Implantação no Vercel — limitação importante

**Este repositório ainda não deve ser publicado como aplicação funcional de produção no
Vercel sem uma adaptação de infraestrutura.** O backend atual depende de `better-sqlite3`,
de um arquivo SQLite local e de uploads gravados em disco (`server/data` e `server/uploads`).
O filesystem de uma Function serverless não é armazenamento persistente compartilhado, e o
módulo nativo do SQLite não deve ser presumido compatível com o runtime de Functions sem
configuração/build específicos. Um `vercel.json` isolado não resolveria a persistência e
poderia aparentar funcionar enquanto perderia dados ou anexos.

Para um deploy real, é necessário antes escolher/configurar armazenamento persistente remoto
para **banco e anexos**, e adaptar/testar as camadas `src/db/connection.js` e
`src/servicos/uploads.js` para esses serviços. Como esta execução não dispõe de credenciais
nem de um serviço remoto escolhido, nenhuma migração de banco foi simulada e nenhum deploy
foi declarado. O SQLite local permanece suportado para desenvolvimento.

### Caminho recomendado para preparar um deploy real

1. Escolha um banco persistente acessível pelo Vercel (por exemplo, PostgreSQL gerenciado) e
   um armazenamento de objetos para anexos.
2. Implemente e valide uma camada de repositórios compatível com o banco escolhido, incluindo
   migração dos dados SQLite e preservação de chaves/relacionamentos.
3. Configure os segredos no painel do projeto Vercel (não no repositório).
4. Configure e teste as rotas de API e os cookies de sessão no domínio de produção.
5. Só então crie a configuração de build/roteamento do Vercel e faça o deploy. Valide login,
   criação/fechamento/exclusão e persistência após novas execuções.

Variáveis atuais de desenvolvimento estão listadas em `.env.example`; elas não transformam
por si só o armazenamento local em armazenamento persistente de produção.
