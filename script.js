// Login real: antes só verificava se os campos não estavam vazios (sem checar nada no
// servidor). Agora chama a API de verdade; a sessão fica num cookie httpOnly.
async function login() {
    const usuario = document.getElementById('nome').value.trim();
    const senha = document.getElementById('senha').value;
    const botao = document.getElementById('botao');

    if (usuario === '' || senha === '') {
        alert('Preencha login e senha!');
        return;
    }

    botao.disabled = true;
    try {
        const resposta = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ login: usuario, senha: senha }),
        });
        if (!resposta.ok) {
            const dados = await resposta.json().catch(() => ({}));
            alert(dados.erro || 'Login ou senha incorretos!');
            return;
        }
        window.location.href = 'home.html';
    } catch (erro) {
        alert('Não foi possível conectar ao servidor.');
        console.error(erro);
    } finally {
        botao.disabled = false;
    }
}

const botao = document.getElementById('botao');
botao.addEventListener('click', function() {
    login();
});

// Envia com Enter também, já que agora o login é assíncrono.
document.getElementById('senha').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') login();
});

// Se já existe uma sessão válida (cookie ainda não expirou), pula direto para a home.
fetch('/auth/eu', { credentials: 'include' }).then(function(r) {
    if (r.ok) window.location.href = 'home.html';
});

const digital = document.getElementById('digital');
digital.addEventListener('click', function() {
    // Reservado para login biométrico — não há integração definida para isso ainda.
});
