
const browserEl = document.getElementById('browserStatus');
const swEl = document.getElementById('swStatus');
const loginEl = document.getElementById('loginStatus');
const loginResultEl = document.getElementById('loginResult');
const verifyBtn = document.getElementById('verifyBtn');
const heartbeatBtn = document.getElementById('heartbeatBtn');
const heartbeatResultEl = document.getElementById('heartbeatResult');

let currentGoogleCredential = '';

function setConnectivity(){
  const online = navigator.onLine;
  browserEl.textContent = online ? 'ONLINE' : 'OFFLINE';
  browserEl.className = online ? 'ok' : 'bad';
}
window.addEventListener('online', setConnectivity);
window.addEventListener('offline', setConnectivity);
setConnectivity();

(async function registerSW(){
  if (!('serviceWorker' in navigator)) {
    swEl.textContent = 'TIDAK DIDUKUNG';
    swEl.className = 'bad';
    return;
  }
  try {
    await navigator.serviceWorker.register('./service-worker.js?v=b2a-step3a', {scope:'./'});
    swEl.textContent = 'REGISTERED';
    swEl.className = 'ok';
  } catch (err) {
    swEl.textContent = 'GAGAL';
    swEl.className = 'bad';
  }
})();

heartbeatBtn.addEventListener('click', function(){
  testPemsHeartbeat();
});

function testPemsHeartbeat(){
  const bridgeUrl = String(window.PEMS_BRIDGE_URL || '').trim();

  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(bridgeUrl)) {
    heartbeatResultEl.className = 'result errbox';
    heartbeatResultEl.textContent = 'URL Apps Script Bridge tidak valid.';
    return;
  }

  heartbeatBtn.disabled = true;
  heartbeatResultEl.className = 'result muted';
  heartbeatResultEl.textContent = 'Mengecek koneksi server...';

  const cbName = '__pemsHeartbeat_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  let script = document.createElement('script');
  let finished = false;

  const cleanup = function(){
    if (script && script.parentNode) script.parentNode.removeChild(script);
    try { delete window[cbName]; } catch(e) { window[cbName] = undefined; }
    heartbeatBtn.disabled = false;
  };

  const timer = setTimeout(function(){
    if (finished) return;
    finished = true;
    cleanup();
    heartbeatResultEl.className = 'result errbox';
    heartbeatResultEl.textContent = 'Heartbeat timeout.';
  }, 10000);

  window[cbName] = function(payload){
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cleanup();

    if (payload && payload.success === true && payload.version === 'V14C-B2A-STEP3A') {
      heartbeatResultEl.className = 'result okbox';
      heartbeatResultEl.innerHTML =
        '<strong>✓ PWA SERVER CONNECTED</strong><br>' +
        'Version: ' + escapeHtml(payload.version || '-') + '<br>' +
        'Bridge: ' + escapeHtml(payload.bridge || '-') + '<br>' +
        'Server Time: ' + escapeHtml(payload.serverTime || '-');
    } else {
      heartbeatResultEl.className = 'result errbox';
      heartbeatResultEl.textContent = 'Response heartbeat tidak sesuai.';
    }
  };

  script.async = true;
  script.onerror = function(){
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cleanup();
    heartbeatResultEl.className = 'result errbox';
    heartbeatResultEl.textContent = 'Gagal memuat heartbeat server.';
  };

  script.src =
    bridgeUrl +
    '?api=heartbeat&callback=' +
    encodeURIComponent(cbName) +
    '&_=' + Date.now();

  document.head.appendChild(script);
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return null;
  }
}

window.handleGoogleCredential = function(response) {
  const credential = response && response.credential ? response.credential : '';
  const claims = decodeJwtPayload(credential);

  if (!credential || !claims) {
    currentGoogleCredential = '';
    verifyBtn.disabled = true;
    loginEl.textContent = 'GAGAL';
    loginEl.className = 'bad';
    loginResultEl.className = 'result errbox';
    loginResultEl.textContent = 'Login Google tidak menghasilkan credential yang dapat dibaca.';
    return;
  }

  currentGoogleCredential = credential;

  const email = String(claims.email || '');
  const name = String(claims.name || '');

  loginEl.textContent = 'LOGIN OK';
  loginEl.className = 'ok';
  verifyBtn.disabled = false;

  loginResultEl.className = 'result okbox';
  loginResultEl.innerHTML =
    '<strong>✓ LOGIN OK</strong><br>' +
    'Nama: ' + escapeHtml(name || '-') + '<br>' +
    'Email: ' + escapeHtml(email || '-') + '<br>' +
    '<small>Login Step 1 tetap PASS.</small>';
};

verifyBtn.addEventListener('click', function(){
  if (!currentGoogleCredential) {
    alert('Login Google dulu.');
    return;
  }

  const bridgeUrl = String(window.PEMS_BRIDGE_URL || '').trim();

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = bridgeUrl;
  form.target = '_blank';
  form.style.display = 'none';

  const actionInput = document.createElement('input');
  actionInput.type = 'hidden';
  actionInput.name = 'action';
  actionInput.value = 'verify_google';

  const credentialInput = document.createElement('input');
  credentialInput.type = 'hidden';
  credentialInput.name = 'credential';
  credentialInput.value = currentGoogleCredential;

  form.appendChild(actionInput);
  form.appendChild(credentialInput);
  document.body.appendChild(form);
  form.submit();
  form.remove();
});

function escapeHtml(value){
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}
