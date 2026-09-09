const PEMS_GOOGLE_CLIENT_ID = '1060103852891-d73p5h12i97rcrfkh0i0ns891iv37n10.apps.googleusercontent.com';
const BACKEND_KEY = 'pems_backend_webapp_url_v14c';
const AUTH_USER_KEY = 'pems_last_verified_user_v14c_b2a';

const networkStatus = document.getElementById('networkStatus');
const swStatus = document.getElementById('swStatus');
const authBridgeStatus = document.getElementById('authBridgeStatus');
const backendUrlInput = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');
const googleSignInButton = document.getElementById('googleSignInButton');
const logoutBtn = document.getElementById('logoutBtn');
const authResult = document.getElementById('authResult');

let authBridgeReady = false;
let googleButtonRendered = false;
let activeVerifyRequestId = '';
let verifyTimer = null;
let bridgeProbeScript = null;
let bridgeProbeCallbackName = '';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setNetworkStatus() {
  const online = navigator.onLine;
  networkStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
  networkStatus.className = 'value ' + (online ? 'ok' : 'bad');
}
window.addEventListener('online', setNetworkStatus);
window.addEventListener('offline', setNetworkStatus);
setNetworkStatus();

function normalizeBackendUrl(value) {
  const url = String(value || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/i.test(url)) return '';
  return url.split('?')[0];
}

function cleanupBridgeProbe() {
  if (bridgeProbeScript && bridgeProbeScript.parentNode) {
    bridgeProbeScript.parentNode.removeChild(bridgeProbeScript);
  }
  bridgeProbeScript = null;
  if (bridgeProbeCallbackName && window[bridgeProbeCallbackName]) {
    try { delete window[bridgeProbeCallbackName]; } catch (e) { window[bridgeProbeCallbackName] = undefined; }
  }
  bridgeProbeCallbackName = '';
}

function checkAuthBridgeReady() {
  const url = normalizeBackendUrl(backendUrlInput.value || localStorage.getItem(BACKEND_KEY));
  authBridgeReady = false;

  if (!url) {
    authBridgeStatus.textContent = 'URL BELUM ADA';
    authBridgeStatus.className = 'value bad';
    return;
  }

  authBridgeStatus.textContent = 'MENGHUBUNGKAN…';
  authBridgeStatus.className = 'value warn';

  cleanupBridgeProbe();
  const callbackName = '__pemsBridgeReady_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  bridgeProbeCallbackName = callbackName;

  const timeout = setTimeout(() => {
    if (bridgeProbeCallbackName !== callbackName) return;
    cleanupBridgeProbe();
    authBridgeReady = false;
    authBridgeStatus.textContent = 'GAGAL';
    authBridgeStatus.className = 'value bad';
    authResult.innerHTML = '<div class="error-card">Auth Bridge tidak menjawab. Cek deployment / URL bridge.</div>';
  }, 10000);

  window[callbackName] = (data) => {
    clearTimeout(timeout);
    const ok = !!(data && data.success === true);
    authBridgeReady = ok;
    authBridgeStatus.textContent = ok ? 'READY' : 'GAGAL';
    authBridgeStatus.className = 'value ' + (ok ? 'ok' : 'bad');
    if (ok) {
      authResult.innerHTML = '<span class="ok">Auth Bridge READY • ' + escapeHtml(data.version || '-') + '</span>';
    } else {
      authResult.innerHTML = '<div class="error-card">Bridge merespons tetapi status tidak valid.</div>';
    }
    cleanupBridgeProbe();
  };

  bridgeProbeScript = document.createElement('script');
  bridgeProbeScript.src = url + '?api=bridge&callback=' + encodeURIComponent(callbackName) + '&t=' + Date.now();
  bridgeProbeScript.async = true;
  bridgeProbeScript.onerror = () => {
    clearTimeout(timeout);
    cleanupBridgeProbe();
    authBridgeReady = false;
    authBridgeStatus.textContent = 'GAGAL';
    authBridgeStatus.className = 'value bad';
    authResult.innerHTML = '<div class="error-card">Gagal memuat endpoint Auth Bridge.</div>';
  };
  document.head.appendChild(bridgeProbeScript);
}

const savedBackend = localStorage.getItem(BACKEND_KEY) || '';
if (savedBackend) backendUrlInput.value = savedBackend;

saveBackendBtn.addEventListener('click', () => {
  const url = normalizeBackendUrl(backendUrlInput.value);
  if (!url) {
    authResult.innerHTML = '<div class="error-card">URL bridge tidak valid. Gunakan URL deployment yang berakhiran <b>/exec</b>.</div>';
    return;
  }
  localStorage.setItem(BACKEND_KEY, url);
  backendUrlInput.value = url;
  authResult.innerHTML = '<span class="ok">URL bridge tersimpan. Mengecek Auth Bridge…</span>';
  checkAuthBridgeReady();
});

