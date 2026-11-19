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
        window.configurarMenuPerfil(usuarioAtual);
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
const tabelaChamados = document.getElementById('chamados');
const estadoVazioChamados = document.getElementById('estadoVazioChamados');
let chamadoSelecionadoId = null;
let filtroTipoAtual = null;
let chamadosCarregados = false;
let chamadosDisponiveis = [];
const CHAMADOS_POR_PAGINA = 9;
const MAXIMO_ABAS_VISIVEIS = 99;
let paginaAtual = 1;
let chamadosFiltrados = [];

function formatarData(isoComoTexto, incluirSegundos = false) {
    if (!isoComoTexto) return { data: '—', hora: '—' };
    // O banco mantém timestamps UTC em formato SQL sem sufixo de fuso.
    const normalizado = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoComoTexto)
        ? isoComoTexto : `${isoComoTexto.replace(' ', 'T')}Z`;
    const instante = new Date(normalizado);
    if (Number.isNaN(instante.getTime())) return { data: '—', hora: '—' };
    const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(instante);
    const opcoesHora = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false };
    if (incluirSegundos) opcoesHora.second = '2-digit';
    const hora = new Intl.DateTimeFormat('pt-BR', opcoesHora).format(instante);
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
    return ({ aberto: 'Aberto', em_atendimento: 'Em atendimento', fechado: 'Fechado', cancelado: 'Cancelado' })[status] || status || 'Não informado';
}

function dataCompleta(valor, incluirSegundos = false) {
    if (!valor) return '—';
    const data = formatarData(valor, incluirSegundos);
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
    // O autor pode editar o próprio chamado aberto, independentemente do cargo.
    // Administradores também podem editar chamados abertos de terceiros.
    return Boolean(usuarioAtual && !chamado.cancelado && chamado.status === 'aberto' &&
        (usuarioAtual.papel === 'admin' || chamado.usuario?.id === usuarioAtual.id));
}

