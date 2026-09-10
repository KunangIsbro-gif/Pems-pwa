
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
const gpsQualityStatusEl = document.getElementById('gpsQualityStatus');
const retryGpsBtn = document.getElementById('retryGpsBtn');
const pointSessionStatusEl = document.getElementById('pointSessionStatus');
const loadPointSessionsBtn = document.getElementById('loadPointSessionsBtn');
const pointSessionsPanel = document.getElementById('pointSessionsPanel');
const pointSessionSummaryEl = document.getElementById('pointSessionSummary');
const pointSessionListEl = document.getElementById('pointSessionList');
const pointSessionSearchEl = document.getElementById('pointSessionSearch');
const pointSessionRenderInfoEl = document.getElementById('pointSessionRenderInfo');
const syncServerStatusEl = document.getElementById('syncServerStatus');
const syncEvidenceBtn = document.getElementById('syncEvidenceBtn');
const syncGateResultEl = document.getElementById('syncGateResult');
const syncResultLocalEl = document.getElementById('syncResultLocal');
const projectsPanel = document.getElementById('projectsPanel');
const projectListEl = document.getElementById('projectList');
const selectedProjectBanner = document.getElementById('selectedProjectBanner');

const PROOF_KEY = 'PEMS_SERVER_PROOF_STEP3C';
const PROJECTS_KEY = 'PEMS_PROJECTS_STEP5A';
const SELECTED_PROJECT_KEY = 'PEMS_SELECTED_PROJECT_STEP5A';
const MATERIALS_KEY = 'PEMS_MATERIALS_STEP7D';
const EVIDENCE_DRAFTS_KEY = 'PEMS_EVIDENCE_DRAFTS_STEP7D';
const POINT_SESSIONS_KEY = 'PEMS_POINT_SESSIONS_STEP8B';
const SELECTED_POINT_SESSION_KEY = 'PEMS_SELECTED_POINT_SESSION_STEP8B';

let currentGoogleCredential = '';
let currentServerProof = '';
let currentProjects = [];
let currentMaterials = [];
let currentEvidenceDraft = null;
let currentLocalPhoto = null;
let currentPointSessions = [];

const POINT_RENDER_LIMIT = 30;
let pointSessionSearchTerm = '';

const PHOTO_DB_NAME = 'PEMS_LOCAL_EVIDENCE_DB';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE = 'photos';

function getSelectedProjectId(){
  return localStorage.getItem(SELECTED_PROJECT_KEY) || '';
}

