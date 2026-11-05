import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'webapp-test-'));
process.env.DB_PATH = path.join(pasta, 'teste.sqlite');
process.env.UPLOADS_PATH = path.join(pasta, 'uploads');
process.env.SCRYPT_N = '1024'; // mais rápido nos testes; não usado em produção

const { db } = await import('../src/db/connection.js');
const { migrar } = await import('../src/db/migrate.js');
const { config } = await import('../src/config.js');
const auth = await import('../src/auth/servico.js');
const { hashSenha, validarSenha } = await import('../src/auth/senha.js');
const usuariosRepo = await import('../src/repositories/usuarios.js');
const chamadosRepo = await import('../src/repositories/chamados.js');
const uploads = await import('../src/servicos/uploads.js');

migrar(db, config.pastaMigracoes);

after(() => {
  db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function criarUsuario(login, senha = 'senha12345', papel = 'usuario') {
  return usuariosRepo.criar({ nome: login, login, senhaHash: await hashSenha(senha), papel, cargo: papel });
}

test('hash de senha: confere e nunca guarda em texto puro', async () => {
  const hash = await hashSenha('minhasenha123');
  assert.ok(!hash.includes('minhasenha123'));
  const { verificarSenha } = await import('../src/auth/senha.js');
  assert.equal(await verificarSenha('minhasenha123', hash), true);
  assert.equal(await verificarSenha('errada', hash), false);
});

test('validarSenha rejeita curta demais', () => {
  assert.ok(validarSenha('123').length > 0);
  assert.deepEqual(validarSenha('senha12345'), []);
});

test('login: usuário inexistente e senha errada dão a mesma mensagem (401)', async () => {
  await criarUsuario('ana');
  const a = await auth.login({ login: 'ana', senha: 'errada123' }, { ip: '10.0.0.1' }).catch((e) => e);
  const b = await auth.login({ login: 'fantasma', senha: 'errada123' }, { ip: '10.0.0.1' }).catch((e) => e);
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.message, b.message);
});

test('login: credenciais corretas geram sessão válida', async () => {
  await criarUsuario('bruno', 'senha12345');
  const { token, usuario } = await auth.login({ login: 'bruno', senha: 'senha12345' }, { ip: '10.0.0.2' });
  assert.ok(token);
  assert.equal(usuario.login, 'bruno');
  assert.equal(usuario.senha_hash, undefined, 'hash nunca aparece na resposta pública');
});

test('bloqueio por tentativas: 5 falhas travam, mesmo com a senha certa', async () => {
  await criarUsuario('carla', 'senha12345');
  for (let i = 0; i < 5; i++) {
    await auth.login({ login: 'carla', senha: 'errada' }, { ip: '10.0.0.3' }).catch(() => {});
  }
  const erro = await auth.login({ login: 'carla', senha: 'senha12345' }, { ip: '10.0.0.3' }).catch((e) => e);
  assert.equal(erro.status, 429);
});

test('upload de imagem: decodifica base64, valida tipo e tamanho, salva em disco', () => {
  const pngMinusculo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const nome = uploads.salvarImagemBase64(pngMinusculo);
  assert.match(nome, /\.png$/);
  assert.ok(fs.existsSync(path.join(config.pastaUploads, nome)));

  assert.equal(uploads.salvarImagemBase64(null), null);
  assert.equal(uploads.salvarImagemBase64('/uploads/ja-existe.png'), null, 'URL que não é data: é ignorada, não gera arquivo novo');
  assert.throws(() => uploads.salvarImagemBase64('data:application/pdf;base64,AAAA'), /não permitido/);
});

test('chamados: criar, listar, buscar, fechar com solução e cancelar preservando histórico', () => {
  const dono = criarChamadoDeTeste();
  const chamado = chamadosRepo.criar({ usuarioId: dono.id, descricao: 'Ar condicionado quebrado', tipo: 'Manutenção' });
  assert.equal(chamado.descricao, 'Ar condicionado quebrado');
  assert.equal(chamado.status, 'aberto');
  assert.equal(chamado.restrito, false);

  const lista = chamadosRepo.listar({ usuarioId: dono.id, ehAdmin: false });
  assert.ok(lista.some((c) => c.id === chamado.id));

  const fechado = chamadosRepo.fechar(chamado.id, { solucao: 'Peça substituída', usuarioId: dono.id });
  assert.equal(fechado.status, 'fechado');
  assert.equal(fechado.solucaoFechamento, 'Peça substituída');
  assert.ok(fechado.fechadoEm, 'fechado_em é preenchido ao fechar');
  const cancelado = chamadosRepo.cancelar(chamado.id, { motivo: 'Cancelado para teste', usuarioId: dono.id });
  assert.equal(cancelado.cancelado, true);
  assert.equal(cancelado.motivoCancelamento, 'Cancelado para teste');
  assert.equal(chamadosRepo.buscar(chamado.id).descricao, 'Ar condicionado quebrado', 'o fechamento não altera o conteúdo do chamado');
});

test('chamados: filtro por tipo', () => {
  const dono = criarChamadoDeTeste();
  chamadosRepo.criar({ usuarioId: dono.id, descricao: 'Chamado TI', tipo: 'T.I' });
  chamadosRepo.criar({ usuarioId: dono.id, descricao: 'Chamado Manutenção', tipo: 'Manutenção' });

  const soTi = chamadosRepo.listar({ usuarioId: dono.id, ehAdmin: false, tipo: 'T.I' });
  assert.ok(soTi.every((c) => c.tipo === 'T.I'));
  assert.ok(soTi.some((c) => c.descricao === 'Chamado TI'));
});

test('todos os usuários podem consultar chamados restritos conforme a nova regra de visibilidade global autenticada', () => {
  const dono = criarChamadoDeTeste('dono1');
  const outro = criarChamadoDeTeste('outro1');
  const admin = criarChamadoDeTeste('admin1', 'admin');

  const chamado = chamadosRepo.criar({ usuarioId: dono.id, descricao: 'Assunto sensível', tipo: 'T.I' });
  db.prepare('UPDATE chamados SET restrito = 1 WHERE id = ?').run(chamado.id);

  const paraDono = chamadosRepo.listar({ usuarioId: dono.id, ehAdmin: false });
  const paraOutro = chamadosRepo.listar({ usuarioId: outro.id, ehAdmin: false });
  const paraAdmin = chamadosRepo.listar({ usuarioId: admin.id, ehAdmin: true });

  assert.ok(paraDono.some((c) => c.id === chamado.id));
  assert.ok(paraOutro.some((c) => c.id === chamado.id));
  assert.ok(paraAdmin.some((c) => c.id === chamado.id));
});

let contador = 0;
function criarChamadoDeTeste(prefixo = 'u', papel = 'usuario') {
  contador++;
  const login = `${prefixo}${contador}_${Date.now()}`;
  const info = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, cargo) VALUES (?, ?, ?, ?, ?)').run(login, login, 'x', papel === 'admin' ? 'admin' : 'usuario', papel);
  return { id: Number(info.lastInsertRowid), login };
}
