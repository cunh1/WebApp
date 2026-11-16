import crypto from 'node:crypto';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { paraSql, deSql } from './tempo.js';

const novoToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function criarSessao(usuarioId, { ip, userAgent, manterConectado = false } = {}) {
  const token = novoToken();
  const agora = Date.now();
  db.prepare(
    `INSERT INTO sessoes (usuario_id, token_hash, criada_em, ultimo_uso_em, expira_em, ip, user_agent, manter_conectado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(usuarioId, hashToken(token), paraSql(agora), paraSql(agora), paraSql(agora + config.auth.sessaoMaxMs), ip ?? null, userAgent ?? null, manterConectado ? 1 : 0);

  db.prepare(
    `DELETE FROM sessoes WHERE usuario_id = ?
       AND id NOT IN (SELECT id FROM sessoes WHERE usuario_id = ? ORDER BY id DESC LIMIT ?)`,
  ).run(usuarioId, usuarioId, config.auth.maxSessoesPorUsuario);
  return token;
}

export function validarSessao(token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const linha = db
    .prepare(
      `SELECT s.id AS sessao_id, s.ultimo_uso_em, s.expira_em, s.manter_conectado, u.id, u.nome, u.login, u.papel, u.cargo, u.setor, u.ativo
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = ?`,
    )
    .get(hashToken(token));
  if (!linha || !linha.ativo) {
    if (linha) db.prepare('DELETE FROM sessoes WHERE id = ?').run(linha.sessao_id);
    return null;
  }

  const agora = Date.now();
  const limiteInatividade = linha.manter_conectado ? config.auth.sessaoMaxMs : config.auth.sessaoInatividadeMs;
  const inativa = agora - deSql(linha.ultimo_uso_em) > limiteInatividade;
  if (inativa || deSql(linha.expira_em) <= agora) {
    db.prepare('DELETE FROM sessoes WHERE id = ?').run(linha.sessao_id);
    return null;
  }

  if (agora - deSql(linha.ultimo_uso_em) > 60 * 1000) {
    db.prepare('UPDATE sessoes SET ultimo_uso_em = ? WHERE id = ?').run(paraSql(agora), linha.sessao_id);
  }
  return { usuario: { id: linha.id, nome: linha.nome, login: linha.login, papel: linha.cargo || linha.papel, cargo: linha.cargo || linha.papel, setor: linha.setor ?? null } };
}

export function revogarSessao(token) {
  if (typeof token === 'string') db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}