function waitForGoogleIdentity(maxMs = 12000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > maxMs) {
        clearInterval(timer);
        reject(new Error('Google Identity Services gagal dimuat. Cek internet / blocker browser.'));
      }
    }, 100);
  });
}

async function initGoogleLogin() {
  if (googleButtonRendered) return;
  try {
    await waitForGoogleIdentity();
    google.accounts.id.initialize({
      client_id: PEMS_GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    google.accounts.id.renderButton(googleSignInButton, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'signin_with',
      width: 320
    });
    googleButtonRendered = true;
  } catch (error) {
    authResult.innerHTML = '<div class="error-card">' + escapeHtml(error.message || error) + '</div>';
  }
}

function submitCredentialToBridge(credential, requestId) {
  const url = normalizeBackendUrl(backendUrlInput.value || localStorage.getItem(BACKEND_KEY));
  if (!url) throw new Error('URL Auth Bridge belum tersedia.');

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.target = 'pemsAuthPostFrame';
  form.style.display = 'none';

  const fields = {
    action: 'verify_google',
    requestId: requestId,
    credential: credential
  };

  Object.keys(fields).forEach((name) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = fields[name];
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 1000);
}

function handleGoogleCredential(response) {
  const credential = response && response.credential ? String(response.credential) : '';
  if (!credential) {
    authResult.innerHTML = '<div class="error-card">Google tidak mengirim ID token.</div>';
    return;
  }
  if (!authBridgeReady) {
    authResult.innerHTML = '<div class="error-card">Auth Bridge belum READY. Klik SIMPAN URL BRIDGE lalu tunggu status READY.</div>';
    return;
  }

  activeVerifyRequestId = 'AUTH-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  authResult.innerHTML = '<span class="warn">Login Google berhasil. Memverifikasi token di server…</span>';

  clearTimeout(verifyTimer);
  verifyTimer = setTimeout(() => {
    if (!activeVerifyRequestId) return;
    activeVerifyRequestId = '';
    authResult.innerHTML = '<div class="error-card">Timeout saat verifikasi server.</div>';
  }, 20000);

  try {
    submitCredentialToBridge(credential, activeVerifyRequestId);
  } catch (error) {
    clearTimeout(verifyTimer);
    activeVerifyRequestId = '';
    authResult.innerHTML = '<div class="error-card">' + escapeHtml(error.message || error) + '</div>';
  }
}

function isAllowedBridgeMessageOrigin(origin) {
  return origin === 'https://script.google.com' ||
    /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/i.test(String(origin || ''));
}

window.addEventListener('message', (event) => {
  if (!isAllowedBridgeMessageOrigin(event.origin)) return;
  const data = event.data || {};
  if (data.type !== 'PEMS_AUTH_VERIFY_RESULT') return;
  if (!activeVerifyRequestId || data.requestId !== activeVerifyRequestId) return;

  clearTimeout(verifyTimer);
  activeVerifyRequestId = '';

  const result = data.result || {};
  if (result.success === true && result.authorized === true && result.user) {
    const safeUser = {
      email: String(result.user.email || ''),
      name: String(result.user.name || ''),
      sub: String(result.user.sub || ''),
      verifiedAt: String(result.verifiedAt || '')
    };
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(safeUser));
    authResult.innerHTML =
      '<div class="success-card">' +
        '<b>✓ ACCESS GRANTED</b><br>' +
        '<b>SERVER VERIFIED</b><br>' +
        'User: ' + escapeHtml(safeUser.name || '-') + '<br>' +
        'Email: ' + escapeHtml(safeUser.email || '-') + '<br>' +
        '<span class="small">Verified: ' + escapeHtml(safeUser.verifiedAt || '-') + '</span>' +
      '</div>';
    logoutBtn.hidden = false;
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
    authResult.innerHTML = '<div class="error-card"><b>✗ ACCESS DENIED</b><br>' + escapeHtml(result.message || 'Akun tidak diizinkan / token tidak valid.') + '</div>';
    logoutBtn.hidden = true;
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(AUTH_USER_KEY);
  try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
  authResult.textContent = 'Logout POC selesai. Token tidak disimpan di browser.';
  logoutBtn.hidden = true;
});

const lastUserRaw = localStorage.getItem(AUTH_USER_KEY);
if (lastUserRaw) {
  try {
    const u = JSON.parse(lastUserRaw);
    authResult.innerHTML = '<span class="small">Last verified user (informasi lokal saja, bukan sesi server): ' + escapeHtml(u.email || '-') + '</span>';
  } catch (e) {
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js?v=v14c-b2a-fix1')
    .then(async (registration) => {
      swStatus.textContent = 'REGISTERED';
      swStatus.className = 'value ok';
      try { await registration.update(); } catch (e) {}
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    })
    .catch((err) => {
      swStatus.textContent = 'GAGAL';
      swStatus.className = 'value bad';
      console.error('Service worker gagal:', err);
    });
} else {
  swStatus.textContent = 'TIDAK DIDUKUNG';
  swStatus.className = 'value bad';
}

checkAuthBridgeReady();
initGoogleLogin();
