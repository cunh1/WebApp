const tabela = document.querySelector('article');

// Mouse (desktop)
let isDown = false;
let arrastou = false;
let startX, scrollLeft;

tabela.addEventListener('mousedown', (e) => {
    isDown = true;
    arrastou = false;
    tabela.style.cursor = 'grabbing';
    startX = e.pageX - tabela.offsetLeft;
    scrollLeft = tabela.scrollLeft;
});
tabela.addEventListener('mouseleave', () => { isDown = false; tabela.style.cursor = 'grab'; });
tabela.addEventListener('mouseup', () => { isDown = false; tabela.style.cursor = 'grab'; });
tabela.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - tabela.offsetLeft;
    if (Math.abs(x - startX) > 5) arrastou = true;
    tabela.scrollLeft = scrollLeft - (x - startX) * 1.5;
});
// Um arraste não deve ser interpretado como clique na linha (abriria o chamado sem querer).
tabela.addEventListener('click', (e) => {
    if (arrastou) { e.stopPropagation(); e.preventDefault(); arrastou = false; }
}, true);

// Touch (celular/tablet): a rolagem nativa do navegador (overflow-x: auto) já cuida da tabela;
// o antigo touchmove com preventDefault bloqueava também a rolagem vertical da página.

// ---------------------------------------------------------------------------------------
// Sessão: sem login válido, volta para a tela inicial. Preenche o nome de quem está logado.
// ---------------------------------------------------------------------------------------
let usuarioAtual = null;

async function verificarSessao() {
    try {
        const resposta = await fetch('/auth/eu', { credentials: 'include' });
        if (!resposta.ok) throw new Error('sem sessão');
        const dados = await resposta.json();
        usuarioAtual = dados.usuario;
        document.getElementById('usuarioLogado').textContent = usuarioAtual.nome;
        if (usuarioAtual.papel === 'admin') document.getElementById('linkUsuarios').style.display = 'inline';
        // Todos os cargos podem consultar chamados de todos os setores; a API aplica
        // as permissões de edição, fechamento e cancelamento.
        document.getElementById('Manutencao').hidden = false;
        document.getElementById('TI').hidden = false;
        document.getElementById('titulo').textContent = 'Sistema de Chamados';
        document.getElementById('excluir').hidden = true;
        await carregarChamados();
        const match = window.location.hash.match(/^#chamado-(\d+)$/);
        if (match) abrirDetalhes(Number(match[1]), { atualizarUrl: false });
    } catch {
        window.location.href = 'inicial.html';
    }
}

document.getElementById('sair').addEventListener('click', async function() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    window.location.href = 'inicial.html';
});

// ---------------------------------------------------------------------------------------
// Tabela de chamados: carrega da API e desenha as linhas (antes ficava sempre vazia).
// ---------------------------------------------------------------------------------------
const corpoTabela = document.querySelector('#chamados tbody');
let chamadoSelecionadoId = null;
let filtroTipoAtual = null;
let incluirCancelados = false;

function formatarData(isoComoTexto) {
    if (!isoComoTexto) return { data: '—', hora: '—' };
    // O banco mantém timestamps UTC em formato SQL sem sufixo de fuso.
    const normalizado = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoComoTexto)
        ? isoComoTexto : `${isoComoTexto.replace(' ', 'T')}Z`;
    const instante = new Date(normalizado);
    if (Number.isNaN(instante.getTime())) return { data: '—', hora: '—' };
    const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(instante);
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(instante);
    return { data, hora };
}

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------------------
// Visualização completa do chamado: mantém a listagem no DOM para preservar o filtro e
// permite acesso direto via hash (#chamado-123), sem exigir uma nova rota no servidor.
// ---------------------------------------------------------------------------------------
const areaLista = document.getElementById('areaLista');
const areaDetalhes = document.getElementById('areaDetalhes');
const acoesLista = document.getElementById('acoesLista');
const detalhesConteudo = document.getElementById('detalhesConteudo');
const detalheNumero = document.getElementById('detalheNumero');
let chamadoDetalhadoId = null;
let carregandoHash = false;

