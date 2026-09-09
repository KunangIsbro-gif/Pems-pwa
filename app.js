
const browserEl = document.getElementById('browserStatus');
const proofEl = document.getElementById('proofStatus');
const projectStatusEl = document.getElementById('projectStatus');
const projectResultEl = document.getElementById('projectResult');
const loginResultEl = document.getElementById('loginResult');
const verifyBtn = document.getElementById('verifyBtn');
const loadProjectsBtn = document.getElementById('loadProjectsBtn');
const projectsPanel = document.getElementById('projectsPanel');
const projectListEl = document.getElementById('projectList');
const selectedProjectBanner = document.getElementById('selectedProjectBanner');

const PROOF_KEY = 'PEMS_SERVER_PROOF_STEP3C';
const PROJECTS_KEY = 'PEMS_PROJECTS_STEP4B';
const SELECTED_PROJECT_KEY = 'PEMS_SELECTED_PROJECT_STEP4B';

let currentGoogleCredential = '';
let currentServerProof = '';
let currentProjects = [];

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

function readSignedPayload(token){
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    return JSON.parse(base64UrlDecodeUtf8(parts[0]) || '{}');
  } catch (e) {
    return null;
  }
}

function acceptProof(proof){
  const payload = readSignedPayload(proof);
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
    loadProjectsBtn.disabled = true;
    return false;
  }

  currentServerProof = proof;
  sessionStorage.setItem(PROOF_KEY, proof);
  proofEl.textContent = 'RECEIVED';
  proofEl.className = 'ok';
  loadProjectsBtn.disabled = false;
  return true;
}

function acceptProjectBundle(bundle){
  const payload = readSignedPayload(bundle);
  const nowSec = Math.floor(Date.now() / 1000);

  const validShape =
    payload &&
    payload.v === 'V14C-B2A-STEP4B' &&
    payload.kind === 'PROJECT_LIST' &&
    Array.isArray(payload.projects) &&
    Number(payload.exp || 0) > nowSec;

  if (!validShape) {
    projectStatusEl.textContent = 'INVALID';
    projectStatusEl.className = 'bad';
    projectResultEl.className = 'result errbox';
    projectResultEl.textContent = 'Project bundle tidak valid / expired.';
    return false;
  }

  currentProjects = payload.projects;
  sessionStorage.setItem(PROJECTS_KEY, JSON.stringify(currentProjects));

  projectStatusEl.textContent = 'LOADED';
  projectStatusEl.className = 'ok';

  projectResultEl.className = 'result okbox';
  projectResultEl.innerHTML =
    '<strong>✓ PROJECT DATA LOADED</strong><br>' +
    'Total project ACTIVE: ' + escapeHtml(String(currentProjects.length)) + '<br>' +
    'Email session: ' + escapeHtml(payload.email || '-');

  renderProjects();
  return true;
}

function processHashHandoffs(){
  const hash = String(location.hash || '');

  if (hash.startsWith('#pems_auth=')) {
    const proof = decodeURIComponent(hash.slice('#pems_auth='.length));
    acceptProof(proof);
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }

  if (hash.startsWith('#pems_projects=')) {
    const bundle = decodeURIComponent(hash.slice('#pems_projects='.length));
    acceptProjectBundle(bundle);

    const storedProof = sessionStorage.getItem(PROOF_KEY);
    if (storedProof) {
      acceptProof(storedProof);
    }

    history.replaceState(null, '', location.pathname + location.search);
  }
}
processHashHandoffs();

if (!currentServerProof) {
  const storedProof = sessionStorage.getItem(PROOF_KEY);
  if (storedProof) acceptProof(storedProof);
}

if (currentProjects.length === 0) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(PROJECTS_KEY) || '[]');
    if (Array.isArray(cached) && cached.length) {
      currentProjects = cached;
      projectStatusEl.textContent = 'LOADED';
      projectStatusEl.className = 'ok';
      projectResultEl.className = 'result okbox';
      projectResultEl.innerHTML =
        '<strong>✓ PROJECT DATA LOADED</strong><br>' +
        'Total project ACTIVE: ' + escapeHtml(String(currentProjects.length));
      renderProjects();
    }
  } catch (e) {}
}

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
    loginResultEl.className = 'result errbox';
    loginResultEl.textContent = 'Login Google gagal.';
    return;
  }

  currentGoogleCredential = credential;
  verifyBtn.disabled = false;

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

  submitHiddenPost(
    {
      action: 'verify_google',
      credential: currentGoogleCredential
    },
    '_self'
  );
});

loadProjectsBtn.addEventListener('click', function(){
  if (!currentServerProof) {
    alert('Session proof belum ada / sudah expired. Login ulang dulu.');
    return;
  }

  submitHiddenPost(
    {
      action: 'read_projects_handoff',
      proof: currentServerProof
    },
    '_self'
  );
});

function renderProjects(){
  projectsPanel.hidden = false;
  projectListEl.innerHTML = '';

  const selectedId = sessionStorage.getItem(SELECTED_PROJECT_KEY) || '';

  currentProjects.forEach(function(project){
    const card = document.createElement('div');
    card.className =
      'project-card' +
      (selectedId === project.projectId ? ' selected' : '');

    card.innerHTML =
      '<div class="project-id">' + escapeHtml(project.projectId || '-') + '</div>' +
      '<div class="project-name">' + escapeHtml(project.projectName || '-') + '</div>' +
      '<div class="project-meta">' +
        '<b>Stakeholder:</b> ' + escapeHtml(project.stakeholder || '-') + '<br>' +
        '<b>LOP / Ring:</b> ' + escapeHtml(project.lopRing || '-') + '<br>' +
        '<b>Status:</b> ' + escapeHtml(project.statusProject || '-') +
      '</div>' +
      '<div class="project-actions">' +
        '<button class="select-btn" type="button">PILIH PROJECT</button>' +
      '</div>';

    card.querySelector('.select-btn').addEventListener('click', function(){
      sessionStorage.setItem(SELECTED_PROJECT_KEY, project.projectId || '');
      renderProjects();
      renderSelectedProject(project);
    });

    projectListEl.appendChild(card);
  });

  if (selectedId) {
    const selected = currentProjects.find(p => p.projectId === selectedId);
    if (selected) renderSelectedProject(selected);
  }
}

function renderSelectedProject(project){
  selectedProjectBanner.innerHTML =
    '<div class="selected-banner">' +
      '<strong>✓ PROJECT TERPILIH</strong><br>' +
      escapeHtml(project.projectId || '-') + ' — ' +
      escapeHtml(project.projectName || '-') +
    '</div>';
}

function submitHiddenPost(fields, target){
  const bridgeUrl = String(window.PEMS_BRIDGE_URL || '').trim();

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = bridgeUrl;
  form.target = target || '_self';
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
