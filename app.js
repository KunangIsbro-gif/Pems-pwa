
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
const photoLocalStatusEl = document.getElementById('photoLocalStatus');
const photoInput = document.getElementById('photoInput');
const choosePhotoBtn = document.getElementById('choosePhotoBtn');
const photoResultEl = document.getElementById('photoResult');
const photoPreviewWrap = document.getElementById('photoPreviewWrap');
const photoPreview = document.getElementById('photoPreview');
const projectsPanel = document.getElementById('projectsPanel');
const projectListEl = document.getElementById('projectList');
const selectedProjectBanner = document.getElementById('selectedProjectBanner');

const PROOF_KEY = 'PEMS_SERVER_PROOF_STEP3C';
const PROJECTS_KEY = 'PEMS_PROJECTS_STEP5A';
const SELECTED_PROJECT_KEY = 'PEMS_SELECTED_PROJECT_STEP5A';
const MATERIALS_KEY = 'PEMS_MATERIALS_STEP7B';
const EVIDENCE_DRAFTS_KEY = 'PEMS_EVIDENCE_DRAFTS_STEP7B';

let currentGoogleCredential = '';
let currentServerProof = '';
let currentProjects = [];
let currentMaterials = [];
let currentEvidenceDraft = null;
let currentLocalPhoto = null;

const PHOTO_DB_NAME = 'PEMS_LOCAL_EVIDENCE_DB';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE = 'photos';

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




function openPhotoDb(){
  return new Promise(function(resolve, reject){
    const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);

    request.onupgradeneeded = function(event){
      const db = event.target.result;

      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(
          PHOTO_STORE,
          { keyPath: 'photoLocalId' }
        );

        store.createIndex(
          'evidenceDraftId',
          'evidenceDraftId',
          { unique: false }
        );
      }
    };

    request.onsuccess = function(){
      resolve(request.result);
    };

    request.onerror = function(){
      reject(request.error || new Error('IndexedDB gagal dibuka.'));
    };
  });
}

function putLocalPhoto(record){
  return openPhotoDb().then(function(db){
    return new Promise(function(resolve, reject){
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);

      store.put(record);

      tx.oncomplete = function(){
        db.close();
        resolve(record);
      };

      tx.onerror = function(){
        db.close();
        reject(tx.error || new Error('Foto lokal gagal disimpan.'));
      };
    });
  });
}

function getLatestPhotoByEvidenceDraftId(evidenceDraftId){
  return openPhotoDb().then(function(db){
    return new Promise(function(resolve, reject){
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_STORE);
      const index = store.index('evidenceDraftId');
      const request = index.getAll(evidenceDraftId);

      request.onsuccess = function(){
        const rows = Array.isArray(request.result)
          ? request.result
          : [];

        rows.sort(function(a, b){
          return String(b.createdAt || '')
            .localeCompare(String(a.createdAt || ''));
        });

        db.close();
        resolve(rows[0] || null);
      };

      request.onerror = function(){
        db.close();
        reject(request.error || new Error('Foto lokal gagal dibaca.'));
      };
    });
  });
}

function makeLocalPhotoId(){
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return 'PHOTO-LOCAL-' + stamp + '-' + rand;
}

function getGpsPosition(){
  return new Promise(function(resolve, reject){
    if (!navigator.geolocation) {
      reject(new Error('Browser tidak mendukung GPS/geolocation.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function(position){
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString()
        });
      },
      function(error){
        let message = 'GPS gagal diperoleh.';

        if (error && error.code === 1) {
          message = 'Izin lokasi ditolak.';
        } else if (error && error.code === 2) {
          message = 'Lokasi tidak tersedia.';
        } else if (error && error.code === 3) {
          message = 'Permintaan GPS timeout.';
        }

        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );
  });
}

