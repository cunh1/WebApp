import { hashSenha, validarSenha } from '../auth/senha.js';

const CHAVES = ['INITIAL_ADMIN_NAME', 'INITIAL_ADMIN_EMAIL', 'INITIAL_ADMIN_PASSWORD'];
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Cria uma única conta administrativa somente se o banco ainda não tiver usuários. */
export async function bootstrapPrimeiroAdmin(db, env = process.env) {
  if (db.prepare('SELECT 1 FROM usuarios LIMIT 1').get()) return false;

  if (!CHAVES.some((chave) => env[chave] !== undefined)) return false;

  const nome = typeof env.INITIAL_ADMIN_NAME === 'string' ? env.INITIAL_ADMIN_NAME.trim() : '';
  const email = typeof env.INITIAL_ADMIN_EMAIL === 'string' ? env.INITIAL_ADMIN_EMAIL.trim() : '';
  const senha = env.INITIAL_ADMIN_PASSWORD;
  if (!nome || nome.length > 120 || !email || email.length > 60 || !EMAIL_VALIDO.test(email) ||
      typeof senha !== 'string' || validarSenha(senha).length) {
    throw new Error('Configuração do administrador inicial inválida ou incompleta.');
  }

  const senhaHash = await hashSenha(senha);
  const inserirSeVazio = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM usuarios LIMIT 1').get()) return false;
    db.prepare(`
      INSERT INTO usuarios (nome, login, senha_hash, papel, cargo, ativo, setor)
      VALUES (?, ?, ?, 'admin', 'admin', 1, NULL)
    `).run(nome, email, senhaHash);
    return true;
  });

  return inserirSeVazio.immediate();
}