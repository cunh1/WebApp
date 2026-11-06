(() => {
  let region;

  function getRegion() {
    if (region) return region;
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-label', 'Notificações');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(region);
    return region;
  }

  function showToast(message, type = 'info', duration = 4500) {
    const kind = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = { success: '✓', error: '!', warning: '⚠', info: 'i' }[kind];

    const text = document.createElement('p');
    text.className = 'toast__message';
    text.textContent = String(message ?? '');

    const close = document.createElement('button');
    close.className = 'toast__close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar notificação');
    close.textContent = '×';
    toast.append(icon, text, close);
    getRegion().appendChild(toast);

    const dismiss = () => {
      if (!toast.isConnected) return;
      toast.classList.add('toast--leaving');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 300);
    };
    const timer = setTimeout(dismiss, Math.max(1500, duration));
    close.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
    return toast;
  }

  window.showToast = showToast;
  window.showToastOnNextPage = (message, type = 'success') => {
    try { sessionStorage.setItem('webapp.toast', JSON.stringify({ message, type })); } catch {}
  };

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const pending = JSON.parse(sessionStorage.getItem('webapp.toast') || 'null');
      sessionStorage.removeItem('webapp.toast');
      if (pending?.message) showToast(pending.message, pending.type);
    } catch {}
  });
})();