function formatBytes(bytes){
  const n = Number(bytes || 0);

  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function renderLocalPhoto(record){
  currentLocalPhoto = record || null;

  if (!record) {
    photoLocalStatusEl.textContent = 'BELUM ADA';
    photoLocalStatusEl.className = '';
    photoResultEl.className = 'result muted';
    photoResultEl.textContent = 'Belum ada foto lokal.';
    photoPreviewWrap.hidden = true;
    photoPreview.removeAttribute('src');
    return;
  }

  photoLocalStatusEl.textContent = 'READY';
  photoLocalStatusEl.className = 'ok';

  photoResultEl.className = 'result okbox';
  photoResultEl.innerHTML =
    '<strong>✓ PHOTO LOCAL READY</strong><br>' +
    '<b>Photo Local ID:</b> ' +
      escapeHtml(record.photoLocalId || '-') + '<br>' +
    '<b>Evidence Draft ID:</b> ' +
      escapeHtml(record.evidenceDraftId || '-') + '<br>' +
    '<b>File:</b> ' +
      escapeHtml(record.fileName || '-') + '<br>' +
    '<b>Size:</b> ' +
      escapeHtml(formatBytes(record.fileSize || 0)) + '<br>' +
    '<b>Latitude:</b> ' +
      escapeHtml(String(record.latitude ?? '-')) + '<br>' +
    '<b>Longitude:</b> ' +
      escapeHtml(String(record.longitude ?? '-')) + '<br>' +
    '<b>GPS Accuracy:</b> ' +
      escapeHtml(String(record.accuracy ?? '-')) + ' m<br>' +
    '<b>Status:</b> PHOTO_LOCAL_READY<br>' +
    '<small>Foto + GPS tersimpan lokal. Belum sync ke server.</small>';

  if (record.blob) {
    const objectUrl = URL.createObjectURL(record.blob);
    photoPreview.src = objectUrl;
    photoPreviewWrap.hidden = false;
  } else {
    photoPreviewWrap.hidden = true;
  }
}

function restoreLocalPhoto(){
  if (!currentEvidenceDraft || !currentEvidenceDraft.evidenceDraftId) {
    renderLocalPhoto(null);
    return;
  }

  getLatestPhotoByEvidenceDraftId(
    currentEvidenceDraft.evidenceDraftId
  )
    .then(function(record){
      renderLocalPhoto(record);
    })
    .catch(function(){
      renderLocalPhoto(null);
    });
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
    choosePhotoBtn.disabled = true;
    renderLocalPhoto(null);
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

  choosePhotoBtn.disabled = false;
  restoreLocalPhoto();
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


choosePhotoBtn.addEventListener('click', function(){
  if (!currentEvidenceDraft) {
    alert('Buat / pilih draft evidence dulu.');
    return;
  }

  photoInput.value = '';
  photoInput.click();
});

photoInput.addEventListener('change', async function(){
  const file =
    photoInput.files && photoInput.files[0]
      ? photoInput.files[0]
      : null;

  if (!file) {
    return;
  }

  if (!currentEvidenceDraft) {
    alert('Draft evidence belum aktif.');
    return;
  }

  photoLocalStatusEl.textContent = 'PROCESSING';
  photoLocalStatusEl.className = '';
  photoResultEl.className = 'result muted';
  photoResultEl.textContent = 'Mengambil GPS dan menyimpan foto lokal...';

  try {
    const gps = await getGpsPosition();

    const record = {
      photoLocalId: makeLocalPhotoId(),
      evidenceDraftId: currentEvidenceDraft.evidenceDraftId,
      projectId: currentEvidenceDraft.projectId,
      projectMaterialId: currentEvidenceDraft.projectMaterialId,
      fileName: file.name || 'evidence.jpg',
      fileType: file.type || 'image/jpeg',
      fileSize: file.size || 0,
      blob: file,
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy,
      capturedAt: gps.capturedAt,
      createdAt: new Date().toISOString(),
      status: 'PHOTO_LOCAL_READY'
    };

    await putLocalPhoto(record);
    renderLocalPhoto(record);

  } catch (error) {
    photoLocalStatusEl.textContent = 'GPS / SAVE FAILED';
    photoLocalStatusEl.className = 'bad';
    photoResultEl.className = 'result errbox';
    photoResultEl.textContent =
      error && error.message
        ? error.message
        : 'Foto lokal gagal diproses.';
  }
});

refreshMaterialButton();
