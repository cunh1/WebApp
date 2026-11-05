// Não existe tela de cadastro no front-end fornecido (inicial.html só tem login), então
// contas são criadas por aqui. Uso: node src/db/criar-usuario.js <login> <senha> [nome] [--admin]
import { hashSenha, validarSenha } from '../auth/senha.js';
import { db } from './connection.js';
import { migrar } from './migrate.js';
import { config } from '../config.js';

migrar(db, config.pastaMigracoes);

const args = process.argv.slice(2).filter((a) => a !== '--admin');
const ehAdmin = process.argv.includes('--admin');
const [login, senha, nome = login] = args;

if (!login || !senha) {
  console.error('Uso: node src/db/criar-usuario.js <login> <senha> [nome] [--admin]');
  process.exit(1);
}

const erros = validarSenha(senha);
if (erros.length) {
  console.error('Senha inválida: ' + erros.join('; '));
  process.exit(1);
}

const existente = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(login);
const senhaHash = await hashSenha(senha);

if (existente) {
  db.prepare("UPDATE usuarios SET senha_hash = ?, nome = ?, papel = ?, cargo = ?, ativo = 1, atualizado_em = datetime('now') WHERE id = ?")
    .run(senhaHash, nome, ehAdmin ? 'admin' : 'usuario', ehAdmin ? 'admin' : 'usuario', existente.id);
  console.log(`Usuário "${login}" atualizado${ehAdmin ? ' (admin)' : ''}.`);
} else {
  db.prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, cargo, ativo) VALUES (?, ?, ?, ?, ?, 1)')
    .run(nome, login, senhaHash, ehAdmin ? 'admin' : 'usuario', ehAdmin ? 'admin' : 'usuario');
  console.log(`Usuário "${login}" criado${ehAdmin ? ' (admin)' : ''}.`);
}
db.close();
