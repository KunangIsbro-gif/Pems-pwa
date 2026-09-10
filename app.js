
const browserEl = document.getElementById('browserStatus');
const proofEl = document.getElementById('proofStatus');
const projectStatusEl = document.getElementById('projectStatus');
const projectResultEl = document.getElementById('projectResult');
const loginResultEl = document.getElementById('loginResult');
const verifyBtn = document.getElementById('verifyBtn');
const loadProjectsBtn = document.getElementById('loadProjectsBtn');
const readMaterialsBtn = document.getElementById('readMaterialsBtn');
const materialStatusEl = document.getElementById('materialStatus');
const materialsPanel = document.getElementById('materialsPanel');
const materialSummaryEl = document.getElementById('materialSummary');
const materialListEl = document.getElementById('materialList');
const evidenceDraftStatusEl = document.getElementById('evidenceDraftStatus');
const evidenceDraftPanel = document.getElementById('evidenceDraftPanel');
const evidenceDraftResultEl = document.getElementById('evidenceDraftResult');
const projectsPanel = document.getElementById('projectsPanel');
const projectListEl = document.getElementById('projectList');
const selectedProjectBanner = document.getElementById('selectedProjectBanner');

const PROOF_KEY = 'PEMS_SERVER_PROOF_STEP3C';
const PROJECTS_KEY = 'PEMS_PROJECTS_STEP5A';
const SELECTED_PROJECT_KEY = 'PEMS_SELECTED_PROJECT_STEP5A';
const MATERIALS_KEY = 'PEMS_MATERIALS_STEP7A';
const EVIDENCE_DRAFTS_KEY = 'PEMS_EVIDENCE_DRAFTS_STEP7A';

let currentGoogleCredential = '';
let currentServerProof = '';
let currentProjects = [];
let currentMaterials = [];
let currentEvidenceDraft = null;

function getSelectedProjectId(){
  return localStorage.getItem(SELECTED_PROJECT_KEY) || '';
}

function refreshMaterialButton(){
  readMaterialsBtn.disabled = !(
    currentServerProof &&
    getSelectedProjectId()
  );
}

function setConnectivity(){
  const online = navigator.onLine;
  browserEl.textContent = online ? 'ONLINE' : 'OFFLINE';
  browserEl.className = online ? 'ok' : 'bad';

  if (currentMaterials.length > 0) {
    materialStatusEl.textContent = online ? 'CACHED' : 'CACHED OFFLINE';
    materialStatusEl.className = 'ok';

    const projectId = getSelectedProjectId();
    if (projectId) {
      renderMaterials(projectId);
    }
  }
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
    refreshMaterialButton();
    return false;
  }

  currentServerProof = proof;
  sessionStorage.setItem(PROOF_KEY, proof);
  proofEl.textContent = 'RECEIVED';
  proofEl.className = 'ok';
  loadProjectsBtn.disabled = false;
  refreshMaterialButton();
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
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(currentProjects));

  projectStatusEl.textContent = 'CACHED';
  projectStatusEl.className = 'ok';

  projectResultEl.className = 'result okbox';
  projectResultEl.innerHTML =
    '<strong>✓ PROJECT DATA LOADED & CACHED</strong><br>' +
    'Total project ACTIVE: ' + escapeHtml(String(currentProjects.length)) + '<br>' +
    'Email session: ' + escapeHtml(payload.email || '-') + '<br>' +
    '<small>Project disimpan lokal agar tetap tersedia saat PEMS dibuka kembali offline.</small>';

  renderProjects();
  return true;
}



function loadEvidenceDrafts(){
  try {
    const drafts = JSON.parse(
      localStorage.getItem(EVIDENCE_DRAFTS_KEY) || '[]'
    );
    return Array.isArray(drafts) ? drafts : [];
  } catch (e) {
    return [];
  }
}

function saveEvidenceDrafts(drafts){
  localStorage.setItem(
    EVIDENCE_DRAFTS_KEY,
    JSON.stringify(Array.isArray(drafts) ? drafts : [])
  );
}

function makeLocalEvidenceDraftId(){
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return 'EVI-LOCAL-' + stamp + '-' + rand;
}

