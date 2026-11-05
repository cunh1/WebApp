import { Router } from 'express';
import { exigirLogin, exigirPapel } from '../middlewares/autenticacao.js';
import { hashSenha, validarSenha } from '../auth/senha.js';
import * as usuarios from '../repositories/usuarios.js';
import { db } from '../db/connection.js';

const router = Router();
router.use(exigirLogin, exigirPapel('admin'));
const CARGOS = ['usuario', 'admin', 'ti', 'manutencao'];
function idDe(req) { const id = Number(req.params.id); return Number.isInteger(id) && id > 0 ? id : null; }
function normalizarLogin(v) { return typeof v === 'string' ? v.trim() : ''; }
function validarCampos(c, { senhaObrigatoria }) {
  const erros = [], nome = typeof c.nome === 'string' ? c.nome.trim() : '', login = normalizarLogin(c.login);
  if (senhaObrigatoria || c.nome !== undefined) { if (!nome) erros.push('nome é obrigatório'); else if (nome.length > 120) erros.push('nome muito longo (máx. 120 caracteres)'); }
  if (senhaObrigatoria || c.login !== undefined) { if (!login) erros.push('login é obrigatório'); else if (login.length > 60) erros.push('login muito longo (máx. 60 caracteres)'); }
  if (senhaObrigatoria || c.senha !== undefined) erros.push(...validarSenha(c.senha));
  const cargo = c.cargo ?? c.papel;
  if (cargo !== undefined && !CARGOS.includes(cargo)) erros.push(`cargo deve ser um de: ${CARGOS.join(', ')}`);
  let setor = c.setor;
  if (cargo === 'ti') setor = 'TI';
  if (cargo === 'manutencao') setor = 'Manutenção';
  if ((setor !== undefined && setor !== null && !['TI', 'Manutenção'].includes(setor))) erros.push('setor inválido');
  if ((cargo === 'admin' || cargo === 'usuario') && setor === undefined) setor = null;
  return { erros, nome, login, cargo, setor };
}
router.get('/usuarios', (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca : undefined;
  res.json(usuarios.listar({ busca }));
});
router.post('/usuarios', async (req, res) => {
  const c = req.body ?? {};
  const v = validarCampos(c, { senhaObrigatoria: true });
  if (v.erros.length) return res.status(400).json({ erros: v.erros });
  if (usuarios.buscarPorLogin(v.login)) return res.status(409).json({ erro: 'Já existe uma conta com esse login' });
  const senhaHash = await hashSenha(c.senha);
  const cargo = v.cargo || 'usuario';
  const setor = cargo === 'ti' ? 'TI' : cargo === 'manutencao' ? 'Manutenção' : (v.setor ?? null);
  const criado = usuarios.criar({ nome: v.nome, login: v.login, senhaHash, cargo, papel: cargo, setor });
  res.status(201).json(usuarios.paraPublico(criado));
});
router.put('/usuarios/:id', async (req, res) => {
  const id = idDe(req), alvo = id !== null && usuarios.buscarPorId(id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const c = req.body ?? {}, v = validarCampos(c, { senhaObrigatoria: false });
  if (v.erros.length) return res.status(400).json({ erros: v.erros });
  if (c.login !== undefined && v.login !== alvo.login && usuarios.buscarPorLogin(v.login)) return res.status(409).json({ erro: 'Já existe uma conta com esse login' });
  const cargoNovo = v.cargo ?? alvo.cargo ?? alvo.papel;
  if (alvo.cargo === 'admin' && cargoNovo !== 'admin' && usuarios.contarAdmins() <= 1) return res.status(409).json({ erro: 'Não é possível remover o último administrador do sistema' });
  const senhaHash = c.senha !== undefined ? await hashSenha(c.senha) : undefined;
  const setor = cargoNovo === 'ti' ? 'TI' : cargoNovo === 'manutencao' ? 'Manutenção' : (c.setor !== undefined ? v.setor : (c.cargo !== undefined || c.papel !== undefined ? null : alvo.setor));
  const atualizado = usuarios.atualizar(id, {
    nome: c.nome !== undefined ? v.nome : undefined, login: c.login !== undefined ? v.login : undefined,
    senhaHash, cargo: c.cargo !== undefined || c.papel !== undefined ? cargoNovo : undefined,
    setor: c.setor !== undefined || c.cargo !== undefined || c.papel !== undefined ? setor : undefined,
  });
  res.json(usuarios.paraPublico(atualizado));
});
router.patch('/usuarios/:id/ativo', (req, res) => {
  const id = idDe(req), alvo = id !== null && usuarios.buscarPorId(id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const ativo = req.body?.ativo;
  if (typeof ativo !== 'boolean') return res.status(400).json({ erro: 'Informe ativo como booleano' });
  if (id === req.usuario.id && !ativo) return res.status(400).json({ erro: 'Não é possível desativar a própria conta' });
  if (!ativo && (alvo.cargo || alvo.papel) === 'admin' && usuarios.contarAdmins() <= 1) return res.status(409).json({ erro: 'Não é possível desativar o último administrador' });
  db.prepare("UPDATE usuarios SET ativo=?, atualizado_em=datetime('now') WHERE id=?").run(ativo ? 1 : 0, id);
  if (!ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(id);
  res.json(usuarios.paraPublico(usuarios.buscarPorId(id)));
});
router.delete('/usuarios/:id', (req, res) => {
  const id = idDe(req), alvo = id !== null && usuarios.buscarPorId(id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado' });
  if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode excluir a própria conta' });
  if ((alvo.cargo || alvo.papel) === 'admin' && usuarios.contarAdmins() <= 1) return res.status(409).json({ erro: 'Não é possível excluir o último administrador' });
  usuarios.removerComChamados(id);
  res.status(204).end();
});
export default router;
