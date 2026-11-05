import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const producao = process.env.NODE_ENV === 'production';

export const config = {
  producao,
  porta: Number(process.env.PORT) || 3000,
  caminhoBanco: process.env.DB_PATH || path.join(raiz, 'data', 'app.sqlite'),
  pastaUploads: process.env.UPLOADS_PATH || path.join(raiz, 'uploads'),
  pastaMigracoes: path.join(raiz, 'src', 'db', 'migrations'),
  // Pasta onde estão os arquivos do front-end (html/css/js), um nível acima do backend.
  pastaFrontend: path.resolve(raiz, '..'),

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
    maxBytesPorImagem: 5 * 1024 * 1024, // 5 MB por imagem, antes de decodificar o base64
    tiposPermitidos: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  },
};
