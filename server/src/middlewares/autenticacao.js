import { config } from '../config.js';
import { validarSessao } from '../auth/sessoes.js';

export function lerCookie(req, nome) {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1 || parte.slice(0, i).trim() !== nome) continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function carregarSessao(req, res, next) {
  req.usuario = null;
  req.tokenSessao = null;
  const token = lerCookie(req, config.auth.nomeCookie);
  if (token) {
    const sessao = validarSessao(token);
    if (sessao) {
      req.usuario = sessao.usuario;
      req.tokenSessao = token;
    }
  }
  next();
}

export function exigirLogin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ erro: 'Autenticação necessária' });
  next();
}

export const exigirPapel = (...papeis) => (req, res, next) => {
  if (!papeis.includes(req.usuario?.papel)) return res.status(403).json({ erro: 'Acesso negado' });
  next();
};
