let modoAlteracao = false;
let chamadoIdAtual = null;
let imagem1Alterada = false;
let imagem2Alterada = false;
const botaoSalvar = document.getElementById('salvar');
botaoSalvar.disabled = true;

window.addEventListener('load', async () => {
    let usuario;
    try {
        const resposta = await fetch('/auth/eu', { credentials: 'include' });
        if (!resposta.ok) {
            window.location.href = 'inicial.html';
            return;
        }
        ({ usuario } = await resposta.json());
    } catch {
        window.location.href = 'inicial.html';
        return;
    }

    const tituloSalvo = localStorage.getItem('titulo');
    if (tituloSalvo) document.getElementById('labelTitulo').textContent = tituloSalvo;
    else if (usuario.papel === 'usuario') document.getElementById('labelTitulo').textContent = 'Abrir solicitação';
    else document.getElementById('labelTitulo').textContent = 'Inclusão de Chamado';

    const seletorTipo = document.getElementById('Tipo');
    seletorTipo.disabled = false;
    const idDaUrl = new URLSearchParams(window.location.search).get('chamadoId');
    const idSalvo = idDaUrl ?? localStorage.getItem('chamadoId');

    if (idSalvo !== null && idSalvo !== '') {
        if (!/^\d+$/.test(idSalvo) || Number(idSalvo) < 1) {
            alert('O identificador do chamado é inválido. Abra o chamado novamente pela listagem.');
            limparEstadoEdicao();
            window.location.href = 'home.html';
            return;
        }
        modoAlteracao = true;
        chamadoIdAtual = String(Number(idSalvo));
        try {
            const resposta = await fetch(`/chamados/${chamadoIdAtual}`, { credentials: 'include' });
            if (resposta.status === 401) {
                window.location.href = 'inicial.html';
                return;
            }
            const chamado = await resposta.json().catch(() => ({}));
            if (!resposta.ok) throw new Error(chamado.erro || 'Não foi possível carregar o chamado.');
            if (chamado.status !== 'aberto' || chamado.cancelado) throw new Error('Somente chamados abertos podem ser editados.');
            if (usuario.papel !== 'admin' && chamado.usuario?.id !== usuario.id) throw new Error('Você não tem permissão para editar este chamado.');

            if (usuario.papel !== 'admin') seletorTipo.disabled = true;
            document.getElementById('labelTitulo').textContent = 'Alteração de Chamado';
            document.getElementById('Nchamado').value = chamado.descricao || '';
            seletorTipo.value = chamado.setorResponsavel === 'TI' ? 'T.I' : (chamado.setorResponsavel || chamado.tipo || '');
            document.getElementById('Evento').value = chamado.evento || '';
            document.getElementById('Solicitacao').value = chamado.solicitacao || '';
            if (chamado.imagem1) document.getElementById('imagem1').src = chamado.imagem1;
            if (chamado.imagem2) document.getElementById('imagem2').src = chamado.imagem2;
        } catch (erro) {
            alert(erro.message || 'Não foi possível carregar o chamado selecionado.');
            limparEstadoEdicao();
            window.location.href = 'home.html';
            return;
        }
    } else {
        if (tituloSalvo === 'Alteração de Chamado') {
            alert('Não foi possível identificar o chamado que será editado. Abra-o novamente pela lista.');
            limparEstadoEdicao();
            window.location.href = 'home.html';
            return;
        }
        modoAlteracao = false;
    }
    botaoSalvar.disabled = false;
});

function limparEstadoEdicao() {
    localStorage.removeItem('titulo');
    localStorage.removeItem('chamadoId');
}

function configurarImagem(inputId, imagemId, marcarAlterada) {
    // A miniatura funciona como botão: clique e teclado (Enter/Espaço) abrem o seletor de arquivo.
    const miniatura = document.getElementById(imagemId);
    miniatura.addEventListener('click', () => document.getElementById(inputId).click());
    miniatura.addEventListener('keydown', (evento) => {
        if (evento.key !== 'Enter' && evento.key !== ' ') return;
        evento.preventDefault();
        document.getElementById(inputId).click();
    });
    document.getElementById(inputId).addEventListener('change', function() {
        const arquivo = this.files?.[0];
        if (!arquivo) return;
        if (!arquivo.type.startsWith('image/')) {
            alert('Selecione um arquivo de imagem válido.');
            this.value = '';
            return;
        }
        botaoSalvar.disabled = true;
        const leitor = new FileReader();
        leitor.onload = (evento) => {
            document.getElementById(imagemId).src = evento.target.result;
            marcarAlterada();
            botaoSalvar.disabled = false;
        };
        leitor.onerror = () => {
            alert('Não foi possível carregar a imagem selecionada.');
            botaoSalvar.disabled = false;
        };
        leitor.readAsDataURL(arquivo);
    });
}

configurarImagem('inputImagem1', 'imagem1', () => { imagem1Alterada = true; });
configurarImagem('inputImagem2', 'imagem2', () => { imagem2Alterada = true; });

function cancelar() {
    limparEstadoEdicao();
    window.location.href = 'home.html';
}
document.getElementById('cancelar').addEventListener('click', cancelar);

botaoSalvar.addEventListener('click', async () => {
    const tipo = document.getElementById('Tipo').value;
    const dados = {
        descricao: document.getElementById('Nchamado').value.trim(),
        tipo,
        setorResponsavel: tipo === 'T.I' ? 'TI' : (tipo === 'Manutenção' ? 'Manutenção' : null),
        evento: document.getElementById('Evento').value,
        solicitacao: document.getElementById('Solicitacao').value.trim(),
    };

    if (!dados.descricao || !dados.tipo || !dados.setorResponsavel) {
        alert('Preencha a descrição e selecione um tipo/setor válido.');
        return;
    }
    if (modoAlteracao && (!chamadoIdAtual || !/^\d+$/.test(chamadoIdAtual))) {
        alert('Não foi possível identificar o chamado que será alterado. Volte à lista e abra o chamado novamente.');
        return;
    }

    if (!modoAlteracao || imagem1Alterada) dados.imagem1 = imagem1Alterada ? document.getElementById('imagem1').src : null;
    if (!modoAlteracao || imagem2Alterada) dados.imagem2 = imagem2Alterada ? document.getElementById('imagem2').src : null;

    botaoSalvar.disabled = true;
    try {
        const resposta = await fetch(modoAlteracao ? `/chamados/${chamadoIdAtual}` : '/chamados', {
            method: modoAlteracao ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(dados),
        });
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error((resultado.erros && resultado.erros.join('; ')) || resultado.erro || 'Erro ao salvar o chamado.');

        const idSalvo = modoAlteracao ? chamadoIdAtual : resultado.id;
        alert(modoAlteracao ? 'Chamado atualizado com sucesso.' : 'Chamado criado com sucesso.');
        limparEstadoEdicao();
        window.location.href = modoAlteracao && idSalvo ? `home.html#chamado-${idSalvo}` : 'home.html';
    } catch (erro) {
        alert(`Erro ao salvar: ${erro.message}`);
        console.error(erro);
    } finally {
        botaoSalvar.disabled = false;
    }
});
