(() => {
    const nomesCargo = {
        admin: 'Administrador',
        usuario: 'Usuário comum',
        ti: 'TI',
        manutencao: 'Manutenção',
    };
    const setoresPorCargo = { ti: 'TI', manutencao: 'Manutenção' };

    window.configurarMenuPerfil = (usuario) => {
        const menu = document.getElementById('menuPerfil');
        const gatilho = document.getElementById('alternarMenuPerfil');
        const dropdown = document.getElementById('menuPerfilDropdown');
        const nome = String(usuario?.nome || '').trim();
        const cargo = usuario?.cargo || usuario?.papel;
        const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2)
            .map((parte) => Array.from(parte)[0]).join('').toLocaleUpperCase('pt-BR');

        document.getElementById('usuarioLogado').textContent = nome || 'Usuário';
        document.getElementById('avatarPerfil').textContent = iniciais || '?';
        document.getElementById('perfilNome').textContent = nome || 'Usuário';
        document.getElementById('perfilCargo').textContent = nomesCargo[cargo] || (cargo ? String(cargo) : 'Não informado');
        document.getElementById('perfilSetor').textContent = usuario?.setor || setoresPorCargo[cargo] || 'Não informado';

        const estaAberto = () => gatilho.getAttribute('aria-expanded') === 'true';
        const definirAberto = (aberto, devolverFoco = false) => {
            gatilho.setAttribute('aria-expanded', String(aberto));
            dropdown.setAttribute('aria-hidden', String(!aberto));
            dropdown.inert = !aberto;
            menu.classList.toggle('aberto', aberto);
            if (devolverFoco) gatilho.focus();
        };

        gatilho.addEventListener('click', () => definirAberto(!estaAberto()));
        document.addEventListener('click', (evento) => {
            if (estaAberto() && !menu.contains(evento.target)) definirAberto(false);
        });
        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape' && estaAberto()) definirAberto(false, true);
        });
    };
})();
