let usuarioAtual = null;
let usuarioEmEdicaoId = null; // null = modo "criar"; número = modo "editar"

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mostrarMensagem(texto, tipo) {
    window.showToast(texto, tipo === 'sucesso' ? 'success' : tipo === 'aviso' ? 'warning' : 'error');
}

// ---------------------------------------------------------------------------------------
// Sessão: a tela só é usável por quem está logado E é admin. A checagem no servidor em
// cada rota de /admin já garante a segurança de verdade; este redirecionamento é só para
// não deixar um usuário comum "preso" numa tela cujas ações vão falhar com 403.
// ---------------------------------------------------------------------------------------
async function verificarSessao() {
    try {
        const resposta = await fetch('/auth/eu', { credentials: 'include' });
        if (!resposta.ok) throw new Error('sem sessão');
        const dados = await resposta.json();
        usuarioAtual = dados.usuario;
        if (usuarioAtual.papel !== 'admin') {
            window.location.href = 'home.html';
            return;
        }
        window.configurarMenuPerfil(usuarioAtual);
        carregarUsuarios();
    } catch {
        window.location.href = 'inicial.html';
    }
}

document.getElementById('sair').addEventListener('click', async function() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    window.location.href = 'inicial.html';
});

// ---------------------------------------------------------------------------------------
// Listagem + busca
// ---------------------------------------------------------------------------------------
const corpoTabela = document.getElementById('corpoUsuarios');
const tabela = document.getElementById('tabelaUsuarios');
const carregando = document.getElementById('carregando');
const listaVazia = document.getElementById('listaVazia');
let usuariosCarregados = false;

async function carregarUsuarios() {
    const termo = document.getElementById('busca').value.trim();
    if (!usuariosCarregados) {
        tabela.classList.remove('com-registros');
        listaVazia.hidden = true;
        carregando.style.display = 'block';
    }

    try {
        const url = termo ? `/admin/usuarios?busca=${encodeURIComponent(termo)}` : '/admin/usuarios';
        const resposta = await fetch(url, { credentials: 'include' });
        if (resposta.status === 401) return window.location.href = 'inicial.html';
        if (resposta.status === 403) return window.location.href = 'home.html';
        if (!resposta.ok) throw new Error('Falha ao carregar usuários');

        const lista = await resposta.json();
        usuariosCarregados = true;
        carregando.style.display = 'none';
        if (!lista.length) {
            tabela.classList.remove('com-registros');
            const buscando = Boolean(termo);
            document.getElementById('listaVaziaTitulo').textContent = buscando
                ? 'Nenhum usuário encontrado'
                : 'Nenhum usuário cadastrado';
            document.getElementById('listaVaziaTexto').textContent = buscando
                ? 'Não encontramos usuários com esse nome ou login. Limpe a busca para ver todos.'
                : 'Cadastre um usuário para que ele apareça nesta lista.';
            document.getElementById('criarPrimeiroUsuario').hidden = buscando;
            document.getElementById('limparBusca').hidden = !buscando;
            listaVazia.hidden = false;
            return;
        }
        listaVazia.hidden = true;
        corpoTabela.innerHTML = lista.map(desenharLinha).join('');
        tabela.classList.add('com-registros');
    } catch (erro) {
        if (!usuariosCarregados) carregando.style.display = 'none';
        mostrarMensagem(erro.message, 'erro');
    }
}

document.getElementById('criarPrimeiroUsuario').addEventListener('click', () => {
    document.getElementById('novoUsuario').click();
});
document.getElementById('limparBusca').addEventListener('click', () => {
    document.getElementById('busca').value = '';
    carregarUsuarios();
});

