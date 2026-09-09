const browserEl = document.getElementById('browserStatus');
const swEl = document.getElementById('swStatus');
const loginEl = document.getElementById('loginStatus');
const resultEl = document.getElementById('result');

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
    await navigator.serviceWorker.register('./service-worker.js?v=b2a-step1', {scope:'./'});
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
    loginEl.textContent = 'GAGAL';
    loginEl.className = 'bad';
    resultEl.className = 'result errbox';
    resultEl.textContent = 'Login Google tidak menghasilkan credential yang dapat dibaca.';
    return;
  }

  const email = String(claims.email || '');
  const name = String(claims.name || '');

  loginEl.textContent = 'LOGIN OK';
  loginEl.className = 'ok';
  resultEl.className = 'result okbox';
  resultEl.innerHTML =
    '<strong>✓ LOGIN OK</strong><br>' +
    'Nama: ' + escapeHtml(name || '-') + '<br>' +
    'Email: ' + escapeHtml(email || '-') + '<br>' +
    '<small>Identitas ini baru dibaca di browser dan belum diverifikasi server. Verifikasi server adalah Step 2.</small>';
};

function escapeHtml(value){
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}
