// GroupGo — minimal client-side JS
// All interactivity is handled by HTMX; this file only manages:
// 1. Toast notifications triggered by HTMX events
// 2. localStorage identity token sync

(function () {
  // ── Toast notifications ───────────────────────────────────────────────────
  const toast = document.getElementById('gg-toast') || document.getElementById('toast');
  const toastBaseClass = toast ? toast.className : '';
  let toastTimer;

  function showToast(message, type = 'success') {
    if (!toast) return;
    const styles = {
      success: 'bg-green-700 text-white',
      error: 'bg-red-700 text-white',
      info: 'bg-indigo-700 text-white',
      warn: 'bg-amber-600 text-white',
    };
    toast.className = `${toastBaseClass} ${styles[type] || styles.success}`.trim();
    toast.textContent = message || '✓ Saved';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(16px)';
      toast.style.opacity = '0';
    }, 3000);
  }

  window.showToast = showToast;

  window.confirmHtmxButton = function (button) {
    const message = button.dataset.confirmMessage || 'Are you sure?';
    const triggerConfirmed = function () {
      htmx.trigger(button, 'confirmed');
    };
    if (typeof window.showConfirm === 'function') {
      window.showConfirm(message, triggerConfirmed);
      return;
    }
    if (confirm(message)) {
      triggerConfirmed();
    }
  };

  // HTMX fires this event when a vote response includes HX-Trigger: voteSaved
  document.body.addEventListener('voteSaved', function () {
    showToast('✓ Vote saved');
  });

  // ── HTMX global config ────────────────────────────────────────────────────
  document.body.addEventListener('htmx:configRequest', function (evt) {
    // Forward the token as a header on all HTMX requests
    const token = localStorage.getItem('groupgo_token') || getCookie('token');
    if (token) {
      evt.detail.headers['X-User-Token'] = token;
    }
  });

  // ── Identity token sync ───────────────────────────────────────────────────
  // On page load, sync cookie token to localStorage for HTMX header forwarding
  const cookieToken = getCookie('token');
  if (cookieToken) {
    localStorage.setItem('groupgo_token', cookieToken);
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // ── Confirm dialogs for hx-confirm ────────────────────────────────────────
  document.body.addEventListener('htmx:confirm', function (evt) {
    if (evt.detail.question) {
      if (!confirm(evt.detail.question)) {
        evt.preventDefault();
      }
    }
  });
})();
