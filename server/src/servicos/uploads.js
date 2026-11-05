import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { ErroHttp } from '../erros.js';

const EXTENSAO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

fs.mkdirSync(config.pastaUploads, { recursive: true });

/**
 * Recebe o data URL base64 que o front-end já gera (FileReader.readAsDataURL, em
 * inclusao.js) e salva como arquivo real em disco — em vez de guardar o base64 enorme
 * dentro do banco. Devolve o nome do arquivo salvo, ou null se nada foi enviado.
 * Valida tipo e tamanho antes de gravar qualquer coisa em disco.
 */
export function salvarImagemBase64(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  // O <img> começa com res/bkg.png (padrão, sem upload) até o usuário escolher um arquivo;
  // só processamos quando é de fato um data: URL vindo do FileReader.
  if (!dataUrl.startsWith('data:')) return null;

  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new ErroHttp(400, 'Imagem em formato inválido');
  const [, tipo, base64] = m;

  if (!config.uploads.tiposPermitidos.includes(tipo)) {
    throw new ErroHttp(400, `Tipo de imagem não permitido: ${tipo}`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > config.uploads.maxBytesPorImagem) {
    throw new ErroHttp(400, 'Imagem maior que o limite permitido (5 MB)');
  }

  const nome = `${crypto.randomUUID()}.${EXTENSAO[tipo]}`;
  fs.writeFileSync(path.join(config.pastaUploads, nome), buffer);
  return nome;
}

export function removerImagem(nome) {
  if (!nome) return;
  const caminho = path.join(config.pastaUploads, nome);
  if (caminho.startsWith(config.pastaUploads)) fs.rm(caminho, { force: true }, () => {});
}
