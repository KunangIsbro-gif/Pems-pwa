const networkStatus = document.getElementById('networkStatus');
const swStatus = document.getElementById('swStatus');
const shellStatus = document.getElementById('shellStatus');
const bootStamp = document.getElementById('bootStamp');
const saveBtn = document.getElementById('saveBtn');
const savedResult = document.getElementById('savedResult');

function setNetworkStatus() {
  const online = navigator.onLine;
  networkStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
  networkStatus.className = 'value ' + (online ? 'ok' : 'bad');
}

window.addEventListener('online', setNetworkStatus);
window.addEventListener('offline', setNetworkStatus);
setNetworkStatus();

const now = new Date();
bootStamp.textContent = now.toLocaleString('id-ID') + ' • ' + (navigator.onLine ? 'boot online' : 'boot offline');

const saved = localStorage.getItem('pems_v14c_a_test');
if (saved) savedResult.textContent = 'Data lokal ditemukan: ' + saved;

saveBtn.addEventListener('click', () => {
  const value = 'PEMS local OK @ ' + new Date().toLocaleString('id-ID');
  localStorage.setItem('pems_v14c_a_test', value);
  savedResult.textContent = 'Tersimpan: ' + value;
});

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
