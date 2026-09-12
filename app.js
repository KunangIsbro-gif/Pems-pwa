const CFG = window.PEMS_CONFIG || {};
const APP_VERSION = CFG.APP_VERSION || 'V15.0.0-CONSOLIDATED';
const GOOGLE_CLIENT_ID = CFG.GOOGLE_CLIENT_ID || '';
const API_BASE_KEY = 'PEMS_V15_API_BASE';
const SESSION_KEY = 'PEMS_V15_SESSION';
const SESSION_EXP_KEY = 'PEMS_V15_SESSION_EXP';
const DEVICE_KEY = 'PEMS_V15_DEVICE_ID';
const LAST_GPS_KEY = 'PEMS_V15_LAST_GPS';
const SELECTED_PROJECT_KEY = 'PEMS_V15_SELECTED_PROJECT';
const ACTIVE_DRAFT_KEY = 'PEMS_V15_ACTIVE_DRAFT_ID';

const DB_NAME = 'PEMS_V15_DB';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_DRAFTS = 'drafts';
const STORE_PHOTOS = 'photos';
const STORE_QUEUE = 'queue';

const state = {
  apiBase: '',
  sessionToken: '',
  sessionExpiresAt: '',
  user: null,
  bootstrap: null,
  config: {},
  currentPage: 'home',
  selectedProjectId: '',
  workspace: null,
  selectedSession: null,
  requirements: null,
  selectedRequirement: null,
  drafts: [],
  queue: [],
  revisions: [],
  verificationQueue: [],
  monitoring: null,
  syncing: false,
  cameraContext: null,
  revisionTargetPmId: '',
  draftsPhotos: [],
  photoPreviewUrls: new Map(),
  serverPhotoCache: new Map(),
  verifierPhotoObjectUrls: new Map(),
  activeDraftId: '',
  notifications: { count: 0, items: [], generatedAt: '' },
  notificationTimer: null,
  notificationInflight: null,
  notificationLastFetchAt: 0,
  monitoringInflight: null,
  monitoringLastFetchAt: 0,
  workspaceInflight: new Map(),
  requirementsInflight: new Map(),
  requirementsRequestSeq: 0,
  gpsWarmupPromise: null,
  captureStage: { label: '', percent: 0, active: false }
};

const el = {
  sidebar: document.getElementById('sidebar'),
  mainShell: document.getElementById('mainShell'),
  sideNav: document.getElementById('sideNav'),
  bottomNav: document.getElementById('bottomNav'),
  sidebarUser: document.getElementById('sidebarUser'),
  topbar: document.getElementById('topbar'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  netBadge: document.getElementById('netBadge'),
  queueBadge: document.getElementById('queueBadge'),
  roleBadge: document.getElementById('roleBadge'),
  notifBtn: document.getElementById('notifBtn'),
  notifBadge: document.getElementById('notifBadge'),
  notifPanel: document.getElementById('notifPanel'),
  notifList: document.getElementById('notifList'),
  notifGeneratedAt: document.getElementById('notifGeneratedAt'),
  notifRefreshBtn: document.getElementById('notifRefreshBtn'),
  loginView: document.getElementById('loginView'),
  content: document.getElementById('content'),
  loginMessage: document.getElementById('loginMessage'),
  googleButton: document.getElementById('googleButton'),
  gatewaySetup: document.getElementById('gatewaySetup'),
  apiBaseInput: document.getElementById('apiBaseInput'),
  saveApiBaseBtn: document.getElementById('saveApiBaseBtn'),
  retryBootBtn: document.getElementById('retryBootBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  toast: document.getElementById('toast'),
  cameraInput: document.getElementById('cameraInput'),
  photoModal: document.getElementById('photoModal'),
  photoModalImage: document.getElementById('photoModalImage'),
  photoModalMeta: document.getElementById('photoModalMeta'),
  photoModalClose: document.getElementById('photoModalClose')
};

const NAV_META = {
  home: ['Home', 'Ringkasan pekerjaan dan status sistem'],
  pekerjaan: ['Pekerjaan', 'Project → Point → Requirement → Evidence'],
  evidence: ['Evidence', 'Draft lokal, queue, sync, dan submit'],
  verifikasi: ['Verifikasi', 'Periksa realisasi yang SUBMITTED'],
  monitoring: ['Monitoring', 'Progress dan exception yang perlu tindakan'],
  admin: ['Admin', 'User, assignment, dan konfigurasi'],
  output: ['Output Center', 'KML/KMZ, Word, PDF, dan report'],
  audit: ['Audit Log', 'Riwayat perubahan penting'],
  settings: ['Settings', 'Status aplikasi dan konfigurasi perangkat']
};

const NAV_LABEL = {
  home: 'Home', pekerjaan: 'Pekerjaan', evidence: 'Evidence', verifikasi: 'Verifikasi',
  monitoring: 'Monitoring', admin: 'Admin', output: 'Output', audit: 'Audit', settings: 'Settings'
};

init();

async function init() {
  wireStaticEvents();
  setupNetworkListeners();
  registerServiceWorker();
  await openDb();
  state.apiBase = resolveApiBase();
  await refreshLocalState();
  updateNetworkUi();

  if (!state.apiBase) {
    showGatewaySetup();
    return;
  }

  restoreSession();
  if (sessionIsUsable()) {
    const booted = await bootAuthenticated();
    if (booted) return;
  }

  showLogin('Login Google sekali untuk masuk ke PEMS V15.');
}

function wireStaticEvents() {
  el.saveApiBaseBtn.addEventListener('click', saveApiBaseFromInput);
  el.retryBootBtn.addEventListener('click', init);
  el.logoutBtn.addEventListener('click', logout);
  el.cameraInput.addEventListener('change', onCameraFileSelected);
  el.photoModalClose?.addEventListener('click', closePhotoModal);
  el.photoModal?.addEventListener('click', (event) => {
    if (event.target === el.photoModal) closePhotoModal();
  });

  el.notifBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    el.notifPanel?.classList.toggle('hidden');
    if (!el.notifPanel?.classList.contains('hidden')) {
      await refreshNotifications(true, true);
    }
  });

  el.notifRefreshBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await refreshNotifications(true, true);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('.notification-wrap')) {
      el.notifPanel?.classList.add('hidden');
    }
  });
}

function setupNetworkListeners() {
  window.addEventListener('online', async () => {
    updateNetworkUi();
    toast('Koneksi kembali online. Memeriksa queue...', 'success');
    await runSyncQueue();
  });
  window.addEventListener('offline', () => {
    updateNetworkUi();
    toast('Offline. Foto tetap disimpan di perangkat.', 'warning');
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js?v=v15-3-r10');
  } catch (err) {
    console.warn('SW registration failed', err);
  }
}

function resolveApiBase() {
  const hardcoded = String(CFG.API_BASE || '').trim().replace(/\/$/, '');
  if (hardcoded) return hardcoded;
  return String(localStorage.getItem(API_BASE_KEY) || '').trim().replace(/\/$/, '');
}

function showGatewaySetup() {
  el.gatewaySetup.classList.remove('hidden');
  el.apiBaseInput.value = localStorage.getItem(API_BASE_KEY) || '';
  el.loginMessage.className = 'status-box warning';
  el.loginMessage.textContent = 'API Gateway V15 belum dihubungkan.';
  el.googleButton.innerHTML = '';
  el.retryBootBtn.classList.add('hidden');
}

async function saveApiBaseFromInput() {
  const value = String(el.apiBaseInput.value || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(value)) {
    toast('Gunakan URL HTTPS API Gateway.', 'danger');
    return;
  }
  localStorage.setItem(API_BASE_KEY, value);
  state.apiBase = value;
  el.gatewaySetup.classList.add('hidden');
  showLogin('Gateway tersimpan. Login Google untuk melanjutkan.');
}

function restoreSession() {
  state.sessionToken = localStorage.getItem(SESSION_KEY) || '';
  state.sessionExpiresAt = localStorage.getItem(SESSION_EXP_KEY) || '';
}

function sessionIsUsable() {
  if (!state.sessionToken || !state.sessionExpiresAt) return false;
  const exp = new Date(state.sessionExpiresAt).getTime();
  return Number.isFinite(exp) && exp > Date.now() + 30_000;
}

function saveSession(token, expiresAt) {
  state.sessionToken = token;
  state.sessionExpiresAt = expiresAt;
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(SESSION_EXP_KEY, expiresAt);
}

function clearSession() {
  state.sessionToken = '';
  state.sessionExpiresAt = '';
  state.user = null;
  state.bootstrap = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_EXP_KEY);
}

function logout() {
  stopNotificationPolling();
  clearSession();
  hideAppShell();
  showLogin('Session ditutup. Login kembali bila diperlukan.');
}

function showLogin(message) {
  hideAppShell();
  el.loginView.classList.remove('hidden');
  el.loginMessage.className = 'status-box neutral';
  el.loginMessage.textContent = message || 'Login diperlukan.';
  el.retryBootBtn.classList.add('hidden');
  if (!state.apiBase) {
    showGatewaySetup();
    return;
  }
  renderGoogleButtonWhenReady();
}

function renderGoogleButtonWhenReady() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (window.google?.accounts?.id) {
      clearInterval(timer);
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: false
      });
      el.googleButton.innerHTML = '';
      window.google.accounts.id.renderButton(el.googleButton, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', width: 310
      });
      return;
    }
    if (attempts > 40) {
      clearInterval(timer);
      el.loginMessage.className = 'status-box danger';
      el.loginMessage.textContent = 'Google Login gagal dimuat. Pastikan internet aktif lalu coba lagi.';
      el.retryBootBtn.classList.remove('hidden');
    }
  }, 250);
}

async function handleGoogleCredential(response) {
  try {
    el.loginMessage.className = 'status-box neutral';
    el.loginMessage.textContent = 'Memverifikasi akun dan role PEMS...';
    const result = await apiRaw('/auth/google', {
      method: 'POST',
      auth: false,
      body: { credential: response.credential }
    });
    const token = result?.data?.sessionToken;
    const expiresAt = result?.data?.expiresAt;
    if (!token || !expiresAt) throw new Error('Session token tidak diterima dari gateway.');
    saveSession(token, expiresAt);
    await bootAuthenticated();
  } catch (err) {
    el.loginMessage.className = 'status-box danger';
    el.loginMessage.textContent = humanError(err);
  }
}

async function bootAuthenticated() {
  try {
    let boot;
    if (navigator.onLine) {
      boot = await api('/bootstrap');
      await cachePut('bootstrap', boot);
    } else {
      boot = await cacheGet('bootstrap');
      if (!boot) throw new Error('Belum ada bootstrap offline. Login/boot sekali saat online.');
    }

    state.bootstrap = boot;
    state.user = boot.user;
    state.config = boot.config || {};
    state.selectedProjectId = localStorage.getItem(SELECTED_PROJECT_KEY) || '';
    if (state.selectedProjectId && !(boot.projects || []).some(p => p.projectId === state.selectedProjectId)) {
      state.selectedProjectId = '';
      localStorage.removeItem(SELECTED_PROJECT_KEY);
    }

    await refreshLocalState();

    state.activeDraftId =
      localStorage.getItem(ACTIVE_DRAFT_KEY) || '';

    if (
      state.activeDraftId &&
      !state.drafts.some(
        d => d.draftId === state.activeDraftId
      )
    ) {
      state.activeDraftId = '';
      localStorage.removeItem(ACTIVE_DRAFT_KEY);
    }

    const cachedNotifRow =
      await cacheGetRow(
        `notifications:${userCachePrefix()}`
      );

    if (cachedNotifRow?.value) {
      state.notifications =
        cachedNotifRow.value;
      renderNotificationCenter();
    }

    showAppShell();
    renderNavigation();
    navigate('home');

    if (navigator.onLine) {
      runSyncQueue();
      refreshNotifications(false);
      startNotificationPolling();
      primeGpsCache();
    }

    return true;
  } catch (err) {
    if (isAuthError(err)) clearSession();
    showLogin(humanError(err));
    el.retryBootBtn.classList.remove('hidden');
    return false;
  }
}

function showAppShell() {
  el.loginView.classList.add('hidden');
  el.sidebar.classList.remove('hidden');
  el.mainShell.classList.remove('full-width');
  el.topbar.classList.remove('hidden');
  el.content.classList.remove('hidden');
  el.bottomNav.classList.remove('hidden');
  el.roleBadge.textContent = roleLabel(state.user?.role);
  el.sidebarUser.innerHTML = `${escapeHtml(state.user?.fullName || state.user?.email || '')}<br><span class="muted">${escapeHtml(roleLabel(state.user?.role))}</span>`;
  updateNetworkUi();
  updateQueueBadge();
}

function hideAppShell() {
  el.sidebar.classList.add('hidden');
  el.mainShell.classList.add('full-width');
  el.topbar.classList.add('hidden');
  el.content.classList.add('hidden');
  el.bottomNav.classList.add('hidden');
}

function renderNavigation() {
  const menus = state.bootstrap?.roleMenus || ['home', 'settings'];

  const render = (container) => {
    container.innerHTML = menus.map(key => {
      const count = notificationCountForPage(key);
      return `<button class="nav-btn" data-nav="${escapeAttr(key)}">
        <span>${escapeHtml(NAV_LABEL[key] || key)}</span>
        ${count ? `<span class="nav-count">${escapeHtml(String(count))}</span>` : ''}
      </button>`;
    }).join('');

    container.querySelectorAll('[data-nav]').forEach(btn =>
      btn.addEventListener('click', () => navigate(btn.dataset.nav))
    );
  };

  render(el.sideNav);
  render(el.bottomNav);

  document
    .querySelectorAll('[data-nav]')
    .forEach(btn =>
      btn.classList.toggle(
        'active',
        btn.dataset.nav ===
          state.currentPage
      )
    );
}

