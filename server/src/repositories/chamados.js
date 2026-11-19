import { db } from '../db/connection.js';

const CAMPOS = `
  c.id, c.descricao, c.tipo, c.setor_responsavel, c.evento, c.solicitacao, c.imagem1_path, c.imagem2_path,
  c.status, c.restrito, c.criado_em, c.atualizado_em, c.fechado_em,
  c.solucao_fechamento, c.fechado_por_id, fc.nome AS fechado_por_nome,
  c.motivo_cancelamento, c.cancelado_em, c.cancelado_por_id, cc.nome AS cancelado_por_nome,
  u.id AS usuario_id, u.nome AS usuario_nome,
  a.id AS atendente_id, a.nome AS atendente_nome
`;
const JUNCOES = `
  FROM chamados c
  JOIN usuarios u ON u.id = c.usuario_id
  LEFT JOIN usuarios a ON a.id = c.atendente_id
  LEFT JOIN usuarios fc ON fc.id = c.fechado_por_id
  LEFT JOIN usuarios cc ON cc.id = c.cancelado_por_id
`;

function paraPublico(linha) {
  return {
    id: linha.id,
    descricao: linha.descricao,
    tipo: linha.tipo,
    setorResponsavel: linha.setor_responsavel ?? null,
    evento: linha.evento,
    solicitacao: linha.solicitacao,
    imagem1: linha.imagem1_path ? `/uploads/${linha.imagem1_path}` : null,
    imagem2: linha.imagem2_path ? `/uploads/${linha.imagem2_path}` : null,
    status: linha.cancelado_em ? 'cancelado' : linha.status,
    cancelado: Boolean(linha.cancelado_em),
    motivoCancelamento: linha.motivo_cancelamento ?? null,
    canceladoEm: linha.cancelado_em ?? null,
    canceladoPor: linha.cancelado_por_id ? { id: linha.cancelado_por_id, nome: linha.cancelado_por_nome } : null,
    solucaoFechamento: linha.solucao_fechamento ?? null,
    fechadoPor: linha.fechado_por_id ? { id: linha.fechado_por_id, nome: linha.fechado_por_nome } : null,
    restrito: Boolean(linha.restrito),
    usuario: { id: linha.usuario_id, nome: linha.usuario_nome },
    atendente: linha.atendente_id ? { id: linha.atendente_id, nome: linha.atendente_nome } : null,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    fechadoEm: linha.fechado_em,
  };
}

export function listar({ tipo, incluirCancelados = false } = {}) {
  const condicoes = [];
  const params = [];
  if (!incluirCancelados) condicoes.push('c.cancelado_em IS NULL');
  if (tipo) { condicoes.push('c.tipo = ?'); params.push(tipo); }
  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  return db.prepare(`SELECT ${CAMPOS} ${JUNCOES} ${onde} ORDER BY c.id DESC`).all(...params).map(paraPublico);
}

export function buscar(id) {
  const linha = db.prepare(`SELECT ${CAMPOS} ${JUNCOES} WHERE c.id = ?`).get(id);
  return linha ? paraPublico(linha) : undefined;
}

export const buscarCru = (id) => db.prepare('SELECT * FROM chamados WHERE id = ?').get(id);

export function criar({ usuarioId, descricao, tipo, setorResponsavel, evento, solicitacao, imagem1Path, imagem2Path }) {
  const info = db.prepare(`INSERT INTO chamados (usuario_id, descricao, tipo, setor_responsavel, evento, solicitacao, imagem1_path, imagem2_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, descricao, tipo, setorResponsavel ?? null, evento ?? null, solicitacao ?? null, imagem1Path ?? null, imagem2Path ?? null);
  return buscar(info.lastInsertRowid);
}

export function atualizarConteudo(id, { descricao, tipo, setorResponsavel, evento, solicitacao, imagem1Path, imagem2Path }) {
  const atual = buscarCru(id);
  if (!atual || atual.cancelado_em || atual.status !== 'aberto') return undefined;
  const resultado = db.prepare(`UPDATE chamados SET descricao=?, tipo=?, setor_responsavel=?, evento=?, solicitacao=?, imagem1_path=?, imagem2_path=?, atualizado_em=?
    WHERE id=? AND status='aberto' AND cancelado_em IS NULL`)
    .run(descricao ?? atual.descricao, tipo ?? atual.tipo,
      setorResponsavel !== undefined ? setorResponsavel : atual.setor_responsavel,
      evento !== undefined ? evento : atual.evento, solicitacao !== undefined ? solicitacao : atual.solicitacao,
      imagem1Path !== undefined ? imagem1Path : atual.imagem1_path,
      imagem2Path !== undefined ? imagem2Path : atual.imagem2_path,
      new Date().toISOString().slice(0, 19).replace('T', ' '), id);
  return resultado.changes ? buscar(id) : undefined;
}

export function marcarEmAndamento(id, { usuarioId }) {
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const resultado = db.prepare(`UPDATE chamados
    SET status='em_andamento', atendente_id=?, atualizado_em=?
    WHERE id=? AND status='aberto' AND cancelado_em IS NULL`)
    .run(usuarioId, agora, id);
  return resultado.changes ? buscar(id) : undefined;
}

export function fechar(id, { solucao, usuarioId }) {
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const resultado = db.prepare(`UPDATE chamados SET status='fechado', solucao_fechamento=?, fechado_por_id=?, fechado_em=?, atualizado_em=?
    WHERE id=? AND status!='fechado' AND cancelado_em IS NULL`).run(solucao, usuarioId, agora, agora, id);
  return resultado.changes ? buscar(id) : undefined;
}

export function cancelar(id, { motivo, usuarioId }) {
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const resultado = db.prepare(`UPDATE chamados SET motivo_cancelamento=?, cancelado_por_id=?, cancelado_em=?, atualizado_em=?
    WHERE id=? AND cancelado_em IS NULL`).run(motivo, usuarioId, agora, agora, id);
  return resultado.changes ? buscar(id) : undefined;
}


/** Exclusão definitiva de um chamado aberto; dados relacionados não são apagados em cascata. */
export function excluir(id) {
  const resultado = db.prepare("DELETE FROM chamados WHERE id = ?").run(id);
  return resultado.changes > 0;
}
