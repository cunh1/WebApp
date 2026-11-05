import { Router } from 'express';
import { config } from '../config.js';
import * as auth from '../auth/servico.js';
import { exigirLogin } from '../middlewares/autenticacao.js';

const router = Router();
const contexto = (req) => ({ ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) });
const opcoesCookie = { httpOnly: true, secure: config.producao, sameSite: 'lax', path: '/' };

router.post('/login', async (req, res) => {
  const { token, usuario } = await auth.login(req.body ?? {}, contexto(req));
  res.cookie(config.auth.nomeCookie, token, { ...opcoesCookie, maxAge: config.auth.sessaoMaxMs });
  res.json({ usuario });
});

router.post('/logout', (req, res) => {
  if (req.tokenSessao) auth.logout(req.tokenSessao);
  res.clearCookie(config.auth.nomeCookie, opcoesCookie);
  res.status(204).end();
});

router.get('/eu', exigirLogin, (req, res) => {
  res.json({ usuario: req.usuario });
});

export default router;