function desenharLinha(u) {
    const cargo = u.cargo || u.papel;
    const nomes = { admin: 'Administrador', usuario: 'Usuário comum', ti: 'TI', manutencao: 'Manutenção' };
    const ehEuMesmo = usuarioAtual && u.id === usuarioAtual.id;
    // Ações via data-attributes + delegação de eventos: com onclick inline, um nome com apóstrofo
    // (ex.: D'Ávila) quebrava o JavaScript do botão e abria brecha para injeção de código.
    return `<tr>
      <td>${escapar(u.nome)}</td><td>${escapar(u.login)}</td>
      <td><span class="selo ${cargo === 'admin' ? 'selo-admin' : 'selo-usuario'}">${escapar(nomes[cargo] || cargo)}</span></td>
      <td>${escapar(u.setor || (cargo === 'ti' ? 'TI' : cargo === 'manutencao' ? 'Manutenção' : '—'))}</td>
      <td><span class="status-conta ${u.ativo ? 'status-conta--ativa' : 'status-conta--inativa'}">${!u.ativo ? 'Desativado' : 'Ativo'}</span></td>
      <td><details class="acoes-usuario">
        <summary aria-label="Abrir aÃ§Ãµes para ${escapar(u.nome)}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="16" cy="10" r="1.4"/></svg></summary>
        <div class="acoes-usuario__menu">
        <button type="button" class="btn-editar" data-acao="editar" data-id="${u.id}">Editar</button>
        <button type="button" class="btn-promover" data-acao="${!u.ativo ? 'ativar' : 'desativar'}" data-id="${u.id}" data-nome="${escapar(u.nome)}" ${ehEuMesmo ? 'disabled title="Você não pode desativar a própria conta"' : ''}>${!u.ativo ? 'Ativar' : 'Desativar'}</button>
        <button type="button" class="btn-excluir" data-acao="excluir" data-id="${u.id}" data-nome="${escapar(u.nome)}" ${ehEuMesmo ? 'disabled title="Você não pode excluir a própria conta"' : ''}>Excluir</button>
        </div>
      </details></td></tr>`;
}

corpoTabela.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao || botao.disabled) return;
    const id = Number(botao.dataset.id);
    botao.closest('details')?.removeAttribute('open');
    if (botao.dataset.acao === 'editar') window.abrirEdicao(id);
    else window.confirmarAcao(botao.dataset.acao, id, botao.dataset.nome);
});

let temporizadorBusca;
document.getElementById('busca').addEventListener('input', function() {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(carregarUsuarios, 300);
});

// ---------------------------------------------------------------------------------------
// Modal de criar/editar
// ---------------------------------------------------------------------------------------
const overlayForm = document.getElementById('overlayForm');
const formUsuario = document.getElementById('formUsuario');
const erroForm = document.getElementById('erroForm');

function abrirCriacao() {
    usuarioEmEdicaoId = null;
    document.getElementById('tituloForm').textContent = 'Novo usuário';
    document.getElementById('rotuloSenha').textContent = 'Senha';
    document.getElementById('campoSenha').required = true;
    document.getElementById('dicaSenha').textContent = 'Mínimo de 8 caracteres.';
    formUsuario.reset();
    erroForm.textContent = '';
    overlayForm.classList.add('ativo');
    document.getElementById('campoNome').focus();
}

window.abrirEdicao = async function(id) {
    try {
        // Não há "GET /admin/usuarios/:id"; a própria listagem já tem tudo que a edição
        // precisa (nome, login, papel) — buscar de novo na lista evita um endpoint extra.
        const resposta = await fetch(`/admin/usuarios?busca=`, { credentials: 'include' });
        const lista = await resposta.json();
        const usuario = lista.find((u) => u.id === id);
        if (!usuario) throw new Error('Usuário não encontrado');

        usuarioEmEdicaoId = id;
        document.getElementById('tituloForm').textContent = 'Editar usuário';
        document.getElementById('campoNome').value = usuario.nome;
        document.getElementById('campoLogin').value = usuario.login;
        const cargo = usuario.cargo || usuario.papel;
        document.getElementById('campoAdministrador').checked = cargo === 'admin';
        document.getElementById('campoSetor').value = usuario.setor || (cargo === 'ti' ? 'TI' : cargo === 'manutencao' ? 'Manutenção' : '');
        document.getElementById('campoSenha').value = '';
        document.getElementById('campoSenha').required = false;
        document.getElementById('rotuloSenha').textContent = 'Nova senha';
        document.getElementById('dicaSenha').textContent = 'Deixe em branco para manter a senha atual.';
        erroForm.textContent = '';
        overlayForm.classList.add('ativo');
        document.getElementById('campoNome').focus();
    } catch (erro) {
        mostrarMensagem(erro.message, 'erro');
    }
};

document.getElementById('novoUsuario').addEventListener('click', abrirCriacao);
document.getElementById('cancelarForm').addEventListener('click', () => overlayForm.classList.remove('ativo'));

