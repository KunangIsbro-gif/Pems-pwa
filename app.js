
const browserEl = document.getElementById('browserStatus');
const loginEl = document.getElementById('loginStatus');
const handoffEl = document.getElementById('handoffStatus');
const handoffResultEl = document.getElementById('handoffResult');
const loginResultEl = document.getElementById('loginResult');
const verifyBtn = document.getElementById('verifyBtn');

let currentGoogleCredential = '';

function setConnectivity(){
  const online = navigator.onLine;
  browserEl.textContent = online ? 'ONLINE' : 'OFFLINE';
  browserEl.className = online ? 'ok' : 'bad';
}
window.addEventListener('online', setConnectivity);
window.addEventListener('offline', setConnectivity);
setConnectivity();

function base64UrlDecodeUtf8(value){
  try {
    let b64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return '';
  }
}

function processServerHandoff(){
  const hash = String(location.hash || '');
  const prefix = '#pems_auth=';
  if (!hash.startsWith(prefix)) return;

  const token = decodeURIComponent(hash.slice(prefix.length));
  const parts = token.split('.');

  // Proof disimpan opaque untuk Step 3C. Frontend hanya membaca payload untuk UI.
  // Keputusan akses data tidak boleh bergantung pada parsing client ini.
  if (parts.length !== 2) {
    handoffEl.textContent = 'INVALID';
    handoffEl.className = 'bad';
    handoffResultEl.className = 'result errbox';
    handoffResultEl.textContent = 'Format handoff tidak valid.';
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeUtf8(parts[0]) || '{}');
  } catch (e) {
    payload = null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const validShape =
    payload &&
    payload.v === 'V14C-B2A-STEP3B' &&
    typeof payload.email === 'string' &&
    Number(payload.exp || 0) > nowSec;

  if (!validShape) {
    handoffEl.textContent = 'INVALID / EXPIRED';
    handoffEl.className = 'bad';
    handoffResultEl.className = 'result errbox';
    handoffResultEl.textContent = 'Proof tidak valid atau sudah kedaluwarsa.';
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }

  sessionStorage.setItem('PEMS_SERVER_PROOF_STEP3B', token);

  handoffEl.textContent = 'RECEIVED';
  handoffEl.className = 'ok';

  handoffResultEl.className = 'result okbox';
  handoffResultEl.innerHTML =
    '<strong>✓ SERVER HANDOFF RECEIVED</strong><br>' +
    'Email: ' + escapeHtml(payload.email || '-') + '<br>' +
    'Nama: ' + escapeHtml(payload.name || '-') + '<br>' +
    'Version: ' + escapeHtml(payload.v || '-') + '<br>' +
    '<small>Proof disimpan sementara di session browser. Step 3C akan meminta server memvalidasi proof ini sebelum akses dilanjutkan.</small>';

  // Hapus proof dari address bar setelah dibaca.
  history.replaceState(null, '', location.pathname + location.search);
}

processServerHandoff();

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecodeUtf8(parts[1]) || '{}');
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
  verifyBtn.disabled = false;

  loginEl.textContent = 'LOGIN OK';
  loginEl.className = 'ok';

  loginResultEl.className = 'result okbox';
  loginResultEl.innerHTML =
    '<strong>✓ LOGIN OK</strong><br>' +
    'Nama: ' + escapeHtml(claims.name || '-') + '<br>' +
    'Email: ' + escapeHtml(claims.email || '-');
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
