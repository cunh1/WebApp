# WebApp Seiren — Sistema de gerenciamento de chamados

O projeto mantém o frontend HTML/CSS/JavaScript, backend Node.js + Express e SQLite (`better-sqlite3`). Localmente, `cd server; npm ci; npm start` continua servindo frontend e API na mesma origem.

## Deploy de teste na Vercel

A raiz do repositório é o diretório do projeto Vercel. A Function `api/index.js` importa a aplicação Express sem abrir uma porta, executa as migrations e responde às rotas existentes; `vercel.json` encaminha as requisições para ela e inclui frontend e migrations no pacote.

Configure Node.js 22 no projeto e implante a partir da raiz. Não configure `DB_PATH` ou `UPLOADS_PATH` para diretórios do bundle: na Vercel os padrões usam `/tmp/webapp-seiren`, gravável durante a execução.

**Limitação de persistência:** `/tmp` é efêmero e não é compartilhado entre instâncias. SQLite, usuários, sessões, chamados e anexos podem desaparecer em cold starts e divergirem entre instâncias. Portanto, este deploy permite testar a integração e os fluxos enquanto uma única instância retém seu estado; não é adequado a dados confiáveis nem a uso real/multi-instância. Preservando SQLite local sem serviço externo não existe configuração que garanta persistência no Vercel. A alternativa mínima para operação real é manter o backend num host com disco persistente (e uploads no mesmo disco) ou posteriormente adotar armazenamento persistente compatível.

Crie o primeiro administrador através de `cd server` e `npm run criar-usuario -- gerente "umaSenhaForte123" "Nome do Gerente" --admin` antes de usar o deploy; o arquivo do banco criado localmente não será enviado nem compartilhado pela Function. A Vercel não oferece execução interativa desse script contra o filesystem efêmero.

## Validação

Execute `cd server; npm ci; npm test` para testes locais. O endpoint `/saude` verifica a disponibilidade do banco. Após deploy, confira `/saude`, login/logout, painel e operações de chamados. Uploads são gravados temporariamente em `/tmp` e servidos apenas por rota autenticada.