function rotuloStatus(status) {
    return ({ aberto: 'Aberto', em_andamento: 'Em andamento', fechado: 'Fechado', cancelado: 'Cancelado' })[status] || status || 'Não informado';
}

function dataCompleta(valor) {
    if (!valor) return '—';
    const data = formatarData(valor);
    return data.hora === '—' ? data.data : `${data.data} às ${data.hora}`;
}

function podeOperarSetor(chamado) {
    if (!usuarioAtual) return false;
    if (usuarioAtual.papel === 'admin') return true;
    if (usuarioAtual.papel === 'ti') return chamado.setorResponsavel === 'TI';
    if (usuarioAtual.papel === 'manutencao') return chamado.setorResponsavel === 'Manutenção';
    return false;
}
function podeEditarChamado(chamado) {
    return Boolean(usuarioAtual && !chamado.cancelado && chamado.status === 'aberto' &&
        (usuarioAtual.papel === 'admin' || chamado.usuario?.id === usuarioAtual.id));
}

function podeExcluirChamado(chamado) {
    // A exclusão é exclusiva de quem abriu o chamado, sem exceção por cargo/setor.
    return Boolean(usuarioAtual && !chamado.cancelado && chamado.status === 'aberto' &&
        chamado.usuario?.id === usuarioAtual.id);
}

