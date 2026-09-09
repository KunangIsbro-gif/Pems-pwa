
const browserEl = document.getElementById('browserStatus');
const loginEl = document.getElementById('loginStatus');
const proofEl = document.getElementById('proofStatus');
const proofResultEl = document.getElementById('proofResult');
const loginResultEl = document.getElementById('loginResult');
const verifyBtn = document.getElementById('verifyBtn');
const readProjectsBtn = document.getElementById('readProjectsBtn');

const PROOF_KEY = 'PEMS_SERVER_PROOF_STEP3C';
let currentGoogleCredential = '';
let currentServerProof = '';

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

function readProofPayload(proof){
  try {
    const parts = String(proof || '').split('.');
    if (parts.length !== 2) return null;
    return JSON.parse(base64UrlDecodeUtf8(parts[0]) || '{}');
  } catch (e) {
    return null;
  }
}

function acceptProof(proof){
  const payload = readProofPayload(proof);
  const nowSec = Math.floor(Date.now() / 1000);

  const validShape =
    payload &&
    payload.v === 'V14C-B2A-STEP3C' &&
    typeof payload.email === 'string' &&
    Number(payload.exp || 0) > nowSec;

  if (!validShape) {
    sessionStorage.removeItem(PROOF_KEY);
    currentServerProof = '';
    proofEl.textContent = 'INVALID / EXPIRED';
    proofEl.className = 'bad';
    proofResultEl.className = 'result errbox';
    proofResultEl.textContent = 'Proof session tidak valid atau sudah kedaluwarsa.';
    readProjectsBtn.disabled = true;
    return false;
  }

  currentServerProof = proof;
  sessionStorage.setItem(PROOF_KEY, proof);

  proofEl.textContent = 'RECEIVED';
  proofEl.className = 'ok';

  proofResultEl.className = 'result okbox';
  proofResultEl.innerHTML =
    '<strong>✓ SERVER PROOF RECEIVED</strong><br>' +
    'Email: ' + escapeHtml(payload.email || '-') + '<br>' +
    'Nama: ' + escapeHtml(payload.name || '-') + '<br>' +
    '<small>Server akan memvalidasi proof lagi sebelum membaca project.</small>';

  readProjectsBtn.disabled = false;
  return true;
}

function processServerHandoff(){
  const hash = String(location.hash || '');
  const prefix = '#pems_auth=';

  if (hash.startsWith(prefix)) {
    const proof = decodeURIComponent(hash.slice(prefix.length));
    acceptProof(proof);
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }

  const stored = sessionStorage.getItem(PROOF_KEY);
  if (stored) {
    acceptProof(stored);
  }
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

  submitHiddenPost({
    action: 'verify_google',
    credential: currentGoogleCredential
  });
});

readProjectsBtn.addEventListener('click', function(){
  if (!currentServerProof) {
    alert('Proof session belum ada / sudah expired. Login ulang dulu.');
    return;
  }

  submitHiddenPost({
    action: 'read_projects',
    proof: currentServerProof
  });
});

function submitHiddenPost(fields){
  const bridgeUrl = String(window.PEMS_BRIDGE_URL || '').trim();

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = bridgeUrl;
  form.target = '_blank';
  form.style.display = 'none';

  Object.keys(fields || {}).forEach(function(key){
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = String(fields[key] || '');
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function escapeHtml(value){
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}
