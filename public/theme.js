ou (() => {
  const STORAGE_KEY = 'webapp.theme';
  const root = document.documentElement;
  const allowedThemes = ['light', 'dark'];

  let savedTheme = root.dataset.theme || 'light';
  try {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (allowedThemes.includes(storedTheme)) savedTheme = storedTheme;
  } catch {}
  root.dataset.theme = savedTheme;

  const menu = document.querySelector('.profile-dropdown');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `theme-toggle${menu ? ' theme-toggle--menu' : ' theme-toggle--floating'}`;
  toggle.setAttribute('aria-pressed', String(savedTheme === 'dark'));
  toggle.innerHTML = `
    <svg class="theme-toggle__sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 1.8v2m0 12.4v2M1.8 10h2m12.4 0h2M4.2 4.2l1.4 1.4m8.8 8.8 1.4 1.4m0-11.6-1.4 1.4m-8.8 8.8-1.4 1.4"/></svg>
    <svg class="theme-toggle__moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.8 12.3A7.4 7.4 0 0 1 7.7 3.2 7.5 7.5 0 1 0 16.8 12.3Z"/></svg>
    <span data-theme-label></span>`;

  const label = toggle.querySelector('[data-theme-label]');
  const updateLabel = () => {
    const dark = root.dataset.theme === 'dark';
    label.textContent = dark ? 'Tema claro' : 'Tema escuro';
    toggle.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
    toggle.setAttribute('aria-pressed', String(dark));
  };
  updateLabel();

  toggle.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = nextTheme;
    try { localStorage.setItem(STORAGE_KEY, nextTheme); } catch {}
    updateLabel();
  });

  if (menu) {
    const logout = menu.querySelector('#sair');
    if (logout) menu.insertBefore(toggle, logout);
    else menu.appendChild(toggle);
  } else {
    document.body.appendChild(toggle);
  }
})();