function renderizarDetalhes(chamado) {
    const imagens = [
        chamado.imagem1 ? { src: chamado.imagem1, alt: 'Imagem 1 anexada ao chamado' } : null,
        chamado.imagem2 ? { src: chamado.imagem2, alt: 'Imagem 2 anexada ao chamado' } : null,
    ].filter(Boolean);
    const galeria = imagens.length ? `
        <section class="detalhe-bloco">
          <h2>Anexos</h2>
          <div class="galeria-imagens">${imagens.map(img => `
            <a class="anexo-imagem" href="${escapar(img.src)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagem em tamanho completo">
              <img src="${escapar(img.src)}" alt="${escapar(img.alt)}" loading="lazy">
              <span>Ver imagem completa ↗</span>
            </a>`).join('')}
          </div>
        </section>` : '';
    detalhesConteudo.innerHTML = `
      <section class="detalhe-cabecalho">
        <div>
          <p class="detalhe-sobretitulo">${escapar(chamado.tipo || 'Chamado')}</p>
          <h1>Chamado #${escapar(chamado.id)}</h1>
          <p class="detalhe-metadados">Aberto por <strong>${escapar(chamado.usuario?.nome || 'Usuário não informado')}</strong> · ${escapar(dataCompleta(chamado.criadoEm))}</p>
        </div>
        <span class="status-badge status-${escapar(chamado.status)}">${escapar(rotuloStatus(chamado.status))}</span>
      </section>
      <div class="detalhes-grade">
        <div class="detalhes-principal">
          <section class="detalhe-bloco">
            <h2>Descrição</h2>
            <p class="texto-completo">${escapar(chamado.descricao || 'Nenhuma descrição informada.')}</p>
          </section>
          ${chamado.evento ? `<section class="detalhe-bloco"><h2>Evento</h2><p class="texto-completo">${escapar(chamado.evento)}</p></section>` : ''}
          ${chamado.solicitacao ? `<section class="detalhe-bloco"><h2>Solicitação</h2><p class="texto-completo">${escapar(chamado.solicitacao)}</p></section>` : ''}
          ${galeria}
        </div>
        <aside class="detalhes-lateral">
          <section class="detalhe-bloco">
            <h2>Informações do chamado</h2>
            <dl class="detalhe-lista">
              <div><dt>Identificador</dt><dd>#${escapar(chamado.id)}</dd></div>
              <div><dt>Tipo</dt><dd>${escapar(chamado.tipo || '—')}</dd></div>
              <div><dt>Setor responsável</dt><dd>${escapar(chamado.setorResponsavel || 'Sem classificação')}</dd></div>
              <div><dt>Status</dt><dd>${escapar(rotuloStatus(chamado.status))}</dd></div>
              <div><dt>Prioridade</dt><dd>Não definida</dd></div>
              <div><dt>Restrito</dt><dd>${chamado.restrito ? 'Sim' : 'Não'}</dd></div>
            </dl>
          </section>
          <section class="detalhe-bloco">
            <h2>Participantes</h2>
            <dl class="detalhe-lista">
              <div><dt>Solicitante</dt><dd>${escapar(chamado.usuario?.nome || '—')}</dd></div>
              <div><dt>Responsável</dt><dd>${escapar(chamado.atendente?.nome || 'Ainda não atribuído')}</dd></div>
            </dl>
          </section>
          <section class="detalhe-bloco">
            <h2>Datas</h2>
            <dl class="detalhe-lista">
              <div><dt>Abertura</dt><dd>${escapar(dataCompleta(chamado.criadoEm))}</dd></div>
              <div><dt>Última atualização</dt><dd>${escapar(dataCompleta(chamado.atualizadoEm))}</dd></div>
              <div><dt>Fechamento</dt><dd>${escapar(dataCompleta(chamado.fechadoEm))}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
      ${chamado.cancelado ? `<section class="detalhe-bloco"><h2>Chamado cancelado</h2><p class="texto-completo"><strong>Motivo:</strong> ${escapar(chamado.motivoCancelamento || 'Motivo não informado')}</p><p>Cancelado por: ${escapar(chamado.canceladoPor?.nome || 'Usuário não disponível')} · ${escapar(dataCompleta(chamado.canceladoEm))}</p></section>` : ''}
      ${chamado.status === 'fechado' ? `<section class="detalhe-bloco"><h2>Solução / registro de encerramento</h2><p class="texto-completo">${escapar(chamado.solucaoFechamento || 'Não foi registrada uma solução.')}</p><p>Fechado por: <strong>${escapar(chamado.fechadoPor?.nome || 'Usuário não disponível')}</strong></p><p>Data do fechamento: ${escapar(dataCompleta(chamado.fechadoEm))}</p></section>` : ''}
      ${!chamado.cancelado && (podeEditarChamado(chamado) || podeExcluirChamado(chamado) || (chamado.status !== 'fechado' && podeOperarSetor(chamado))) ? `<div class="detalhes-acoes">
        ${podeEditarChamado(chamado) ? `<button type="button" class="button" id="detalheAlterar">Alterar chamado</button>` : ''}
        ${podeExcluirChamado(chamado) ? `<button type="button" class="button botao-excluir" id="detalheExcluirDefinitivo">🗑 Excluir chamado</button>` : ''}
        ${chamado.status !== 'fechado' && podeOperarSetor(chamado) ? `<button type="button" class="button" id="detalheExcluir">Cancelar chamado</button><button type="button" class="button" id="detalheFechar">Fechar chamado</button>` : ''}
      </div>` : ''}`;
}

async function abrirDetalhes(id, { atualizarUrl = true } = {}) {
    const idValido = Number(id);
    if (!Number.isInteger(idValido) || idValido < 1) return;
    chamadoSelecionadoId = idValido;
    chamadoDetalhadoId = idValido;
    areaLista.hidden = true;
    acoesLista.hidden = true;
    document.getElementById('container').classList.add('detalhes-abertos');
    areaDetalhes.hidden = false;
    detalhesConteudo.innerHTML = '<div class="detalhes-carregando">Carregando informações do chamado…</div>';
    detalheNumero.textContent = `Chamado #${idValido}`;
    if (atualizarUrl && window.location.hash !== `#chamado-${idValido}`) {
        history.pushState({ chamadoId: idValido }, '', `#chamado-${idValido}`);
    }
    try {
        const resposta = await fetch(`/chamados/${idValido}`, { credentials: 'include' });
        if (resposta.status === 401) return window.location.href = 'inicial.html';
        const chamado = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(chamado.erro || 'Não foi possível abrir este chamado.');
        if (chamadoDetalhadoId !== idValido) return;
        renderizarDetalhes(chamado);
    } catch (erro) {
        detalhesConteudo.innerHTML = `<div class="detalhes-erro"><h2>Não foi possível abrir o chamado</h2><p>${escapar(erro.message)}</p><button type="button" class="button" id="tentarNovamente">Tentar novamente</button></div>`;
        document.getElementById('tentarNovamente')?.addEventListener('click', () => abrirDetalhes(idValido, { atualizarUrl: false }));
    }
}