function createOrReuseEvidenceDraft(material){
  const projectId = getSelectedProjectId();

  if (!projectId || !material || !material.projectMaterialId) {
    alert('Project / material belum valid.');
    return;
  }

  const drafts = loadEvidenceDrafts();

  let draft = drafts.find(function(item){
    return (
      item &&
      item.projectId === projectId &&
      item.projectMaterialId === material.projectMaterialId &&
      item.status === 'DRAFT_LOCAL'
    );
  });

  if (!draft) {
    draft = {
      evidenceDraftId: makeLocalEvidenceDraftId(),
      projectId: projectId,
      projectMaterialId: material.projectMaterialId,
      materialId: material.materialId || '',
      designator: material.designator || '',
      materialName: material.materialName || '',
      category: material.category || '',
      qtyPlan:
        material.qtyPlan === null || material.qtyPlan === undefined
          ? ''
          : material.qtyPlan,
      unit: material.unit || '',
      status: 'DRAFT_LOCAL',
      createdAt: new Date().toISOString()
    };

    drafts.push(draft);
    saveEvidenceDrafts(drafts);
  }

  currentEvidenceDraft = draft;
  renderEvidenceDraft();
  renderMaterials(projectId);
}

function renderEvidenceDraft(){
  if (!currentEvidenceDraft) {
    evidenceDraftStatusEl.textContent = 'BELUM ADA';
    evidenceDraftStatusEl.className = '';
    evidenceDraftPanel.hidden = true;
    return;
  }

  evidenceDraftStatusEl.textContent = 'DRAFT LOCAL';
  evidenceDraftStatusEl.className = 'ok';
  evidenceDraftPanel.hidden = false;

  evidenceDraftResultEl.innerHTML =
    '<strong>✓ DRAFT EVIDENCE LOCAL</strong><br>' +
    '<b>Evidence Draft ID:</b> ' +
      escapeHtml(currentEvidenceDraft.evidenceDraftId || '-') + '<br>' +
    '<b>Project:</b> ' +
      escapeHtml(currentEvidenceDraft.projectId || '-') + '<br>' +
    '<b>Project Material ID:</b> ' +
      escapeHtml(currentEvidenceDraft.projectMaterialId || '-') + '<br>' +
    '<b>Designator:</b> ' +
      escapeHtml(currentEvidenceDraft.designator || '-') + '<br>' +
    '<b>Material:</b> ' +
      escapeHtml(currentEvidenceDraft.materialName || '-') + '<br>' +
    '<b>Status:</b> ' +
      escapeHtml(currentEvidenceDraft.status || '-') + '<br>' +
    '<small>Draft tersimpan lokal. Belum dikirim ke server.</small>';
}

function restoreEvidenceDraft(){
  const projectId = getSelectedProjectId();
  if (!projectId) return;

  const drafts = loadEvidenceDrafts();

  const draft = drafts
    .filter(function(item){
      return (
        item &&
        item.projectId === projectId &&
        item.status === 'DRAFT_LOCAL'
      );
    })
    .sort(function(a, b){
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })[0];

  if (draft) {
    currentEvidenceDraft = draft;
    renderEvidenceDraft();
  }
}

function acceptMaterialBundle(bundle){
  const payload = readSignedPayload(bundle);
  const nowSec = Math.floor(Date.now() / 1000);
  const selectedProjectId = getSelectedProjectId();

  const validShape =
    payload &&
    payload.v === 'V14C-B2A-STEP6B' &&
    payload.kind === 'PROJECT_MATERIAL_LIST' &&
    typeof payload.projectId === 'string' &&
    payload.projectId === selectedProjectId &&
    Array.isArray(payload.materials) &&
    Number(payload.exp || 0) > nowSec;

  if (!validShape) {
    materialStatusEl.textContent = 'INVALID';
    materialStatusEl.className = 'bad';
    materialsPanel.hidden = true;
    return false;
  }

  currentMaterials = payload.materials;

  // Step 6C: material disimpan persistently agar tersedia saat offline.
  localStorage.setItem(
    MATERIALS_KEY,
    JSON.stringify({
      projectId: payload.projectId,
      materials: currentMaterials,
      cachedAt: Date.now()
    })
  );

  materialStatusEl.textContent = 'CACHED';
  materialStatusEl.className = 'ok';

  renderMaterials(payload.projectId);
  return true;
}