formUsuario.addEventListener('submit', async function(evento) {
    evento.preventDefault();
    erroForm.textContent = '';

    const dados = {
        nome: document.getElementById('campoNome').value.trim(),
        login: document.getElementById('campoLogin').value.trim(),
        administrador: document.getElementById('campoAdministrador').checked,
        setor: document.getElementById('campoSetor').value || null,
    };
    const senha = document.getElementById('campoSenha').value;
    if (senha || usuarioEmEdicaoId === null) dados.senha = senha;

    const botao = document.getElementById('salvarUsuario');
    botao.disabled = true;
    try {
        const resposta = await fetch(
            usuarioEmEdicaoId === null ? '/admin/usuarios' : `/admin/usuarios/${usuarioEmEdicaoId}`,
            {
                method: usuarioEmEdicaoId === null ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(dados),
            },
        );
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            throw new Error((resultado.erros && resultado.erros.join('; ')) || resultado.erro || 'Erro ao salvar');
        }

        overlayForm.classList.remove('ativo');
        mostrarMensagem(usuarioEmEdicaoId === null ? 'Usuário criado com sucesso.' : 'Usuário atualizado com sucesso.', 'sucesso');
        carregarUsuarios();
    } catch (erro) {
        erroForm.textContent = erro.message;
    } finally {
        botao.disabled = false;
    }
});

// ---------------------------------------------------------------------------------------
// Confirmação (promover / rebaixar / excluir) — reaproveita o mesmo padrão de modal já
// usado em home.html (overlay + texto dinâmico + ação pendente).
// ---------------------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const overlayTexto = document.getElementById('overlayTexto');
let acaoPendente = null;
let idPendente = null;

const TEXTOS = {
    ativar: (nome) => `Ativar a conta de "${nome}"?`,
    desativar: (nome) => `Desativar a conta de "${nome}"? As sessões ativas serão encerradas.`,
    excluir: (nome) => `Tem certeza de que deseja excluir o usuário "${nome}"? Todos os chamados associados a esta conta também serão excluídos. Esta operação não poderá ser desfeita.`,
};

window.confirmarAcao = function(acao, id, nome) {
    acaoPendente = acao;
    idPendente = id;
    overlayTexto.textContent = TEXTOS[acao](nome);
    overlay.classList.add('ativo');
    document.getElementById('btnCancelar').focus();
};

// Esc fecha qualquer modal aberto.
document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    if (overlay.classList.contains('ativo')) { overlay.classList.remove('ativo'); acaoPendente = null; }
    else if (overlayForm.classList.contains('ativo')) overlayForm.classList.remove('ativo');
});

document.getElementById('btnCancelar').addEventListener('click', () => {
    overlay.classList.remove('ativo');
    acaoPendente = null;
});

document.getElementById('btnConfirmar').addEventListener('click', async function() {
    const botao = this;
    const acao = acaoPendente;
    const id = idPendente;
    if (!acao || id === null) return;
    botao.disabled = true;
    try {
        let resposta;
        if (acao === 'excluir') {
            resposta = await fetch(`/admin/usuarios/${id}`, { method: 'DELETE', credentials: 'include' });
        } else {
            resposta = await fetch(`/admin/usuarios/${id}/ativo`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ ativo: acao === 'ativar' }),
            });
        }
        if (!resposta.ok && resposta.status !== 204) {
            const dados = await resposta.json().catch(() => ({}));
            const mensagensErro = {
                ativar: 'Não foi possível ativar o usuário.',
                desativar: 'Não foi possível desativar o usuário.',
                excluir: 'Não foi possível excluir o usuário.',
            };
            throw new Error(dados.erro || mensagensErro[acao]);
        }
        overlay.classList.remove('ativo');
        const mensagensSucesso = {
            ativar: 'Usuário ativado com sucesso.',
            desativar: 'Usuário desativado com sucesso.',
            excluir: 'Usuário e chamados associados excluídos com sucesso.',
        };
        mostrarMensagem(mensagensSucesso[acao], 'sucesso');
        await carregarUsuarios();
    } catch (erro) {
        mostrarMensagem(erro.message, 'erro');
    } finally {
        botao.disabled = false;
        acaoPendente = null;
        idPendente = null;
    }
});

verificarSessao();