function podeExcluirChamado(chamado) {
    // A exclusão definitiva é exclusiva do autor, inclusive para usuários comuns.
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
              <div><dt>Tipo</dt><dd>${escapar(chamado.tipo || '—')}</dd></div>
              <div><dt>Setor responsável</dt><dd>${escapar(chamado.setorResponsavel || 'Sem classificação')}</dd></div>
              <div><dt>Status</dt><dd>${escapar(rotuloStatus(chamado.status))}</dd></div>
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
            </dl>
          </section>
        </aside>
      </div>
      ${chamado.cancelado ? `<section class="detalhe-bloco"><h2>Chamado cancelado</h2><p class="texto-completo"><strong>Motivo:</strong> ${escapar(chamado.motivoCancelamento || 'Motivo não informado')}</p><p>Cancelado por: ${escapar(chamado.canceladoPor?.nome || 'Usuário não disponível')} · ${escapar(dataCompleta(chamado.canceladoEm, true))}</p></section>` : ''}
      ${chamado.status === 'fechado' && !chamado.cancelado ? `<section class="detalhe-bloco"><h2>Solução / registro de encerramento</h2><p class="texto-completo">${escapar(chamado.solucaoFechamento || 'Não foi registrada uma solução.')}</p><p>Fechado por: <strong>${escapar(chamado.fechadoPor?.nome || 'Usuário não disponível')}</strong></p><p>Fechado em: ${escapar(dataCompleta(chamado.fechadoEm, true))}</p></section>` : ''}
      ${!chamado.cancelado && (podeEditarChamado(chamado) || podeExcluirChamado(chamado) || (chamado.status !== 'fechado' && podeOperarSetor(chamado))) ? `<div class="detalhes-acoes">
        ${podeEditarChamado(chamado) ? `<button type="button" class="button" id="detalheAlterar">Alterar chamado</button>` : ''}
        ${podeExcluirChamado(chamado) ? `<button type="button" class="button botao-excluir" id="detalheExcluirDefinitivo">🗑 Excluir chamado</button>` : ''}
        ${chamado.status !== 'fechado' && podeOperarSetor(chamado) ? `${chamado.status === 'aberto' ? `<button type="button" class="button botao-atendimento" id="detalheAtendimento">Marcar como em atendimento</button>` : ''}<button type="button" class="button" id="detalheExcluir">Cancelar chamado</button><button type="button" class="button" id="detalheFechar">Fechar chamado</button>` : ''}
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
    if (!detalhesConteudo.querySelector('.detalhe-cabecalho')) {
        detalhesConteudo.innerHTML = `<div class="detalhes-skeleton" role="status" aria-label="Carregando detalhes do chamado">
          <div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line skeleton-line--short"></div>
          <div class="detalhes-grade"><div class="detalhes-principal">
            <section class="detalhe-bloco skeleton-block"><div class="skeleton skeleton-heading"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--short"></div></section>
            <section class="detalhe-bloco skeleton-block"><div class="skeleton skeleton-heading"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--medium"></div></section>
          </div><aside class="detalhes-lateral"><section class="detalhe-bloco skeleton-block"><div class="skeleton skeleton-heading"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></section></aside></div>
        </div>`;
    }
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
        const confirmar = await solicitarConfirmacao({
            titulo: 'Alterar chamado?',
            descricao: 'Você será direcionado ao formulário para atualizar este chamado. Deseja continuar?',
        });
        if (!confirmar) return;
        localStorage.setItem('titulo', 'Alteração de Chamado');
        localStorage.setItem('chamadoId', String(chamadoDetalhadoId));
        window.location.href = `inclusao.html?chamadoId=${encodeURIComponent(chamadoDetalhadoId)}`;
    }
    if (botao.id === 'detalheExcluirDefinitivo') {
        const id = chamadoDetalhadoId;
        const tituloChamado = detalhesConteudo.querySelector('.detalhe-cabecalho h1')?.textContent || `Chamado #${id}`;
        const confirmar = await solicitarConfirmacao({
            titulo: 'Excluir chamado definitivamente?',
            descricao: `Tem certeza que deseja excluir ${tituloChamado}? Esta ação não pode ser desfeita.`,
            destrutiva: true,
        });
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
            window.showToast(`Chamado #${id} excluído com sucesso.`, 'success');
        } catch (e) {
            botao.disabled = false;
            delete botao.dataset.enviando;
            window.showToast(e.message, 'error');
        }
        return;
    }
    if (botao.id === 'detalheAtendimento') {
        const id = chamadoDetalhadoId;
        if (!id || botao.dataset.enviando === '1') return;
        botao.dataset.enviando = '1';
        botao.disabled = true;
        try {
            const r = await fetch(`/chamados/${id}/atendimento`, { method: 'POST', credentials: 'include' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.erro || 'Não foi possível iniciar o atendimento.');
            await carregarChamados();
            await abrirDetalhes(id, { atualizarUrl: false });
            window.showToast(`Chamado #${id} marcado como em atendimento. Atendimento atribuído a ${d.atendente?.nome || 'você'}.`, 'success');
        } catch (e) {
            botao.disabled = false;
            delete botao.dataset.enviando;
            window.showToast(e.message, 'error');
        }
        return;
    }
    if (botao.id === 'detalheExcluir') {
        const motivo = await solicitarConfirmacao({
            titulo: 'Cancelar chamado?',
            descricao: 'Informe o motivo do cancelamento. Esta ação será registrada no chamado.',
            campo: { rotulo: 'Motivo do cancelamento', placeholder: 'Descreva o motivo' },
            destrutiva: true,
        });
        if (!motivo) return;
        try {
            const r = await fetch(`/chamados/${chamadoDetalhadoId}`, { method: 'DELETE', headers: {'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ motivo: motivo.trim() }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.erro || 'Não foi possível cancelar o chamado.');
            await carregarChamados(); await abrirDetalhes(chamadoDetalhadoId, { atualizarUrl:false });
            window.showToast(`Chamado #${chamadoDetalhadoId} cancelado com sucesso.`, 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
    }
    if (botao.id === 'detalheFechar') {
        const solucao = await solicitarConfirmacao({
            titulo: 'Fechar chamado?',
            descricao: 'Confirme o fechamento e informe a solução aplicada. Esse registro ficará associado ao chamado.',
            campo: { rotulo: 'Solução aplicada', placeholder: 'Descreva a solução' },
        });
        if (!solucao) return;
        try {
            const r = await fetch(`/chamados/${chamadoDetalhadoId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ status: 'fechado', solucao: solucao.trim() }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.erro || 'Não foi possível fechar o chamado.');
            await carregarChamados(); await abrirDetalhes(chamadoDetalhadoId, { atualizarUrl:false });
            window.showToast(`Chamado #${chamadoDetalhadoId} fechado com sucesso.`, 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
    }
});

function desenharLinha(chamado) {
    const abertura = formatarData(chamado.criadoEm);
    const fechamento = formatarData(chamado.fechadoEm, true);
    const tr = document.createElement('tr');
    tr.dataset.id = chamado.id;
    tr.dataset.titulo = chamado.descricao || 'Chamado sem descriÃ§Ã£o';
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
        <td class="celula-status status-${escapar(chamado.status)}">${escapar(rotuloStatus(chamado.status))}</td>
        <td>${fechamento.data}</td>
        <td>${fechamento.hora}</td>
    `;
    // A linha inteira abre o chamado; tabindex/Enter/Espaço dão o mesmo acesso a quem usa teclado.
    tr.tabIndex = 0;
    tr.addEventListener('click', (evento) => {
        abrirDetalhes(chamado.id);
    });
    tr.addEventListener('keydown', (evento) => {
        if (evento.target !== tr || (evento.key !== 'Enter' && evento.key !== ' ')) return;
        evento.preventDefault();
        abrirDetalhes(chamado.id);
    });
    return tr;
}

function selecionarLinha(id) {
    chamadoSelecionadoId = chamadoSelecionadoId === id ? null : id; // clicar de novo desmarca
    for (const tr of corpoTabela.querySelectorAll('tr')) {
        tr.classList.toggle('selecionada', Number(tr.dataset.id) === chamadoSelecionadoId);
    }
}

async function carregarChamados() {
    // Sempre traz também os cancelados: o filtro de status (inclusive "Todos os status") decide o que aparece.
    const url = '/chamados?incluirCancelados=1';
    if (!chamadosCarregados) {
        corpoTabela.innerHTML = Array.from({ length: 5 }, (_, linha) => `<tr aria-hidden="true">${Array.from({ length: 9 }, (__, coluna) => `<td><span class="skeleton skeleton-cell skeleton-cell--${(linha + coluna) % 3}"></span></td>`).join('')}</tr>`).join('');
        tabelaChamados.hidden = false;
        tabelaChamados.setAttribute('aria-busy', 'true');
        estadoVazioChamados.hidden = true;
    }
    try {
        const resposta = await fetch(url, { credentials: 'include' });
        if (resposta.status === 401) return window.location.href = 'inicial.html';
        if (!resposta.ok) throw new Error('Falha ao listar chamados');
        const chamados = await resposta.json();
        chamadosCarregados = true;
        chamadosDisponiveis = chamados;
        tabelaChamados.removeAttribute('aria-busy');
        chamadoSelecionadoId = null;
        aplicarFiltrosChamados();
    } catch (erro) {
        if (!chamadosCarregados) {
            corpoTabela.innerHTML = '';
            tabelaChamados.hidden = true;
            tabelaChamados.removeAttribute('aria-busy');
        }
        window.showToast('Não foi possível carregar os chamados.', 'error');
        console.error(erro);
    }
}

function normalizarPesquisa(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function dataLocalChamado(valor) {
    if (!valor) return '';
    const normalizado = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(valor) ? valor : `${String(valor).replace(' ', 'T')}Z`;
    const instante = new Date(normalizado);
    if (Number.isNaN(instante.getTime())) return '';
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function renderizarPaginacao(totalPaginas) {
    const navegacao = document.getElementById('paginacaoChamados');
    const numeros = document.getElementById('numerosPaginas');
    const anterior = document.getElementById('paginaAnterior');
    const proxima = document.getElementById('proximaPagina');
    const resumo = document.getElementById('resumoPaginacao');

    navegacao.hidden = totalPaginas === 0;
    if (!totalPaginas) {
        numeros.replaceChildren();
        resumo.textContent = '';
        return;
    }

    // No máximo 99 números ficam visíveis por vez. Em listas enormes, os botões
    // anterior/próximo percorrem os blocos seguintes sem impor limite ao total de páginas.
    const inicioBloco = Math.floor((paginaAtual - 1) / MAXIMO_ABAS_VISIVEIS) * MAXIMO_ABAS_VISIVEIS + 1;
    const fimBloco = Math.min(totalPaginas, inicioBloco + MAXIMO_ABAS_VISIVEIS - 1);
    const botoes = [];
    for (let pagina = inicioBloco; pagina <= fimBloco; pagina++) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'pagination__page';
        botao.textContent = String(pagina);
        botao.setAttribute('aria-label', `Página ${pagina}`);
        if (pagina === paginaAtual) botao.setAttribute('aria-current', 'page');
        botao.classList.toggle('ativa', pagina === paginaAtual);
        botao.addEventListener('click', () => {
            paginaAtual = pagina;
            aplicarFiltrosChamados({ reiniciarPagina: false });
        });
        botoes.push(botao);
    }
    numeros.replaceChildren(...botoes);
    anterior.disabled = inicioBloco === 1;
    proxima.disabled = fimBloco >= totalPaginas;
    resumo.textContent = `${paginaAtual} / ${totalPaginas}`;
}

function aplicarFiltrosChamados({ reiniciarPagina = true } = {}) {
    if (!chamadosCarregados) return;
    if (reiniciarPagina) paginaAtual = 1;
    const pesquisa = normalizarPesquisa(document.getElementById('pesquisaChamados').value);
    const status = document.getElementById('filtroStatus').value;
    const inicio = document.getElementById('filtroDataInicio').value;
    const fim = document.getElementById('filtroDataFim').value;
    const setor = filtroTipoAtual === 'T.I' ? 'TI' : filtroTipoAtual;
    const chamados = chamadosDisponiveis.filter(chamado => {
        const nomeUsuario = normalizarPesquisa(chamado.usuario?.nome);
        const descricao = normalizarPesquisa(chamado.descricao);
        const textoPesquisa = !pesquisa || String(chamado.id).includes(pesquisa) || nomeUsuario.includes(pesquisa) || descricao.includes(pesquisa);
        const data = dataLocalChamado(chamado.criadoEm);
        const correspondeSetor = !setor || (chamado.setorResponsavel || chamado.tipo) === setor;
        return textoPesquisa && correspondeSetor && (!status || chamado.status === status) &&
            (!inicio || (data && data >= inicio)) && (!fim || (data && data <= fim));
    });
    chamadosFiltrados = chamados;
    const totalPaginas = Math.ceil(chamados.length / CHAMADOS_POR_PAGINA);
    paginaAtual = Math.min(Math.max(1, paginaAtual), Math.max(1, totalPaginas));
    const primeiroIndice = (paginaAtual - 1) * CHAMADOS_POR_PAGINA;
    const chamadosDaPagina = chamados.slice(primeiroIndice, primeiroIndice + CHAMADOS_POR_PAGINA);
    corpoTabela.replaceChildren(...chamadosDaPagina.map(desenharLinha));
    renderizarPaginacao(totalPaginas);

    const filtros = [];
    if (pesquisa) filtros.push(`Pesquisa: ${document.getElementById('pesquisaChamados').value.trim()}`);
    if (setor) filtros.push(`Setor: ${filtroTipoAtual}`);
    if (status) filtros.push(`Status: ${rotuloStatus(status)}`);
    if (inicio) filtros.push(`A partir de: ${inicio.split('-').reverse().join('/')}`);
    if (fim) filtros.push(`Até: ${fim.split('-').reverse().join('/')}`);
    const ativo = filtros.length > 0;
    const limpar = document.getElementById('limparTodosFiltros');
    limpar.disabled = !ativo;
    const chips = document.getElementById('filtrosAtivos');
    chips.replaceChildren(...filtros.map(texto => { const chip = document.createElement('span'); chip.className = 'filter-chip'; chip.textContent = texto; return chip; }));
    const quantidade = chamados.length;
    document.getElementById('resumoChamados').textContent = `${quantidade} ${quantidade === 1 ? 'chamado encontrado' : 'chamados encontrados'}`;
    if (quantidade) {
        tabelaChamados.hidden = false;
        estadoVazioChamados.hidden = true;
    } else {
        tabelaChamados.hidden = true;
        estadoVazioChamados.hidden = false;
        document.getElementById('estadoVazioChamadosTitulo').textContent = ativo ? 'Nenhum chamado encontrado' : 'Nenhum chamado cadastrado';
        document.getElementById('estadoVazioChamadosTexto').textContent = ativo
            ? 'Ajuste ou limpe os filtros para ver outros chamados.'
            : 'Quando um chamado for criado, ele aparecerá nesta lista.';
        document.getElementById('criarChamadoVazio').hidden = ativo;
        document.getElementById('limparFiltrosChamados').hidden = !ativo;
    }
}

// Avança ou retorna um bloco de até 99 abas, mantendo a página atual dentro do novo bloco.
document.getElementById('paginaAnterior').addEventListener('click', () => {
    paginaAtual = Math.max(1, Math.floor((paginaAtual - 1) / MAXIMO_ABAS_VISIVEIS) * MAXIMO_ABAS_VISIVEIS);
    aplicarFiltrosChamados({ reiniciarPagina: false });
});
document.getElementById('proximaPagina').addEventListener('click', () => {
    const totalPaginas = Math.ceil(chamadosFiltrados.length / CHAMADOS_POR_PAGINA);
    paginaAtual = Math.min(totalPaginas, Math.floor((paginaAtual - 1) / MAXIMO_ABAS_VISIVEIS) * MAXIMO_ABAS_VISIVEIS + MAXIMO_ABAS_VISIVEIS + 1);
    aplicarFiltrosChamados({ reiniciarPagina: false });
});

function limparFiltrosChamados() {
    filtroTipoAtual = null;
    document.getElementById('pesquisaChamados').value = '';
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroDataInicio').value = '';
    document.getElementById('filtroDataFim').value = '';
    for (const id of ['Manutencao', 'TI']) {
        document.getElementById(id).classList.remove('ativo');
        document.getElementById(id).setAttribute('aria-pressed', 'false');
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
        aplicarFiltrosChamados();
        fecharMenuMobile();
    });
}

const asideMenuMobile = document.getElementById('menuNavegacao');
const alternarMenuMobile = document.getElementById('alternarMenuMobile');
function fecharMenuMobile(devolverFoco = false) {
    if (!asideMenuMobile || !alternarMenuMobile) return;
    asideMenuMobile.classList.remove('nav-mobile-aberto');
    alternarMenuMobile.setAttribute('aria-expanded', 'false');
    if (devolverFoco) alternarMenuMobile.focus();
}
alternarMenuMobile.addEventListener('click', () => {
    const aberto = alternarMenuMobile.getAttribute('aria-expanded') !== 'true';
    asideMenuMobile.classList.toggle('nav-mobile-aberto', aberto);
    alternarMenuMobile.setAttribute('aria-expanded', String(aberto));
});
document.addEventListener('click', (evento) => {
    if (alternarMenuMobile.getAttribute('aria-expanded') === 'true' && !asideMenuMobile.contains(evento.target)) {
        fecharMenuMobile();
    }
});
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && alternarMenuMobile.getAttribute('aria-expanded') === 'true') {
        fecharMenuMobile(true);
    }
});
configurarFiltroMenu('Manutencao', 'Manutenção');
configurarFiltroMenu('TI', 'T.I');

document.getElementById('criarChamadoVazio').addEventListener('click', () => {
    document.getElementById('incluir').click();
});
document.getElementById('limparFiltrosChamados').addEventListener('click', async () => {
    limparFiltrosChamados();
    await carregarChamados();
});

document.getElementById('limparTodosFiltros').addEventListener('click', async () => {
    limparFiltrosChamados();
    await carregarChamados();
});
document.getElementById('pesquisaChamados').placeholder = 'Número, assunto ou solicitante';
document.getElementById('pesquisaChamados').addEventListener('input', aplicarFiltrosChamados);
const alternarFiltrosChamados = document.getElementById('alternarFiltrosChamados');
const filtrosAvancadosChamados = document.getElementById('filtrosAvancadosChamados');
alternarFiltrosChamados.addEventListener('click', () => {
    const aberto = alternarFiltrosChamados.getAttribute('aria-expanded') !== 'true';
    alternarFiltrosChamados.setAttribute('aria-expanded', String(aberto));
    filtrosAvancadosChamados.classList.toggle('aberto', aberto);
});
for (const id of ['filtroDataInicio', 'filtroDataFim']) document.getElementById(id).addEventListener('change', aplicarFiltrosChamados);
document.getElementById('filtroStatus').addEventListener('change', () => aplicarFiltrosChamados());

// ---------------------------------------------------------------------------------------
// Overlay (modal) de confirmação: compartilhado pelos 3 botões do rodapé. No código
// original, "Alterar" tentava usar um elemento #overlayA que não existe no HTML (um bug
// que quebraria o clique), e "Excluir" reaproveitava sem querer o texto e a ação de
// "Incluir". Agora o mesmo modal é reaproveitado de propósito, com texto e ação de acordo
// com o botão que foi clicado.
// ---------------------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const overlayTitulo = document.getElementById('overlayTitulo');
const overlayTexto = document.getElementById('overlayTexto');
const overlayCampoRotulo = document.getElementById('overlayCampoRotulo');
const overlayCampoTexto = document.getElementById('overlayCampoTexto');
let acaoPendente = null; // 'incluir'
let resolverConfirmacao = null;

// "click" cobre mouse, toque e teclado (Enter/Espaço). O antigo Hammer 'tap' não respondia ao
// teclado e, se a CDN ficasse fora do ar, quebrava a página inteira (Hammer is not defined).
function addTouchClick(id, fn) {
    document.getElementById(id).addEventListener('click', fn);
}

function fecharOverlay(confirmado = false) {
    overlay.classList.remove('ativo');
    document.getElementById('modal-confirma').classList.remove('acao-destrutiva');
    overlayCampoRotulo.hidden = true;
    overlayCampoTexto.hidden = true;
    overlayCampoTexto.value = '';
    acaoPendente = null;
    if (resolverConfirmacao) {
        const resolver = resolverConfirmacao;
        resolverConfirmacao = null;
        resolver(confirmado);
    }
}
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && overlay.classList.contains('ativo')) fecharOverlay();
});

addTouchClick('incluir', function() {
    acaoPendente = 'incluir';
    overlayTitulo.textContent = 'Abrir chamado';
    overlayTexto.textContent = 'Deseja abrir um novo chamado?';
    document.getElementById('btnConfirmar').textContent = 'Continuar';
    overlay.classList.add('ativo');
    document.getElementById('btnConfirmar').focus();
});

function solicitarConfirmacao({ titulo, descricao, destrutiva = false, campo = null }) {
    overlayTitulo.textContent = titulo;
    overlayTexto.textContent = descricao;
    acaoPendente = null;
    document.getElementById('btnConfirmar').textContent = 'Confirmar';
    document.getElementById('modal-confirma').classList.toggle('acao-destrutiva', destrutiva);
    overlayCampoRotulo.hidden = !campo;
    overlayCampoTexto.hidden = !campo;
    overlayCampoTexto.value = '';
    if (campo) {
        overlayCampoRotulo.textContent = campo.rotulo;
        overlayCampoTexto.placeholder = campo.placeholder || '';
    }
    overlay.classList.add('ativo');
    (campo ? overlayCampoTexto : document.getElementById('btnCancelar')).focus();
    return new Promise((resolve) => { resolverConfirmacao = resolve; });
}

addTouchClick('excluir', function() { /* cancelamento exige motivo e ocorre na tela de detalhes */ });

addTouchClick('btnConfirmar', async function() {
    if (resolverConfirmacao) {
        const motivo = overlayCampoTexto.hidden ? true : overlayCampoTexto.value.trim();
        if (!motivo) {
            window.showToast('O motivo do cancelamento é obrigatório.', 'warning');
            overlayCampoTexto.focus();
            return;
        }
        fecharOverlay(motivo);
        return;
    }
    const acao = acaoPendente;
    fecharOverlay();

    if (acao === 'incluir') {
        localStorage.setItem('titulo', 'Inclusão de Chamado');
        localStorage.removeItem('chamadoId');
        window.location.href = 'inclusao.html';
    }
    acaoPendente = null;
});

addTouchClick('btnCancelar', function() {
    fecharOverlay(false);
});

verificarSessao();
