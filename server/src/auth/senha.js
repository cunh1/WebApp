import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scrypt = promisify(crypto.scrypt);
const TAM_CHAVE = 64;

function derivar(senha, salt, { N, r, p }) {
  return scrypt(senha.normalize('NFKC'), salt, TAM_CHAVE, { N, r, p, maxmem: 256 * N * r });
}

export async function hashSenha(senha) {
  const params = { ...config.auth.scrypt };
  const salt = crypto.randomBytes(16);
  const chave = await derivar(senha, salt, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), chave.toString('base64')].join('$');
}

export async function verificarSenha(senha, armazenado) {
  try {
    const partes = String(armazenado).split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
    const [, N, r, p, saltB64, chaveB64] = partes;
    const esperado = Buffer.from(chaveB64, 'base64');
    const chave = await derivar(senha, Buffer.from(saltB64, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
    return chave.length === esperado.length && crypto.timingSafeEqual(chave, esperado);
  } catch {
    return false;
  }
}

// Usado quando o login não existe, pra gastar o mesmo tempo que gastaria verificando de
// verdade — evita que alguém descubra quais logins existem pelo tempo de resposta.
let hashFalso;
export const obterHashFalso = () => (hashFalso ??= hashSenha(crypto.randomBytes(16).toString('hex')));

export function validarSenha(senha) {
  const erros = [];
  if (typeof senha !== 'string' || senha.length < 8) erros.push('a senha deve ter pelo menos 8 caracteres');
  if (typeof senha === 'string' && senha.length > 128) erros.push('a senha deve ter no máximo 128 caracteres');
  return erros;
}
