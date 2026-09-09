const networkStatus = document.getElementById('networkStatus');
const swStatus = document.getElementById('swStatus');
const shellStatus = document.getElementById('shellStatus');
const backendUrlInput = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');
const testBridgeBtn = document.getElementById('testBridgeBtn');
const bridgeResult = document.getElementById('bridgeResult');

const BACKEND_KEY = 'pems_backend_webapp_url_v14c';

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
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/i.test(url)) {
    return '';
  }
  return url.split('?')[0];
}

const savedBackend = localStorage.getItem(BACKEND_KEY) || '';
if (savedBackend) backendUrlInput.value = savedBackend;

saveBackendBtn.addEventListener('click', () => {
  const url = normalizeBackendUrl(backendUrlInput.value);
  if (!url) {
    bridgeResult.innerHTML = '<span class="bad">URL backend tidak valid. Gunakan URL deployment yang berakhiran /exec.</span>';
    return;
  }
  localStorage.setItem(BACKEND_KEY, url);
  backendUrlInput.value = url;
  bridgeResult.innerHTML = '<span class="ok">URL backend tersimpan di browser.</span>';
});

function jsonpPEMS(baseUrl, params, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const callbackName = '__pemsJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Timeout: backend PEMS tidak merespons.'));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(payload);
    };

    const query = new URLSearchParams({ ...params, callback: callbackName, _: String(Date.now()) });
    script.src = baseUrl + (baseUrl.includes('?') ? '&' : '?') + query.toString();
    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('Gagal memuat endpoint backend. Cek deployment/access GAS.'));
    };

    document.head.appendChild(script);
  });
}

testBridgeBtn.addEventListener('click', async () => {
  const url = normalizeBackendUrl(backendUrlInput.value || localStorage.getItem(BACKEND_KEY));
  if (!url) {
    bridgeResult.innerHTML = '<span class="bad">Simpan URL backend GAS terlebih dahulu.</span>';
    return;
  }
  if (!navigator.onLine) {
    bridgeResult.innerHTML = '<span class="bad">Browser sedang OFFLINE. Hidupkan koneksi untuk test bridge.</span>';
    return;
  }

  localStorage.setItem(BACKEND_KEY, url);
  testBridgeBtn.disabled = true;
  testBridgeBtn.textContent = 'MENGHUBUNGI BACKEND...';
  bridgeResult.textContent = 'Mengirim request aman ke Google Apps Script...';

  try {
    const data = await jsonpPEMS(url, { api: 'bridge' });
    if (!data || data.success !== true) {
      throw new Error((data && data.message) || 'Response backend tidak valid.');
    }

    bridgeResult.innerHTML =
      '<div class="success-card">' +
        '<b>✓ BACKEND CONNECTED</b><br>' +
        'Version: ' + escapeHtml(data.version || '-') + '<br>' +
        'Server Time: ' + escapeHtml(data.serverTime || '-') + '<br>' +
        '<span class="small">Belum ada data project yang dikirim pada tahap B1.</span>' +
      '</div>';
  } catch (error) {
    bridgeResult.innerHTML = '<span class="bad">✗ ' + escapeHtml(error.message || String(error)) + '</span>';
  } finally {
    testBridgeBtn.disabled = false;
    testBridgeBtn.textContent = 'TEST KONEKSI BACKEND';
  }
});

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(async (registration) => {
      swStatus.textContent = 'REGISTERED';
      swStatus.className = 'value ok';

      await navigator.serviceWorker.ready;
      shellStatus.textContent = 'CACHE READY';
      shellStatus.className = 'value ok';

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    })
    .catch((err) => {
      swStatus.textContent = 'GAGAL';
      swStatus.className = 'value bad';
      shellStatus.textContent = 'BELUM SIAP';
      shellStatus.className = 'value warn';
      console.error('Service worker gagal:', err);
    });
} else {
  swStatus.textContent = 'TIDAK DIDUKUNG';
  swStatus.className = 'value bad';
  shellStatus.textContent = 'BELUM SIAP';
  shellStatus.className = 'value bad';
}
