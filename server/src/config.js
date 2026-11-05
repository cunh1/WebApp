import os from 'node:os';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const producao = process.env.NODE_ENV === 'production';
const temporario = process.env.VERCEL === '1' ? os.tmpdir() : raiz;

export const config = {
  producao,
  porta: Number(process.env.PORT) || 3000,
  // Vercel Functions have a read-only deployment bundle; /tmp is writable but ephemeral.
  caminhoBanco: process.env.DB_PATH || path.join(temporario, 'webapp-seiren', 'app.sqlite'),
  pastaUploads: process.env.UPLOADS_PATH || path.join(temporario, 'webapp-seiren', 'uploads'),
  pastaMigracoes: path.join(raiz, 'src', 'db', 'migrations'),
  // In a Vercel build the project root is the frontend root.
  pastaFrontend: process.env.VERCEL === '1' ? process.cwd() : path.resolve(raiz, '..'),

  auth: {
    nomeCookie: producao ? '__Host-sid' : 'sid',
    sessaoInatividadeMs: 7 * 24 * 60 * 60 * 1000,
    sessaoMaxMs: 30 * 24 * 60 * 60 * 1000,
    maxSessoesPorUsuario: 10,
    janelaTentativasMs: 15 * 60 * 1000,
    maxFalhasPorLogin: 5,
    maxFalhasPorIp: 20,
    scrypt: { N: Number(process.env.SCRYPT_N) || 2 ** 17, r: 8, p: 1 },
  },

  uploads: {
    maxBytesPorImagem: 5 * 1024 * 1024,
    tiposPermitidos: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  },
};
