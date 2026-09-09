
const browserEl = document.getElementById('browserStatus');
const swEl = document.getElementById('swStatus');
const loginEl = document.getElementById('loginStatus');
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

(async function registerSW(){
  if (!('serviceWorker' in navigator)) {
    swEl.textContent = 'TIDAK DIDUKUNG';
    swEl.className = 'bad';
    return;
  }
  try {
    await navigator.serviceWorker.register('./service-worker.js?v=b2a-step2b', {scope:'./'});
    swEl.textContent = 'REGISTERED';
    swEl.className = 'ok';
  } catch (err) {
    swEl.textContent = 'GAGAL';
    swEl.className = 'bad';
  }
})();

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
    '<small>Token disimpan sementara di memori halaman untuk Step 2B dan tidak ditampilkan.</small>';
};

verifyBtn.addEventListener('click', function(){
  if (!currentGoogleCredential) {
    alert('Login Google dulu.');
    return;
  }

  const bridgeUrl = String(window.PEMS_STEP2B_BRIDGE_URL || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(bridgeUrl)) {
    alert('URL Apps Script Bridge tidak valid.');
    return;
  }

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
