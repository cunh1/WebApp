// Testes de ponta a ponta das rotas administrativas: sobe o servidor de verdade (porta
// aleatória) e usa fetch nativo do Node, com um "pote de cookies" manual (fetch não
// gerencia cookies entre chamadas sozinho, como um navegador faz).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'webapp-admin-test-'));
process.env.DB_PATH = path.join(pasta, 'teste.sqlite');
process.env.UPLOADS_PATH = path.join(pasta, 'uploads');
process.env.SCRYPT_N = '1024';

const { db } = await import('../src/db/connection.js');
const { migrar } = await import('../src/db/migrate.js');
const { config } = await import('../src/config.js');
const { hashSenha } = await import('../src/auth/senha.js');
const { app } = await import('../src/app.js');

migrar(db, config.pastaMigracoes);

let servidor;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${servidor.address().port}`;
      resolve();
    });
  });
});

after(() => {
  servidor.close();
  db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

// --- pote de cookies simples, um por "sessão de navegador" simulada ---
function criarCliente() {
  let cookie = '';
  async function chamar(caminho, opcoes = {}) {
    const resposta = await fetch(baseUrl + caminho, {
      ...opcoes,
      headers: { ...(opcoes.corpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
    const setCookie = resposta.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const tipo = resposta.headers.get('content-type') || '';
    const dados = tipo.includes('application/json') ? await resposta.json().catch(() => null) : null;
    return { status: resposta.status, dados };
  }
  return {
    login: (login, senha) => chamar('/auth/login', { method: 'POST', corpo: { login, senha } }),
    get: (caminho) => chamar(caminho),
    post: (caminho, corpo) => chamar(caminho, { method: 'POST', corpo }),
    put: (caminho, corpo) => chamar(caminho, { method: 'PUT', corpo }),
    del: (caminho) => chamar(caminho, { method: 'DELETE' }),
  };
}

// --- usuários de apoio para os testes, direto no banco (mais rápido que passar pela API) ---
let contador = 0;
async function criarUsuarioDireto(papel = 'usuario', senha = 'senha12345') {
  contador++;
  const login = `teste${contador}_${Date.now()}`;
  const senhaHash = await hashSenha(senha);
  db.prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, cargo) VALUES (?, ?, ?, ?, ?)').run(`Teste ${contador}`, login, senhaHash, papel === 'admin' ? 'admin' : 'usuario', papel);
  return { login, senha };
}

test('1) usuário comum consegue logar normalmente', async () => {
  const { login, senha } = await criarUsuarioDireto('usuario');
  const cliente = criarCliente();
  const r = await cliente.login(login, senha);
  assert.equal(r.status, 200);
  assert.equal(r.dados.usuario.papel, 'usuario');
});

test('2) admin acessa o gerenciamento de usuários (200) e 3) usuário comum recebe 403', async () => {
  const admin = await criarUsuarioDireto('admin');
  const comum = await criarUsuarioDireto('usuario');

  const clienteAdmin = criarCliente();
  await clienteAdmin.login(admin.login, admin.senha);
  const rAdmin = await clienteAdmin.get('/admin/usuarios');
  assert.equal(rAdmin.status, 200);
  assert.ok(Array.isArray(rAdmin.dados));

  const clienteComum = criarCliente();
  await clienteComum.login(comum.login, comum.senha);
  const rComum = await clienteComum.get('/admin/usuarios');
  assert.equal(rComum.status, 403);
});

test('4) usuário não autenticado recebe 401 nas rotas administrativas', async () => {
  const cliente = criarCliente(); // nunca logou
  const r = await cliente.get('/admin/usuarios');
  assert.equal(r.status, 401);
  const rPost = await cliente.post('/admin/usuarios', { nome: 'X', login: 'x', senha: 'senha12345' });
  assert.equal(rPost.status, 401);
});

test('5) admin cria conta comum e 6) cria conta administrativa', async () => {
  const admin = await criarUsuarioDireto('admin');
  const cliente = criarCliente();
  await cliente.login(admin.login, admin.senha);

  const loginComum = `novo_comum_${Date.now()}`;
  const rComum = await cliente.post('/admin/usuarios', { nome: 'Fulano', login: loginComum, senha: 'senha12345', papel: 'usuario' });
  assert.equal(rComum.status, 201);
  assert.equal(rComum.dados.papel, 'usuario');
  assert.equal(rComum.dados.senha_hash, undefined, 'hash nunca aparece na resposta');

  const loginAdmin = `novo_admin_${Date.now()}`;
  const rAdmin = await cliente.post('/admin/usuarios', { nome: 'Ciclana', login: loginAdmin, senha: 'senha12345', papel: 'admin' });
  assert.equal(rAdmin.status, 201);
  assert.equal(rAdmin.dados.papel, 'admin');

  // o recém-criado realmente consegue logar
  const novoCliente = criarCliente();
  const rLogin = await novoCliente.login(loginAdmin, 'senha12345');
  assert.equal(rLogin.status, 200);
});

test('7) login duplicado é rejeitado', async () => {
  const admin = await criarUsuarioDireto('admin');
  const existente = await criarUsuarioDireto('usuario');
  const cliente = criarCliente();
  await cliente.login(admin.login, admin.senha);

  const r = await cliente.post('/admin/usuarios', { nome: 'Outro', login: existente.login, senha: 'senha12345' });
  assert.equal(r.status, 409);
});

test('8) admin altera dados permitidos de um usuário', async () => {
  const admin = await criarUsuarioDireto('admin');
  const alvo = await criarUsuarioDireto('usuario');
  const alvoId = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(alvo.login).id;

  const cliente = criarCliente();
  await cliente.login(admin.login, admin.senha);
  const r = await cliente.put(`/admin/usuarios/${alvoId}`, { nome: 'Nome Alterado' });
  assert.equal(r.status, 200);
  assert.equal(r.dados.nome, 'Nome Alterado');
});

test('9) admin promove usuário comum e 10) remove privilégio de outro admin', async () => {
  const adminPrincipal = await criarUsuarioDireto('admin');
  const outroAdmin = await criarUsuarioDireto('admin'); // garante que não é o único, para poder rebaixar
  const comum = await criarUsuarioDireto('usuario');
  const idOutroAdmin = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(outroAdmin.login).id;
  const idComum = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(comum.login).id;

  const cliente = criarCliente();
  await cliente.login(adminPrincipal.login, adminPrincipal.senha);

  const rPromover = await cliente.put(`/admin/usuarios/${idComum}`, { papel: 'admin' });
  assert.equal(rPromover.status, 200);
  assert.equal(rPromover.dados.papel, 'admin');

  const rRebaixar = await cliente.put(`/admin/usuarios/${idOutroAdmin}`, { papel: 'usuario' });
  assert.equal(rRebaixar.status, 200);
  assert.equal(rRebaixar.dados.papel, 'usuario');
});

test('11) admin exclui conta respeitando integridade (sem chamados vinculados)', async () => {
  const admin = await criarUsuarioDireto('admin');
  const alvo = await criarUsuarioDireto('usuario');
  const idAlvo = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(alvo.login).id;

  const cliente = criarCliente();
  await cliente.login(admin.login, admin.senha);
  const r = await cliente.del(`/admin/usuarios/${idAlvo}`);
  assert.equal(r.status, 204);
  assert.equal(db.prepare('SELECT id FROM usuarios WHERE id = ?').get(idAlvo), undefined);
});

test('11b) admin exclui usuário e todos os chamados associados, preservando os demais', async () => {
  const admin = await criarUsuarioDireto('admin');
  const autor = await criarUsuarioDireto('usuario');
  const outro = await criarUsuarioDireto('usuario');
  const idAutor = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(autor.login).id;
  const idOutro = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(outro.login).id;
  const insert = db.prepare('INSERT INTO chamados (usuario_id, descricao, tipo, status, cancelado_em, atendente_id) VALUES (?, ?, \'T.I\', ?, ?, ?)');
  const chamadosAlvo = [
    insert.run(idAutor, 'aberto', 'aberto', null, null).lastInsertRowid,
    insert.run(idAutor, 'em andamento', 'em_andamento', null, null).lastInsertRowid,
    insert.run(idAutor, 'encerrado', 'fechado', null, null).lastInsertRowid,
    insert.run(idAutor, 'cancelado', 'aberto', '2026-01-01', null).lastInsertRowid,
  ];
  const chamadoOutro = insert.run(idOutro, 'pertence a outro', 'aberto', null, idAutor).lastInsertRowid;

  const cliente = criarCliente();
  await cliente.login(admin.login, admin.senha);
  const r = await cliente.del(`/admin/usuarios/${idAutor}`);
  assert.equal(r.status, 204);
  assert.equal(db.prepare('SELECT id FROM usuarios WHERE id = ?').get(idAutor), undefined);
  for (const id of chamadosAlvo) assert.equal(db.prepare('SELECT id FROM chamados WHERE id = ?').get(id), undefined);
  assert.ok(db.prepare('SELECT id FROM usuarios WHERE id = ?').get(idOutro), 'outro usuário continua existindo');
  assert.equal(db.prepare('SELECT usuario_id, atendente_id FROM chamados WHERE id = ?').get(chamadoOutro).atendente_id, null, 'referência ao usuário como atendente respeita ON DELETE SET NULL');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('exclusão de usuário inexistente responde 404 sem alterar dados', async () => {
  const admin = await criarUsuarioDireto('admin');
  const cliente = criarCliente(); await cliente.login(admin.login, admin.senha);
  assert.equal((await cliente.del('/admin/usuarios/999999')).status, 404);
});

test('usuário comum não pode excluir diretamente pela API', async () => {
  const comum = await criarUsuarioDireto('usuario');
  const alvo = await criarUsuarioDireto('usuario');
  const idAlvo = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(alvo.login).id;
  const cliente = criarCliente(); await cliente.login(comum.login, comum.senha);
  assert.equal((await cliente.del(`/admin/usuarios/${idAlvo}`)).status, 403);
  assert.ok(db.prepare('SELECT id FROM usuarios WHERE id = ?').get(idAlvo));
});

test('falha ao excluir usuário reverte também a exclusão prévia dos chamados', async () => {
  const admin = await criarUsuarioDireto('admin');
  const alvo = await criarUsuarioDireto('usuario');
  const idAlvo = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(alvo.login).id;
  const chamado = db.prepare("INSERT INTO chamados (usuario_id, descricao, tipo) VALUES (?, 'Rollback', 'T.I')").run(idAlvo).lastInsertRowid;
  db.exec("CREATE TRIGGER falhar_exclusao_usuario BEFORE DELETE ON usuarios WHEN OLD.id = " + idAlvo + " BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
  const cliente = criarCliente(); await cliente.login(admin.login, admin.senha);
  const resposta = await cliente.del(`/admin/usuarios/${idAlvo}`);
  db.exec('DROP TRIGGER falhar_exclusao_usuario');
  assert.equal(resposta.status, 409);
  assert.ok(db.prepare('SELECT id FROM usuarios WHERE id = ?').get(idAlvo));
  assert.ok(db.prepare('SELECT id FROM chamados WHERE id = ?').get(chamado));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('12) não é possível excluir ou rebaixar o último administrador', async () => {
  // Mesmo banco dos outros testes (reimportar connection.js com outro caminho não troca o
  // banco que app.js/repositórios já carregaram — módulos ES são cacheados pelo Node pelo
  // especificador do import, então um "banco isolado" por import dinâmico não funcionaria
  // de verdade aqui). Em vez disso, rebaixa todos os outros admins existentes para sobrar
  // só um — e testa a regra nesse único que restou.
  db.prepare("UPDATE usuarios SET papel = 'usuario', cargo = 'usuario' WHERE cargo = 'admin'").run();
  const unico = await criarUsuarioDireto('admin');
  const idUnico = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(unico.login).id;
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE papel = 'admin'").get().n, 1, 'pré-condição: só 1 admin no banco');

  const cliente = criarCliente();
  await cliente.login(unico.login, unico.senha);

  // Rebaixar: ninguém mais está envolvido, então é a regra do "último admin" (409) que barra.
  const rRebaixar = await cliente.put(`/admin/usuarios/${idUnico}`, { papel: 'usuario' });
  assert.equal(rRebaixar.status, 409);

  // Excluir: aqui o único admin estaria excluindo A SI MESMO, então a regra mais específica
  // (não pode excluir a própria conta) dispara primeiro — 400, não 409. As duas proteções
  // existem; esse teste confirma que pelo menos uma delas sempre barra esse caso.
  const rExcluir = await cliente.del(`/admin/usuarios/${idUnico}`);
  assert.equal(rExcluir.status, 400);
  assert.equal(db.prepare('SELECT papel FROM usuarios WHERE id = ?').get(idUnico).papel, 'admin', 'continua admin');
});

test('13) usuário comum não consegue se autopromover manipulando a requisição', async () => {
  const comum = await criarUsuarioDireto('usuario');
  const idComum = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(comum.login).id;

  const cliente = criarCliente();
  await cliente.login(comum.login, comum.senha);
  const r = await cliente.put(`/admin/usuarios/${idComum}`, { papel: 'admin' });
  assert.equal(r.status, 403); // a rota inteira é bloqueada para quem não é admin, nem chega a olhar o corpo
  assert.equal(db.prepare('SELECT papel FROM usuarios WHERE id = ?').get(idComum).papel, 'usuario');
});

test('14) excluir uma conta invalida a sessão ativa dela imediatamente', async () => {
  const admin = await criarUsuarioDireto('admin');
  const alvo = await criarUsuarioDireto('usuario');
  const idAlvo = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(alvo.login).id;

  const clienteAlvo = criarCliente();
  const rLoginAlvo = await clienteAlvo.login(alvo.login, alvo.senha);
  assert.equal(rLoginAlvo.status, 200);
  assert.equal((await clienteAlvo.get('/auth/eu')).status, 200, 'sessão válida antes da exclusão');

  const clienteAdmin = criarCliente();
  await clienteAdmin.login(admin.login, admin.senha);
  assert.equal((await clienteAdmin.del(`/admin/usuarios/${idAlvo}`)).status, 204);

  const rDepois = await clienteAlvo.get('/auth/eu'); // mesmo cookie de antes, sem logar de novo
  assert.equal(rDepois.status, 401, 'sessão antiga não funciona mais depois da exclusão');
});

test('15) mudança de privilégio vale na sessão já aberta, sem precisar logar de novo', async () => {
  const admin = await criarUsuarioDireto('admin');
  const comum = await criarUsuarioDireto('usuario');
  const idComum = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(comum.login).id;

  const clienteComum = criarCliente();
  await clienteComum.login(comum.login, comum.senha);
  assert.equal((await clienteComum.get('/admin/usuarios')).status, 403, 'ainda não é admin');

  const clienteAdmin = criarCliente();
  await clienteAdmin.login(admin.login, admin.senha);
  await clienteAdmin.put(`/admin/usuarios/${idComum}`, { papel: 'admin' });

  // MESMO cookie de antes da promoção — nenhum novo login foi feito.
  const rDepois = await clienteComum.get('/admin/usuarios');
  assert.equal(rDepois.status, 200, 'a promoção já vale na próxima requisição da sessão existente');
});

test('16) login, logout e CRUD de chamados continuam funcionando', async () => {
  const usuario = await criarUsuarioDireto('usuario');
  const cliente = criarCliente();
  assert.equal((await cliente.login(usuario.login, usuario.senha)).status, 200);

  const rCriar = await cliente.post('/chamados', { descricao: 'Teste pós-migração', tipo: 'T.I', setorResponsavel: 'TI' });
  assert.equal(rCriar.status, 201);
  const rListar = await cliente.get('/chamados');
  assert.equal(rListar.status, 200);
  assert.ok(rListar.dados.some((c) => c.id === rCriar.dados.id));

  assert.equal((await cliente.post('/auth/logout', undefined)).status, 204);
  assert.equal((await cliente.get('/auth/eu')).status, 401);
});