function voltarParaLista({ atualizarUrl = true } = {}) {
    chamadoDetalhadoId = null;
    areaDetalhes.hidden = true;
    areaLista.hidden = false;
    document.getElementById('container').classList.remove('detalhes-abertos');
    acoesLista.hidden = false;
    if (atualizarUrl && window.location.hash.startsWith('#chamado-')) {
        history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    }
    for (const tr of corpoTabela.querySelectorAll('tr')) {
        tr.classList.toggle('selecionada', Number(tr.dataset.id) === chamadoSelecionadoId);
    }
}

document.getElementById('voltarLista').addEventListener('click', () => voltarParaLista());
window.addEventListener('popstate', () => {
    const match = window.location.hash.match(/^#chamado-(\d+)$/);
    if (match) abrirDetalhes(Number(match[1]), { atualizarUrl: false });
    else voltarParaLista({ atualizarUrl: false });
});
window.addEventListener('hashchange', () => {
    if (carregandoHash) return;
    const match = window.location.hash.match(/^#chamado-(\d+)$/);
    if (match && Number(match[1]) !== chamadoDetalhadoId) abrirDetalhes(Number(match[1]), { atualizarUrl: false });
    else if (!match && chamadoDetalhadoId !== null) voltarParaLista({ atualizarUrl: false });
});

detalhesConteudo.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('button');
    if (!botao) return;
    if (botao.id === 'detalheAlterar') {
        if (!chamadoDetalhadoId) return;
        localStorage.setItem('titulo', 'Alteração de Chamado');
        localStorage.setItem('chamadoId', String(chamadoDetalhadoId));
        window.location.href = `inclusao.html?chamadoId=${encodeURIComponent(chamadoDetalhadoId)}`;
    }
    if (botao.id === 'detalheExcluirDefinitivo') {
        const id = chamadoDetalhadoId;
        const tituloChamado = detalhesConteudo.querySelector('.detalhe-cabecalho h1')?.textContent || `Chamado #${id}`;
        const confirmar = window.confirm(`Tem certeza que deseja excluir definitivamente ${tituloChamado}? Esta ação não pode ser desfeita.`);
        if (!confirmar) return;
        if (botao.dataset.enviando === '1') return;
        botao.dataset.enviando = '1';
        botao.disabled = true;
        try {
            const r = await fetch(`/chamados/${id}/excluir`, { method: 'DELETE', credentials: 'include' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.erro || 'Não foi possível excluir o chamado.');
            chamadoDetalhadoId = null;
            await carregarChamados();
            voltarParaLista();
            alert(`Chamado #${id} excluído com sucesso.`);
        } catch (e) {
            botao.disabled = false;
            delete botao.dataset.enviando;
            alert(e.message);
        }
        return;
    }
    if (botao.id === 'detalheExcluir') {
        const motivo = window.prompt('Informe o motivo do cancelamento deste chamado:');
        if (!motivo || !motivo.trim()) return alert('O motivo do cancelamento é obrigatório.');
        try {
            const r = await fetch(`/chamados/${chamadoDetalhadoId}`, { method: 'DELETE', headers: {'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ motivo: motivo.trim() }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.erro || 'Não foi possível cancelar o chamado.');
            await carregarChamados(); await abrirDetalhes(chamadoDetalhadoId, { atualizarUrl:false });
        } catch (e) { alert(e.message); }
    }
    if (botao.id === 'detalheFechar') {
        const solucao = window.prompt('Descreva a solução aplicada antes de fechar o chamado:');
        if (!solucao || !solucao.trim()) return alert('A solução é obrigatória para fechar o chamado.');
        try {
            const r = await fetch(`/chamados/${chamadoDetalhadoId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ status: 'fechado', solucao: solucao.trim() }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.erro || 'Não foi possível fechar o chamado.');
            await carregarChamados(); await abrirDetalhes(chamadoDetalhadoId, { atualizarUrl:false });
        } catch (e) { alert(e.message); }
    }
});

function desenharLinha(chamado) {
    const abertura = formatarData(chamado.criadoEm);
    const fechamento = formatarData(chamado.fechadoEm);
    const tr = document.createElement('tr');
    tr.dataset.id = chamado.id;
    if (chamado.id === chamadoSelecionadoId) tr.classList.add('selecionada');
    if (chamado.cancelado) tr.classList.add('chamado-cancelado');
    if (chamado.status === 'fechado') tr.classList.add('chamado-fechado');
    tr.innerHTML = `
        <td>${chamado.id}</td>
        <td>${escapar(chamado.usuario.nome)}</td>
        <td>${abertura.data}</td>
        <td>${escapar(chamado.tipo)}</td>
        <td>${escapar(chamado.setorResponsavel || 'Sem classificação')}</td>
        <td>${abertura.hora}</td>
        <td>${escapar(rotuloStatus(chamado.status))}</td>
        <td>${fechamento.data}</td>
        <td>${fechamento.hora}</td>
        <td>${chamado.atendente ? escapar(chamado.atendente.nome) : '—'}</td>
        <td>${chamado.restrito ? 'Sim' : 'Não'}</td>
        <td class="celula-acoes">${podeExcluirChamado(chamado) ? `<button type="button" class="acao-excluir-lista" data-excluir-chamado="${chamado.id}" aria-label="Excluir chamado #${chamado.id}" title="Excluir chamado">🗑 Excluir</button>` : '—'}</td>
    `;
    // A linha inteira abre o chamado; tabindex/Enter/Espaço dão o mesmo acesso a quem usa teclado.
    tr.tabIndex = 0;
    tr.addEventListener('click', (evento) => {
        if (evento.target.closest('[data-excluir-chamado]')) return;
        abrirDetalhes(chamado.id);
    });
    tr.addEventListener('keydown', (evento) => {
        if (evento.target !== tr || (evento.key !== 'Enter' && evento.key !== ' ')) return;
        evento.preventDefault();
        abrirDetalhes(chamado.id);
    });
    return tr;
}

corpoTabela.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('[data-excluir-chamado]');
    if (!botao) return;
    evento.stopPropagation();
    const id = Number(botao.dataset.excluirChamado);
    if (!Number.isInteger(id) || id < 1 || botao.disabled) return;
    if (!window.confirm(`Tem certeza que deseja excluir definitivamente o chamado #${id}? Esta ação não pode ser desfeita.`)) return;
    botao.disabled = true;
    try {
        const resposta = await fetch(`/chamados/${id}/excluir`, { method: 'DELETE', credentials: 'include' });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir o chamado.');
        await carregarChamados();
        alert(`Chamado #${id} excluído com sucesso.`);
    } catch (erro) {
        botao.disabled = false;
        alert(erro.message);
    }
});

function selecionarLinha(id) {
    chamadoSelecionadoId = chamadoSelecionadoId === id ? null : id; // clicar de novo desmarca
    for (const tr of corpoTabela.querySelectorAll('tr')) {
        tr.classList.toggle('selecionada', Number(tr.dataset.id) === chamadoSelecionadoId);
    }
}

async function carregarChamados() {
    const params = new URLSearchParams();
    if (filtroTipoAtual) params.set('tipo', filtroTipoAtual);
    if (incluirCancelados) params.set('incluirCancelados', '1');
    const url = `/chamados${params.toString() ? `?${params}` : ''}`;
    try {
        const resposta = await fetch(url, { credentials: 'include' });
        if (resposta.status === 401) return window.location.href = 'inicial.html';
        if (!resposta.ok) throw new Error('Falha ao listar chamados');
        const chamados = await resposta.json();
        corpoTabela.innerHTML = '';
        chamadoSelecionadoId = null;
        for (const chamado of chamados) corpoTabela.appendChild(desenharLinha(chamado));
    } catch (erro) {
        alert('Não foi possível carregar os chamados.');
        console.error(erro);
    }
}

// Menu lateral: filtra a lista por tipo (clicar de novo no mesmo item remove o filtro).
function configurarFiltroMenu(idMenu, tipo) {
    const el = document.getElementById(idMenu);
    el.addEventListener('click', () => {
        filtroTipoAtual = filtroTipoAtual === tipo ? null : tipo;
        document.getElementById('Manutencao').classList.toggle('ativo', filtroTipoAtual === 'Manutenção');
        document.getElementById('TI').classList.toggle('ativo', filtroTipoAtual === 'T.I');
        document.getElementById('Manutencao').setAttribute('aria-pressed', String(filtroTipoAtual === 'Manutenção'));
        document.getElementById('TI').setAttribute('aria-pressed', String(filtroTipoAtual === 'T.I'));
        carregarChamados();
    });
}
configurarFiltroMenu('Manutencao', 'Manutenção');
configurarFiltroMenu('TI', 'T.I');

const botaoCancelados = document.getElementById('verCancelados');
if (botaoCancelados) botaoCancelados.addEventListener('click', async () => {
    incluirCancelados = !incluirCancelados;
    botaoCancelados.textContent = incluirCancelados ? 'Ocultar cancelados' : 'Ver cancelados';
    await carregarChamados();
});

// ---------------------------------------------------------------------------------------
// Overlay (modal) de confirmação: compartilhado pelos 3 botões do rodapé. No código
// original, "Alterar" tentava usar um elemento #overlayA que não existe no HTML (um bug
// que quebraria o clique), e "Excluir" reaproveitava sem querer o texto e a ação de
// "Incluir". Agora o mesmo modal é reaproveitado de propósito, com texto e ação de acordo
// com o botão que foi clicado.
// ---------------------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const overlayTexto = document.getElementById('overlayTexto');
let acaoPendente = null; // 'incluir'

// "click" cobre mouse, toque e teclado (Enter/Espaço). O antigo Hammer 'tap' não respondia ao
// teclado e, se a CDN ficasse fora do ar, quebrava a página inteira (Hammer is not defined).
function addTouchClick(id, fn) {
    document.getElementById(id).addEventListener('click', fn);
}

function fecharOverlay() {
    overlay.classList.remove('ativo');
    acaoPendente = null;
}
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && overlay.classList.contains('ativo')) fecharOverlay();
});

addTouchClick('incluir', function() {
    acaoPendente = 'incluir';
    overlayTexto.textContent = 'Deseja abrir um novo chamado?';
    overlay.classList.add('ativo');
    document.getElementById('btnConfirmar').focus();
});

addTouchClick('excluir', function() { /* cancelamento exige motivo e ocorre na tela de detalhes */ });

addTouchClick('btnConfirmar', async function() {
    overlay.classList.remove('ativo');

    if (acaoPendente === 'incluir') {
        localStorage.setItem('titulo', 'Inclusão de Chamado');
        localStorage.removeItem('chamadoId');
        window.location.href = 'inclusao.html';
    }
    acaoPendente = null;
});

addTouchClick('btnCancelar', function() {
    overlay.classList.remove('ativo');
    acaoPendente = null;
});

verificarSessao();
