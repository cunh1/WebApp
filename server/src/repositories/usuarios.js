import { db, emTransacao } from '../db/connection.js';
import { removerImagem } from '../servicos/uploads.js';

export const paraPublico = (u) => ({
  id: u.id, nome: u.nome, login: u.login,
  papel: u.cargo || u.papel || 'usuario',
  cargo: u.cargo || u.papel || 'usuario',
  setor: u.setor ?? null,
  ativo: u.ativo === undefined ? true : Boolean(u.ativo),
});
export const buscarPorLogin = (login) => db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
export const buscarPorId = (id) => db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
export function listar({ busca } = {}) {
  const sql = `SELECT id, nome, login, papel, cargo, setor, ativo FROM usuarios`;
  if (busca && busca.trim()) {
    const termo = `%${busca.trim()}%`;
    return db.prepare(`${sql} WHERE nome LIKE ? OR login LIKE ? ORDER BY nome`).all(termo, termo).map(paraPublico);
  }
  return db.prepare(`${sql} ORDER BY nome`).all().map(paraPublico);
}
export const contarAdmins = () => db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE cargo = 'admin'").get().n;
export function criar({ nome, login, senhaHash, papel = 'usuario', cargo = papel, setor = null }) {
  const legado = cargo === 'admin' ? 'admin' : 'usuario';
  const info = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, cargo, setor) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nome, login, senhaHash, legado, cargo, setor);
  return buscarPorId(info.lastInsertRowid);
}
export function atualizar(id, { nome, login, senhaHash, papel, cargo, setor }) {
  const atual = buscarPorId(id);
  if (!atual) return undefined;
  const cargoFinal = cargo !== undefined ? cargo : (papel !== undefined ? papel : atual.cargo);
  const legado = cargoFinal === 'admin' ? 'admin' : 'usuario';
  db.prepare(`UPDATE usuarios SET nome=?, login=?, senha_hash=?, papel=?, cargo=?, setor=?, atualizado_em=datetime('now') WHERE id=?`)
    .run(nome ?? atual.nome, login ?? atual.login, senhaHash ?? atual.senha_hash, legado, cargoFinal,
      setor !== undefined ? setor : atual.setor, id);
  return buscarPorId(id);
}
export function removerComChamados(id) {
  const imagens = emTransacao(() => {
    const chamados = db.prepare('SELECT imagem1_path, imagem2_path FROM chamados WHERE usuario_id = ?').all(id);
    db.prepare('DELETE FROM chamados WHERE usuario_id = ?').run(id);
    const resultado = db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    if (!resultado.changes) throw new Error('Usuário deixou de existir durante a exclusão');
    return chamados.flatMap((chamado) => [chamado.imagem1_path, chamado.imagem2_path]).filter(Boolean);
  });
  // Arquivos só são removidos depois do commit; uma falha no banco nunca deixa
  // chamados apontando para anexos apagados.
  const imagemAindaUsada = db.prepare('SELECT 1 FROM chamados WHERE imagem1_path = ? OR imagem2_path = ? LIMIT 1');
  for (const imagem of new Set(imagens)) {
    if (!imagemAindaUsada.get(imagem, imagem)) removerImagem(imagem);
  }
  return true;
}
export const contarChamadosDe = (id) => db.prepare('SELECT COUNT(*) AS n FROM chamados WHERE usuario_id = ?').get(id).n;