async function navigate(page) {
  const menus = state.bootstrap?.roleMenus || [];
  if (!menus.includes(page)) page = 'home';
  state.currentPage = page;
  const meta = NAV_META[page] || [page, ''];
  el.pageTitle.textContent = meta[0];
  el.pageSubtitle.textContent = meta[1];
  document.querySelectorAll('[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === page));
  el.content.innerHTML = '<div class="empty">Memuat...</div>';

  // R9: notifications are no longer fetched on every navigation.
  // Polling/manual refresh handles them without blocking page flow.

  if (page === 'pekerjaan') {
    primeGpsCache();
  }

  if (page === 'home') return renderHome();
  if (page === 'pekerjaan') return renderWork();
  if (page === 'evidence') return renderEvidence();
  if (page === 'verifikasi') return renderVerification();
  if (page === 'monitoring') return renderMonitoring();
  if (page === 'admin') return renderAdmin();
  if (page === 'output') return renderOutput();
  if (page === 'audit') return renderAudit();
  if (page === 'settings') return renderSettings();
}

async function renderHome() {
  await refreshLocalState();
  let monitoring =
    state.monitoring;

  const homeMonitoringKey =
    `monitoring:${userCachePrefix()}`;

  const homeMonitoringRow =
    await cacheGetRow(
      homeMonitoringKey
    );

  if (
    !monitoring &&
    homeMonitoringRow?.value
  ) {
    monitoring =
      homeMonitoringRow.value;

    state.monitoring =
      monitoring;
  }

  if (
    navigator.onLine &&
    sessionIsUsable() &&
    (
      !homeMonitoringRow?.value ||
      cacheRowAgeMs(
        homeMonitoringRow
      ) > 30_000
    )
  ) {
    fetchMonitoringOnce(
      homeMonitoringKey
    ).catch(() => {});
  }
  if (navigator.onLine && hasPermission('evidence.revise')) {
    try {
      const rev = await api('/evidence/revisions');
      state.revisions = rev.revisions || [];
      await cachePut('revisions', state.revisions);
    } catch {}
  } else if (!state.revisions.length) {
    state.revisions = await cacheGet('revisions') || [];
  }

  const projects = state.bootstrap?.projects || [];
  const q = state.queue;
  const pending = q.filter(x => x.state === 'WAITING' || x.state === 'SYNCING').length;
  const failed = q.filter(x => x.state === 'FAILED').length;
  const m = monitoring || { evidenceTotal: 0, waitingVerification: 0, needRevision: 0, verified: 0 };

  el.content.innerHTML = `
    ${state.config.GPS_POLICY === 'DEV' ? '<div class="warning-strip"><b>DEV MODE:</b> GPS fallback laptop masih diizinkan. Ubah GPS_POLICY ke FIELD sebelum pilot tim lapangan.</div>' : ''}
    <div class="grid kpi">
      ${kpi('Project', projects.length)}
      ${kpi('Queue Lokal', pending, failed ? `${failed} gagal` : 'siap')}
      ${kpi('Need Revision', m.needRevision || 0)}
      ${kpi('Verified', m.verified || 0)}
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="card">
        <div class="section-head"><h2>Mulai / Lanjut Pekerjaan</h2><span class="badge ${navigator.onLine ? 'success' : 'warning'}">${navigator.onLine ? 'ONLINE' : 'OFFLINE'}</span></div>
        <p class="muted">Tidak ada lagi tombol Ambil Project/Material/Point satu-satu. Pilih project, lalu PEMS menyiapkan workspace otomatis.</p>
        <div class="field"><label>Project</label>${projectSelectHtml(projects, state.selectedProjectId, 'homeProjectSelect')}</div>
        <button id="continueWorkBtn" class="btn primary full" style="margin-top:12px" ${projects.length ? '' : 'disabled'}>Lanjut Pekerjaan</button>
      </div>
      <div class="card">
        <h2>Status Sistem</h2>
        <div class="list">
          ${statusRow('Koneksi', navigator.onLine ? 'Online' : 'Offline', navigator.onLine ? 'success' : 'warning')}
          ${statusRow('Session', sessionIsUsable() ? 'Aktif' : 'Login diperlukan', sessionIsUsable() ? 'success' : 'danger')}
          ${statusRow('Auto Sync', truthyConfig('AUTO_SYNC', true) ? 'Aktif' : 'Nonaktif', truthyConfig('AUTO_SYNC', true) ? 'success' : 'neutral')}
          ${statusRow('Role', roleLabel(state.user?.role), 'info')}
        </div>
      </div>
    </div>
    ${state.revisions.length ? `
      <div class="card" style="margin-top:16px">
        <div class="section-head"><h2>Perlu Perbaikan</h2><span class="badge warning">${state.revisions.length}</span></div>
        <div class="list">${state.revisions.slice(0,10).map(ev => `
          <div class="list-item"><div><div class="item-title">${escapeHtml(ev.itemLabel || ev.designator || ev.evidenceId)}</div><div class="item-sub">${escapeHtml(ev.projectId)} • ${escapeHtml(ev.sessionId || '-')}<br>${escapeHtml(ev.revisionReason || 'Perlu revisi evidence')}</div></div><button class="btn warning small" data-start-revision="${escapeAttr(ev.evidenceId)}">Buat Revisi</button></div>`).join('')}</div>
      </div>` : ''}
  `;

  document.getElementById('homeProjectSelect')?.addEventListener('change', e => selectProject(e.target.value, false));
  document.getElementById('continueWorkBtn')?.addEventListener('click', async () => {
    const select = document.getElementById('homeProjectSelect');
    if (select?.value) await selectProject(select.value, true);
    navigate('pekerjaan');
  });
  el.content.querySelectorAll('[data-start-revision]').forEach(btn => {
    btn.addEventListener('click', () => startRevision(btn.dataset.startRevision));
  });
}

async function startRevision(evidenceId) {
  const ev = state.revisions.find(x => x.evidenceId === evidenceId);
  if (!ev) return;
  try {
    state.selectedProjectId = ev.projectId;
    localStorage.setItem(SELECTED_PROJECT_KEY, ev.projectId);
    await loadWorkspace(ev.projectId);
    state.selectedSession = (state.workspace?.pointSessions || []).find(s => s.sessionId === ev.sessionId) || null;
    if (!state.selectedSession) throw new Error('Point Session revisi tidak ditemukan di assignment saat ini.');
    state.requirements = await loadRequirements(ev.projectId, ev.sessionId);
    state.selectedRequirement = (state.requirements?.requirements || []).find(r => r.projectMaterialId === ev.projectMaterialId) || null;
    if (!state.selectedRequirement) throw new Error('Material requirement revisi tidak ditemukan.');
    state.revisionTargetPmId = ev.projectMaterialId;

    // Local V1 rows are history after NEED_REVISION.
    // They must never compete with the new V2 draft for "current draft".
    const parentLocalDrafts = state.drafts.filter(
      d =>
        d.projectId === ev.projectId &&
        d.sessionId === ev.sessionId &&
        d.projectMaterialId === ev.projectMaterialId &&
        d.serverEvidenceId === ev.evidenceId
    );

    for (const parentDraft of parentLocalDrafts) {
      parentDraft.workflow = 'NEED_REVISION';
      parentDraft.isHistory = true;
      parentDraft.updatedAt =
        parentDraft.updatedAt ||
        new Date().toISOString();
      await idbPut(STORE_DRAFTS, parentDraft);
    }

    const draft = {
      draftId: `LED-${crypto.randomUUID?.() || uid()}`,
      projectId: ev.projectId,
      sessionId: ev.sessionId,
      anchorLabel: state.selectedSession.anchorLabel,
      projectMaterialId: ev.projectMaterialId,
      materialId: state.selectedRequirement.materialId,
      designator: state.selectedRequirement.designator || ev.designator,
      materialName: state.selectedRequirement.materialName || '',
      requirementCode: state.selectedRequirement.requirementCode,
      requiredPhotoCount: Math.max(1, Number(state.selectedRequirement.evidenceRequired || ev.requiredPhotoCount || 1)),
      qtyPlan: state.selectedRequirement.qtyPlan,
      qtyReal: ev.qtyReal || '',
      fieldNote: '',
      serverEvidenceId: '',
      serverPhotoCount: 0,
      workflow: 'DRAFT_LOCAL',
      parentEvidenceId: ev.evidenceId,
      parentVersionNo: Number(ev.versionNo || 1),
      revisionVersionNo: Number(ev.versionNo || 1) + 1,
      revisionReason: ev.revisionReason || 'NEED_REVISION',
      assignmentId: assignmentForCurrentPoint()?.assignmentId || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await idbPut(STORE_DRAFTS, draft);

    state.activeDraftId = draft.draftId;
    localStorage.setItem(
      ACTIVE_DRAFT_KEY,
      draft.draftId
    );

    // Prevent parent V1 preview/count from leaking into the new revision UI.
    state.serverPhotoCache.delete(ev.evidenceId);

    await refreshLocalState();
    await navigate('pekerjaan');
    toast('Draft revisi dibuat. Ambil foto perbaikan tanpa mengubah evidence lama.', 'success', 5000);
  } catch (err) {
    toast(humanError(err), 'danger', 6000);
  }
}

async function renderWork() {
  const projects = state.bootstrap?.projects || [];
  if (!projects.length) {
    el.content.innerHTML = '<div class="empty">Belum ada project yang dapat diakses. Admin perlu cek role/assignment.</div>';
    return;
  }

  if (!state.selectedProjectId) {
    state.selectedProjectId = projects[0].projectId;
    localStorage.setItem(SELECTED_PROJECT_KEY, state.selectedProjectId);
  }

  await loadWorkspace(state.selectedProjectId);
  primeGpsCache();
  const workspace = state.workspace;
  if (!workspace) {
    el.content.innerHTML = '<div class="empty">Workspace project belum tersedia offline. Buka project ini sekali saat online.</div>';
    return;
  }

  const sessions = workspace.pointSessions || [];
  el.content.innerHTML = `
    <div class="toolbar">
      <div class="grow">${projectSelectHtml(projects, state.selectedProjectId, 'workProjectSelect')}</div>
      <span class="badge info">${escapeHtml(workspace.project?.stakeholder || '-')}</span>
      <span class="badge neutral">${sessions.length} Point Session</span>
    </div>
    <div class="split-layout">
      <div class="card">
        <div class="section-head"><h2>Pilih Titik</h2><span class="tiny muted">otomatis dari workspace</span></div>
        <input id="sessionSearch" class="input" placeholder="Cari PS-000001 / label / role...">
        <div id="sessionList" class="list" style="margin-top:12px"></div>
      </div>
      <div id="workRight" class="card sticky-card">
        <div class="empty">Pilih satu titik. Requirement material akan dimuat otomatis.</div>
      </div>
    </div>
  `;

  document.getElementById('workProjectSelect').addEventListener('change', async e => {
    await selectProject(e.target.value, true);
    state.selectedSession = null;
    state.requirements = null;
    state.selectedRequirement = null;
    renderWork();
  });
  const search = document.getElementById('sessionSearch');
  search.addEventListener('input', () => renderSessionList(search.value));
  renderSessionList('');
  if (state.selectedSession && sessions.some(s => s.sessionId === state.selectedSession.sessionId)) {
    await selectSession(state.selectedSession.sessionId);
  }
}

function renderSessionList(filter) {
  const container = document.getElementById('sessionList');
  if (!container || !state.workspace) return;
  const q = String(filter || '').toLowerCase().trim();
  const sessions = (state.workspace.pointSessions || []).filter(s => {
    const text = [s.sessionId, s.anchorLabel, s.anchorRole, s.anchorPointId].join(' ').toLowerCase();
    return !q || text.includes(q);
  }).slice(0, 60);

  container.innerHTML = sessions.length ? sessions.map(s => `
    <div class="list-item clickable session-card ${state.selectedSession?.sessionId === s.sessionId ? 'selected' : ''}" data-session="${escapeAttr(s.sessionId)}">
      <div><div class="item-title">${escapeHtml(s.anchorLabel || s.sessionId)}</div><div class="item-sub">${escapeHtml(s.sessionId)} • ${escapeHtml(s.anchorRole || '-')}<br>Plan GPS: ${formatCoord(s.latPlan)}, ${formatCoord(s.longPlan)}</div></div>
      <span class="badge ${s.verifyStatus === 'VERIFIED' ? 'success' : s.verifyStatus === 'IN_PROGRESS' ? 'warning' : 'neutral'}">${escapeHtml(s.verifyStatus || 'DRAFT')}</span>
    </div>
  `).join('') : '<div class="empty">Titik tidak ditemukan.</div>';
  container.querySelectorAll('[data-session]').forEach(node => node.addEventListener('click', () => selectSession(node.dataset.session)));
}

async function selectSession(sessionId) {
  const sameSession =
    state.selectedSession?.sessionId ===
    sessionId;

  state.selectedSession =
    (state.workspace?.pointSessions || [])
      .find(
        s =>
          s.sessionId ===
          sessionId
      ) || null;

  const revisionPmId =
    state.revisionTargetPmId || '';

  if (
    sameSession &&
    state.requirements &&
    !revisionPmId
  ) {
    renderSessionList(
      document.getElementById(
        'sessionSearch'
      )?.value || ''
    );

    renderRequirementsPanel();
    return;
  }

  const requestSeq =
    ++state.requirementsRequestSeq;

  // Clear old point state immediately.
  // Never leave previous point/material on screen while new point is loading.
  state.requirements = null;
  state.selectedRequirement = null;

  renderSessionList(
    document.getElementById(
      'sessionSearch'
    )?.value || ''
  );

  const right =
    document.getElementById(
      'workRight'
    );

  if (
    !right ||
    !state.selectedSession
  ) {
    return;
  }

  const loadingLabel =
    state.selectedSession.anchorLabel ||
    state.selectedSession.sessionId;

  const loadingRole =
    state.selectedSession.anchorRole ||
    '-';

  right.innerHTML = `
    <div class="point-loading-state">
      <div class="point-loading-spinner"></div>
      <div>
        <b>Memuat ${escapeHtml(loadingLabel)}</b>
        <div class="small muted">
          ${escapeHtml(state.selectedSession.sessionId)}
          • ${escapeHtml(loadingRole)}
        </div>
        <div class="tiny muted">
          Requirement titik sebelumnya disembunyikan sampai data titik ini siap.
        </div>
      </div>
    </div>
  `;

  try {
    const data =
      await loadRequirements(
        state.selectedProjectId,
        sessionId
      );

    // User may have clicked another point while this request was running.
    if (
      requestSeq !==
        state.requirementsRequestSeq ||
      state.selectedSession?.sessionId !==
        sessionId
    ) {
      return;
    }

    state.requirements =
      data;

    if (revisionPmId) {
      state.selectedRequirement =
        (
          state.requirements?.requirements ||
          []
        ).find(
          r =>
            r.projectMaterialId ===
            revisionPmId
        ) || null;

      state.revisionTargetPmId = '';
    }

    renderRequirementsPanel();
  }
  catch (err) {
    if (
      requestSeq !==
        state.requirementsRequestSeq ||
      state.selectedSession?.sessionId !==
        sessionId
    ) {
      return;
    }

    right.innerHTML = `
      <div class="status-box danger">
        ${escapeHtml(humanError(err))}
      </div>
    `;
  }
}


function effectiveRequirementWorkflow(r, draft) {
  const serverWorkflow =
    String(
      r?.workflowStatus ||
      r?.verifyStatus ||
      ''
    ).toUpperCase();

  const draftWorkflow =
    String(
      draft?.workflow ||
      ''
    ).toUpperCase();

  const openRevision =
    draft?.parentEvidenceId &&
    !draft?.isHistory &&
    ![
      'SUBMITTED',
      'VERIFIED',
      'REJECTED',
      'NEED_REVISION'
    ].includes(
      draftWorkflow
    );

  if (openRevision) {
    return draftWorkflow ||
      'DRAFT_LOCAL';
  }

  if (
    [
      'VERIFIED',
      'NEED_REVISION',
      'REJECTED',
      'SUBMITTED',
      'REVISION_RESOLVED',
      'REOPENED'
    ].includes(
      serverWorkflow
    )
  ) {
    return serverWorkflow;
  }

  return (
    draftWorkflow ||
    serverWorkflow
  );
}

function selectedRequirementStatusBannerHtml() {
  const r =
    state.selectedRequirement;

  if (!r) {
    return '';
  }

  const draft =
    findCurrentDraft();

  const workflow =
    effectiveRequirementWorkflow(
      r,
      draft
    );

  const target =
    Number(
      r.evidenceRequired || 0
    );

  const photoCount =
    draft
      ? Number(
          draft.serverPhotoCount || 0
        )
      : Number(
          r.photoCount || 0
        );

  let label =
    friendlyWorkflowLabel(
      workflow
    );

  let badge =
    workflowBadge(
      workflow
    );

  if (
    !workflow ||
    workflow === 'DRAFT'
  ) {
    if (
      target > 0 &&
      photoCount >= target
    ) {
      label =
        'Complete — menunggu status workflow';
      badge =
        'success';
    }
    else {
      label =
        r.required
          ? 'Belum lengkap'
          : 'Opsional';
      badge =
        r.required
          ? 'warning'
          : 'neutral';
    }
  }

  const version =
    Number(
      draft?.revisionVersionNo ||
      r.latestVersionNo ||
      1
    );

  return `
    <div class="selected-item-banner ${badge}">
      <div>
        <span class="tiny">ITEM TERPILIH</span>
        <b>${escapeHtml(r.designator || r.materialName || r.projectMaterialId)}</b>
        <small>${escapeHtml(label)}</small>
      </div>
      <div class="selected-item-facts">
        <span>Foto ${escapeHtml(String(photoCount))}/${escapeHtml(String(target))}</span>
        <span>V${escapeHtml(String(version))}</span>
      </div>
    </div>
  `;
}

function renderRequirementsPanel() {
  const right = document.getElementById('workRight');
  if (!right || !state.requirements || !state.selectedSession) return;
  const reqs = state.requirements.requirements || [];
  right.innerHTML = `
    <div class="section-head"><div><h2>${escapeHtml(state.selectedSession.anchorLabel || state.selectedSession.sessionId)}</h2><div class="small muted">${escapeHtml(state.selectedSession.sessionId)} • ${escapeHtml(state.selectedSession.anchorRole || '-')}</div></div><span class="badge info">${reqs.length} material valid</span></div>
    ${state.requirements.warnings?.length ? `<div class="warning-strip">${escapeHtml(state.requirements.warnings.map(w => w.message || w.code).join(' • '))}</div>` : ''}
    ${selectedRequirementStatusBannerHtml()}
    <div id="requirementList" class="list"></div>
    <div id="capturePanel" style="margin-top:16px"></div>
  `;

  const list = document.getElementById('requirementList');
  list.innerHTML = reqs.length ? reqs.map(r => {
    const target = Number(r.evidenceRequired || 0);

    const revisionDraft = state.drafts
      .filter(
        d =>
          d.projectId ===
            state.selectedProjectId &&
          d.sessionId ===
            state.selectedSession.sessionId &&
          d.projectMaterialId ===
            r.projectMaterialId &&
          d.parentEvidenceId &&
          !d.isHistory &&
          !['NEED_REVISION','REJECTED','VERIFIED']
            .includes(
              String(
                d.workflow || ''
              ).toUpperCase()
            )
      )
      .sort(
        (a,b) =>
          String(b.updatedAt || '')
            .localeCompare(
              String(a.updatedAt || '')
            )
      )[0] || null;

    let serverCount = Number(r.photoCount || 0);
    let label = '';
    let badgeClass = '';
    let badgeText = '';

    if (revisionDraft) {
      const localUnsynced = (state.draftsPhotos || []).filter(
        p =>
          p.draftId === revisionDraft.draftId &&
          p.state !== 'SYNCED'
      ).length;

      serverCount =
        Number(revisionDraft.serverPhotoCount || 0) +
        localUnsynced;

      label =
        ` • REVISI V${Number(revisionDraft.revisionVersionNo || 2)}`;

      const revisionComplete =
        target > 0 &&
        Number(revisionDraft.serverPhotoCount || 0) >= target;

      badgeClass =
        revisionComplete ? 'success' : 'warning';

      badgeText =
        revisionComplete ? 'REVISI COMPLETE' : 'PERLU PERBAIKAN';
    } else {
      const workflow =
        String(
          r.workflowStatus ||
          r.verifyStatus ||
          ''
        ).toUpperCase();

      const complete =
        target > 0 &&
        serverCount >= target;

      if (workflow === 'VERIFIED') {
        badgeClass = 'success';
        badgeText = 'VERIFIED';
        label = ` • V${Number(r.latestVersionNo || 1)}`;
      }
      else if (workflow === 'SUBMITTED') {
        badgeClass = 'warning';
        badgeText = 'MENUNGGU VERIF';
        label = ` • V${Number(r.latestVersionNo || 1)}`;
      }
      else if (workflow === 'NEED_REVISION') {
        badgeClass = 'warning';
        badgeText = 'PERLU PERBAIKAN';
        label = ` • V${Number(r.latestVersionNo || 1)}`;
      }
      else if (workflow === 'REJECTED') {
        badgeClass = 'danger';
        badgeText = 'DITOLAK';
        label = ` • V${Number(r.latestVersionNo || 1)}`;
      }
      else if (workflow === 'SYNCED') {
        badgeClass = 'info';
        badgeText = 'SIAP SUBMIT';
      }
      else if (workflow === 'DRAFT_SERVER') {
        badgeClass = 'neutral';
        badgeText = 'PROSES';
      }
      else {
        badgeClass =
          complete
            ? 'success'
            : r.required
              ? 'warning'
              : 'neutral';

        badgeText =
          complete
            ? 'COMPLETE'
            : r.required
              ? 'BELUM'
              : 'OPSIONAL';
      }
    }

    return `
      <div class="list-item clickable material-card ${state.selectedRequirement?.projectMaterialId === r.projectMaterialId ? 'selected' : ''}" data-pm="${escapeAttr(r.projectMaterialId)}">
        <div>
          <div class="item-title">${escapeHtml(r.designator || r.materialName || r.projectMaterialId)}</div>
          <div class="item-sub">
            ${escapeHtml(r.materialName || '')}<br>
            ${escapeHtml(r.requirementCode || 'MATERIAL')} •
            ${r.required ? 'WAJIB' : 'OPSIONAL'} •
            Evidence ${serverCount}/${target}${escapeHtml(label)}
          </div>
        </div>
        <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
      </div>`;
  }).join('') : '<div class="empty">Tidak ada material valid pada titik ini.</div>';
  list.querySelectorAll('[data-pm]').forEach(node => node.addEventListener('click', () => selectRequirement(node.dataset.pm)));
  if (state.selectedRequirement) renderCapturePanel();
}

async function selectRequirement(projectMaterialId) {
  state.selectedRequirement =
    (
      state.requirements?.requirements ||
      []
    ).find(
      r =>
        r.projectMaterialId ===
        projectMaterialId
    ) || null;

  // renderRequirementsPanel() already invokes renderCapturePanel()
  // for the selected requirement. Do not invoke it twice.
  renderRequirementsPanel();
}


async function getServerPhotosForEvidence(evidenceId) {
  if (!evidenceId) {
    return [];
  }

  if (
    state.serverPhotoCache.has(
      evidenceId
    )
  ) {
    return (
      state.serverPhotoCache.get(
        evidenceId
      ) || []
    );
  }

  if (!navigator.onLine) {
    return [];
  }

  try {
    const result = await api(
      `/evidence/${encodeURIComponent(evidenceId)}/photos`
    );
    const photos = Array.isArray(result?.photos)
      ? result.photos
      : [];

    state.serverPhotoCache.set(
      evidenceId,
      photos
    );

    return photos;
  } catch (err) {
    console.warn(
      'Server photo preview unavailable',
      evidenceId,
      err
    );
    return state.serverPhotoCache.get(evidenceId) || [];
  }
}

function serverPhotoPreviewUrl(photo) {
  const fileId = String(photo?.fileId || '').trim();
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
}

function serverPhotoCardHtml(photo, index, locked, evidenceId) {
  const previewUrl = serverPhotoPreviewUrl(photo);
  return `
    <div class="photo-card evidence-preview-card server-photo-card">
      ${previewUrl
        ? `<button type="button" class="photo-thumb-button" data-view-server-photo="${escapeAttr(photo.photoId)}" data-evidence-id="${escapeAttr(evidenceId)}" aria-label="Lihat foto evidence server">
             <img src="${escapeAttr(previewUrl)}" alt="Evidence ${index + 1}" loading="lazy"
                  onerror="this.closest('.photo-thumb-button').classList.add('thumb-error')">
           </button>`
        : `<div class="photo-placeholder">Preview server tidak tersedia</div>`
      }
      <div class="photo-card-body">
        <div class="photo-card-title">
          <b>Foto ${index + 1}</b>
          <span class="badge success">SERVER</span>
        </div>
        <div class="tiny muted">${escapeHtml(photo.fileName || photo.photoId || '')}</div>
        <div class="photo-meta-grid">
          <div><span>GPS Accuracy</span><b>${escapeHtml(formatNumber(photo.gpsAccuracy))} m</b></div>
          <div><span>Ke Titik Plan</span><b>${escapeHtml(formatNumber(photo.distanceToPlanM))} m</b></div>
          <div><span>GPS Source</span><b>${escapeHtml(photo.gpsSource || '-')}</b></div>
          <div><span>Status</span><b>${escapeHtml(photo.status || 'SYNCED')}</b></div>
          <div class="full"><span>Waktu Capture</span><b>${escapeHtml(formatDate(photo.capturedAt))}</b></div>
        </div>
        <div class="toolbar compact">
          ${previewUrl ? `<button type="button" class="btn outline small" data-view-server-photo="${escapeAttr(photo.photoId)}" data-evidence-id="${escapeAttr(evidenceId)}">Lihat / Perbesar</button>` : ''}
          ${photo.url ? `<a class="btn outline small" href="${escapeAttr(photo.url)}" target="_blank" rel="noopener" style="text-decoration:none">Buka Drive</a>` : ''}
          ${!locked ? `<button type="button" class="btn danger small" data-delete-server-photo="${escapeAttr(photo.photoId)}" data-evidence-id="${escapeAttr(evidenceId)}">Hapus / Ganti</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function openServerPhotoModal(evidenceId, photoId) {
  const photos = await getServerPhotosForEvidence(evidenceId);
  const photo = photos.find(p => String(p.photoId) === String(photoId));
  if (!photo) {
    toast('Foto server tidak ditemukan.', 'warning');
    return;
  }

  const url = serverPhotoPreviewUrl(photo);
  if (!url) {
    if (photo.url) {
      window.open(photo.url, '_blank', 'noopener');
      return;
    }
    toast('Preview foto server tidak tersedia.', 'warning');
    return;
  }

  el.photoModalImage.src = url;
  el.photoModalMeta.innerHTML = `
    <div><b>${escapeHtml(photo.fileName || photo.photoId)}</b></div>
    <div>GPS Accuracy: <b>${escapeHtml(formatNumber(photo.gpsAccuracy))} m</b></div>
    <div>Jarak ke titik plan: <b>${escapeHtml(formatNumber(photo.distanceToPlanM))} m</b></div>
    <div>GPS Source: <b>${escapeHtml(photo.gpsSource || '-')}</b></div>
    <div>Captured: <b>${escapeHtml(formatDate(photo.capturedAt))}</b></div>
    <div>Status: <b>${escapeHtml(photo.status || 'SYNCED')}</b></div>
  `;
  el.photoModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

async function deleteServerCapturePhoto(evidenceId, photoId) {
  const draft = findCurrentDraft();
  const workflow = String(draft?.workflow || '').toUpperCase();

  if (['SUBMITTED','VERIFIED','REJECTED'].includes(workflow)) {
    toast('Evidence sudah dikunci. Gunakan Revision/Reopen.', 'warning', 6000);
    return;
  }

  if (!navigator.onLine) {
    toast('Foto yang sudah ada di server hanya dapat dihapus saat ONLINE.', 'warning', 6000);
    return;
  }

  const yes = window.confirm(
    'Foto ini sudah tersimpan di server. Hapus foto ini agar bisa ambil ulang?'
  );
  if (!yes) return;

  try {
    const result = await api(
      `/evidence/${encodeURIComponent(evidenceId)}/photos/${encodeURIComponent(photoId)}`,
      { method: 'DELETE' }
    );

    state.serverPhotoCache.delete(evidenceId);

    if (draft) {
      draft.serverPhotoCount = Number(result.photoCount || 0);
      draft.workflow =
        result.workflowStatus ||
        (draft.serverPhotoCount > 0 ? 'SYNCED' : 'DRAFT_LOCAL');
      draft.updatedAt = new Date().toISOString();
      await idbPut(STORE_DRAFTS, draft);
    }

    if (state.selectedRequirement) {
      state.selectedRequirement.photoCount = Number(result.photoCount || 0);
      state.selectedRequirement.evidenceProgress =
        Number(result.photoCount || 0) > 0
          ? 'SYNCED'
          : 'BELUM_EVIDENCE';
    }

    await refreshLocalState();
    toast('Foto server dihapus. Silakan ambil foto pengganti.', 'success', 5000);
    renderRequirementsPanel();
    await renderCapturePanel();
  } catch (err) {
    toast(humanError(err), 'danger', 6000);
  }
}

async function renderCapturePanel() {
  const panel = document.getElementById('capturePanel');
  if (!panel || !state.selectedRequirement || !state.selectedSession) return;
  await refreshLocalState();
  const r = state.selectedRequirement;
  const draft = findCurrentDraft();

  const localPhotos = draft
    ? state.draftsPhotos?.filter?.(
        p => p.draftId === draft.draftId
      ) || []
    : [];

  const actualLocal =
    await photoCountForDraft(draft?.draftId);

  // IMPORTANT:
  // A revision draft (V2+) must be isolated from its parent V1.
  // If a local draft exists but has not synced yet, there is NO server
  // evidence for the new version yet. Do not fall back to r.evidenceItemId,
  // because that belongs to the previous version.
  const serverEvidenceId =
    draft
      ? String(draft.serverEvidenceId || '').trim()
      : String(r.evidenceItemId || '').trim();

  const serverPhotos =
    serverEvidenceId
      ? await getServerPhotosForEvidence(
          serverEvidenceId
        )
      : [];

  const localServerIds = new Set(
    localPhotos
      .map(p => String(p.serverPhotoId || ''))
      .filter(Boolean)
  );

  const serverOnlyPhotos =
    serverPhotos.filter(
      p => !localServerIds.has(
        String(p.photoId || '')
      )
    );

  const serverCount =
    draft
      ? Math.max(
          Number(draft.serverPhotoCount || 0),
          serverPhotos.length
        )
      : Math.max(
          Number(r.photoCount || 0),
          serverPhotos.length
        );

  const target =
    Math.max(
      0,
      Number(r.evidenceRequired || 0)
    );

  const totalKnown =
    Math.max(
      serverCount,
      serverCount + actualLocal.unsynced
    );

  const complete =
    target === 0 ||
    serverCount >= target;

  const activeWorkflow =
    effectiveRequirementWorkflow(
      r,
      draft
    );

  const locked =
    ['SUBMITTED','VERIFIED','REJECTED']
      .includes(activeWorkflow);

  const activeStatusLabel =
    friendlyWorkflowLabel(activeWorkflow || (complete ? 'SYNCED' : 'DRAFT_LOCAL'));

  const activeVersion =
    Number(
      draft?.revisionVersionNo ||
      r.latestVersionNo ||
      1
    );

  panel.innerHTML = `
    <div class="capture-status-strip ${workflowBadge(activeWorkflow)}">
      <div>
        <span class="tiny">STATUS ITEM</span>
        <strong>${escapeHtml(activeStatusLabel)}</strong>
      </div>
      <div class="capture-status-meta">
        <span>Foto ${serverCount}/${target}</span>
        <span>V${escapeHtml(String(activeVersion))}</span>
      </div>
    </div>

    <div id="captureProcess" class="capture-process ${state.captureStage.active ? '' : 'hidden'}">
      <div class="capture-process-head">
        <span id="captureStageLabel">${escapeHtml(state.captureStage.label || 'Memproses...')}</span>
        <b id="captureStagePercent">${escapeHtml(String(state.captureStage.percent || 0))}%</b>
      </div>
      <div class="progress"><span id="captureStageBar" style="width:${Math.max(0,Math.min(100,Number(state.captureStage.percent||0)))}%"></span></div>
    </div>

    <div class="divider"></div>

    ${draft?.parentEvidenceId ? `
      <div class="status-box warning revision-banner">
        <b>REVISI V${escapeHtml(String(draft.revisionVersionNo || 2))}</b><br>
        Parent: ${escapeHtml(draft.parentEvidenceId)}<br>
        Alasan: ${escapeHtml(draft.revisionReason || 'Perlu perbaikan evidence')}<br>
        <span class="tiny">Foto versi sebelumnya tetap tersimpan sebagai histori dan tidak ikut dihitung pada revisi ini.</span>
      </div>
    ` : ''}

    <h3>Realisasi Evidence</h3>
    <div class="grid two">
      <div class="field"><label>Quantity Realisasi</label><input id="qtyRealInput" class="input" type="number" step="any" value="${escapeAttr(draft?.qtyReal ?? '')}" placeholder="Opsional" ${locked ? 'disabled' : ''}></div>
      <div class="field"><label>Target Foto</label><input class="input" disabled value="${target} foto"></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Catatan Lapangan</label><textarea id="fieldNoteInput" class="textarea" placeholder="Kendala / kondisi khusus..." ${locked ? 'disabled' : ''}>${escapeHtml(draft?.fieldNote || '')}</textarea></div>
    <div class="status-box ${complete ? 'success' : 'neutral'}">
      <b>Progress:</b> Server ${serverCount}/${target} • Lokal belum sync ${actualLocal.unsynced} • Total terdeteksi ${totalKnown}/${target}
    </div>

    ${(localPhotos.length || serverOnlyPhotos.length) ? `
      <div class="evidence-photo-section">
        <div class="section-head compact">
          <div>
            <h3>Foto Evidence ${Math.max(serverCount, localPhotos.length)}/${target || Math.max(serverCount, localPhotos.length)}</h3>
            <div class="tiny muted">${locked ? 'Evidence sudah dikunci untuk perubahan.' : 'Cek foto sebelum Submit Verifikasi.'}</div>
          </div>
        </div>
        <div class="photo-grid">
          ${localPhotos
            .slice()
            .sort((a,b) => String(a.capturedAt || '').localeCompare(String(b.capturedAt || '')))
            .map((photo, index) => capturePhotoCardHtml(photo, index, locked))
            .join('')}
          ${serverOnlyPhotos
            .slice()
            .sort((a,b) => Number(a.photoNo || 0) - Number(b.photoNo || 0))
            .map((photo, index) => serverPhotoCardHtml(
              photo,
              localPhotos.length + index,
              locked,
              serverEvidenceId
            ))
            .join('')}
        </div>
      </div>
    ` : (
      serverCount > 0
        ? `<div class="status-box warning"><b>Foto sudah tersimpan di server (${serverCount}/${target})</b>, tetapi metadata preview belum berhasil dimuat. Gunakan Sync/refresh saat online.</div>`
        : ''
    )}

    <div class="toolbar" style="margin-top:12px">
      <button id="captureBtn" class="btn primary" ${!hasPermission('evidence.capture') || locked || (target > 0 && totalKnown >= target) ? 'disabled' : ''}>Ambil Foto + GPS</button>
      <button id="syncNowBtn" class="btn secondary" ${!navigator.onLine || locked ? 'disabled' : ''}>Sync Queue</button>
      <button id="submitEvidenceBtn" class="btn success" ${!draft?.serverEvidenceId || !complete || locked ? 'disabled' : ''}>Submit Verifikasi</button>
    </div>
    <div id="captureHint" class="small muted">${locked ? 'Evidence sudah SUBMITTED/terkunci. Perubahan berikutnya harus melalui Revision/Reopen.' : (navigator.onLine ? 'Online: foto tetap disimpan lokal dahulu, lalu auto-sync.' : 'Offline: foto aman di IndexedDB dan masuk queue.')}</div>
  `;

  document.getElementById('captureBtn')?.addEventListener('click', () => beginCapture());
  document.getElementById('syncNowBtn')?.addEventListener('click', runSyncQueue);
  document.getElementById('submitEvidenceBtn')?.addEventListener('click', submitCurrentEvidence);

  panel.querySelectorAll('[data-view-photo]').forEach(btn => {
    btn.addEventListener('click', () => openPhotoModal(btn.dataset.viewPhoto));
  });

  panel.querySelectorAll('[data-delete-photo]').forEach(btn => {
    btn.addEventListener('click', () => deleteCapturePhoto(btn.dataset.deletePhoto));
  });

  panel.querySelectorAll('[data-view-server-photo]').forEach(btn => {
    btn.addEventListener('click', () =>
      openServerPhotoModal(
        btn.dataset.evidenceId,
        btn.dataset.viewServerPhoto
      )
    );
  });

  panel.querySelectorAll('[data-delete-server-photo]').forEach(btn => {
    btn.addEventListener('click', () =>
      deleteServerCapturePhoto(
        btn.dataset.evidenceId,
        btn.dataset.deleteServerPhoto
      )
    );
  });
}


function previewUrlForPhoto(photo) {
  if (!photo?.blob) return '';
  const key = photo.photoLocalId;
  if (state.photoPreviewUrls.has(key)) return state.photoPreviewUrls.get(key);
  const url = URL.createObjectURL(photo.blob);
  state.photoPreviewUrls.set(key, url);
  return url;
}

function capturePhotoCardHtml(photo, index, locked) {
  const url = previewUrlForPhoto(photo);
  const syncLabel = photo.state === 'SYNCED' ? 'SYNCED' : 'LOCAL / QUEUED';
  const syncClass = photo.state === 'SYNCED' ? 'success' : 'warning';
  const source = photo.gpsSource || '-';

  return `
    <div class="photo-card evidence-preview-card">
      ${url
        ? `<button type="button" class="photo-thumb-button" data-view-photo="${escapeAttr(photo.photoLocalId)}" aria-label="Lihat foto evidence">
             <img src="${escapeAttr(url)}" alt="Evidence ${index + 1}">
           </button>`
        : `<div class="photo-placeholder">Preview tidak tersedia</div>`
      }
      <div class="photo-card-body">
        <div class="photo-card-title">
          <b>Foto ${index + 1}</b>
          <span class="badge ${syncClass}">${syncLabel}</span>
        </div>
        <div class="tiny muted">${escapeHtml(photo.fileName || photo.photoLocalId)}</div>
        <div class="photo-meta-grid">
          <div><span>Ukuran</span><b>${escapeHtml(formatBytes(photo.fileSize || 0))}</b></div>
          <div><span>GPS Accuracy</span><b>${escapeHtml(formatNumber(photo.gpsAccuracy))} m</b></div>
          <div><span>Ke Titik Plan</span><b>${escapeHtml(formatNumber(photo.distanceToPlanM))} m</b></div>
          <div><span>GPS Source</span><b>${escapeHtml(source)}</b></div>
          <div class="full"><span>Waktu Capture</span><b>${escapeHtml(formatDate(photo.capturedAt))}</b></div>
        </div>
        <div class="toolbar compact">
          ${url ? `<button type="button" class="btn outline small" data-view-photo="${escapeAttr(photo.photoLocalId)}">Lihat / Perbesar</button>` : ''}
          ${!locked ? `<button type="button" class="btn danger small" data-delete-photo="${escapeAttr(photo.photoLocalId)}">${photo.state === 'SYNCED' ? 'Hapus / Ganti' : 'Hapus Lokal'}</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function openPhotoModal(photoLocalId) {
  const photo = await idbGet(STORE_PHOTOS, photoLocalId);
  if (!photo) {
    toast('Foto lokal tidak ditemukan.', 'warning');
    return;
  }
  const url = previewUrlForPhoto(photo);
  if (!url) {
    toast('Preview foto tidak tersedia di perangkat ini.', 'warning');
    return;
  }

  el.photoModalImage.src = url;
  el.photoModalMeta.innerHTML = `
    <div><b>${escapeHtml(photo.fileName || photo.photoLocalId)}</b></div>
    <div>GPS Accuracy: <b>${escapeHtml(formatNumber(photo.gpsAccuracy))} m</b></div>
    <div>Jarak ke titik plan: <b>${escapeHtml(formatNumber(photo.distanceToPlanM))} m</b></div>
    <div>GPS Source: <b>${escapeHtml(photo.gpsSource || '-')}</b></div>
    <div>Captured: <b>${escapeHtml(formatDate(photo.capturedAt))}</b></div>
    <div>Status: <b>${escapeHtml(photo.state || '-')}</b></div>
  `;
  el.photoModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closePhotoModal() {
  el.photoModal?.classList.add('hidden');
  if (el.photoModalImage) el.photoModalImage.src = '';
  if (el.photoModalMeta) el.photoModalMeta.innerHTML = '';
  document.body.classList.remove('modal-open');
}

async function deleteCapturePhoto(photoLocalId) {
  const photo = await idbGet(STORE_PHOTOS, photoLocalId);
  if (!photo) {
    toast('Foto tidak ditemukan.', 'warning');
    return;
  }

  const draft = await idbGet(STORE_DRAFTS, photo.draftId);
  if (!draft) {
    toast('Draft evidence tidak ditemukan.', 'danger');
    return;
  }

  const workflow = String(draft.workflow || '').toUpperCase();
  if (['SUBMITTED','VERIFIED','REJECTED'].includes(workflow)) {
    toast('Evidence sudah dikunci. Gunakan workflow Revision/Reopen.', 'warning', 6000);
    return;
  }

  const yes = window.confirm(
    photo.state === 'SYNCED'
      ? 'Foto ini sudah tersimpan di server. Hapus foto ini agar bisa ambil ulang?'
      : 'Hapus foto lokal ini?'
  );
  if (!yes) return;

  try {
    if (photo.state === 'SYNCED' && photo.serverEvidenceId && photo.serverPhotoId) {
      if (!navigator.onLine) {
        throw new Error('Foto yang sudah tersinkron hanya dapat dihapus saat ONLINE.');
      }
      const result = await api(
        `/evidence/${encodeURIComponent(photo.serverEvidenceId)}/photos/${encodeURIComponent(photo.serverPhotoId)}`,
        { method: 'DELETE' }
      );
      draft.serverPhotoCount = Number(result.photoCount || 0);
      draft.workflow = result.workflowStatus || (draft.serverPhotoCount > 0 ? 'SYNCED' : 'DRAFT_LOCAL');
      draft.updatedAt = new Date().toISOString();
      await idbPut(STORE_DRAFTS, draft);
    }

    const queueItems = await idbGetAll(STORE_QUEUE);
    for (const q of queueItems) {
      if (q.photoLocalId === photoLocalId) {
        await idbDelete(STORE_QUEUE, q.queueId);
      }
    }

    await idbDelete(STORE_PHOTOS, photoLocalId);

    const oldUrl = state.photoPreviewUrls.get(photoLocalId);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      state.photoPreviewUrls.delete(photoLocalId);
    }

    await refreshLocalState();
    toast('Foto dihapus. Silakan Ambil Foto + GPS untuk mengganti.', 'success', 5000);
    await renderCapturePanel();
  } catch (err) {
    toast(humanError(err), 'danger', 6000);
  }
}

function beginCapture() {
  if (!state.selectedRequirement || !state.selectedSession) return;
  state.cameraContext = {
    qtyReal: document.getElementById('qtyRealInput')?.value || '',
    fieldNote: document.getElementById('fieldNoteInput')?.value || ''
  };
  el.cameraInput.value = '';
  el.cameraInput.click();
}

async function onCameraFileSelected(event) {
  const file = event.target.files?.[0];

  if (
    !file ||
    !state.selectedRequirement ||
    !state.selectedSession
  ) {
    return;
  }

  try {
    setCaptureStage(
      'GPS + optimasi foto',
      12,
      true
    );

    // Run the two slowest client-side steps at the same time.
    const gpsPromise =
      getGpsForCapture();

    const optimizePromise =
      optimizePhoto(file);

    const [gps, optimized] =
      await Promise.all([
        gpsPromise,
        optimizePromise
      ]);

    const pointDistance =
      distanceToSelectedPlan(
        gps.latitude,
        gps.longitude
      );

    const blockGps =
      Number(
        configNumber(
          'GPS_FIELD_BLOCK_M',
          50
        )
      );

    const gpsPolicy =
      String(
        state.config.GPS_POLICY ||
        'DEV'
      ).toUpperCase();

    if (
      gpsPolicy === 'FIELD' &&
      gps.accuracy > blockGps
    ) {
      throw new Error(
        `GPS accuracy ${Math.round(gps.accuracy)} m > batas FIELD ${blockGps} m. Ulangi GPS.`
      );
    }

    setCaptureStage(
      'Menyiapkan evidence lokal',
      48,
      true
    );

    const hash =
      await sha256Blob(
        optimized.blob
      );

    const draft =
      await getOrCreateCurrentDraft(
        state.cameraContext || {}
      );

    const photoLocalId =
      `LPH-${crypto.randomUUID?.() || uid()}`;

    const photo = {
      photoLocalId,
      draftId:
        draft.draftId,
      blob:
        optimized.blob,
      fileName:
        optimized.fileName,
      mimeType:
        optimized.blob.type ||
        'image/jpeg',
      fileSize:
        optimized.blob.size,
      originalFileSize:
        file.size,
      photoHash:
        hash,
      latitude:
        gps.latitude,
      longitude:
        gps.longitude,
      gpsAccuracy:
        gps.accuracy,
      gpsSource:
        gps.source,
      distanceToPlanM:
        Number.isFinite(
          pointDistance
        )
          ? Math.round(
              pointDistance * 10
            ) / 10
          : null,
      capturedAt:
        new Date().toISOString(),
      state:
        'LOCAL',
      serverPhotoId:
        ''
    };

    await idbPut(
      STORE_PHOTOS,
      photo
    );

    const queueItem = {
      queueId:
        `QUE-${photoLocalId}`,
      photoLocalId,
      draftId:
        draft.draftId,
      state:
        'WAITING',
      attempts:
        0,
      lastError:
        '',
      createdAt:
        new Date().toISOString()
    };

    await idbPut(
      STORE_QUEUE,
      queueItem
    );

    await refreshLocalState();
    updateQueueBadge();

    setCaptureStage(
      navigator.onLine
        ? 'Foto aman lokal — mulai upload'
        : 'Foto aman di perangkat',
      navigator.onLine ? 64 : 100,
      true
    );

    await renderCapturePanel();

    toast(
      `Foto tersimpan lokal. GPS ${Math.round(gps.accuracy)} m${
        Number.isFinite(pointDistance)
          ? ` • ke titik ${Math.round(pointDistance)} m`
          : ''
      }.`,
      'success'
    );

    if (
      navigator.onLine &&
      truthyConfig(
        'AUTO_SYNC',
        true
      )
    ) {
      runSyncQueue();
    }
    else {
      setCaptureStage(
        'Menunggu koneksi untuk sync',
        100,
        false
      );
    }
  }
  catch (err) {
    setCaptureStage(
      'Gagal memproses foto',
      0,
      false
    );

    toast(
      humanError(err),
      'danger',
      6000
    );
  }
}

async function getOrCreateCurrentDraft(ctx) {
  const existing = findCurrentDraft();
  if (
    existing &&
    ![
      'SUBMITTED',
      'VERIFIED',
      'REJECTED',
      'NEED_REVISION'
    ].includes(
      String(existing.workflow || '')
        .toUpperCase()
    )
  ) {
    existing.qtyReal = ctx.qtyReal;
    existing.fieldNote = ctx.fieldNote;
    existing.updatedAt = new Date().toISOString();
    await idbPut(STORE_DRAFTS, existing);
    return existing;
  }

  const r = state.selectedRequirement;
  const draft = {
    draftId: `LED-${crypto.randomUUID?.() || uid()}`,
    projectId: state.selectedProjectId,
    sessionId: state.selectedSession.sessionId,
    anchorLabel: state.selectedSession.anchorLabel,
    projectMaterialId: r.projectMaterialId,
    materialId: r.materialId,
    designator: r.designator,
    materialName: r.materialName,
    requirementCode: r.requirementCode,
    requiredPhotoCount: Math.max(0, Number(r.evidenceRequired || 0)),
    qtyPlan: r.qtyPlan,
    qtyReal: ctx.qtyReal,
    fieldNote: ctx.fieldNote,
    serverEvidenceId: '',
    serverPhotoCount: Number(r.photoCount || 0),
    workflow: 'DRAFT_LOCAL',
    parentEvidenceId: '',
    revisionReason: '',
    assignmentId: assignmentForCurrentPoint()?.assignmentId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await idbPut(STORE_DRAFTS, draft);

  state.activeDraftId = draft.draftId;
  localStorage.setItem(
    ACTIVE_DRAFT_KEY,
    draft.draftId
  );

  await refreshLocalState();
  return draft;
}

function findCurrentDraft() {
  if (
    !state.selectedRequirement ||
    !state.selectedSession
  ) {
    return null;
  }

  const candidates = state.drafts.filter(
    d =>
      d.projectId === state.selectedProjectId &&
      d.sessionId === state.selectedSession.sessionId &&
      d.projectMaterialId ===
        state.selectedRequirement.projectMaterialId
  );

  if (!candidates.length) {
    return null;
  }

  // 1. Explicit active draft always wins.
  if (state.activeDraftId) {
    const active = candidates.find(
      d => d.draftId === state.activeDraftId
    );

    if (active) {
      return active;
    }
  }

  // 2. An open revision V2+ wins over any V1 history.
  const revisionOpen = candidates
    .filter(
      d =>
        d.parentEvidenceId &&
        !d.isHistory &&
        !['NEED_REVISION','REJECTED','VERIFIED']
          .includes(
            String(d.workflow || '')
              .toUpperCase()
          )
    )
    .sort(
      (a, b) =>
        String(b.updatedAt || '')
          .localeCompare(
            String(a.updatedAt || '')
          )
    )[0];

  if (revisionOpen) {
    state.activeDraftId =
      revisionOpen.draftId;

    localStorage.setItem(
      ACTIVE_DRAFT_KEY,
      revisionOpen.draftId
    );

    return revisionOpen;
  }

  // 3. Prefer an editable normal draft.
  const normalOpen = candidates
    .filter(
      d =>
        !d.isHistory &&
        !['NEED_REVISION','REJECTED','VERIFIED']
          .includes(
            String(d.workflow || '')
              .toUpperCase()
          )
    )
    .sort(
      (a, b) =>
        String(b.updatedAt || '')
          .localeCompare(
            String(a.updatedAt || '')
          )
    )[0];

  if (normalOpen) {
    return normalOpen;
  }

  // 4. Fallback for read-only history display.
  return candidates
    .slice()
    .sort(
      (a, b) =>
        String(b.updatedAt || '')
          .localeCompare(
            String(a.updatedAt || '')
          )
    )[0];
}

function assignmentForCurrentPoint() {
  const assignments = state.bootstrap?.assignments || [];
  const exact = assignments.find(a => a.projectId === state.selectedProjectId && String(a.scopeType).toUpperCase() === 'POINT' && a.scopeValue === state.selectedSession?.sessionId);
  return exact || assignments.find(a => a.projectId === state.selectedProjectId && String(a.scopeType).toUpperCase() === 'PROJECT') || null;
}

async function submitCurrentEvidence() {
  const draft =
    findCurrentDraft();

  if (!draft?.serverEvidenceId) {
    toast(
      'Evidence belum tersimpan di server.',
      'warning'
    );
    return;
  }

  const btn =
    document.getElementById(
      'submitEvidenceBtn'
    );

  const oldText =
    btn?.textContent || '';

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent =
        'Mengirim ke Verifier...';
    }

    setCaptureStage(
      'Submit verifikasi',
      88,
      true
    );

    const result =
      await api(
        `/evidence/${encodeURIComponent(draft.serverEvidenceId)}/submit`,
        {
          method:
            'POST',
          body: {
            fieldNote:
              draft.fieldNote || ''
          }
        }
      );

    draft.workflow =
      result.workflowStatus ||
      'SUBMITTED';

    draft.updatedAt =
      new Date().toISOString();

    await idbPut(
      STORE_DRAFTS,
      draft
    );

    await refreshLocalState();

    setCaptureStage(
      'SUBMITTED',
      100,
      false
    );

    toast(
      'Evidence SUBMITTED ke tim verifikasi.',
      'success'
    );

    refreshNotifications(false);
    await renderCapturePanel();
  }
  catch (err) {
    setCaptureStage(
      'Submit gagal',
      0,
      false
    );

    toast(
      humanError(err),
      'danger',
      6000
    );

    if (btn) {
      btn.disabled = false;
      btn.textContent =
        oldText ||
        'Submit Verifikasi';
    }
  }
}

async function runSyncQueue() {
  if (state.syncing || !navigator.onLine || !sessionIsUsable()) {
    updateQueueBadge();
    return;
  }
  state.syncing = true;
  updateQueueBadge();
  try {
    let items = (await idbGetAll(STORE_QUEUE)).filter(q => q.state === 'WAITING' || q.state === 'FAILED');
    items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const item of items) {
      if (!navigator.onLine || !sessionIsUsable()) break;
      try {
        item.state = 'SYNCING';
        item.attempts = Number(item.attempts || 0) + 1;

        setCaptureStage(
          'Upload foto ke server',
          72,
          true
        );
        await idbPut(STORE_QUEUE, item);
        updateQueueBadge();
        await syncOneQueueItem(item);
        await idbDelete(STORE_QUEUE, item.queueId);

        setCaptureStage(
          'Sync selesai',
          100,
          false
        );
      } catch (err) {
        const msg = humanError(err);
        if (isAuthError(err) || err?.networkError) {
          item.state = 'WAITING';
          item.lastError = msg;
          await idbPut(STORE_QUEUE, item);
          if (isAuthError(err)) {
            clearSession();
            toast('Session expired. Queue lokal tetap aman; login sekali untuk lanjut.', 'warning', 6000);
            showLogin('Session expired. Login kembali; queue lokal tidak hilang.');
          }
          break;
        }
        item.state = 'FAILED';
        item.lastError = msg;
        await idbPut(STORE_QUEUE, item);
        console.warn('Queue item failed', item.queueId, err);
        continue;
      }
    }
  } finally {
    state.syncing = false;
    await refreshLocalState();
    updateQueueBadge();
    if (state.currentPage === 'evidence') renderEvidence();
    if (state.currentPage === 'pekerjaan' && state.selectedRequirement) renderCapturePanel();

    refreshNotifications(false);
  }
}

async function syncOneQueueItem(item) {
  const photo = await idbGet(STORE_PHOTOS, item.photoLocalId);
  const draft = await idbGet(STORE_DRAFTS, item.draftId);
  if (!photo || !draft) throw new Error('Queue orphan: draft/foto lokal tidak ditemukan.');
  const base64 = await blobToBase64(photo.blob);
  const result = await api('/evidence/sync-photo', {
    method: 'POST',
    body: {
      projectId: draft.projectId,
      sessionId: draft.sessionId,
      projectMaterialId: draft.projectMaterialId,
      evidenceDraftId: draft.draftId,
      photoLocalId: photo.photoLocalId,
      latitude: photo.latitude,
      longitude: photo.longitude,
      gpsAccuracy: photo.gpsAccuracy,
      gpsSource: photo.gpsSource,
      distanceToPlanM: photo.distanceToPlanM,
      capturedAt: photo.capturedAt,
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      fileSize: photo.fileSize,
      photoHash: photo.photoHash,
      deviceId: getDeviceId(),
      qtyPlan: draft.qtyPlan,
      qtyReal: draft.qtyReal,
      fieldNote: draft.fieldNote,
      assignmentId: draft.assignmentId || '',
      parentEvidenceId: draft.parentEvidenceId || '',
      revisionReason: draft.revisionReason || '',
      base64
    }
  });

  draft.serverEvidenceId = result.evidenceItemId;
  draft.serverPhotoCount = Number(result.photoCount || draft.serverPhotoCount || 0);
  draft.requiredPhotoCount = Number(result.requiredPhotoCount || draft.requiredPhotoCount || 1);
  draft.workflow = 'SYNCED';
  draft.updatedAt = new Date().toISOString();
  await idbPut(STORE_DRAFTS, draft);

  photo.state = 'SYNCED';
  photo.serverPhotoId = result.photoId || '';
  photo.serverEvidenceId = result.evidenceItemId || '';
  photo.duplicateHashOf = result.duplicateHashOf || '';
  photo.syncedAt = new Date().toISOString();
  await idbPut(STORE_PHOTOS, photo);
}

async function renderEvidence() {
  await refreshLocalState();
  const drafts = state.drafts.slice().sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const queue = state.queue;
  el.content.innerHTML = `
    <div class="grid kpi">
      ${kpi('Draft Lokal', drafts.filter(d => d.workflow === 'DRAFT_LOCAL').length)}
      ${kpi('Menunggu Sync', queue.filter(q => q.state === 'WAITING' || q.state === 'SYNCING').length)}
      ${kpi('Sync Gagal', queue.filter(q => q.state === 'FAILED').length)}
      ${kpi('Submitted', drafts.filter(d => d.workflow === 'SUBMITTED').length)}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="section-head"><h2>Queue & Draft Evidence</h2><button id="evidenceSyncBtn" class="btn secondary small" ${!navigator.onLine ? 'disabled' : ''}>Sync Sekarang</button></div>
      <div class="list">
        ${drafts.length ? drafts.map(d => draftCardHtml(d, queue)).join('') : '<div class="empty">Belum ada draft evidence lokal.</div>'}
      </div>
    </div>
  `;
  document.getElementById('evidenceSyncBtn')?.addEventListener('click', runSyncQueue);
  el.content.querySelectorAll('[data-draft-submit]').forEach(btn => btn.addEventListener('click', async () => {
    const draft = await idbGet(STORE_DRAFTS, btn.dataset.draftSubmit);
    if (!draft?.serverEvidenceId) return;
    try {
      const result = await api(`/evidence/${encodeURIComponent(draft.serverEvidenceId)}/submit`, { method:'POST', body:{ fieldNote:draft.fieldNote || '' } });
      draft.workflow = result.workflowStatus;
      draft.updatedAt = new Date().toISOString();
      await idbPut(STORE_DRAFTS,draft);
      toast('Evidence submitted.', 'success');
      renderEvidence();
    } catch(err) { toast(humanError(err),'danger',6000); }
  }));
}

function draftCardHtml(draft, queue) {
  const q = queue.filter(x => x.draftId === draft.draftId);
  const waiting = q.filter(x => ['WAITING','SYNCING'].includes(x.state)).length;
  const failed = q.filter(x => x.state === 'FAILED').length;
  const complete = Number(draft.serverPhotoCount || 0) >= Number(draft.requiredPhotoCount || 1);
  return `
    <div class="list-item">
      <div><div class="item-title">${escapeHtml(draft.designator || draft.materialName || draft.projectMaterialId)}</div><div class="item-sub">${escapeHtml(draft.projectId)} • ${escapeHtml(draft.sessionId)}<br>Server ${Number(draft.serverPhotoCount || 0)}/${Number(draft.requiredPhotoCount || 0)} • Queue ${waiting}${failed ? ` • Failed ${failed}` : ''}</div></div>
      <div style="display:grid;gap:7px;justify-items:end"><span class="badge ${workflowBadge(draft.workflow)}">${escapeHtml(draft.workflow || 'DRAFT_LOCAL')}</span>${draft.serverEvidenceId && complete && draft.workflow !== 'SUBMITTED' ? `<button class="btn success small" data-draft-submit="${escapeAttr(draft.draftId)}">Submit</button>` : ''}</div>
    </div>`;
}

async function renderVerification() {
  if (!hasPermission('verification.decide')) {
    el.content.innerHTML = '<div class="empty">Role ini tidak memiliki hak verifikasi.</div>';
    return;
  }
  if (!navigator.onLine) {
    el.content.innerHTML = '<div class="empty">Verifikasi membutuhkan koneksi server. Evidence lapangan tetap dapat dibuat offline.</div>';
    return;
  }
  try {
    const data = await api('/verification/queue');
    state.verificationQueue = data.items || [];
    el.content.innerHTML = `
      <div class="toolbar"><span class="badge warning">${state.verificationQueue.length} waiting</span><button id="refreshVerification" class="btn ghost small">Refresh</button></div>
      <div class="list">${state.verificationQueue.length ? state.verificationQueue.map(verificationCardHtml).join('') : '<div class="empty">Tidak ada evidence menunggu verifikasi.</div>'}</div>
    `;
    document.getElementById('refreshVerification')?.addEventListener('click', renderVerification);
    el.content.querySelectorAll('[data-verify]').forEach(btn => btn.addEventListener('click', () => handleVerificationAction(btn)));
    el.content.querySelectorAll('[data-verifier-photo-open]').forEach(btn => {
      btn.addEventListener('click', () =>
        openVerifierPhotoModal(
          btn.dataset.evidenceId,
          btn.dataset.photoId
        )
      );
    });
    hydrateVerifierPhotoPreviews();
  } catch (err) {
    el.content.innerHTML = `<div class="status-box danger">${escapeHtml(humanError(err))}</div>`;
  }
}

function verificationCardHtml(ev) {
  const photos = ev.photos || [];
  return `
    <div class="card">
      <div class="section-head"><div><h3>${escapeHtml(ev.itemLabel || ev.designator || ev.evidenceId)}</h3><div class="small muted">${escapeHtml(ev.evidenceId)} • V${Number(ev.versionNo || 1)} • ${escapeHtml(ev.projectId)} • ${escapeHtml(ev.sessionId || '-')}</div></div><span class="badge warning">SUBMITTED</span></div>
      <div class="grid three">
        <div><div class="tiny muted">GPS Accuracy</div><b>${formatNumber(ev.gpsAccuracy)} m</b></div>
        <div><div class="tiny muted">Distance to Plan</div><b>${formatNumber(ev.distanceToPlanM)} m</b></div>
        <div><div class="tiny muted">Foto</div><b>${photos.length}/${Number(ev.requiredPhotoCount || 1)}</b></div>
      </div>
      ${ev.fieldNote ? `<div class="status-box neutral"><b>Catatan Lapangan:</b> ${escapeHtml(ev.fieldNote)}</div>` : ''}
      <div class="photo-grid" style="margin-top:12px">${photos.map(p => `
        <div class="photo-card verifier-photo-card">
          <div class="small"><b>${escapeHtml(p.fileName || p.photoId)}</b></div>
          <div class="tiny muted">GPS ${formatNumber(p.gpsAccuracy)} m • Ke titik ${formatNumber(p.distanceToPlanM)} m</div>
          ${p.duplicateStatus === 'HASH_DUPLICATE' ? '<span class="badge danger" style="margin-top:6px">POTENSI DUPLIKAT</span>' : ''}
          <button
            type="button"
            class="verifier-inline-preview"
            data-verifier-photo-open="1"
            data-evidence-id="${escapeAttr(ev.evidenceId)}"
            data-photo-id="${escapeAttr(p.photoId)}"
            aria-label="Lihat foto evidence">
            <div class="verifier-photo-loading" data-verifier-photo-loading="${escapeAttr(ev.evidenceId)}|${escapeAttr(p.photoId)}">Memuat foto...</div>
            <img
              class="hidden"
              data-verifier-photo-img="${escapeAttr(ev.evidenceId)}|${escapeAttr(p.photoId)}"
              alt="${escapeAttr(p.fileName || p.photoId)}">
          </button>
          <div class="toolbar compact">
            <button
              type="button"
              class="btn outline small"
              data-verifier-photo-open="1"
              data-evidence-id="${escapeAttr(ev.evidenceId)}"
              data-photo-id="${escapeAttr(p.photoId)}">
              Lihat / Perbesar
            </button>
            ${p.url ? `<a class="btn outline small" href="${escapeAttr(p.url)}" target="_blank" rel="noopener" style="text-decoration:none">Lihat Foto Drive</a>` : ''}
          </div>
        </div>
      `).join('')}</div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label>Reason Code</label><select class="select" data-reason-for="${escapeAttr(ev.evidenceId)}"><option value="">-- pilih bila revision/reject --</option><option>FOTO_TIDAK_JELAS</option><option>GPS_TIDAK_SESUAI</option><option>MATERIAL_TIDAK_SESUAI</option><option>QTY_TIDAK_SESUAI</option><option>EVIDENCE_KURANG</option><option>LAINNYA</option></select></div>
        <div class="field"><label>Catatan</label><input class="input" data-note-for="${escapeAttr(ev.evidenceId)}" placeholder="Catatan verifier"></div>
      </div>
      <div class="toolbar" style="margin-top:12px"><button class="btn success" data-verify="approve" data-id="${escapeAttr(ev.evidenceId)}">Approve</button><button class="btn warning" data-verify="revision" data-id="${escapeAttr(ev.evidenceId)}">Need Revision</button><button class="btn danger" data-verify="reject" data-id="${escapeAttr(ev.evidenceId)}">Reject</button></div>
    </div>`;
}


async function verifierPhotoObjectUrl(evidenceId, photoId) {
  const key = `${evidenceId}|${photoId}`;

  if (state.verifierPhotoObjectUrls.has(key)) {
    return state.verifierPhotoObjectUrls.get(key);
  }

  const result = await api(
    `/evidence/${encodeURIComponent(evidenceId)}/photos/${encodeURIComponent(photoId)}`
  );

  if (!result?.base64) {
    throw new Error('Data preview foto kosong.');
  }

  const binary = atob(result.base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob(
    [bytes],
    {
      type:
        result.mimeType ||
        'image/jpeg'
    }
  );

  const url = URL.createObjectURL(blob);
  state.verifierPhotoObjectUrls.set(key, url);

  return url;
}

async function hydrateOneVerifierPhoto(img) {
  if (
    !img ||
    img.dataset.loaded === '1'
  ) {
    return;
  }

  img.dataset.loaded = '1';

  const key =
    img.dataset.verifierPhotoImg || '';

  const splitAt =
    key.indexOf('|');

  if (splitAt < 1) {
    return;
  }

  const evidenceId =
    key.slice(
      0,
      splitAt
    );

  const photoId =
    key.slice(
      splitAt + 1
    );

  const loading =
    el.content.querySelector(
      `[data-verifier-photo-loading="${cssEscape(key)}"]`
    );

  try {
    const url =
      await verifierPhotoObjectUrl(
        evidenceId,
        photoId
      );

    img.src = url;
    img.classList.remove(
      'hidden'
    );

    if (loading) {
      loading.classList.add(
        'hidden'
      );
    }
  }
  catch (err) {
    if (loading) {
      loading.textContent =
        'Preview belum dimuat — klik Lihat / Perbesar';
      loading.classList.add(
        'danger-text'
      );
    }

    img.dataset.loaded =
      '0';
  }
}

function hydrateVerifierPhotoPreviews() {
  const images =
    Array.from(
      el.content.querySelectorAll(
        '[data-verifier-photo-img]'
      )
    );

  if (!images.length) {
    return;
  }

  if (
    'IntersectionObserver' in
    window
  ) {
    const observer =
      new IntersectionObserver(
        entries => {
          entries.forEach(
            entry => {
              if (
                entry.isIntersecting
              ) {
                observer.unobserve(
                  entry.target
                );

                hydrateOneVerifierPhoto(
                  entry.target
                );
              }
            }
          );
        },
        {
          rootMargin:
            '220px 0px'
        }
      );

    images.forEach(
      img =>
        observer.observe(
          img
        )
    );

    return;
  }

  // Fallback: only the first visible cards are hydrated immediately.
  images
    .slice(0, 2)
    .forEach(
      img =>
        hydrateOneVerifierPhoto(
          img
        )
    );
}

async function openVerifierPhotoModal(
  evidenceId,
  photoId
) {
  const ev =
    state.verificationQueue.find(
      item =>
        String(item.evidenceId) ===
        String(evidenceId)
    );

  const photo =
    ev?.photos?.find(
      item =>
        String(item.photoId) ===
        String(photoId)
    );

  try {
    const url =
      await verifierPhotoObjectUrl(
        evidenceId,
        photoId
      );

    el.photoModalImage.src = url;

    el.photoModalMeta.innerHTML = `
      <div><b>${escapeHtml(photo?.fileName || photoId)}</b></div>
      <div>GPS Accuracy: <b>${escapeHtml(formatNumber(photo?.gpsAccuracy))} m</b></div>
      <div>Jarak ke titik plan: <b>${escapeHtml(formatNumber(photo?.distanceToPlanM))} m</b></div>
      <div>GPS Source: <b>${escapeHtml(photo?.gpsSource || '-')}</b></div>
      <div>Captured: <b>${escapeHtml(formatDate(photo?.capturedAt))}</b></div>
      <div>Status: <b>${escapeHtml(photo?.status || 'SYNCED')}</b></div>
    `;

    el.photoModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
  catch (err) {
    toast(
      humanError(err),
      'danger',
      6000
    );
  }
}

async function handleVerificationAction(btn) {
  const id = btn.dataset.id;
  const action = btn.dataset.verify;
  const reasonCode = document.querySelector(`[data-reason-for="${cssEscape(id)}"]`)?.value || '';
  const note = document.querySelector(`[data-note-for="${cssEscape(id)}"]`)?.value || '';
  if ((action === 'revision' || action === 'reject') && !reasonCode && !note) {
    toast('Revision/Reject wajib punya alasan.', 'warning');
    return;
  }
  try {
    await api(`/verification/${encodeURIComponent(id)}/${action}`, { method:'POST', body:{reasonCode,note} });
    toast(`Evidence ${action.toUpperCase()} berhasil.`, 'success');
    await refreshNotifications(true, true);
    renderVerification();
  } catch(err) { toast(humanError(err),'danger',6000); }
}


async function fetchMonitoringOnce(cacheKey) {
  if (
    state.monitoringInflight
  ) {
    return await state.monitoringInflight;
  }

  state.monitoringInflight =
    api('/monitoring')
      .then(async data => {
        state.monitoring =
          data;

        state.monitoringLastFetchAt =
          Date.now();

        await cachePut(
          cacheKey,
          data
        );

        return data;
      })
      .finally(() => {
        state.monitoringInflight =
          null;
      });

  return await state.monitoringInflight;
}

async function refreshMonitoringInBackground(cacheKey) {
  try {
    const data =
      await fetchMonitoringOnce(
        cacheKey
      );

    if (
      state.currentPage ===
      'monitoring'
    ) {
      // Refresh UI only after data arrives; current cached UI stays visible.
      renderMonitoring({
        force: false,
        fromBackground: true
      });
    }

    return data;
  }
  catch (err) {
    console.warn(
      'Background monitoring refresh failed',
      err
    );
  }
}

async function renderMonitoring(options = {}) {
  const cacheKey =
    `monitoring:${userCachePrefix()}`;

  const force =
    options.force === true;

  let data = null;

  const cachedRow =
    await cacheGetRow(
      cacheKey
    );

  if (
    !force &&
    cachedRow?.value
  ) {
    data =
      cachedRow.value;

    state.monitoring =
      data;

    if (
      navigator.onLine &&
      sessionIsUsable() &&
      cacheRowAgeMs(cachedRow) > 30_000
    ) {
      refreshMonitoringInBackground(
        cacheKey
      );
    }
  }
  else if (
    navigator.onLine &&
    sessionIsUsable()
  ) {
    data =
      await fetchMonitoringOnce(
        cacheKey
      );
  }

  data =
    data ||
    cachedRow?.value ||
    state.monitoring ||
    {};

  const role =
    String(
      state.user?.role ||
      data.role ||
      ''
    ).toUpperCase();

  const statuses =
    data.byStatus || {};

  const actionItems =
    data.actionItems || [];

  const recentItems =
    data.recentItems || [];

  const byUser =
    data.byUser || [];

  const isField =
    role === 'LAPANGAN';

  const metricCards =
    isField
      ? [
          [
            'Evidence Saya',
            data.evidenceTotal || 0,
            'yang pernah saya kirim/buat'
          ],
          [
            'Menunggu Verif',
            data.waitingVerification || 0,
            'sudah submit'
          ],
          [
            'Perlu Perbaikan',
            data.needRevision || 0,
            'harus saya tindak'
          ],
          [
            'Selesai',
            data.verified || 0,
            'verified'
          ]
        ]
      : [
          [
            'Total Evidence',
            data.evidenceTotal || 0,
            'dalam akses saya'
          ],
          [
            'Menunggu Verif',
            data.waitingVerification || 0,
            'butuh keputusan'
          ],
          [
            'Perlu Revisi',
            data.needRevision || 0,
            'dikembalikan ke lapangan'
          ],
          [
            'Verified',
            data.verified || 0,
            'selesai'
          ]
        ];

  el.content.innerHTML = `
    <div class="monitoring-intro card">
      <div>
        <h2>${isField ? 'Monitoring Pekerjaan Saya' : 'Monitoring Operasional'}</h2>
        <p class="muted">
          ${isField
            ? 'Lihat status evidence yang benar-benar dibuat oleh akun ini: apa yang menunggu verifikasi, perlu diperbaiki, dan sudah selesai.'
            : 'Fokus pada pekerjaan yang masih membutuhkan tindakan: verifikasi, revisi, rejected, atau sudah sync tetapi belum submit.'}
        </p>
      </div>
      <span class="badge info">${escapeHtml(roleLabel(role))}</span>
    </div>

    <div class="grid kpi" style="margin-top:16px">
      ${metricCards.map(row =>
        kpi(row[0], row[1], row[2])
      ).join('')}
    </div>

    <div class="grid ${isField ? 'two' : 'two'}" style="margin-top:16px">
      <div class="card">
        <div class="section-head">
          <h2>Perlu Tindakan</h2>
          <span class="badge ${actionItems.length ? 'warning' : 'success'}">${actionItems.length || 0}</span>
        </div>
        <div class="list">
          ${actionItems.length
            ? actionItems.map(item => `
              <button class="list-item clickable monitoring-action" data-monitor-page="${escapeAttr(item.page || 'monitoring')}">
                <div>
                  <div class="item-title">${escapeHtml(item.label || item.code)}</div>
                  <div class="item-sub">${escapeHtml(item.detail || '')}</div>
                </div>
                <span class="badge ${escapeAttr(item.severity || 'neutral')}">${escapeHtml(String(item.count || 0))}</span>
              </button>
            `).join('')
            : '<div class="empty">Tidak ada pekerjaan yang membutuhkan tindakan saat ini.</div>'}
        </div>
      </div>

      <div class="card">
        <h2>Arti Status</h2>
        <div class="status-definition-grid">
          ${Object.entries(data.statusDefinitions || {}).map(([key, label]) => `
            <div class="status-definition">
              <span class="badge ${workflowBadge(key)}">${escapeHtml(key)}</span>
              <span>${escapeHtml(label)}</span>
            </div>
          `).join('') || '<div class="empty">Belum ada definisi status.</div>'}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-head">
        <div>
          <h2>${isField ? 'Evidence Terakhir Saya' : 'Evidence Terbaru'}</h2>
          <div class="small muted">${isField ? 'Menunjukkan titik/material yang sebenarnya diverifikasi.' : '20 aktivitas evidence terbaru di area akses.'}</div>
        </div>
        <span class="badge neutral">${recentItems.length}</span>
      </div>

      <div class="monitoring-evidence-list">
        ${recentItems.length
          ? recentItems.map(item => `
            <div class="monitoring-evidence-row">
              <div class="monitoring-evidence-main">
                <div class="item-title">${escapeHtml(item.itemLabel || item.evidenceId)}</div>
                <div class="item-sub">
                  ${escapeHtml(item.sessionId || '-')}
                  ${item.designator ? ` • ${escapeHtml(item.designator)}` : ''}
                  • V${escapeHtml(String(item.versionNo || 1))}
                  <br>
                  ${isField ? '' : `${escapeHtml(item.createdByName || item.createdBy || '-')} • `}
                  ${escapeHtml(formatDate(item.createdAt))}
                </div>
                ${item.fieldNote ? `<div class="monitor-note">${escapeHtml(item.fieldNote)}</div>` : ''}
              </div>
              <div class="monitoring-evidence-side">
                <span class="badge ${workflowBadge(item.workflowStatus)}">${escapeHtml(item.workflowLabel || friendlyWorkflowLabel(item.workflowStatus))}</span>
                <div class="tiny muted">Foto ${escapeHtml(String(item.actualPhotoCount || 0))}/${escapeHtml(String(item.requiredPhotoCount || 0))}</div>
              </div>
            </div>
          `).join('')
          : '<div class="empty">Belum ada evidence milik akun/area ini.</div>'}
      </div>
    </div>

    ${!isField && byUser.length ? `
      <div class="card" style="margin-top:16px">
        <div class="section-head">
          <h2>Progress per User</h2>
          <span class="badge info">${byUser.length} user</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Total</th>
                <th>Waiting</th>
                <th>Revision</th>
                <th>Verified</th>
                <th>Rejected</th>
              </tr>
            </thead>
            <tbody>
              ${byUser.map(user => `
                <tr>
                  <td>
                    <b>${escapeHtml(user.name || user.email)}</b>
                    <div class="tiny muted">${escapeHtml(user.email)}</div>
                  </td>
                  <td>${escapeHtml(String(user.total || 0))}</td>
                  <td>${escapeHtml(String(user.submitted || 0))}</td>
                  <td>${escapeHtml(String(user.needRevision || 0))}</td>
                  <td>${escapeHtml(String(user.verified || 0))}</td>
                  <td>${escapeHtml(String(user.rejected || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}
  `;

  el.content.querySelectorAll('[data-monitor-page]').forEach(btn => {
    btn.addEventListener('click', () =>
      navigate(btn.dataset.monitorPage || 'monitoring')
    );
  });
}

async function renderAdmin() {
  if (!hasPermission('user.manage') && !hasPermission('assignment.manage')) {
    el.content.innerHTML = '<div class="empty">Role ini tidak memiliki menu Admin.</div>';
    return;
  }
  if (!navigator.onLine) {
    el.content.innerHTML = '<div class="empty">Admin master data membutuhkan koneksi server.</div>';
    return;
  }
  try {
    const [usersData, assignData, configData] = await Promise.all([api('/admin/users'), api('/admin/assignments'), api('/admin/config')]);
    const users = usersData.users || [];
    const assignments = assignData.assignments || [];
    const adminConfig = configData.config || {};
    const projects = state.bootstrap?.projects || [];
    el.content.innerHTML = `
      <div class="grid two">
        <div class="card"><h2>User & Role</h2>
          <div class="form-row"><div class="field"><label>Email</label><input id="adminUserEmail" class="input" placeholder="nama@domain.com"></div><div class="field"><label>Nama</label><input id="adminUserName" class="input"></div></div>
          <div class="form-row" style="margin-top:10px"><div class="field"><label>Role</label><select id="adminUserRole" class="select"><option>LAPANGAN</option><option>ADMIN</option><option>VERIFIER</option><option>PM_LEADER</option></select></div><div class="field"><label>Area</label><input id="adminUserArea" class="input" placeholder="Pontianak"></div></div>
          <button id="saveUserBtn" class="btn secondary full" style="margin-top:12px">Simpan User</button>
        </div>
        <div class="card"><h2>Assignment</h2>
          <div class="field"><label>User</label><select id="assignUser" class="select">${users.map(u=>`<option value="${escapeAttr(u.email)}">${escapeHtml(u.fullName || u.email)} — ${escapeHtml(u.role)}</option>`).join('')}</select></div>
          <div class="field" style="margin-top:10px"><label>Project</label><select id="assignProject" class="select">${projects.map(p=>`<option value="${escapeAttr(p.projectId)}">${escapeHtml(p.projectId)} — ${escapeHtml(p.projectName)}</option>`).join('')}</select></div>
          <div class="form-row" style="margin-top:10px"><div class="field"><label>Scope</label><select id="assignScope" class="select"><option>PROJECT</option><option>POINT</option></select></div><div class="field"><label>Scope Value</label><input id="assignScopeValue" class="input" placeholder="Kosong untuk PROJECT / PS-... untuk POINT"></div></div>
          <button id="saveAssignmentBtn" class="btn secondary full" style="margin-top:12px">Simpan Assignment</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h2>App Config Operasional</h2>
        <div class="grid three">
          <div class="field"><label>GPS Policy</label><select id="cfgGpsPolicy" class="select"><option ${String(adminConfig.GPS_POLICY).toUpperCase()==='DEV'?'selected':''}>DEV</option><option ${String(adminConfig.GPS_POLICY).toUpperCase()==='FIELD'?'selected':''}>FIELD</option></select></div>
          <div class="field"><label>GPS Field Block (m)</label><input id="cfgGpsBlock" class="input" type="number" value="${escapeAttr(adminConfig.GPS_FIELD_BLOCK_M ?? 50)}"></div>
          <div class="field"><label>Distance Warning (m)</label><input id="cfgDistanceWarn" class="input" type="number" value="${escapeAttr(adminConfig.POINT_DISTANCE_WARNING_M ?? 30)}"></div>
        </div>
        <button id="saveOperationalConfigBtn" class="btn secondary" style="margin-top:12px">Simpan Config</button>
        <div class="small muted" style="margin-top:8px">Gunakan DEV selama test laptop. Ganti FIELD sebelum pilot tim lapangan.</div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Daftar User</h2><div class="table-wrap"><table><thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Area</th><th>Aktif</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.fullName)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.area)}</td><td>${u.active?'YES':'NO'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h2>Assignment Aktif</h2><div class="table-wrap"><table><thead><tr><th>User</th><th>Project</th><th>Scope</th><th>Value</th><th>Status</th></tr></thead><tbody>${assignments.map(a=>`<tr><td>${escapeHtml(a.userEmail)}</td><td>${escapeHtml(a.projectId)}</td><td>${escapeHtml(a.scopeType)}</td><td>${escapeHtml(a.scopeValue)}</td><td>${escapeHtml(a.status)}</td></tr>`).join('')}</tbody></table></div></div>
    `;
    document.getElementById('saveUserBtn')?.addEventListener('click', saveAdminUser);
    document.getElementById('saveAssignmentBtn')?.addEventListener('click', saveAdminAssignment);
    document.getElementById('saveOperationalConfigBtn')?.addEventListener('click', saveOperationalConfig);
  } catch(err) { el.content.innerHTML=`<div class="status-box danger">${escapeHtml(humanError(err))}</div>`; }
}

async function saveAdminUser() {
  try {
    await api('/admin/users/upsert', {method:'POST', body:{email:value('adminUserEmail'),fullName:value('adminUserName'),role:value('adminUserRole'),area:value('adminUserArea'),active:true}});
    toast('User disimpan.', 'success');
    await refreshNotifications(true, true);
    renderAdmin();
  } catch(err){toast(humanError(err),'danger',6000);}
}

async function saveAdminAssignment() {
  try {
    await api('/admin/assignments/upsert', {method:'POST', body:{userEmail:value('assignUser'),projectId:value('assignProject'),scopeType:value('assignScope'),scopeValue:value('assignScopeValue'),status:'ACTIVE',active:true}});
    toast('Assignment disimpan.', 'success');
    await refreshNotifications(true, true);
    renderAdmin();
  } catch(err){toast(humanError(err),'danger',6000);}
}

async function saveOperationalConfig() {
  try {
    const updates = [
      ['GPS_POLICY', value('cfgGpsPolicy')],
      ['GPS_FIELD_BLOCK_M', value('cfgGpsBlock')],
      ['POINT_DISTANCE_WARNING_M', value('cfgDistanceWarn')]
    ];
    for (const [key, val] of updates) {
      await api('/admin/config', { method:'POST', body:{ key, value:val } });
    }
    const boot = await api('/bootstrap');
    state.bootstrap = boot;
    state.user = boot.user;
    state.config = boot.config || {};
    await cachePut('bootstrap', boot);
    toast('Config operasional disimpan.', 'success');
    renderAdmin();
  } catch (err) {
    toast(humanError(err), 'danger', 6000);
  }
}

async function renderOutput() {
  let caps = state.bootstrap?.outputCapabilities || {};
  if (navigator.onLine) {
    try { caps = await api('/outputs/capabilities'); } catch {}
  }
  el.content.innerHTML = `
    <div class="card"><h2>Output Generation Layer</h2><p class="muted">Fondasi stakeholder mapping sudah masuk V15. Preview boleh memakai data belum verified dengan penanda DRAFT; output resmi/final hanya memakai VERIFIED evidence.</p>
      <div class="list">
        ${statusRow('KML Plan / Realisasi', caps.kmlPlan || caps.kml || 'FOUNDATION_READY', 'success')}
        ${statusRow('KMZ Evidence', caps.kmzEvidence || 'NEXT_INCREMENT', 'warning')}
        ${statusRow('Word Evidence Report', caps.wordEvidence || caps.word || 'NEXT_INCREMENT', 'warning')}
        ${statusRow('PDF Evidence Report', caps.pdfEvidence || caps.pdf || 'NEXT_INCREMENT', 'warning')}
      </div>
      <div class="status-box neutral"><b>Rule:</b> Official Output = VERIFIED EVIDENCE. Data stakeholder/material/designator tetap dipisahkan melalui mapping project.</div>
    </div>`;
}

async function renderAudit() {
  if (!hasPermission('audit.read')) { el.content.innerHTML='<div class="empty">Tidak memiliki hak audit.</div>'; return; }
  if (!navigator.onLine) { el.content.innerHTML='<div class="empty">Audit Log dibaca dari server.</div>'; return; }
  try {
    const data = await api('/audit?limit=80');
    const items = data.items || [];
    el.content.innerHTML = `<div class="card"><h2>Audit Terbaru</h2><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Nama User</th><th>Role</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>${items.map(a=>`<tr><td>${formatDate(a.CREATED_AT)}</td><td><b>${escapeHtml(a.USER_NAME || a.USER_EMAIL || 'SYSTEM')}</b><div class="tiny muted">${escapeHtml(a.USER_EMAIL || '')}</div></td><td>${escapeHtml(a.ROLE)}</td><td>${escapeHtml(a.ACTION)}</td><td>${escapeHtml(a.ENTITY_ID)}</td><td>${escapeHtml(a.REASON)}</td></tr>`).join('')}</tbody></table></div></div>`;
  } catch(err){el.content.innerHTML=`<div class="status-box danger">${escapeHtml(humanError(err))}</div>`;}
}

function renderSettings() {
  const isField =
    String(
      state.user?.role || ''
    ).toUpperCase() ===
    'LAPANGAN';

  el.content.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h2>Perangkat</h2>
        <div class="list">
          ${statusRow('Device ID', getDeviceId(), 'neutral')}
          ${statusRow('App Version', APP_VERSION, 'info')}
          ${statusRow('Koneksi API', state.apiBase ? 'Terhubung' : 'Belum terhubung', state.apiBase ? 'success':'danger')}
          ${statusRow('Session', sessionIsUsable() ? 'Aktif' : 'Login diperlukan', sessionIsUsable()?'success':'warning')}
        </div>
      </div>

      <div class="card">
        <h2>Konfigurasi Operasional</h2>
        <div class="list">
          ${statusRow('GPS Policy', state.config.GPS_POLICY || '-', state.config.GPS_POLICY === 'FIELD'?'success':'warning')}
          ${statusRow('GPS Field Block', `${configNumber('GPS_FIELD_BLOCK_M',50)} m`, 'neutral')}
          ${statusRow('Distance Warning', `${configNumber('POINT_DISTANCE_WARNING_M',30)} m`, 'neutral')}
          ${statusRow('Photo Max', `${configNumber('MAX_PHOTO_MB',5.5)} MB`, 'neutral')}
        </div>

        ${isField
          ? '<div class="small muted" style="margin-top:12px">Konfigurasi server dikunci untuk role LAPANGAN.</div>'
          : '<button id="changeGatewayBtn" class="btn ghost full" style="margin-top:12px">Ubah API Gateway Perangkat Ini</button>'}
      </div>
    </div>`;

  document.getElementById('changeGatewayBtn')?.addEventListener('click', () => {
    const next = prompt('API Gateway URL', state.apiBase || '');
    if (!next) return;
    localStorage.setItem(API_BASE_KEY, next.trim().replace(/\/$/, ''));
    location.reload();
  });
}

async function selectProject(projectId, preload) {
  state.selectedProjectId = projectId;
  localStorage.setItem(SELECTED_PROJECT_KEY, projectId);
  if (preload) await loadWorkspace(projectId);
}

async function loadWorkspace(projectId, options = {}) {
  const key =
    `workspace:${userCachePrefix()}:${projectId}`;

  const force =
    options.force === true;

  if (
    !force &&
    state.workspace?.project?.projectId === projectId
  ) {
    return state.workspace;
  }

  const cachedRow =
    await cacheGetRow(key);

  if (
    !force &&
    cachedRow?.value
  ) {
    state.workspace =
      cachedRow.value;

    // Stale-while-revalidate. Do not make the user wait.
    if (
      navigator.onLine &&
      sessionIsUsable() &&
      cacheRowAgeMs(cachedRow) > 300_000
    ) {
      refreshWorkspaceInBackground(
        projectId,
        key
      );
    }

    return state.workspace;
  }

  if (
    navigator.onLine &&
    sessionIsUsable()
  ) {
    if (
      state.workspaceInflight.has(
        projectId
      )
    ) {
      return await state.workspaceInflight.get(
        projectId
      );
    }

    const promise =
      api(
        `/projects/${encodeURIComponent(projectId)}/workspace`
      )
        .then(async data => {
          state.workspace = data;
          await cachePut(key, data);
          return data;
        })
        .finally(() => {
          state.workspaceInflight.delete(
            projectId
          );
        });

    state.workspaceInflight.set(
      projectId,
      promise
    );

    try {
      return await promise;
    }
    catch (err) {
      if (cachedRow?.value) {
        state.workspace =
          cachedRow.value;
        return state.workspace;
      }
      throw err;
    }
  }

  state.workspace =
    cachedRow?.value ||
    null;

  return state.workspace;
}

async function refreshWorkspaceInBackground(projectId, key) {
  if (
    state.workspaceInflight.has(
      projectId
    )
  ) {
    return;
  }

  const promise =
    api(
      `/projects/${encodeURIComponent(projectId)}/workspace`
    )
      .then(async data => {
        await cachePut(key, data);

        if (
          state.selectedProjectId ===
          projectId
        ) {
          state.workspace = data;
        }

        return data;
      })
      .catch(err => {
        console.warn(
          'Background workspace refresh failed',
          err
        );
      })
      .finally(() => {
        state.workspaceInflight.delete(
          projectId
        );
      });

  state.workspaceInflight.set(
    projectId,
    promise
  );
}

async function loadRequirements(projectId, sessionId, options = {}) {
  const key =
    `requirements:r10:${userCachePrefix()}:${projectId}:${sessionId}`;

  const requestKey =
    `${projectId}:${sessionId}`;

  const force =
    options.force === true;

  const cachedRow =
    await cacheGetRow(key);

  if (
    !force &&
    cachedRow?.value
  ) {
    // Requirements change rarely; use cached response instantly.
    // Background refresh only when cache is older than 2 minutes.
    if (
      navigator.onLine &&
      sessionIsUsable() &&
      cacheRowAgeMs(cachedRow) > 120_000
    ) {
      refreshRequirementsInBackground(
        projectId,
        sessionId,
        key,
        requestKey
      );
    }

    return cachedRow.value;
  }

  if (
    navigator.onLine &&
    sessionIsUsable()
  ) {
    if (
      state.requirementsInflight.has(
        requestKey
      )
    ) {
      return await state.requirementsInflight.get(
        requestKey
      );
    }

    const promise =
      api(
        `/points/${encodeURIComponent(sessionId)}/requirements?projectId=${encodeURIComponent(projectId)}`
      )
        .then(async data => {
          await cachePut(key, data);
          return data;
        })
        .finally(() => {
          state.requirementsInflight.delete(
            requestKey
          );
        });

    state.requirementsInflight.set(
      requestKey,
      promise
    );

    try {
      return await promise;
    }
    catch (err) {
      if (cachedRow?.value) {
        return cachedRow.value;
      }
      throw err;
    }
  }

  if (!cachedRow?.value) {
    throw new Error(
      'Requirement titik ini belum pernah dicache. Buka titik sekali saat online sebelum bekerja offline.'
    );
  }

  return cachedRow.value;
}

async function refreshRequirementsInBackground(
  projectId,
  sessionId,
  key,
  requestKey
) {
  if (
    state.requirementsInflight.has(
      requestKey
    )
  ) {
    return;
  }

  const promise =
    api(
      `/points/${encodeURIComponent(sessionId)}/requirements?projectId=${encodeURIComponent(projectId)}`
    )
      .then(async data => {
        await cachePut(key, data);

        if (
          state.selectedProjectId === projectId &&
          state.selectedSession?.sessionId === sessionId
        ) {
          state.requirements = data;
          renderRequirementsPanel();
        }

        return data;
      })
      .catch(err => {
        console.warn(
          'Background requirement refresh failed',
          err
        );
      })
      .finally(() => {
        state.requirementsInflight.delete(
          requestKey
        );
      });

  state.requirementsInflight.set(
    requestKey,
    promise
  );
}

async function api(path, options = {}) {
  const result = await apiRaw(path, options);
  if (!result.ok) throw apiError(result);
  return result.data;
}

async function apiRaw(path, options = {}) {
  if (!state.apiBase) throw new Error('API Gateway belum diatur.');
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json' };
  if (options.auth !== false) {
    if (!state.sessionToken) throw apiError({status:401,error:'SESSION_REQUIRED',message:'Login diperlukan.'});
    headers.Authorization = `Bearer ${state.sessionToken}`;
  }
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(`${state.apiBase}${path}`, { method, headers, body, cache:'no-store' });
  } catch (err) {
    const e = new Error('Tidak dapat terhubung ke API Gateway.');
    e.networkError = true;
    throw e;
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`API response bukan JSON (HTTP ${response.status}).`); }
  if (!response.ok || data.ok === false) throw apiError(data, response.status);
  return data;
}

function apiError(data, fallbackStatus) {
  const err = new Error(data?.message || data?.error || 'API error');
  err.status = Number(data?.status || fallbackStatus || 500);
  err.code = data?.error || '';
  return err;
}

function isAuthError(err) { return Number(err?.status) === 401 || ['SESSION_REQUIRED','SESSION_EXPIRED'].includes(err?.code); }
function humanError(err) { return err?.message || String(err || 'Terjadi kesalahan.'); }

async function getGpsForCapture() {
  const recent =
    readRecentLiveGps(
      20_000
    );

  const policy =
    String(
      state.config.GPS_POLICY ||
      'DEV'
    ).toUpperCase();

  const blockGps =
    Number(
      configNumber(
        'GPS_FIELD_BLOCK_M',
        50
      )
    );

  if (
    recent &&
    (
      policy !== 'FIELD' ||
      Number(recent.accuracy) <=
        blockGps
    )
  ) {
    return {
      latitude:
        Number(recent.latitude),
      longitude:
        Number(recent.longitude),
      accuracy:
        Number(recent.accuracy),
      source:
        'LIVE_GPS_RECENT'
    };
  }

  const live =
    await getLiveGps()
      .catch(
        err => ({
          error:
            err
        })
      );

  if (!live.error) {
    localStorage.setItem(
      LAST_GPS_KEY,
      JSON.stringify({
        ...live,
        cachedAt:
          new Date().toISOString()
      })
    );

    return live;
  }

  if (
    policy === 'DEV'
  ) {
    const cached =
      safeJson(
        localStorage.getItem(
          LAST_GPS_KEY
        )
      );

    if (
      cached &&
      Number.isFinite(
        Number(
          cached.latitude
        )
      ) &&
      Number.isFinite(
        Number(
          cached.longitude
        )
      )
    ) {
      return {
        latitude:
          Number(
            cached.latitude
          ),
        longitude:
          Number(
            cached.longitude
          ),
        accuracy:
          Math.max(
            999,
            Number(
              cached.accuracy
            ) || 999
          ),
        source:
          'DEV_CACHED_GPS'
      };
    }
  }

  throw live.error;
}

function readRecentLiveGps(
  maxAgeMs = 20_000
) {
  const cached =
    safeJson(
      localStorage.getItem(
        LAST_GPS_KEY
      )
    );

  if (!cached) {
    return null;
  }

  if (
    !String(
      cached.source || ''
    ).startsWith(
      'LIVE_GPS'
    )
  ) {
    return null;
  }

  const cachedAt =
    new Date(
      cached.cachedAt || 0
    ).getTime();

  if (
    !Number.isFinite(
      cachedAt
    ) ||
    (
      Date.now() -
      cachedAt
    ) > maxAgeMs
  ) {
    return null;
  }

  return cached;
}

function primeGpsCache() {
  if (
    !navigator.onLine ||
    !navigator.geolocation
  ) {
    return;
  }

  if (
    readRecentLiveGps(
      20_000
    )
  ) {
    return;
  }

  if (
    state.gpsWarmupPromise
  ) {
    return;
  }

  state.gpsWarmupPromise =
    getLiveGps({
      timeout:
        8_000,
      maximumAge:
        10_000
    })
      .then(
        gps => {
          localStorage.setItem(
            LAST_GPS_KEY,
            JSON.stringify({
              ...gps,
              cachedAt:
                new Date().toISOString()
            })
          );

          return gps;
        }
      )
      .catch(
        () => null
      )
      .finally(
        () => {
          state.gpsWarmupPromise =
            null;
        }
      );
}

function getLiveGps(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(
        new Error(
          'Geolocation tidak didukung perangkat.'
        )
      );
    }

    navigator.geolocation.getCurrentPosition(
      pos =>
        resolve({
          latitude:
            pos.coords.latitude,
          longitude:
            pos.coords.longitude,
          accuracy:
            Number(
              pos.coords.accuracy ||
              9999
            ),
          source:
            'LIVE_GPS'
        }),
      err =>
        reject(
          new Error(
            err.code === 3
              ? 'Permintaan GPS timeout.'
              : `GPS gagal: ${
                  err.message ||
                  err.code
                }`
          )
        ),
      {
        enableHighAccuracy:
          true,
        timeout:
          Number(
            options.timeout ||
            8_000
          ),
        maximumAge:
          Number(
            options.maximumAge ??
            10_000
          )
      }
    );
  });
}

function distanceToSelectedPlan(lat, lng) {
  const plat = Number(state.selectedSession?.latPlan);
  const plng = Number(state.selectedSession?.longPlan);
  if (!Number.isFinite(plat) || !Number.isFinite(plng) || !Number.isFinite(lat) || !Number.isFinite(lng)) return NaN;
  return haversine(lat, lng, plat, plng);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(lat2-lat1), dLon = rad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function optimizePhoto(file) {
  const hardMaxMb =
    configNumber(
      'MAX_PHOTO_MB',
      5.5
    );

  const targetMb =
    Math.min(
      hardMaxMb,
      configNumber(
        'PHOTO_UPLOAD_TARGET_MB',
        1.8
      )
    );

  const maxBytes =
    targetMb *
    1024 *
    1024;

  const maxEdge =
    configNumber(
      'PHOTO_MAX_EDGE',
      1920
    );

  if (
    file.size <= maxBytes &&
    [
      'image/jpeg',
      'image/jpg',
      'image/webp'
    ].includes(
      String(
        file.type
      ).toLowerCase()
    )
  ) {
    return {
      blob:
        file,
      fileName:
        file.name ||
        'evidence.jpg',
      optimized:
        false
    };
  }
  const bitmap = await createImageBitmap(file);
  try {
    let w = bitmap.width, h = bitmap.height;
    const scale = Math.min(1, maxEdge / Math.max(w,h));
    w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
    let quality = .84, blob;
    for (let i=0;i<6;i++) {
      const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(bitmap,0,0,w,h);
      blob = await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Kompresi foto gagal.')),'image/jpeg',quality));
      if (blob.size <= maxBytes) break;
      quality=Math.max(.56,quality-.07); w=Math.max(1,Math.round(w*.86)); h=Math.max(1,Math.round(h*.86));
    }
    if (!blob || blob.size > maxBytes) throw new Error(`Foto masih terlalu besar setelah optimasi (${formatBytes(blob?.size || 0)}).`);
    return { blob, fileName:(file.name || 'evidence').replace(/\.[^.]+$/, '') + '.jpg', optimized:true };
  } finally { bitmap.close?.(); }
}

async function sha256Blob(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function blobToBase64(blob) {
  return new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(String(r.result).split(',')[1]||''); r.onerror=()=>reject(new Error('Gagal membaca foto lokal.')); r.readAsDataURL(blob);
  });
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = `DEV-${crypto.randomUUID?.() || uid()}`; localStorage.setItem(DEVICE_KEY,id); }
  return id;
}

async function refreshLocalState() {
  state.drafts = await idbGetAll(STORE_DRAFTS);
  state.queue = await idbGetAll(STORE_QUEUE);
  state.draftsPhotos = await idbGetAll(STORE_PHOTOS);
  updateQueueBadge();
}

async function photoCountForDraft(draftId) {
  if (!draftId) return { total:0, unsynced:0, synced:0 };
  const photos = (await idbGetAll(STORE_PHOTOS)).filter(p => p.draftId === draftId);
  return { total:photos.length, unsynced:photos.filter(p=>p.state!=='SYNCED').length, synced:photos.filter(p=>p.state==='SYNCED').length };
}

function updateNetworkUi() {
  const online = navigator.onLine;
  el.netBadge.textContent = online ? 'Online' : 'Offline';
  el.netBadge.className = `badge ${online ? 'success':'warning'}`;
}

function updateQueueBadge() {
  const pending = (state.queue || []).filter(q => ['WAITING','SYNCING'].includes(q.state)).length;
  const failed = (state.queue || []).filter(q => q.state === 'FAILED').length;
  el.queueBadge.textContent = failed ? `Queue ${pending} • Failed ${failed}` : `Queue ${pending}`;
  el.queueBadge.className = `badge ${failed ? 'danger' : pending ? 'warning' : 'success'}`;
}


function friendlyWorkflowLabel(status) {
  const s =
    String(
      status || ''
    ).toUpperCase();

  return {
    DRAFT_LOCAL:
      'Draft Lokal',
    DRAFT_SERVER:
      'Tersimpan Server',
    SYNCED:
      'Siap Submit',
    SUBMITTED:
      'Menunggu Verifikasi',
    NEED_REVISION:
      'Perlu Perbaikan',
    REJECTED:
      'Ditolak',
    VERIFIED:
      'Verified / Selesai',
    REVISION_RESOLVED:
      'Revisi Selesai',
    REOPENED:
      'Dibuka Kembali'
  }[s] || s || 'Belum Mulai';
}

function setCaptureStage(
  label,
  percent,
  active = true
) {
  state.captureStage = {
    label:
      String(label || ''),
    percent:
      Math.max(
        0,
        Math.min(
          100,
          Number(percent || 0)
        )
      ),
    active:
      active === true
  };

  const wrap =
    document.getElementById(
      'captureProcess'
    );

  const labelEl =
    document.getElementById(
      'captureStageLabel'
    );

  const percentEl =
    document.getElementById(
      'captureStagePercent'
    );

  const bar =
    document.getElementById(
      'captureStageBar'
    );

  if (wrap) {
    wrap.classList.toggle(
      'hidden',
      !state.captureStage.active
    );
  }

  if (labelEl) {
    labelEl.textContent =
      state.captureStage.label;
  }

  if (percentEl) {
    percentEl.textContent =
      `${state.captureStage.percent}%`;
  }

  if (bar) {
    bar.style.width =
      `${state.captureStage.percent}%`;
  }
}

function notificationCountForPage(page) {
  return (
    state.notifications?.items ||
    []
  )
    .filter(
      item =>
        String(
          item.page || ''
        ) ===
        String(page || '')
    )
    .reduce(
      (sum, item) =>
        sum +
        Number(
          item.count || 0
        ),
      0
    );
}

async function refreshNotifications(forceRender = false, forceNetwork = false) {
  if (
    !navigator.onLine ||
    !sessionIsUsable()
  ) {
    return;
  }

  if (
    document.visibilityState ===
      'hidden' &&
    !forceNetwork
  ) {
    return;
  }

  const age =
    Date.now() -
    Number(
      state.notificationLastFetchAt || 0
    );

  if (
    !forceNetwork &&
    age < 120_000 &&
    state.notifications?.generatedAt
  ) {
    if (forceRender) {
      renderNotificationCenter();
      renderNavigation();
    }
    return state.notifications;
  }

  if (
    state.notificationInflight
  ) {
    return await state.notificationInflight;
  }

  state.notificationInflight =
    api('/notifications')
      .then(data => {
        state.notificationLastFetchAt =
          Date.now();

        state.notifications = {
          count:
            Number(data.count || 0),
          items:
            Array.isArray(data.items)
              ? data.items
              : [],
          generatedAt:
            data.generatedAt || ''
        };

        cachePut(
          `notifications:${userCachePrefix()}`,
          state.notifications
        ).catch(() => {});

        renderNotificationCenter();
        renderNavigation();

        if (forceRender) {
          renderNotificationCenter();
        }

        return state.notifications;
      })
      .catch(err => {
        console.warn(
          'Notification refresh failed',
          err
        );
      })
      .finally(() => {
        state.notificationInflight =
          null;
      });

  return await state.notificationInflight;
}

function renderNotificationCenter() {
  const data =
    state.notifications || {
      count:
        0,
      items:
        []
    };

  const count =
    Number(
      data.count || 0
    );

  if (el.notifBadge) {
    el.notifBadge.textContent =
      String(count);

    el.notifBadge.classList.toggle(
      'hidden',
      count < 1
    );
  }

  if (el.notifGeneratedAt) {
    el.notifGeneratedAt.textContent =
      data.generatedAt
        ? `Update ${formatDate(data.generatedAt)}`
        : 'Belum diperbarui';
  }

  if (!el.notifList) {
    return;
  }

  const items =
    data.items || [];

  el.notifList.innerHTML =
    items.length
      ? items.map(item => `
          <button
            type="button"
            class="notification-item"
            data-notif-page="${escapeAttr(item.page || 'monitoring')}">
            <span class="notification-dot ${escapeAttr(item.severity || 'neutral')}"></span>
            <span class="notification-copy">
              <b>${escapeHtml(item.title || item.type)}</b>
              <small>${escapeHtml(item.message || '')}</small>
            </span>
            <span class="badge ${escapeAttr(item.severity || 'neutral')}">${escapeHtml(String(item.count || 0))}</span>
          </button>
        `).join('')
      : '<div class="empty notification-empty">Tidak ada pekerjaan baru yang perlu ditindak.</div>';

  el.notifList
    .querySelectorAll(
      '[data-notif-page]'
    )
    .forEach(
      btn => {
        btn.addEventListener(
          'click',
          () => {
            el.notifPanel?.classList.add(
              'hidden'
            );

            navigate(
              btn.dataset.notifPage ||
              'monitoring'
            );
          }
        );
      }
    );
}

function startNotificationPolling() {
  stopNotificationPolling();

  state.notificationTimer =
    setInterval(
      () => {
        if (
          navigator.onLine &&
          sessionIsUsable() &&
          document.visibilityState ===
            'visible'
        ) {
          refreshNotifications(
            false,
            false
          );
        }
      },
      120_000
    );
}

function stopNotificationPolling() {
  if (
    state.notificationTimer
  ) {
    clearInterval(
      state.notificationTimer
    );

    state.notificationTimer =
      null;
  }
}

function hasPermission(p) { return (state.user?.permissions || []).includes(p); }
function configNumber(key, fallback) { const n=Number(state.config?.[key]); return Number.isFinite(n)?n:fallback; }
function truthyConfig(key, fallback) { const v=state.config?.[key]; if(v===undefined||v===null||v==='')return fallback; return ['TRUE','1','YES','ON'].includes(String(v).toUpperCase()); }

function projectSelectHtml(projects, selected, id) {
  return `<select id="${escapeAttr(id)}" class="select">${projects.map(p=>`<option value="${escapeAttr(p.projectId)}" ${p.projectId===selected?'selected':''}>${escapeHtml(p.projectId)} — ${escapeHtml(p.projectName || p.lopRing || '')}</option>`).join('')}</select>`;
}
function kpi(label,value,sub='') { return `<div class="card kpi-card"><div class="value">${escapeHtml(String(value ?? 0))}</div><div class="label">${escapeHtml(label)}${sub?` • ${escapeHtml(sub)}`:''}</div></div>`; }
function statusRow(label,value,badge='neutral') { return `<div class="list-item"><div><div class="item-title">${escapeHtml(label)}</div></div><span class="badge ${badge}">${escapeHtml(String(value ?? '-'))}</span></div>`; }
function workflowBadge(status) { const s=String(status||'').toUpperCase(); if(['VERIFIED','SYNCED','COMPLETE','REVISION_RESOLVED'].includes(s))return 'success'; if(['SUBMITTED','QUEUED','SYNCING','NEED_REVISION','REOPENED'].includes(s))return 'warning'; if(['REJECTED','FAILED','SYNC_ERROR'].includes(s))return 'danger'; if(['DRAFT_SERVER'].includes(s))return 'info'; return 'neutral'; }
function roleLabel(role) { return {LAPANGAN:'LAPANGAN',ADMIN:'ADMIN',VERIFIER:'VERIFIER',PM_LEADER:'PM / LEADER'}[String(role||'').toUpperCase()] || String(role||'-'); }
function formatNumber(v) { const n=Number(v); return Number.isFinite(n)?(Math.round(n*10)/10).toLocaleString('id-ID'):'-'; }
function formatCoord(v) { const n=Number(v); return Number.isFinite(n)?n.toFixed(6):'-'; }
function formatBytes(bytes) { const n=Number(bytes)||0; if(n<1024)return `${n} B`; if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }
function formatDate(v) { if(!v)return '-'; const d=new Date(v); return isNaN(d)?escapeHtml(String(v)):d.toLocaleString('id-ID'); }
function value(id) { return document.getElementById(id)?.value || ''; }
function safeJson(v) { try{return JSON.parse(v)}catch{return null} }
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g,'&#096;'); }
function cssEscape(value) { return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/(["\\])/g,'\\$1'); }

let toastTimer;
function toast(message,type='neutral',duration=3500) {
  clearTimeout(toastTimer); el.toast.className=`toast ${type}`; el.toast.textContent=message; el.toast.classList.remove('hidden');
  toastTimer=setTimeout(()=>el.toast.classList.add('hidden'),duration);
}

function openDb() {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE_CACHE))db.createObjectStore(STORE_CACHE,{keyPath:'key'});
      if(!db.objectStoreNames.contains(STORE_DRAFTS))db.createObjectStore(STORE_DRAFTS,{keyPath:'draftId'});
      if(!db.objectStoreNames.contains(STORE_PHOTOS))db.createObjectStore(STORE_PHOTOS,{keyPath:'photoLocalId'});
      if(!db.objectStoreNames.contains(STORE_QUEUE))db.createObjectStore(STORE_QUEUE,{keyPath:'queueId'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}

async function withStore(name,mode,fn) {
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(name,mode), store=tx.objectStore(name); let req;
    try{req=fn(store)}catch(err){reject(err);return}
    tx.oncomplete=()=>resolve(req?.result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  });
}
function idbPut(store,value){return withStore(store,'readwrite',s=>s.put(value));}
function idbDelete(store,key){return withStore(store,'readwrite',s=>s.delete(key));}
function idbGet(store,key){return new Promise(async(resolve,reject)=>{try{const db=await openDb();const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}catch(e){reject(e)}});}
function idbGetAll(store){return new Promise(async(resolve,reject)=>{try{const db=await openDb();const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)}catch(e){reject(e)}});}
function cachePut(key,value){return idbPut(STORE_CACHE,{key,value,updatedAt:new Date().toISOString()});}
async function cacheGet(key){const row=await idbGet(STORE_CACHE,key);return row?.value || null;}
async function cacheGetRow(key){return await idbGet(STORE_CACHE,key);}
function cacheRowAgeMs(row){
  const ts = new Date(row?.updatedAt || 0).getTime();
  return Number.isFinite(ts) ? Math.max(0, Date.now() - ts) : Number.POSITIVE_INFINITY;
}
function userCachePrefix(){
  return String(state.user?.email || 'anonymous').toLowerCase();
}
