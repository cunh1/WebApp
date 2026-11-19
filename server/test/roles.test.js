import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'webapp-roles-test-'));
process.env.DB_PATH = path.join(pasta, 'teste.sqlite');
process.env.UPLOADS_PATH = path.join(pasta, 'uploads');
process.env.SCRYPT_N = '1024';
const { db } = await import('../src/db/connection.js');
const { migrar } = await import('../src/db/migrate.js');
const { config } = await import('../src/config.js');
const { hashSenha } = await import('../src/auth/senha.js');
const { app } = await import('../src/app.js');
migrar(db, config.pastaMigracoes);
let server, base;
before(async () => { await new Promise(resolve => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); }); });
after(() => { server.close(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });
function cliente() {
  let cookie = '';
  async function call(url, method='GET', body) {
    const r = await fetch(base + url, { method, headers: { ...(cookie ? {Cookie:cookie}:{}), ...(body !== undefined ? {'Content-Type':'application/json'}:{}) }, body: body !== undefined ? JSON.stringify(body):undefined });
    const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
    const data = (r.headers.get('content-type')||'').includes('application/json') ? await r.json().catch(()=>null) : null;
    return { status:r.status, data };
  }
  return { call, login: (l,p)=>call('/auth/login','POST',{login:l,senha:p}), get:u=>call(u), post:(u,b)=>call(u,'POST',b), put:(u,b)=>call(u,'PUT',b), del:(u,b)=>call(u,'DELETE',b) };
}
let n=0;
async function usuario(cargo) {
  const id = ++n, login = `role_${cargo}_${id}`, senha = 'senha12345';
  const hash = await hashSenha(senha);
  db.prepare('INSERT INTO usuarios (nome,login,senha_hash,papel,cargo,setor) VALUES (?,?,?,?,?,?)')
    .run(`${cargo} ${id}`,login,hash,cargo==='admin'?'admin':'usuario',cargo,cargo==='ti'?'TI':cargo==='manutencao'?'Manutenção':null);
  const cli=cliente(); assert.equal((await cli.login(login,senha)).status,200); return { cli, id, nome: `${cargo} ${id}` };
}
const novoChamado = (setor, descricao='Chamado de teste') => ({ descricao, tipo: setor === 'TI' ? 'T.I' : 'Manutenção', setorResponsavel: setor });

test('todos os cargos podem criar chamados para qualquer setor e visualizar ambos os setores', async () => {
  const admin=await usuario('admin'), ti=await usuario('ti'), manut=await usuario('manutencao'), comum=await usuario('usuario');
  const criados=[];
  for (const pessoa of [admin,ti,manut,comum]) {
    for (const setor of ['TI','Manutenção']) {
      const r=await pessoa.cli.post('/chamados',novoChamado(setor,`${pessoa.nome} -> ${setor}`));
      assert.equal(r.status,201,JSON.stringify(r.data)); criados.push(r.data);
    }
  }
  for (const pessoa of [admin,ti,manut,comum]) {
    const lista=await pessoa.cli.get('/chamados'); assert.equal(lista.status,200);
    for (const chamado of criados) {
      assert.ok(lista.data.some(c=>c.id===chamado.id),`${pessoa.nome} não viu chamado ${chamado.id}`);
      assert.equal((await pessoa.cli.get(`/chamados/${chamado.id}`)).status,200);
    }
  }
});

test('usuário comum pode editar o próprio chamado aberto, mas não chamados de terceiros', async () => {
  const admin=await usuario('admin'), autor=await usuario('usuario'), outro=await usuario('usuario'), ti=await usuario('ti');
  const criado=await autor.cli.post('/chamados',novoChamado('TI'));
  assert.equal(criado.status,201);
  assert.equal((await outro.cli.put(`/chamados/${criado.data.id}`,{descricao:'invasão'})).status,403);
  assert.equal((await ti.cli.put(`/chamados/${criado.data.id}`,{descricao:'edição operacional'})).status,403);
  assert.equal((await autor.cli.put(`/chamados/${criado.data.id}`,{descricao:'minha edição'})).status,200);
  assert.equal((await admin.cli.put(`/chamados/${criado.data.id}`,{descricao:'edição admin'})).status,200);
  const fechado=await ti.cli.put(`/chamados/${criado.data.id}`,{status:'fechado',solucao:'Ajuste realizado'});
  assert.equal(fechado.status,200);
  assert.equal((await autor.cli.put(`/chamados/${criado.data.id}`,{descricao:'não pode'})).status,409);
});

test('fechamento exige solução e só administrador ou setor correspondente pode fechar', async () => {
  const admin=await usuario('admin'), ti=await usuario('ti'), manut=await usuario('manutencao'), comum=await usuario('usuario');
  const ct=await comum.cli.post('/chamados',novoChamado('TI'));
  const cm=await comum.cli.post('/chamados',novoChamado('Manutenção'));
  assert.equal((await ti.cli.put(`/chamados/${ct.data.id}`,{status:'fechado'})).status,400);
  assert.equal((await manut.cli.put(`/chamados/${ct.data.id}`,{status:'fechado',solucao:'Resolvido'})).status,403);
  assert.equal((await comum.cli.put(`/chamados/${ct.data.id}`,{status:'fechado',solucao:'Resolvido'})).status,403);
  const fechado=await ti.cli.put(`/chamados/${ct.data.id}`,{status:'fechado',solucao:'Mouse substituído'});
  assert.equal(fechado.status,200); assert.equal(fechado.data.solucaoFechamento,'Mouse substituído');
  assert.equal(fechado.data.fechadoPor.nome,ti.nome); assert.ok(fechado.data.fechadoEm);
  const registroFechado=db.prepare('SELECT status, fechado_em, fechado_por_id, cancelado_em, cancelado_por_id FROM chamados WHERE id=?').get(ct.data.id);
  assert.equal(registroFechado.status,'fechado'); assert.ok(registroFechado.fechado_em); assert.equal(registroFechado.fechado_por_id,ti.id);
  assert.equal(registroFechado.cancelado_em,null); assert.equal(registroFechado.cancelado_por_id,null);
  const recarregado=await comum.cli.get(`/chamados/${ct.data.id}`);
  assert.equal(recarregado.data.fechadoPor.id,ti.id); assert.equal(recarregado.data.fechadoEm,fechado.data.fechadoEm);
  assert.ok((await comum.cli.get('/chamados')).data.some(c=>c.id===ct.data.id));
  assert.equal((await manut.cli.put(`/chamados/${cm.data.id}`,{status:'fechado',solucao:'Peça trocada'})).status,200);
  const adminClose=await admin.cli.put(`/chamados/${ct.data.id}`,{status:'fechado',solucao:'Atualização administrativa'});
  assert.equal(adminClose.status,409,'não deve fechar novamente chamado já fechado');
});

test('iniciar atendimento é automático, atribui o atendente e usa as mesmas permissões do fechamento', async () => {
  const admin = await usuario('admin');
  const ti = await usuario('ti');
  const manut = await usuario('manutencao');
  const comum = await usuario('usuario');
  const chamadoTI = await comum.cli.post('/chamados', novoChamado('TI', 'Atendimento TI'));
  const chamadoManut = await comum.cli.post('/chamados', novoChamado('Manutenção', 'Atendimento manutenção'));
  const idTI = chamadoTI.data.id;

  assert.equal((await comum.cli.post(`/chamados/${idTI}/andamento`)).status, 403);
  assert.equal((await manut.cli.post(`/chamados/${idTI}/andamento`)).status, 403);
  const iniciado = await ti.cli.post(`/chamados/${idTI}/andamento`);
  assert.equal(iniciado.status, 200, JSON.stringify(iniciado.data));
  assert.equal(iniciado.data.status, 'em_andamento');
  assert.equal(iniciado.data.atendente.id, ti.id);
  assert.equal(iniciado.data.atendente.nome, ti.nome);
  assert.ok(iniciado.data.atualizadoEm);
  assert.equal((await ti.cli.post(`/chamados/${idTI}/andamento`)).status, 409, 'não permite iniciar duas vezes');
  assert.equal((await comum.cli.get(`/chamados/${idTI}`)).data.status, 'em_andamento');
  assert.equal((await ti.cli.put(`/chamados/${idTI}`, { status: 'fechado', solucao: 'Resolvido' })).status, 200,
    'chamado em andamento continua podendo ser fechado pelo operador autorizado');
  assert.equal((await manut.cli.post(`/chamados/${chamadoManut.data.id}/andamento`)).status, 200);
  const chamadoAdmin = await comum.cli.post('/chamados', novoChamado('TI', 'Atendimento iniciado pelo admin'));
  const iniciadoAdmin = await admin.cli.post(`/chamados/${chamadoAdmin.data.id}/andamento`);
  assert.equal(iniciadoAdmin.status, 200, JSON.stringify(iniciadoAdmin.data));
  assert.equal(iniciadoAdmin.data.atendente.id, admin.id);

  const cancelado = await comum.cli.post('/chamados', novoChamado('TI', 'Já cancelado'));
  assert.equal((await ti.cli.del(`/chamados/${cancelado.data.id}`, { motivo: 'duplicado' })).status, 200);
  assert.equal((await ti.cli.post(`/chamados/${cancelado.data.id}/andamento`)).status, 409);
});

test('cancelamento exige motivo, preserva histórico e apenas admin/setor correspondente pode cancelar', async () => {
  const admin=await usuario('admin'), ti=await usuario('ti'), manut=await usuario('manutencao'), comum=await usuario('usuario');
  const ct=await comum.cli.post('/chamados',novoChamado('TI'));
  const cm=await comum.cli.post('/chamados',novoChamado('Manutenção'));
  assert.equal((await ti.cli.del(`/chamados/${cm.data.id}`,{motivo:'duplicado'})).status,403);
  assert.equal((await ti.cli.del(`/chamados/${ct.data.id}`,{motivo:'duplicado'})).status,200);
  const detalhe=await comum.cli.get(`/chamados/${ct.data.id}`);
  assert.equal(detalhe.status,200); assert.equal(detalhe.data.cancelado,true);
  assert.equal(detalhe.data.motivoCancelamento,'duplicado'); assert.equal(detalhe.data.canceladoPor.nome,ti.nome); assert.ok(detalhe.data.canceladoEm);
  const registroCancelado=db.prepare('SELECT status, fechado_em, fechado_por_id, cancelado_em, cancelado_por_id FROM chamados WHERE id=?').get(ct.data.id);
  assert.equal(registroCancelado.status,'aberto'); assert.equal(registroCancelado.fechado_em,null); assert.equal(registroCancelado.fechado_por_id,null);
  assert.ok(registroCancelado.cancelado_em); assert.equal(registroCancelado.cancelado_por_id,ti.id);
  assert.equal((await comum.cli.put(`/chamados/${ct.data.id}`,{descricao:'não pode'})).status,409);
  assert.ok(!(await comum.cli.get('/chamados')).data.some(c=>c.id===ct.data.id));
  assert.ok((await comum.cli.get('/chamados?incluirCancelados=1')).data.some(c=>c.id===ct.data.id));
  assert.equal((await manut.cli.del(`/chamados/${cm.data.id}`,{motivo:'resolvido antes'})).status,200);
  const ca=await comum.cli.post('/chamados',novoChamado('Manutenção'));
  assert.equal((await admin.cli.del(`/chamados/${ca.data.id}`,{motivo:'cancelamento admin'})).status,200);
  assert.equal((await admin.cli.del(`/chamados/${ca.data.id}`,{motivo:'duplo'})).status,409);
});

test('chamados antigos sem setor continuam consultáveis; só admin pode operar neles', async () => {
  const admin=await usuario('admin'), ti=await usuario('ti');
  const r=db.prepare(`INSERT INTO chamados (usuario_id,descricao,tipo,setor_responsavel) VALUES (?, 'Legado sem setor','T.I',NULL)`).run(admin.id);
  assert.equal((await ti.cli.get(`/chamados/${r.lastInsertRowid}`)).status,200);
  assert.equal((await ti.cli.put(`/chamados/${r.lastInsertRowid}`,{status:'fechado',solucao:'feito'})).status,403);
  assert.equal((await admin.cli.put(`/chamados/${r.lastInsertRowid}`,{status:'fechado',solucao:'Classificado e resolvido'})).status,200);
});

test('somente administrador gerencia usuários', async () => {
  const admin=await usuario('admin'), ti=await usuario('ti'), comum=await usuario('usuario');
  assert.equal((await ti.cli.get('/admin/usuarios')).status,403);
  assert.equal((await comum.cli.get('/admin/usuarios')).status,403);
  assert.equal((await admin.cli.get('/admin/usuarios')).status,200);
});


test('edição do autor funciona em chamado legado sem setor_responsavel e mantém campos não alterados', async () => {
  const autor = await usuario('usuario');
  const outro = await usuario('usuario');
  const admin = await usuario('admin');
  const info = db.prepare("INSERT INTO chamados (usuario_id, descricao, tipo, setor_responsavel, evento, solicitacao) VALUES (?, 'Legado', 'T.I', NULL, 'evento antigo', 'texto antigo')").run(autor.id);
  const id = Number(info.lastInsertRowid);
  const tentativaOutro = await outro.cli.put(`/chamados/${id}`, { descricao: 'tentativa indevida', tipo: 'T.I', setorResponsavel: 'TI' });
  assert.equal(tentativaOutro.status, 403);
  assert.equal((await autor.cli.put(`/chamados/${id}`, { descricao: 'Não permitido', tipo: 'T.I', setorResponsavel: 'TI' })).status, 403);
  const edicao = await admin.cli.put(`/chamados/${id}`, { descricao: 'Legado editado', tipo: 'T.I', setorResponsavel: 'TI' });
  assert.equal(edicao.status, 200, JSON.stringify(edicao.data));
  assert.equal(edicao.data.descricao, 'Legado editado');
  assert.equal(edicao.data.evento, 'evento antigo');
  assert.equal(edicao.data.solicitacao, 'texto antigo');
  assert.equal(edicao.data.setorResponsavel, 'TI');
  assert.equal((await admin.cli.get(`/chamados/${id}`)).data.descricao, 'Legado editado');
});

test('edição parcial preserva campos opcionais e autor; autor e admin podem editar, outro usuário não', async () => {
  const admin = await usuario('admin');
  const autor = await usuario('ti');
  const outro = await usuario('usuario');
  const criado = await autor.cli.post('/chamados', { ...novoChamado('TI'), evento: '2', solicitacao: 'Solicitação original' });
  assert.equal(criado.status, 201);
  const id = criado.data.id;

  assert.equal((await cliente().put(`/chamados/${id}`, { descricao: 'Sem sessão' })).status, 401);
  assert.equal((await outro.cli.put(`/chamados/${id}`, { descricao: 'Alteração indevida' })).status, 403);
  const donoEdita = await autor.cli.put(`/chamados/${id}`, { descricao: 'Descrição atualizada' });
  assert.equal(donoEdita.status, 200, JSON.stringify(donoEdita.data));
  assert.equal(donoEdita.data.descricao, 'Descrição atualizada');
  assert.equal(donoEdita.data.evento, '2');
  assert.equal(donoEdita.data.solicitacao, 'Solicitação original');
  assert.equal(donoEdita.data.usuario.id, autor.id);

  const adminEdita = await admin.cli.put(`/chamados/${id}`, { solicitacao: 'Editada pelo admin' });
  assert.equal(adminEdita.status, 200, JSON.stringify(adminEdita.data));
  const consultado = await autor.cli.get(`/chamados/${id}`);
  assert.equal(consultado.status, 200);
  assert.equal(consultado.data.descricao, 'Descrição atualizada');
  assert.equal(consultado.data.solicitacao, 'Editada pelo admin');
  assert.equal(consultado.data.tipo, 'T.I');
  assert.equal(consultado.data.setorResponsavel, 'TI');
  assert.equal((await autor.cli.put('/chamados/999999', { descricao: 'Não deve salvar' })).status, 404);
});

test('edição mantém a restrição para chamados em andamento, fechados e cancelados', async () => {
  const autor = await usuario('usuario');
  const emAndamento = await autor.cli.post('/chamados', novoChamado('TI', 'Em andamento'));
  const fechado = await autor.cli.post('/chamados', novoChamado('Manutenção', 'Fechado'));
  const cancelado = await autor.cli.post('/chamados', novoChamado('TI', 'Cancelado'));
  db.prepare("UPDATE chamados SET status='em_andamento' WHERE id=?").run(emAndamento.data.id);
  db.prepare("UPDATE chamados SET status='fechado' WHERE id=?").run(fechado.data.id);
  db.prepare("UPDATE chamados SET cancelado_em='2026-01-01' WHERE id=?").run(cancelado.data.id);
  for (const chamado of [emAndamento.data, fechado.data, cancelado.data]) {
    assert.equal((await autor.cli.put(`/chamados/${chamado.id}`, { descricao: 'Não editar' })).status, 409);
  }
});

test('edição preserva anexos não enviados, substitui ou remove só quando solicitado e limpa upload se o SQL falhar', async () => {
  const autor = await usuario('ti');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const criado = await autor.cli.post('/chamados', { ...novoChamado('Manutenção'), imagem1: png, imagem2: png });
  assert.equal(criado.status, 201);
  const id = criado.data.id;
  const imagemOriginal = criado.data.imagem1;
  const segundaImagemOriginal = criado.data.imagem2;
  const semAlterarImagens = await autor.cli.put(`/chamados/${id}`, { descricao: 'Só descrição' });
  assert.equal(semAlterarImagens.status, 200, JSON.stringify(semAlterarImagens.data));
  assert.equal(semAlterarImagens.data.imagem1, imagemOriginal);
  assert.ok(semAlterarImagens.data.imagem2);

  const substituicao = await autor.cli.put(`/chamados/${id}`, { imagem1: png, imagem2: null });
  assert.equal(substituicao.status, 200, JSON.stringify(substituicao.data));
  assert.notEqual(substituicao.data.imagem1, imagemOriginal);
  assert.equal(substituicao.data.imagem2, null);
  const imagemNova = substituicao.data.imagem1;
  const nomeImagemNova = imagemNova.split('/').pop();
  const nomesAntigos = [imagemOriginal, segundaImagemOriginal].map(url => url.split('/').pop());
  await new Promise(resolve => setTimeout(resolve, 30));
  for (const nome of nomesAntigos) assert.ok(!fs.existsSync(path.join(process.env.UPLOADS_PATH, nome)), 'anexo substituído/removido é limpo após salvar');
  const arquivosAntesDaFalha = fs.readdirSync(process.env.UPLOADS_PATH).sort();

  db.exec(`CREATE TRIGGER falhar_atualizacao_chamado BEFORE UPDATE ON chamados WHEN OLD.id = ${id} BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`);
  const falha = await autor.cli.put(`/chamados/${id}`, { descricao: 'Não persistir', imagem1: png });
  db.exec('DROP TRIGGER falhar_atualizacao_chamado');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(falha.status, 409);
  const estadoFinal = await autor.cli.get(`/chamados/${id}`);
  assert.equal(estadoFinal.data.descricao, 'Só descrição');
  assert.equal(estadoFinal.data.imagem1, imagemNova);
  assert.ok(fs.existsSync(path.join(process.env.UPLOADS_PATH, nomeImagemNova)), 'anexo persistido continua presente');
  assert.deepEqual(fs.readdirSync(process.env.UPLOADS_PATH).sort(), arquivosAntesDaFalha, 'upload da atualização rejeitada é removido');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('exclusão definitiva: somente o autor pode excluir, independentemente do cargo; fechado preserva histórico', async () => {
  const admin = await usuario('admin');
  const autor = await usuario('ti');
  const outro = await usuario('usuario');
  const criado = await autor.cli.post('/chamados', novoChamado('TI', 'Chamado para excluir'));
  assert.equal(criado.status, 201);
  const id = criado.data.id;

  assert.equal((await outro.cli.del(`/chamados/${id}/excluir`)).status, 403);
  assert.equal((await outro.cli.get(`/chamados/${id}`)).status, 200, 'a tentativa negada não remove o registro');
  assert.equal((await admin.cli.del(`/chamados/${id}/excluir`)).status, 403, 'administrador não pode excluir chamado de terceiro');
  assert.equal((await autor.cli.del(`/chamados/${id}/excluir`)).status, 204);
  assert.equal((await autor.cli.get(`/chamados/${id}`)).status, 404);

  const fechado = await autor.cli.post('/chamados', novoChamado('TI', 'Chamado fechado'));
  const operador = await usuario('ti');
  assert.equal((await operador.cli.put(`/chamados/${fechado.data.id}`, { status: 'fechado', solucao: 'Resolvido' })).status, 200);
  assert.equal((await autor.cli.del(`/chamados/${fechado.data.id}/excluir`)).status, 409);
  assert.equal((await autor.cli.get(`/chamados/${fechado.data.id}`)).status, 200, 'o histórico do chamado fechado permanece');
  assert.equal((await autor.cli.del('/chamados/999999/excluir')).status, 404);
});


test('usuário comum pode excluir definitivamente o próprio chamado aberto, mas não o de terceiros', async () => {
  const autor = await usuario('usuario');
  const outro = await usuario('usuario');
  const criado = await autor.cli.post('/chamados', novoChamado('TI', 'Chamado comum para excluir'));
  assert.equal(criado.status, 201);
  const id = criado.data.id;

  assert.equal((await outro.cli.del(`/chamados/${id}/excluir`)).status, 403);
  assert.equal((await autor.cli.del(`/chamados/${id}/excluir`)).status, 204);
  assert.equal((await autor.cli.get(`/chamados/${id}`)).status, 404);
});

test('exclusão definitiva: TI e Manutenção podem excluir os próprios chamados, mas não os de terceiros', async () => {
  const ti = await usuario('ti');
  const manut = await usuario('manutencao');
  const admin = await usuario('admin');
  const autor = await usuario('usuario');

  const chamadoTI = await ti.cli.post('/chamados', novoChamado('TI', 'Chamado aberto por TI'));
  const chamadoManut = await manut.cli.post('/chamados', novoChamado('Manutenção', 'Chamado aberto por Manutenção'));
  assert.equal(chamadoTI.status, 201);
  assert.equal(chamadoManut.status, 201);

  const chamadoTerceiroTI = await autor.cli.post('/chamados', novoChamado('TI', 'Chamado de terceiro para TI'));
  const chamadoTerceiroManut = await autor.cli.post('/chamados', novoChamado('Manutenção', 'Chamado de terceiro para Manutenção'));
  assert.equal((await ti.cli.del(`/chamados/${chamadoTerceiroTI.data.id}/excluir`)).status, 403);
  assert.equal((await manut.cli.del(`/chamados/${chamadoTerceiroManut.data.id}/excluir`)).status, 403);
  assert.equal((await admin.cli.del(`/chamados/${chamadoTerceiroTI.data.id}/excluir`)).status, 403);

  assert.equal((await ti.cli.del(`/chamados/${chamadoTI.data.id}/excluir`)).status, 204, 'TI pode excluir seu próprio chamado');
  assert.equal((await manut.cli.del(`/chamados/${chamadoManut.data.id}/excluir`)).status, 204, 'Manutenção pode excluir seu próprio chamado');
});