function renderMaterials(projectId){
  materialsPanel.hidden = false;
  materialListEl.innerHTML = '';

  materialSummaryEl.innerHTML =
    '<strong>✓ ' +
      (navigator.onLine ? 'MATERIAL DATA READY' : 'MATERIAL CACHE READY') +
    '</strong><br>' +
    'Project: ' + escapeHtml(projectId || '-') + '<br>' +
    'Total material: ' + escapeHtml(String(currentMaterials.length)) + '<br>' +
    '<small>' +
      (navigator.onLine
        ? 'Material tersedia di cache lokal perangkat.'
        : 'Material dibaca dari cache lokal perangkat.')
    + '</small>';

  currentMaterials.forEach(function(item, index){
    const card = document.createElement('div');

    const isDraftSelected =
      currentEvidenceDraft &&
      currentEvidenceDraft.projectMaterialId === item.projectMaterialId;

    card.className =
      'material-card' +
      (isDraftSelected ? ' draft-selected' : '');

    card.innerHTML =
      '<div class="material-title">' +
        escapeHtml(String(index + 1)) + '. ' +
        escapeHtml(item.designator || '-') +
      '</div>' +
      '<div class="material-meta">' +
        '<b>Material:</b> ' + escapeHtml(item.materialName || '-') + '<br>' +
        '<b>Category:</b> ' + escapeHtml(item.category || '-') + '<br>' +
        '<b>Qty Plan:</b> ' +
          escapeHtml(
            String(
              item.qtyPlan === null || item.qtyPlan === undefined
                ? ''
                : item.qtyPlan
            )
          ) +
          ' ' + escapeHtml(item.unit || '') + '<br>' +
        '<b>Project Material ID:</b> ' +
          escapeHtml(item.projectMaterialId || '-') +
      '</div>' +
      '<div class="material-actions">' +
        '<button class="evidence-btn" type="button">' +
          (isDraftSelected ? 'DRAFT TERPILIH' : 'BUAT DRAFT EVIDENCE') +
        '</button>' +
      '</div>';

    card
      .querySelector('.evidence-btn')
      .addEventListener('click', function(){
        createOrReuseEvidenceDraft(item);
      });

    materialListEl.appendChild(card);
  });
}

function restoreMaterialCache(){
  try {
    const stored = JSON.parse(
      localStorage.getItem(MATERIALS_KEY) || 'null'
    );

    if (
      stored &&
      stored.projectId === getSelectedProjectId() &&
      Array.isArray(stored.materials)
    ) {
      currentMaterials = stored.materials;
      materialStatusEl.textContent =
        navigator.onLine ? 'CACHED' : 'CACHED OFFLINE';
      materialStatusEl.className = 'ok';
      renderMaterials(stored.projectId);
    }
  } catch (e) {}
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
    return;
  }

  if (hash.startsWith('#pems_materials=')) {
    const bundle = decodeURIComponent(hash.slice('#pems_materials='.length));
    acceptMaterialBundle(bundle);

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
    const cached = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    if (Array.isArray(cached) && cached.length) {
      currentProjects = cached;
      projectStatusEl.textContent = navigator.onLine ? 'CACHED' : 'CACHED OFFLINE';
      projectStatusEl.className = 'ok';
      projectResultEl.className = 'result okbox';
      projectResultEl.innerHTML =
        '<strong>✓ PROJECT CACHE READY</strong><br>' +
        'Total project tersimpan: ' + escapeHtml(String(currentProjects.length)) + '<br>' +
        '<small>Data project dibaca dari cache lokal perangkat.</small>';
      renderProjects();
    }
  } catch (e) {}
}

restoreMaterialCache();
restoreEvidenceDraft();

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
    '_blank'
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

readMaterialsBtn.addEventListener('click', function(){
  const projectId = getSelectedProjectId();

  if (!currentServerProof) {
    alert('Session proof belum ada / sudah expired. Login ulang dulu.');
    return;
  }

  if (!projectId) {
    alert('Pilih project dulu.');
    return;
  }

  submitHiddenPost(
    {
      action: 'read_project_materials_handoff',
      proof: currentServerProof,
      project_id: projectId
    },
    '_self'
  );
});

function renderProjects(){
  projectsPanel.hidden = false;
  projectListEl.innerHTML = '';

  const selectedId = localStorage.getItem(SELECTED_PROJECT_KEY) || '';

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
      localStorage.setItem(SELECTED_PROJECT_KEY, project.projectId || '');
      renderProjects();
      renderSelectedProject(project);
      refreshMaterialButton();
    });

    projectListEl.appendChild(card);
  });

  if (selectedId) {
    const selected = currentProjects.find(p => p.projectId === selectedId);
    if (selected) renderSelectedProject(selected);
  }

  refreshMaterialButton();
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
  form.target = target || '_blank';
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

refreshMaterialButton();