function refreshMaterialButton(){
  const ready =
    !!currentServerProof &&
    !!getSelectedProjectId();

  readMaterialsBtn.disabled = !ready;
  loadPointSessionsBtn.disabled = !ready;
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

  if (typeof refreshSyncGate === 'function') {
    refreshSyncGate();
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
    refreshSyncGate();
    return false;
  }

  currentServerProof = proof;
  sessionStorage.setItem(PROOF_KEY, proof);
  proofEl.textContent = 'RECEIVED';
  proofEl.className = 'ok';
  loadProjectsBtn.disabled = false;
  refreshMaterialButton();
  refreshSyncGate();
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


function updateLocalPhotoRecord(photoLocalId, patch){
  return openPhotoDb().then(function(db){
    return new Promise(function(resolve, reject){
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      const getReq = store.get(photoLocalId);

      getReq.onsuccess = function(){
        const current = getReq.result;

        if (!current) {
          db.close();
          reject(new Error('Photo Local ID tidak ditemukan.'));
          return;
        }

        const updated = Object.assign({}, current, patch || {});
        store.put(updated);

        tx.oncomplete = function(){
          db.close();
          resolve(updated);
        };
      };

      getReq.onerror = function(){
        db.close();
        reject(getReq.error || new Error('Foto lokal gagal dibaca.'));
      };

      tx.onerror = function(){
        db.close();
        reject(tx.error || new Error('Foto lokal gagal diperbarui.'));
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


function classifyGpsAccuracy(accuracy){
  const value = Number(accuracy);

  if (!Number.isFinite(value)) {
    return {
      code: 'UNKNOWN',
      label: 'UNKNOWN',
      syncAllowed: false
    };
  }

  if (value <= 20) {
    return {
      code: 'GOOD',
      label: 'GOOD',
      syncAllowed: true
    };
  }

  if (value <= 50) {
    return {
      code: 'WARNING',
      label: 'WARNING',
      syncAllowed: true
    };
  }

  return {
    code: 'RETRY',
    label: 'RETRY GPS',
    syncAllowed: false
  };
}

function renderGpsQuality(record){
  if (!record) {
    gpsQualityStatusEl.textContent = 'BELUM ADA';
    gpsQualityStatusEl.className = '';
    retryGpsBtn.hidden = true;
    return;
  }

  const quality = classifyGpsAccuracy(record.accuracy);

  gpsQualityStatusEl.textContent = quality.label;
  gpsQualityStatusEl.className =
    quality.code === 'RETRY' ? 'bad' : 'ok';

  retryGpsBtn.hidden = quality.code !== 'RETRY';
}

async function retryGpsForCurrentPhoto(){
  if (!currentLocalPhoto) {
    alert('Belum ada foto lokal.');
    return;
  }

  gpsQualityStatusEl.textContent = 'CHECKING';
  gpsQualityStatusEl.className = '';
  retryGpsBtn.disabled = true;

  try {
    const gps = await getGpsPosition();

    const updated = Object.assign({}, currentLocalPhoto, {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy,
      capturedAt: gps.capturedAt,
      gpsRetriedAt: new Date().toISOString()
    });

    await putLocalPhoto(updated);
    renderLocalPhoto(updated);
  } catch (error) {
    gpsQualityStatusEl.textContent = 'RETRY FAILED';
    gpsQualityStatusEl.className = 'bad';
    photoResultEl.className = 'result errbox';
    photoResultEl.textContent =
      error && error.message
        ? error.message
        : 'Retry GPS gagal.';
  } finally {
    retryGpsBtn.disabled = false;
  }
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
    renderGpsQuality(null);
    return;
  }

  photoLocalStatusEl.textContent =
    record.status === 'SYNCED'
      ? 'SYNCED'
      : 'READY';
  photoLocalStatusEl.className = 'ok';

  const gpsQuality = classifyGpsAccuracy(record.accuracy);
  renderGpsQuality(record);

  photoResultEl.className =
    gpsQuality.code === 'RETRY' ? 'result errbox' : 'result okbox';
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
    '<b>GPS Quality:</b> ' +
      escapeHtml(gpsQuality.label) + '<br>' +
    '<b>Sync Gate:</b> ' +
      (gpsQuality.syncAllowed ? 'ALLOWED' : 'BLOCKED - RETRY GPS') + '<br>' +
    '<b>Status:</b> ' +
      escapeHtml(record.status || 'PHOTO_LOCAL_READY') + '<br>' +
    (
      record.status === 'SYNCED'
        ? (
            '<b>Evidence Item ID:</b> ' +
            escapeHtml(record.evidenceItemId || '-') + '<br>' +
            '<b>Photo ID:</b> ' +
            escapeHtml(record.photoId || '-') + '<br>' +
            '<small>Foto sudah tersinkron ke server.</small>'
          )
        : '<small>Foto + GPS tersimpan lokal. Belum sync ke server.</small>'
    );

  if (record.blob) {
    const objectUrl = URL.createObjectURL(record.blob);
    photoPreview.src = objectUrl;
    photoPreviewWrap.hidden = false;
  } else {
    photoPreviewWrap.hidden = true;
  }

  refreshSyncGate();
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

  evidenceDraftStatusEl.textContent =
    currentEvidenceDraft.status === 'SYNCED'
      ? 'SYNCED'
      : 'DRAFT LOCAL';
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
    '<b>Point Session ID:</b> ' +
      escapeHtml(currentEvidenceDraft.sessionId || 'BELUM DIPILIH') + '<br>' +
    (
      currentEvidenceDraft.status === 'SYNCED'
        ? (
            '<b>Evidence Item ID:</b> ' +
            escapeHtml(currentEvidenceDraft.evidenceItemId || '-') + '<br>' +
            '<b>Photo ID:</b> ' +
            escapeHtml(currentEvidenceDraft.photoId || '-') + '<br>' +
            '<small>Evidence sudah tersinkron ke server.</small>'
          )
        : '<small>Draft tersimpan lokal. Belum dikirim ke server.</small>'
    );

  choosePhotoBtn.disabled = false;
  restoreLocalPhoto();
  refreshSyncGate();
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


function updateEvidenceDraftPointSession(pointSession){
  if (!currentEvidenceDraft || !pointSession) return;

  const drafts = loadEvidenceDrafts();
  const index = drafts.findIndex(function(item){
    return (
      item &&
      item.evidenceDraftId === currentEvidenceDraft.evidenceDraftId
    );
  });

  currentEvidenceDraft = Object.assign(
    {},
    currentEvidenceDraft,
    {
      sessionId: pointSession.sessionId || '',
      anchorPointId: pointSession.anchorPointId || '',
      anchorLabel: pointSession.anchorLabel || '',
      anchorRole: pointSession.anchorRole || '',
      latPlan: pointSession.latPlan ?? '',
      longPlan: pointSession.longPlan ?? '',
      pointVerifyStatus: pointSession.verifyStatus || 'DRAFT',
      pointSessionSelectedAt: new Date().toISOString()
    }
  );

  if (index >= 0) {
    drafts[index] = currentEvidenceDraft;
    saveEvidenceDrafts(drafts);
  }

  renderEvidenceDraft();
}

function acceptPointSessionBundle(bundle){
  const payload = readSignedPayload(bundle);
  const nowSec = Math.floor(Date.now() / 1000);
  const selectedProjectId = getSelectedProjectId();

  const validShape =
    payload &&
    payload.v === 'V14C-B2A-STEP8A' &&
    payload.kind === 'POINT_SESSION_LIST' &&
    payload.projectId === selectedProjectId &&
    Array.isArray(payload.pointSessions) &&
    Number(payload.exp || 0) > nowSec;

  if (!validShape) {
    pointSessionStatusEl.textContent = 'INVALID';
    pointSessionStatusEl.className = 'bad';
    pointSessionsPanel.hidden = true;
    return false;
  }

  currentPointSessions = payload.pointSessions;

  localStorage.setItem(
    POINT_SESSIONS_KEY,
    JSON.stringify({
      projectId: payload.projectId,
      pointSessions: currentPointSessions,
      cachedAt: Date.now()
    })
  );

  pointSessionStatusEl.textContent = 'LOADED';
  pointSessionStatusEl.className = 'ok';
  renderPointSessions(payload.projectId);

  return true;
}

function renderPointSessions(projectId){
  pointSessionsPanel.hidden = false;
  pointSessionListEl.innerHTML = '';

  const selectedSessionId =
    localStorage.getItem(SELECTED_POINT_SESSION_KEY) || '';

  const normalizedSearch =
    String(pointSessionSearchTerm || '')
      .trim()
      .toLowerCase();

  let filtered = currentPointSessions;

  if (normalizedSearch) {
    filtered = currentPointSessions.filter(function(item){
      const haystack = [
        item.sessionId,
        item.anchorPointId,
        item.anchorLabel,
        item.anchorRole,
        item.pointId,
        item.verifyStatus
      ]
        .join(' ')
        .toLowerCase();

      return haystack.indexOf(normalizedSearch) !== -1;
    });
  }

  // Selected point selalu diprioritaskan supaya tidak "hilang"
  // walaupun berada di luar 30 hasil pertama.
  let visible = filtered.slice(0, POINT_RENDER_LIMIT);

  if (selectedSessionId) {
    const selectedItem = currentPointSessions.find(function(item){
      return String(item.sessionId || '') === selectedSessionId;
    });

    const alreadyVisible = visible.some(function(item){
      return String(item.sessionId || '') === selectedSessionId;
    });

    if (selectedItem && !alreadyVisible) {
      visible = [selectedItem].concat(
        visible.slice(0, Math.max(0, POINT_RENDER_LIMIT - 1))
      );
    }
  }

  pointSessionSummaryEl.innerHTML =
    '<strong>✓ POINT SESSION DATA LOADED</strong><br>' +
    'Project: ' + escapeHtml(projectId || '-') + '<br>' +
    'Total point session: ' +
      escapeHtml(String(currentPointSessions.length));

  pointSessionRenderInfoEl.textContent =
    'Tampil ' +
    visible.length +
    ' dari ' +
    filtered.length +
    ' hasil' +
    (normalizedSearch ? ' pencarian' : '') +
    '. Total cache: ' +
    currentPointSessions.length +
    '.';

  visible.forEach(function(item, visibleIndex){
    const card = document.createElement('div');
    const selected =
      selectedSessionId === String(item.sessionId || '');

    card.className =
      'point-card' + (selected ? ' selected' : '');

    const memberCount =
      Array.isArray(item.members) ? item.members.length : 0;

    card.innerHTML =
      '<div class="point-title">' +
        escapeHtml(String(visibleIndex + 1)) + '. ' +
        escapeHtml(item.anchorLabel || item.sessionId || '-') +
      '</div>' +
      '<div class="point-meta">' +
        '<b>Session ID:</b> ' +
          escapeHtml(item.sessionId || '-') + '<br>' +
        '<b>Anchor Point:</b> ' +
          escapeHtml(item.anchorPointId || '-') + '<br>' +
        '<b>Role:</b> ' +
          escapeHtml(item.anchorRole || '-') + '<br>' +
        '<b>Lat Plan:</b> ' +
          escapeHtml(String(item.latPlan ?? '-')) + '<br>' +
        '<b>Long Plan:</b> ' +
          escapeHtml(String(item.longPlan ?? '-')) + '<br>' +
        '<b>Verify Status:</b> ' +
          escapeHtml(item.verifyStatus || 'DRAFT') + '<br>' +
        '<b>Members:</b> ' +
          escapeHtml(String(memberCount)) +
      '</div>' +
      '<button class="point-btn" type="button">' +
        (selected
          ? 'POINT SESSION TERPILIH'
          : 'PILIH POINT SESSION') +
      '</button>';

    card.querySelector('.point-btn').addEventListener(
      'click',
      function(){
        localStorage.setItem(
          SELECTED_POINT_SESSION_KEY,
          item.sessionId || ''
        );

        updateEvidenceDraftPointSession(item);
        renderPointSessions(projectId);
        refreshSyncGate();
      }
    );

    pointSessionListEl.appendChild(card);
  });

  if (!visible.length) {
    pointSessionListEl.innerHTML =
      '<div class="result muted">Point Session tidak ditemukan.</div>';
  }
}
function restorePointSessions(){
  try {
    const stored = JSON.parse(
      localStorage.getItem(POINT_SESSIONS_KEY) || 'null'
    );

    if (
      stored &&
      stored.projectId === getSelectedProjectId() &&
      Array.isArray(stored.pointSessions)
    ) {
      currentPointSessions = stored.pointSessions;

      pointSessionStatusEl.textContent =
        navigator.onLine ? 'CACHED' : 'CACHED OFFLINE';
      pointSessionStatusEl.className = 'ok';

      renderPointSessions(stored.projectId);
    }
  } catch (e) {}
}


function refreshSyncGate(){
  const hasProof = !!currentServerProof;
  const hasDraft =
    !!currentEvidenceDraft &&
    !!currentEvidenceDraft.evidenceDraftId &&
    !!currentEvidenceDraft.projectId &&
    !!currentEvidenceDraft.projectMaterialId &&
    !!currentEvidenceDraft.sessionId;

  const selectedPointSessionId =
    localStorage.getItem(SELECTED_POINT_SESSION_KEY) || '';

  const hasPointSession =
    !!selectedPointSessionId &&
    currentPointSessions.some(function(item){
      return String(item.sessionId || '') === selectedPointSessionId;
    }) &&
    (!currentEvidenceDraft ||
      String(currentEvidenceDraft.sessionId || '') === selectedPointSessionId);

  const hasPhoto =
    !!currentLocalPhoto &&
    !!currentLocalPhoto.photoLocalId &&
    !!currentLocalPhoto.blob;

  const hasGps =
    hasPhoto &&
    Number.isFinite(Number(currentLocalPhoto.latitude)) &&
    Number.isFinite(Number(currentLocalPhoto.longitude)) &&
    Number.isFinite(Number(currentLocalPhoto.accuracy));

  const alreadySynced =
    !!currentEvidenceDraft &&
    currentEvidenceDraft.status === 'SYNCED';

  const ready =
    navigator.onLine &&
    hasProof &&
    hasDraft &&
    hasPointSession &&
    hasPhoto &&
    hasGps &&
    !alreadySynced;

  syncEvidenceBtn.disabled = !ready;

  if (!navigator.onLine) {
    syncServerStatusEl.textContent = 'OFFLINE';
    syncServerStatusEl.className = 'bad';
    syncGateResultEl.className = 'result errbox';
    syncGateResultEl.textContent = 'Offline. Sync server belum bisa dilakukan.';
    return;
  }

  if (!hasProof) {
    syncServerStatusEl.textContent = 'WAIT PROOF';
    syncServerStatusEl.className = '';
    syncGateResultEl.className = 'result muted';
    syncGateResultEl.textContent = 'Login + verifikasi server dulu.';
    return;
  }

  if (!hasDraft) {
    syncServerStatusEl.textContent = 'WAIT DRAFT';
    syncServerStatusEl.className = '';
    syncGateResultEl.className = 'result muted';
    syncGateResultEl.textContent =
      'Draft Evidence harus punya Project ID, Project Material ID, dan Point Session ID.';
    return;
  }

  if (alreadySynced) {
    syncServerStatusEl.textContent = 'SYNCED';
    syncServerStatusEl.className = 'ok';
    syncEvidenceBtn.disabled = true;

    syncGateResultEl.className = 'result okbox';
    syncGateResultEl.innerHTML =
      '<strong>✓ EVIDENCE SUDAH SYNCED</strong><br>' +
      'Evidence Item ID: ' +
      escapeHtml(currentEvidenceDraft.evidenceItemId || '-') + '<br>' +
      'Photo ID: ' +
      escapeHtml(currentEvidenceDraft.photoId || '-');
    return;
  }

  if (!hasPointSession) {
    syncServerStatusEl.textContent = 'WAIT POINT';
    syncServerStatusEl.className = '';
    syncGateResultEl.className = 'result muted';
    syncGateResultEl.textContent =
      'Point Session belum valid / belum dipilih ulang.';
    return;
  }

  if (!hasPhoto || !hasGps) {
    syncServerStatusEl.textContent = 'WAIT PHOTO';
    syncServerStatusEl.className = '';
    syncGateResultEl.className = 'result muted';
    syncGateResultEl.textContent = 'Foto lokal + GPS belum siap.';
    return;
  }

  const gpsQuality =
    classifyGpsAccuracy(currentLocalPhoto.accuracy);

  syncServerStatusEl.textContent = 'READY';
  syncServerStatusEl.className = 'ok';

  syncGateResultEl.className =
    gpsQuality.code === 'RETRY'
      ? 'result errbox'
      : 'result okbox';

  syncGateResultEl.innerHTML =
    '<strong>✓ SYNC GATE READY</strong><br>' +
    '<b>Mode:</b> DEV / LAPTOP<br>' +
    '<b>Evidence Draft:</b> ' +
      escapeHtml(currentEvidenceDraft.evidenceDraftId || '-') + '<br>' +
    '<b>Point Session:</b> ' +
      escapeHtml(currentEvidenceDraft.sessionId || '-') + '<br>' +
    '<b>Photo Local:</b> ' +
      escapeHtml(currentLocalPhoto.photoLocalId || '-') + '<br>' +
    '<b>GPS:</b> ' +
      escapeHtml(String(currentLocalPhoto.accuracy ?? '-')) +
      ' m — ' +
      escapeHtml(gpsQuality.label) + '<br>' +
    '<b>DEV Sync:</b> ALLOWED FOR TEST ONLY';
}

function blobToBase64Payload(blob){
  return new Promise(function(resolve, reject){
    const reader = new FileReader();

    reader.onload = function(){
      const result = String(reader.result || '');
      const comma = result.indexOf(',');

      resolve(
        comma >= 0
          ? result.slice(comma + 1)
          : result
      );
    };

    reader.onerror = function(){
      reject(
        reader.error ||
        new Error('Foto gagal dikonversi ke base64.')
      );
    };

    reader.readAsDataURL(blob);
  });
}

async function syncCurrentEvidence(){
  refreshSyncGate();

  if (syncEvidenceBtn.disabled) {
    alert('Data belum siap untuk sync.');
    return;
  }

  syncEvidenceBtn.disabled = true;
  syncServerStatusEl.textContent = 'PREPARING';
  syncServerStatusEl.className = '';
  syncGateResultEl.className = 'result muted';
  syncGateResultEl.textContent =
    'Menyiapkan foto untuk dikirim ke server...';

  try {
    const base64 =
      await blobToBase64Payload(
        currentLocalPhoto.blob
      );

    syncServerStatusEl.textContent = 'SENDING';

    submitHiddenPost(
      {
        action: 'sync_local_capture',
        proof: currentServerProof,
        project_id:
          currentEvidenceDraft.projectId,
        project_material_id:
          currentEvidenceDraft.projectMaterialId,
        session_id:
          currentEvidenceDraft.sessionId,
        evidence_draft_id:
          currentEvidenceDraft.evidenceDraftId,
        photo_local_id:
          currentLocalPhoto.photoLocalId,
        latitude:
          currentLocalPhoto.latitude,
        longitude:
          currentLocalPhoto.longitude,
        gps_accuracy:
          currentLocalPhoto.accuracy,
        captured_at:
          currentLocalPhoto.capturedAt ||
          currentLocalPhoto.createdAt ||
          '',
        file_name:
          currentLocalPhoto.fileName ||
          'evidence.jpg',
        mime_type:
          currentLocalPhoto.fileType ||
          'image/jpeg',
        base64: base64
      },
      '_self'
    );

  } catch (error) {
    syncServerStatusEl.textContent = 'FAILED';
    syncServerStatusEl.className = 'bad';
    syncGateResultEl.className = 'result errbox';
    syncGateResultEl.textContent =
      error && error.message
        ? error.message
        : 'Gagal menyiapkan data sync.';

    refreshSyncGate();
  }
}


async function acceptSyncResultBundle(bundle){
  const payload = readSignedPayload(bundle);
  const nowSec = Math.floor(Date.now() / 1000);

  const validShape =
    payload &&
    payload.v === 'V14C-B2A-STEP8C' &&
    payload.kind === 'SYNC_RESULT' &&
    payload.success === true &&
    Number(payload.exp || 0) > nowSec &&
    payload.evidenceDraftId &&
    payload.photoLocalId &&
    payload.evidenceItemId &&
    payload.photoId;

  if (!validShape) {
    syncServerStatusEl.textContent = 'RESULT INVALID';
    syncServerStatusEl.className = 'bad';
    syncResultLocalEl.className = 'result errbox';
    syncResultLocalEl.textContent =
      'Sync result tidak valid / expired.';
    return false;
  }

  // Update Evidence Draft localStorage.
  const drafts = loadEvidenceDrafts();
  const draftIndex = drafts.findIndex(function(item){
    return (
      item &&
      item.evidenceDraftId === payload.evidenceDraftId
    );
  });

  if (draftIndex >= 0) {
    drafts[draftIndex] = Object.assign(
      {},
      drafts[draftIndex],
      {
        status: 'SYNCED',
        evidenceItemId: payload.evidenceItemId,
        photoId: payload.photoId,
        syncMessage: payload.message || '',
        alreadySynced: payload.alreadySynced === true,
        gpsPolicy: payload.gpsPolicy || '',
        gpsBypass: payload.gpsBypass === true,
        syncedAt: new Date().toISOString()
      }
    );

    saveEvidenceDrafts(drafts);

    if (
      currentEvidenceDraft &&
      currentEvidenceDraft.evidenceDraftId === payload.evidenceDraftId
    ) {
      currentEvidenceDraft = drafts[draftIndex];
    }
  }

  // Update photo record in IndexedDB.
  try {
    const updatedPhoto = await updateLocalPhotoRecord(
      payload.photoLocalId,
      {
        status: 'SYNCED',
        evidenceItemId: payload.evidenceItemId,
        photoId: payload.photoId,
        serverFileName: payload.fileName || '',
        alreadySynced: payload.alreadySynced === true,
        syncedAt: new Date().toISOString()
      }
    );

    if (
      currentLocalPhoto &&
      currentLocalPhoto.photoLocalId === payload.photoLocalId
    ) {
      currentLocalPhoto = updatedPhoto;
    }
  } catch (e) {
    // Draft result tetap valid walau foto lokal sudah tidak tersedia.
  }

  syncServerStatusEl.textContent = 'SYNCED';
  syncServerStatusEl.className = 'ok';

  syncResultLocalEl.className = 'result okbox';
  syncResultLocalEl.innerHTML =
    '<strong>✓ SYNC RESULT RECEIVED</strong><br>' +
    '<b>Evidence Draft:</b> ' +
      escapeHtml(payload.evidenceDraftId) + '<br>' +
    '<b>Evidence Item ID:</b> ' +
      escapeHtml(payload.evidenceItemId) + '<br>' +
    '<b>Photo Local ID:</b> ' +
      escapeHtml(payload.photoLocalId) + '<br>' +
    '<b>Photo ID:</b> ' +
      escapeHtml(payload.photoId) + '<br>' +
    '<b>Status:</b> SYNCED<br>' +
    '<b>Already Synced:</b> ' +
      (payload.alreadySynced ? 'YES' : 'NO');

  renderEvidenceDraft();
  renderLocalPhoto(currentLocalPhoto);
  refreshSyncGate();

  return true;
}

function restoreSyncedResult(){
  if (
    currentEvidenceDraft &&
    currentEvidenceDraft.status === 'SYNCED' &&
    currentEvidenceDraft.evidenceItemId &&
    currentEvidenceDraft.photoId
  ) {
    syncServerStatusEl.textContent = 'SYNCED';
    syncServerStatusEl.className = 'ok';

    syncResultLocalEl.className = 'result okbox';
    syncResultLocalEl.innerHTML =
      '<strong>✓ EVIDENCE SUDAH SYNCED</strong><br>' +
      '<b>Evidence Item ID:</b> ' +
        escapeHtml(currentEvidenceDraft.evidenceItemId) + '<br>' +
      '<b>Photo ID:</b> ' +
        escapeHtml(currentEvidenceDraft.photoId) + '<br>' +
      '<b>Status:</b> SYNCED';
  }
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
    return;
  }

  if (hash.startsWith('#pems_points=')) {
    const bundle = decodeURIComponent(hash.slice('#pems_points='.length));
    acceptPointSessionBundle(bundle);

    const storedProof = sessionStorage.getItem(PROOF_KEY);
    if (storedProof) {
      acceptProof(storedProof);
    }

    history.replaceState(null, '', location.pathname + location.search);
    return;
  }

  if (hash.startsWith('#pems_sync_result=')) {
    const bundle = decodeURIComponent(
      hash.slice('#pems_sync_result='.length)
    );

    acceptSyncResultBundle(bundle);

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
restorePointSessions();
restoreSyncedResult();

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



loadPointSessionsBtn.addEventListener('click', function(){
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
      action: 'read_point_sessions_handoff',
      proof: currentServerProof,
      project_id: projectId
    },
    '_self'
  );
});


pointSessionSearchEl.addEventListener('input', function(){
  pointSessionSearchTerm = String(pointSessionSearchEl.value || '');

  if (currentPointSessions.length) {
    renderPointSessions(getSelectedProjectId());
  }
});

syncEvidenceBtn.addEventListener('click', function(){
  syncCurrentEvidence();
});

retryGpsBtn.addEventListener('click', function(){
  retryGpsForCurrentPhoto();
});

refreshMaterialButton();

refreshSyncGate();
