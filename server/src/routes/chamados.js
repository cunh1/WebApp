import { Router } from 'express';
import { removerImagem } from '../servicos/uploads.js';
import { ErroHttp } from '../erros.js';
import { exigirLogin } from '../middlewares/autenticacao.js';
import { salvarImagemBase64 } from '../servicos/uploads.js';
import * as chamados from '../repositories/chamados.js';

const router = Router();
router.use(exigirLogin);
const TIPOS_VALIDOS = ['Manutenção', 'T.I'];
const SETORES = ['TI', 'Manutenção'];
const setorCargo = (cargo) => cargo === 'ti' ? 'TI' : cargo === 'manutencao' ? 'Manutenção' : null;
const idDe = (req) => { const id = Number(req.params.id); return Number.isInteger(id) && id > 0 ? id : null; };
const texto = (v) => typeof v === 'string' ? v.trim() : '';
function carregarChamado(req, res, next) {
  const id = idDe(req), chamado = id !== null && chamados.buscar(id);
  if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });
  req.chamado = chamado; next();
}
function validarCampos(c, { obrigatorios = false } = {}) {
  const erros = [], descricao = texto(c.descricao), tipo = texto(c.tipo);
  if (obrigatorios || c.descricao !== undefined) {
    if (!descricao) erros.push('descrição do chamado é obrigatória');
    else if (descricao.length > 2000) erros.push('descrição muito longa (máx. 2000 caracteres)');
  }
  if (obrigatorios || c.tipo !== undefined) if (!TIPOS_VALIDOS.includes(tipo)) erros.push(`tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}`);
  if (c.setorResponsavel !== undefined && !SETORES.includes(c.setorResponsavel)) erros.push('selecione um setor responsável válido');
  if (typeof c.solicitacao === 'string' && c.solicitacao.length > 4000) erros.push('solicitação muito longa (máx. 4000 caracteres)');
  return erros;
}
function podeOperarSetor(req, chamado) {
  if (req.usuario.papel === 'admin') return true;
  const setorPermitido = setorCargo(req.usuario.papel);
  return Boolean(setorPermitido && chamado.setorResponsavel === setorPermitido);
}
router.get('/', (req, res) => {
  const tipo = typeof req.query.tipo === 'string' && req.query.tipo.trim() ? req.query.tipo.trim() : undefined;
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) throw new ErroHttp(400, `tipo inválido: ${tipo}`);
  const incluirCancelados = req.query.incluirCancelados === '1';
  res.json(chamados.listar({ tipo, incluirCancelados }));
});
router.get('/:id', carregarChamado, (req, res) => res.json(req.chamado));
router.post('/', (req, res) => {
  const c = req.body ?? {}, erros = validarCampos(c, { obrigatorios: true });
  const setorResponsavel = c.setorResponsavel;
  if (!SETORES.includes(setorResponsavel)) erros.push('selecione o setor de destino do chamado');
  if (erros.length) return res.status(400).json({ erros });
  const tipo = setorResponsavel === 'TI' ? 'T.I' : 'Manutenção';
  const imagem1Path = salvarImagemBase64(c.imagem1), imagem2Path = salvarImagemBase64(c.imagem2);
  const chamado = chamados.criar({ usuarioId: req.usuario.id, descricao: texto(c.descricao), tipo, setorResponsavel,
    evento: texto(c.evento) || null, solicitacao: texto(c.solicitacao) || null, imagem1Path, imagem2Path });
  res.status(201).json(chamado);
});

