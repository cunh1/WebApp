# Relatório de correções — WebApp Seiren

## Implementado nesta revisão

- A edição de conteúdo dos chamados foi removida da interface, da API e do repositório; o `PUT /chamados/:id` permanece exclusivo para fechamento.
- A tela de detalhes agora exibe “Excluir chamado” somente para autor/admin e apenas em chamados abertos/não cancelados, reutilizando o estilo existente.
- A exclusão pede confirmação identificando o número do chamado, impede envio repetido no botão e trata respostas de erro. O backend já valida autor/admin, exige chamado existente e preserva chamados fechados/cancelados.
- Os testes de integração cobrem bloqueio de edição para qualquer perfil, fechamento, cancelamento e exclusão (autor, usuário alheio, administrador, chamado fechado e ID inexistente).
- README raiz documenta instalação, execução, testes e a limitação de deploy.

## Verificações executadas

- `node --check home.js`: passou.
- `node --check inclusao.js`: passou.
- `node --check server/src/routes/chamados.js`: passou.
- `node --check server/src/repositories/chamados.js`: passou.
- `node --check server/test/roles.test.js`: passou.
- Inspeção do esquema SQLite: identificadas tabelas `usuarios`, `sessoes`, `chamados` e `tentativas_login`; não há tabelas de comentários ou auditoria de chamados nas migrações atuais.
- `npm test`: **não executou os testes funcionais** porque a dependência `better-sqlite3` não está instalada neste ambiente (`ERR_MODULE_NOT_FOUND`). A tentativa de instalar dependências não terminou no limite de execução disponível. Portanto, os testes HTTP adicionados não são declarados como aprovados.

## Limitação de implantação

O backend utiliza `better-sqlite3` síncrono e arquivos locais para banco e anexos. Não é seguro declarar este projeto pronto para Vercel serverless sem migrar a persistência para banco remoto e armazenamento de objetos. Nenhum serviço externo foi provisionado, nenhuma migração de dados foi executada e nenhum deploy foi realizado. O README descreve as etapas obrigatórias antes da publicação.

## Ajuste complementar — exclusão exclusiva pelo autor (04/11/2026)

- A exclusão definitiva de chamados agora é permitida somente quando o ID do usuário autenticado na sessão corresponde ao ID do autor persistido no chamado.
- A regra é independente do cargo: administrador, TI e Manutenção não podem excluir chamados de terceiros, mas podem excluir os próprios chamados abertos.
- A interface oculta a ação para qualquer pessoa que não seja autora do chamado; o backend repete a validação e responde HTTP 403 em tentativas não autorizadas.
- Chamados fechados ou cancelados continuam protegidos contra exclusão definitiva.
- Foram atualizados os testes automatizados para cobrir administrador, TI, Manutenção e usuário comum.
- Validação executada: `node --check` nos arquivos JavaScript alterados passou. `npm test` não pôde executar porque `better-sqlite3` não está instalado neste ambiente de análise; os testes precisam ser executados no ambiente local com as dependências instaladas.


## Correções adicionais — permissões mobile e tabela administrativa

- Usuários comuns agora podem editar seus próprios chamados enquanto estiverem abertos; continuam sem poder editar chamados de terceiros.
- Usuários comuns agora podem excluir definitivamente seus próprios chamados abertos; a API continua validando o autor pela sessão e pelo registro persistido.
- A tela de chamados passou a exibir as ações de editar/excluir para o autor independentemente do cargo.
- A tabela de usuários no desktop estava permanentemente oculta por `display: none` sem uma regra de exibição para o estado `com-registros`; foi adicionada a regra para torná-la visível após o carregamento.
- As ações Editar/Ativar/Desativar/Excluir foram mantidas visíveis diretamente na coluna Ações, evitando depender de um menu recolhível.
- O `package.json` da raiz agora inicia o servidor em `server/src/server.js`, compatível com a estrutura deste repositório quando a raiz do repositório é usada como Root Directory no Render.
