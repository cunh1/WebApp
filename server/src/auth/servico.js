import { config } from '../config.js';
import { ErroHttp } from '../erros.js';
import * as usuarios from '../repositories/usuarios.js';
import * as limitador from './limitador.js';
import { hashSenha, verificarSenha, obterHashFalso } from './senha.js';
import { criarSessao, revogarSessao } from './sessoes.js';

const muitasTentativas = () => new ErroHttp(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');

export async function login({ login, senha, manterConectado = false }, { ip, userAgent } = {}) {
  if (typeof login !== 'string' || !login.trim() || typeof senha !== 'string' || !senha) {
    throw new ErroHttp(400, 'Informe login e senha');
  }
  login = login.trim();

  const { janelaTentativasMs: janela, maxFalhasPorLogin, maxFalhasPorIp } = config.auth;
  const chaveLogin = `login:${login}`;
  const chaveIp = `ip:${ip ?? 'desconhecido'}`;

  if (limitador.contar(chaveLogin, janela) >= maxFalhasPorLogin || limitador.contar(chaveIp, janela) >= maxFalhasPorIp) {
    throw muitasTentativas();
  }

  const usuario = usuarios.buscarPorLogin(login);
  const ok = await verificarSenha(senha, usuario?.senha_hash ?? (await obterHashFalso()));

  if (!usuario || !ok || usuario.ativo === 0) {
    limitador.registrar(chaveLogin);
    limitador.registrar(chaveIp);
    throw new ErroHttp(401, 'Login ou senha incorretos'); // mesma mensagem do script.js original
  }

  limitador.limpar(chaveLogin);
  const lembrar = manterConectado === true;
  const token = criarSessao(usuario.id, { ip, userAgent, manterConectado: lembrar });
  return { token, usuario: usuarios.paraPublico(usuario), manterConectado: lembrar };
}

export function logout(token) {
  revogarSessao(token);
}