router.put('/:id', carregarChamado, (req, res) => {
  const atual = req.chamado, c = req.body ?? {}, cargo = req.usuario.papel;
  if (atual.cancelado) return res.status(409).json({ erro: 'Chamados cancelados não podem ser alterados.' });
  if (c.status !== undefined) {
    if (c.status !== 'fechado') return res.status(400).json({ erro: 'Não é permitido reabrir ou alterar o status por esta operação.' });
    if (atual.status === 'fechado') return res.status(409).json({ erro: 'Este chamado já está fechado.' });
    if (!podeOperarSetor(req, atual)) return res.status(403).json({ erro: 'Você não tem permissão para fechar chamados deste setor.' });
    const solucao = texto(c.solucao ?? c.solucaoFechamento);
    if (!solucao) return res.status(400).json({ erro: 'Informe a solução aplicada antes de fechar o chamado.' });
    if (solucao.length > 4000) return res.status(400).json({ erro: 'A solução deve ter no máximo 4000 caracteres.' });
    return res.json(chamados.fechar(atual.id, { solucao, usuarioId: req.usuario.id }));
  }
  if (cargo !== 'admin' && atual.usuario.id !== req.usuario.id) return res.status(403).json({ erro: 'Somente quem abriu o chamado ou um administrador pode editá-lo.' });
  if (atual.status !== 'aberto') return res.status(409).json({ erro: 'Somente chamados abertos podem ser editados.' });
  if (cargo === 'usuario') return res.status(403).json({ erro: 'Usuários sem setor podem apenas abrir chamados.' });
  const erros = validarCampos(c);
  const setorDerivadoDoTipo = c.tipo === 'T.I' ? 'TI' : c.tipo === 'Manutenção' ? 'Manutenção' : undefined;
  // Registros legados podem ter setor_responsavel nulo. Inferimos o setor a partir
  // do tipo persistido para que o autor possa editar os demais campos sem parecer
  // que está tentando mudar o setor. O valor nunca vem da identidade enviada pelo cliente.
  const setorAtualEfetivo = atual.setorResponsavel
    ?? (atual.tipo === 'T.I' ? 'TI' : atual.tipo === 'Manutenção' ? 'Manutenção' : null);
  if (c.setorResponsavel !== undefined && c.setorResponsavel !== setorAtualEfetivo && cargo !== 'admin') erros.push('Somente administradores podem alterar o setor de um chamado existente.');
  if (setorDerivadoDoTipo && setorDerivadoDoTipo !== setorAtualEfetivo && cargo !== 'admin') erros.push('Somente administradores podem alterar o setor de um chamado existente.');
  if (c.setorResponsavel !== undefined && setorDerivadoDoTipo && c.setorResponsavel !== setorDerivadoDoTipo) erros.push('O tipo e o setor responsável devem corresponder.');
  for (const campo of ['imagem1', 'imagem2']) {
    if (c[campo] !== undefined && c[campo] !== null && (typeof c[campo] !== 'string' || !c[campo].startsWith('data:'))) {
      erros.push(`${campo} deve ser uma nova imagem ou null para removê-la`);
    }
  }
  if (erros.length) return res.status(400).json({ erros });
  const imagem1Path = c.imagem1 !== undefined ? (c.imagem1 === null ? null : salvarImagemBase64(c.imagem1)) : undefined;
  let imagem2Path;
  try {
    imagem2Path = c.imagem2 !== undefined ? (c.imagem2 === null ? null : salvarImagemBase64(c.imagem2)) : undefined;
  } catch (erro) {
    // Se o segundo anexo falhar na validação, não deixe órfã a primeira imagem já gravada.
    if (imagem1Path) removerImagem(imagem1Path);
    throw erro;
  }
  const setorResponsavel = c.setorResponsavel !== undefined
    ? c.setorResponsavel
    : (cargo === 'admin' ? setorDerivadoDoTipo : (atual.setorResponsavel ?? setorAtualEfetivo ?? undefined));
  const tipo = setorResponsavel === 'TI' ? 'T.I' : setorResponsavel === 'Manutenção' ? 'Manutenção' : (c.tipo ?? atual.tipo);
  let atualizado;
  try {
    atualizado = chamados.atualizarConteudo(atual.id, { descricao: c.descricao !== undefined ? texto(c.descricao) : undefined,
      tipo, setorResponsavel, evento: c.evento !== undefined ? texto(c.evento) || null : undefined,
      solicitacao: c.solicitacao !== undefined ? texto(c.solicitacao) || null : undefined, imagem1Path, imagem2Path });
  } catch (erro) {
    if (imagem1Path) removerImagem(imagem1Path);
    if (imagem2Path) removerImagem(imagem2Path);
    throw erro;
  }
  if (!atualizado) {
    if (imagem1Path) removerImagem(imagem1Path);
    if (imagem2Path) removerImagem(imagem2Path);
    return res.status(409).json({ erro: 'O chamado deixou de estar disponível para edição. Atualize a página e tente novamente.' });
  }
  // Remove anexos antigos somente depois de confirmar a persistência da atualização.
  if (c.imagem1 !== undefined && atual.imagem1 !== atualizado.imagem1) removerImagem(atual.imagem1?.split('/').pop());
  if (c.imagem2 !== undefined && atual.imagem2 !== atualizado.imagem2) removerImagem(atual.imagem2?.split('/').pop());
  res.json(atualizado);
});

// Exclusão definitiva separada do DELETE legado, que continua significando cancelamento.
router.delete('/:id/excluir', carregarChamado, (req, res) => {
  const atual = req.chamado;
  // Exclusão definitiva é uma decisão exclusiva do autor, independentemente do cargo.
  // A identidade é obtida do chamado persistido e da sessão autenticada, nunca do cliente.
  const ehAutor = atual.usuario?.id === req.usuario.id;
  if (!ehAutor) {
    return res.status(403).json({ erro: 'Somente quem abriu este chamado pode excluí-lo.' });
  }
  // Chamados encerrados/cancelados preservam seu histórico; não são removidos definitivamente.
  if (atual.status === 'fechado' || atual.cancelado) {
    return res.status(409).json({ erro: 'Chamados fechados ou cancelados não podem ser excluídos.' });
  }
  if (req.usuario.papel === 'usuario') return res.status(403).json({ erro: 'Usuários sem setor podem apenas abrir chamados.' });
  const cru = chamados.buscarCru(atual.id);
  if (!chamados.excluir(atual.id)) return res.status(404).json({ erro: 'Chamado não encontrado.' });
  removerImagem(cru?.imagem1_path);
  removerImagem(cru?.imagem2_path);
  return res.status(204).end();
});

router.delete('/:id', carregarChamado, (req, res) => {
  const atual = req.chamado;
  if (atual.cancelado) return res.status(409).json({ erro: 'Este chamado já foi cancelado.' });
  if (!podeOperarSetor(req, atual)) return res.status(403).json({ erro: 'Você não tem permissão para cancelar chamados deste setor.' });
  const motivo = texto(req.body?.motivo ?? req.body?.motivoCancelamento);
  if (!motivo) return res.status(400).json({ erro: 'Informe o motivo do cancelamento.' });
  if (motivo.length > 4000) return res.status(400).json({ erro: 'O motivo deve ter no máximo 4000 caracteres.' });
  const cancelado = chamados.cancelar(atual.id, { motivo, usuarioId: req.usuario.id });
  res.json(cancelado);
});
export default router;
