import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { ErroHttp } from './erros.js';
import { db } from './db/connection.js';
import { cabecalhosSeguros, semCache } from './middlewares/seguranca.js';
import { carregarSessao } from './middlewares/autenticacao.js';
import { logarRequisicoes } from './middlewares/log.js';
import authRouter from './routes/auth.js';
import chamadosRouter from './routes/chamados.js';
import adminRouter from './routes/admin.js';
import uploadsRouter from './routes/uploads.js';

export const app = express();
app.disable('x-powered-by');

app.use(logarRequisicoes);
app.use(cabecalhosSeguros);
// Os dois dropdowns (Tipo/Evento) e os formulários mandam pouco texto, mas as duas imagens
// em base64 (data URL) podem ser bem maiores que o padrão do Express — por isso o limite
// maior aqui, em vez do 10kb padrão.
app.use(express.json({ limit: '20mb' }));
app.use(carregarSessao);

// The Vercel Express runtime ignores express.static(); serve the login entry explicitly.
app.get('/', (req, res) => res.sendFile(path.join(config.pastaFrontend, 'inicial.html')));

app.get('/saude', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, erro: 'Banco indisponível' });
  }
});

app.use('/auth', semCache, authRouter);
app.use('/chamados', chamadosRouter);
app.use('/admin', semCache, adminRouter);

// Anexos são servidos por uma rota autenticada, não por static público.
app.use('/uploads', uploadsRouter);

// Localmente, servimos a mesma pasta public/ que a Vercel publica pelo CDN.
app.use(express.static(config.pastaFrontend, { index: 'inicial.html' }));

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

app.use((erro, req, res, next) => {
  if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message, ...erro.detalhes });
  if (typeof erro.code === 'string' && erro.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ erro: 'Conflito com dados existentes' });
  }
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Corpo da requisição grande demais' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno' });
});

// Export named for the local server and default for Vercel's function loader.
export default app;
