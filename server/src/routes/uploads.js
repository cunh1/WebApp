import { Router } from 'express';
import path from 'node:path';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { exigirLogin } from '../middlewares/autenticacao.js';

const router = Router();
router.use(exigirLogin);
router.get('/:nome', (req, res) => {
  const nome = path.basename(req.params.nome || '');
  if (!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/i.test(nome)) return res.status(404).end();
  const chamado = db.prepare(`SELECT c.cancelado_em FROM chamados c WHERE c.imagem1_path = ? OR c.imagem2_path = ? LIMIT 1`).get(nome, nome);
  if (!chamado) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(config.pastaUploads, nome), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
export default router;
