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
const PROACTIVE_BRIDGE_KEY = 'PEMS_V15_PROACTIVE_BRIDGE_PAYLOAD';

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
  verifierThumbObjectUrls: new Map(),
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
  captureStage: { label: '', percent: 0, active: false },
  adminSection: 'project-setup',
  adminMenuOpen: false,
  adminProjects: [],
  adminMasterOptions: { stakeholders: [], projectTypes: [], stos: [] },
  adminMasterData: [],
  adminCanPublish: false,
  adminPlanUploading: false,
  adminBoqItems: [],
  adminBoqFilter: 'HAS_QTY',
  adminBoqSearch: '',
  adminCache: {},
  adminCacheAt: {},
  adminStaleNotice: '',
  proactiveImportPayload: null,
  outputSelectedProjectId: '',
  outputProjectStatus: null,
  outputGenerating: false
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
  admin: ['Admin', 'Project setup, user, assignment, dan konfigurasi'],
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
  restoreProactiveBridgePayloadPEMS_();
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
  const syncRouteFromLocation = () => {
    if (!state.bootstrap || !sessionIsUsable()) return;
    const route = parseRoutePEMS_();
    navigate(route.page, { fromHash:true, adminSection:route.adminSection });
  };
  window.addEventListener('hashchange', syncRouteFromLocation);
  window.addEventListener('popstate', syncRouteFromLocation);
  window.addEventListener('message', receiveProactiveBridgeMessagePEMS_);
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
    await navigator.serviceWorker.register('./service-worker.js?v=v15-7-0-r11n-p0');
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
    const initialRoute = parseRoutePEMS_();
    navigate(initialRoute.page, { fromHash:true, adminSection:initialRoute.adminSection });

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

function routeForPEMS_(page, adminSection) {
  page = String(page || 'home');
  if (page === 'admin') return `#/admin/${encodeURIComponent(adminSection || state.adminSection || 'project-setup')}`;
  return `#/${encodeURIComponent(page)}`;
}
function parseRoutePEMS_() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').map(x=>decodeURIComponent(x||'')).filter(Boolean);
  const page = parts[0] || 'home';
  return { page, adminSection: page === 'admin' ? (parts[1] || 'project-setup') : '' };
}
function shouldLetBrowserOpenLinkPEMS_(event) {
  return !!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1);
}
function renderNavigation() {
  const menus = state.bootstrap?.roleMenus || ['home', 'settings'];

  const adminSubItems = [
    ['project-setup', 'Project Setup'],
    ['project-list', 'Daftar Project'],
    ['proactive-import', 'Proactive Import'],
    ['master-data', 'Master Data'],
    ['users', 'Daftar User'],
    ['config', 'App Config Operasional'],
    ['assignments', 'Assignment Aktif']
  ];

  const render = (container) => {
    const isSidebar = container === el.sideNav;
    container.innerHTML = menus.map(key => {
      const count = notificationCountForPage(key);
      if (key === 'admin' && isSidebar) {
        return `
          <div class="nav-group ${state.adminMenuOpen ? 'open' : ''}">
            <button class="nav-btn nav-admin-toggle ${state.currentPage === 'admin' ? 'active' : ''}" data-admin-toggle="1">
              <span>${escapeHtml(NAV_LABEL[key] || key)}</span>
              <span class="nav-admin-chevron">${state.adminMenuOpen ? '▾' : '▸'}</span>
            </button>
            <div class="admin-subnav ${state.adminMenuOpen ? '' : 'hidden'}">
              ${adminSubItems.map(([section, label]) => `
                <a class="admin-subnav-btn ${state.currentPage === 'admin' && state.adminSection === section ? 'active' : ''}" href="${escapeAttr(routeForPEMS_('admin', section))}" data-admin-section="${escapeAttr(section)}">
                  ${escapeHtml(label)}
                </a>
              `).join('')}
            </div>
          </div>`;
      }
      return `<a class="nav-btn" href="${escapeAttr(routeForPEMS_(key))}" data-nav="${escapeAttr(key)}">
        <span>${escapeHtml(NAV_LABEL[key] || key)}</span>
        ${count ? `<span class="nav-count">${escapeHtml(String(count))}</span>` : ''}
      </a>`;
    }).join('');

    container.querySelectorAll('[data-nav]').forEach(btn =>
      btn.addEventListener('click', (event) => {
        if (shouldLetBrowserOpenLinkPEMS_(event)) return;
        event.preventDefault();
        navigate(btn.dataset.nav);
      })
    );

    container.querySelectorAll('[data-admin-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        // R11I: parent Admin adalah accordion lokal. Tidak boleh menunggu API.
        // Klik pertama hanya buka/tutup submenu secara instan; request server baru
        // dimulai setelah user memilih salah satu submenu.
        state.adminMenuOpen = !state.adminMenuOpen;
        renderNavigation();
      });
    });

    container.querySelectorAll('[data-admin-section]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        if (shouldLetBrowserOpenLinkPEMS_(event)) return;
        event.preventDefault();
        state.adminMenuOpen = true;
        state.adminSection = btn.dataset.adminSection || 'project-setup';
        navigate('admin', { adminSection: state.adminSection });
      });
    });
  };

  render(el.sideNav);
  render(el.bottomNav);

  document
    .querySelectorAll('[data-nav]')
    .forEach(btn =>
      btn.classList.toggle(
        'active',
        btn.dataset.nav === state.currentPage
      )
    );
}

async function navigate(page, options = {}) {
  const menus = state.bootstrap?.roleMenus || [];
  if (!menus.includes(page)) page = 'home';
  if (page === 'admin' && options.adminSection) state.adminSection = options.adminSection;
  state.currentPage = page;
  if (!options.fromHash) {
    const targetHash = routeForPEMS_(page, state.adminSection);
    if (window.location.hash !== targetHash) history.pushState(null, '', targetHash);
  }
  const meta = NAV_META[page] || [page, ''];
  el.pageTitle.textContent = meta[0];
  el.pageSubtitle.textContent = meta[1];
  renderNavigation();
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
        <p class="muted">Alur lapangan: pilih Project → pilih Titik → pilih Material/Aset yang akan difoto → Ambil Foto + GPS.</p>
        <div class="field"><label>Project</label><input id="homeProjectSearch" class="input" placeholder="Cari PID / detail pekerjaan..." style="margin-bottom:8px">${projectSelectHtml(projects, state.selectedProjectId, 'homeProjectSelect')}</div>
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

  bindSelectSearchPEMS_('homeProjectSearch', 'homeProjectSelect');
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
    <div class="toolbar" style="align-items:flex-end">
      <div class="grow">
        <div class="field" style="margin:0">
          <label>Project</label>
          <input id="workProjectSearch" class="input" placeholder="Cari PID / detail pekerjaan..." style="margin-bottom:8px">
          ${projectSelectHtml(projects, state.selectedProjectId, 'workProjectSelect')}
        </div>
      </div>
      <span class="badge info">${escapeHtml(workspace.project?.stakeholder || '-')}</span>
      <span class="badge neutral">${sessions.length} Point Session</span>
    </div>
    <div class="split-layout">
      <div class="card">
        <div class="section-head"><h2>1. Pilih Titik</h2><span class="tiny muted">dari KML Plan / workspace</span></div>
        <input id="sessionSearch" class="input" placeholder="Cari PS-000001 / label / role...">
        <div id="sessionList" class="list" style="margin-top:12px"></div>
      </div>
      <div id="workRight" class="card sticky-card">
        <div class="empty"><b>Langkah berikutnya:</b><br>Pilih satu titik. Setelah itu pilih <b>Material / Aset yang akan difoto</b>.</div>
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
  bindSelectSearchPEMS_('workProjectSearch', 'workProjectSelect');
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
    <div class="selected-point-summary">
      <span class="tiny">TITIK TERPILIH</span>
      <b>${escapeHtml(state.selectedSession.anchorLabel || state.selectedSession.sessionId)}</b>
      <small>${escapeHtml(state.selectedSession.sessionId)} • ${escapeHtml(state.selectedSession.anchorRole || '-')}</small>
    </div>
    <div class="section-head material-step-head">
      <div>
        <h2>2. Pilih Material / Aset yang akan difoto</h2>
        <div class="small muted">Satu titik dapat memiliki beberapa material. Pilih satu material, ambil evidence, lalu lanjut material berikutnya.</div>
      </div>
      <span class="badge info">${reqs.length} pilihan</span>
    </div>
    ${state.requirements.warnings?.length ? `<div class="warning-strip">${escapeHtml(state.requirements.warnings.map(w => w.message || w.code).join(' • '))}</div>` : ''}
    ${selectedRequirementStatusBannerHtml()}
    <div id="requirementList" class="list material-choice-list"></div>
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

    const isSelected =
      state.selectedRequirement?.projectMaterialId ===
      r.projectMaterialId;

    return `
      <div class="list-item clickable material-card ${isSelected ? 'selected' : ''}" data-pm="${escapeAttr(r.projectMaterialId)}">
        <div class="material-choice-main">
          <div class="item-title">${escapeHtml(r.designator || r.materialName || r.projectMaterialId)}</div>
          <div class="item-sub">
            ${escapeHtml(r.materialName || '')}
            ${r.category ? ` • ${escapeHtml(r.category)}` : ''}<br>
            ${escapeHtml(r.requirementCode || 'MATERIAL')} •
            ${r.required ? 'WAJIB' : 'OPSIONAL'} •
            Evidence ${serverCount}/${target}${escapeHtml(label)}
          </div>
        </div>
        <div class="material-choice-side">
          <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
          <span class="material-select-cta ${isSelected ? 'selected' : ''}">
            ${isSelected ? '✓ TERPILIH' : 'PILIH MATERIAL'}
          </span>
        </div>
      </div>`;
  }).join('') : '<div class="empty">Tidak ada Material / Aset yang dapat dipilih pada titik ini. Cek requirement/mapping point.</div>';
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

function serverPhotoCardHtml(photo, index, locked, evidenceId) {
  const key = `${evidenceId}|${photo.photoId}`;
  return `
    <div class="photo-card evidence-preview-card server-photo-card">
      <button type="button" class="photo-thumb-button" data-view-server-photo="${escapeAttr(photo.photoId)}" data-evidence-id="${escapeAttr(evidenceId)}" aria-label="Lihat foto evidence server">
        ${photo.thumbnailBase64
          ? `<img src="data:${escapeAttr(photo.thumbnailMimeType || 'image/jpeg')};base64,${escapeAttr(photo.thumbnailBase64)}" alt="Evidence ${index + 1}" loading="lazy">`
          : `<div class="verifier-photo-loading" data-server-photo-loading="${escapeAttr(key)}">Memuat thumbnail...</div>
             <img class="hidden" data-server-photo-img="${escapeAttr(key)}" alt="Evidence ${index + 1}">`}
      </button>
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
          <button type="button" class="btn outline small" data-view-server-photo="${escapeAttr(photo.photoId)}" data-evidence-id="${escapeAttr(evidenceId)}">Lihat / Perbesar</button>
          ${photo.url ? `<a class="btn outline small" href="${escapeAttr(photo.url)}" target="_blank" rel="noopener" style="text-decoration:none">Buka Drive</a>` : ''}
          ${!locked ? `<button type="button" class="btn danger small" data-delete-server-photo="${escapeAttr(photo.photoId)}" data-evidence-id="${escapeAttr(evidenceId)}">Hapus / Ganti</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function hydrateServerPhotoPreviews(root) {
  if (!root) return;
  const images = Array.from(root.querySelectorAll('[data-server-photo-img]'));
  if (!images.length) return;

  await Promise.all(images.slice(0, 6).map(async img => {
    const key = img.dataset.serverPhotoImg || '';
    const splitAt = key.indexOf('|');
    if (splitAt < 1) return;
    const evidenceId = key.slice(0, splitAt);
    const photoId = key.slice(splitAt + 1);
    const loading = root.querySelector(`[data-server-photo-loading="${cssEscape(key)}"]`);
    try {
      const url = await verifierPhotoObjectUrl(evidenceId, photoId, 'thumb');
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Thumbnail tidak dapat dirender.'));
        img.src = url;
      });
      img.classList.remove('hidden');
      loading?.classList.add('hidden');
    } catch (err) {
      if (loading) {
        loading.textContent = 'Preview belum dimuat — klik Lihat / Perbesar';
        loading.classList.add('danger-text');
      }
    }
  }));
}

async function openServerPhotoModal(evidenceId, photoId) {
  const photos = await getServerPhotosForEvidence(evidenceId);
  const photo = photos.find(p => String(p.photoId) === String(photoId));
  if (!photo) {
    toast('Foto server tidak ditemukan.', 'warning');
    return;
  }

  try {
    const url = await verifierPhotoObjectUrl(evidenceId, photoId, 'full');
    el.photoModalImage.src = url;
  } catch (err) {
    if (photo.url) {
      window.open(photo.url, '_blank', 'noopener');
      return;
    }
    toast('Preview foto server belum dapat dimuat.', 'warning');
    return;
  }

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

    <h3>3. Ambil Evidence untuk Material Terpilih</h3>
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

  hydrateServerPhotoPreviews(panel).catch(() => {});

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

  try {
    setButtonLoadingPEMS_(btn, true, 'Mengirim ke Verifier...');

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

    setButtonLoadingPEMS_(btn, false);
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


async function makeVerifierThumbnailBase64PEMS_(blob) {
  if (!blob) return { base64:'', mimeType:'image/jpeg', bytes:0 };
  const bitmap = await createImageBitmap(blob);
  try {
    const maxEdge = 320;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', {alpha:false});
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(bitmap,0,0,w,h);
    let quality = .55;
    let out = null;
    for (let i=0;i<4;i++) {
      out = await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Thumbnail gagal dibuat.')),'image/jpeg',quality));
      if (out.size <= 28000) break;
      quality = Math.max(.34, quality-.08);
    }
    if (!out || out.size > 31000) return {base64:'', mimeType:'image/jpeg', bytes:0};
    return { base64: await blobToBase64(out), mimeType: out.type || 'image/jpeg', bytes: out.size };
  } finally { bitmap.close?.(); }
}

async function syncOneQueueItem(item) {
  const photo = await idbGet(STORE_PHOTOS, item.photoLocalId);
  const draft = await idbGet(STORE_DRAFTS, item.draftId);
  if (!photo || !draft) throw new Error('Queue orphan: draft/foto lokal tidak ditemukan.');
  let thumbnail = photo.thumbnail || null;
  if (!thumbnail?.base64) {
    try {
      thumbnail = await makeVerifierThumbnailBase64PEMS_(photo.blob);
      photo.thumbnail = thumbnail;
      await idbPut(STORE_PHOTOS, photo);
    } catch (thumbErr) {
      thumbnail = {base64:'', mimeType:'image/jpeg', bytes:0};
    }
  }
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
      thumbnailBase64: thumbnail?.base64 || '',
      thumbnailMimeType: thumbnail?.mimeType || 'image/jpeg',
      thumbnailBytes: Number(thumbnail?.bytes || 0),
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
      setButtonLoadingPEMS_(btn, true, 'Submitting...');
      const result = await api(`/evidence/${encodeURIComponent(draft.serverEvidenceId)}/submit`, { method:'POST', body:{ fieldNote:draft.fieldNote || '' } });
      draft.workflow = result.workflowStatus;
      draft.updatedAt = new Date().toISOString();
      await idbPut(STORE_DRAFTS,draft);
      toast('Evidence submitted.', 'success');
      await renderEvidence();
    } catch(err) {
      toast(humanError(err),'danger',6000);
      setButtonLoadingPEMS_(btn, false);
    }
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
            ${p.thumbnailBase64
              ? `<img class="verifier-photo-thumb" loading="lazy" src="data:${escapeAttr(p.thumbnailMimeType || 'image/jpeg')};base64,${escapeAttr(p.thumbnailBase64)}" alt="${escapeAttr(p.fileName || p.photoId)}">`
              : `<div class="verifier-photo-loading" data-verifier-photo-loading="${escapeAttr(ev.evidenceId)}|${escapeAttr(p.photoId)}">Memuat preview lama...</div>
                 <img class="hidden" data-verifier-photo-img="${escapeAttr(ev.evidenceId)}|${escapeAttr(p.photoId)}" alt="${escapeAttr(p.fileName || p.photoId)}">`}
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


async function verifierPhotoObjectUrl(evidenceId, photoId, mode = 'full') {
  const normalizedMode = String(mode || 'full').toLowerCase() === 'thumb' ? 'thumb' : 'full';
  const key = `${evidenceId}|${photoId}`;
  const map = normalizedMode === 'thumb'
    ? state.verifierThumbObjectUrls
    : state.verifierPhotoObjectUrls;

  if (map.has(key)) {
    return map.get(key);
  }

  const result = await api(
    `/evidence/${encodeURIComponent(evidenceId)}/photos/${encodeURIComponent(photoId)}?mode=${normalizedMode}`,
    { timeoutMs: normalizedMode === 'thumb' ? 18000 : 30000 }
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
  map.set(key, url);

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
        photoId,
        'thumb'
      );

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Thumbnail tidak dapat dirender.'));
      img.src = url;
    });
    img.classList.remove('hidden');

    if (loading) {
      loading.classList.add('hidden');
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
  const images = Array.from(
    el.content.querySelectorAll('[data-verifier-photo-img]')
  );

  if (!images.length) return;

  // R11M: preload beberapa legacy thumbnail yang tampil paling awal secara
  // paralel. Ini menghindari card ke-2 tertahan oleh lazy observer / full Drive.
  const eagerCount = Math.min(4, images.length);
  images.slice(0, eagerCount).forEach(img => {
    hydrateOneVerifierPhoto(img).catch(() => {});
  });

  const remaining = images.slice(eagerCount);
  if (!remaining.length) return;

  if ('IntersectionObserver' in window) {
    const targetMap = new Map();
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const img = targetMap.get(entry.target);
          if (img) hydrateOneVerifierPhoto(img).catch(() => {});
        });
      },
      { rootMargin: '500px 0px' }
    );

    remaining.forEach(img => {
      const target = img.closest('.verifier-inline-preview') || img;
      targetMap.set(target, img);
      observer.observe(target);
    });
    return;
  }

  remaining.slice(0, 2).forEach(img => {
    hydrateOneVerifierPhoto(img).catch(() => {});
  });
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
        photoId,
        'full'
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
    const loadingLabel = action === 'approve' ? 'Approving...' : action === 'revision' ? 'Mengirim Revisi...' : 'Rejecting...';
    setButtonLoadingPEMS_(btn, true, loadingLabel);
    await api(`/verification/${encodeURIComponent(id)}/${action}`, { method:'POST', body:{reasonCode,note} });
    toast(`Evidence ${action.toUpperCase()} berhasil.`, 'success');
    await refreshNotifications(true, true);
    await renderVerification();
  } catch(err) {
    toast(humanError(err),'danger',6000);
    setButtonLoadingPEMS_(btn, false);
  }
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

async function adminFetchPEMS_(cacheKey, path, options = {}) {
  const maxAgeMs = Math.max(0, Number(options.maxAgeMs ?? 45_000));
  const force = options.force === true;
  const cached = state.adminCache[cacheKey];
  const cachedAt = Number(state.adminCacheAt?.[cacheKey] || 0);
  const fresh = !!cached && !force && (Date.now() - cachedAt) <= maxAgeMs;

  if (fresh) {
    // Cache-first: UI langsung tampil. Refresh server berjalan diam-diam.
    api(path, { maxAttempts:3, timeoutMs:30000 }).then(data => {
      state.adminCache[cacheKey] = data;
      state.adminCacheAt[cacheKey] = Date.now();
    }).catch(() => {});
    return cached;
  }

  try {
    const data = await api(path, { maxAttempts:3, timeoutMs:30000 });
    state.adminCache[cacheKey] = data;
    state.adminCacheAt[cacheKey] = Date.now();
    return data;
  } catch (err) {
    if (cached) {
      state.adminStaleNotice = 'Server sempat tidak stabil. Data terakhir tetap ditampilkan.';
      return cached;
    }
    throw err;
  }
}


function restoreProactiveBridgePayloadPEMS_() {
  try {
    const raw = sessionStorage.getItem(PROACTIVE_BRIDGE_KEY);
    if (raw) state.proactiveImportPayload = JSON.parse(raw);
  } catch (_) {}
}

function receiveProactiveBridgeMessagePEMS_(event) {
  if (event.origin !== 'https://apps.telkomakses.co.id') return;
  const msg = event.data || {};
  if (msg.type !== 'PEMS_PROACTIVE_IMPORT_V1' || !msg.payload) return;
  state.proactiveImportPayload = msg.payload;
  try { sessionStorage.setItem(PROACTIVE_BRIDGE_KEY, JSON.stringify(msg.payload)); } catch (_) {}
  toast(`Data Proactive diterima: ${Number(msg.payload?.boq?.length || 0)} item BOQ.`, 'success', 6000);
  if (state.bootstrap && sessionIsUsable()) {
    state.adminMenuOpen = true;
    navigate('admin', { adminSection:'proactive-import' });
  }
}

function proactiveBookmarkletPEMS_() {
  const scriptUrl = new URL('./proactive-bridge.js?v=v15-7-0-r11n-p0', window.location.href).href;
  return `javascript:(()=>{var s=document.createElement('script');s.src=${JSON.stringify(scriptUrl)};s.async=true;document.documentElement.appendChild(s)})()`;
}

async function copyProactiveBookmarkletPEMS_() {
  const text = proactiveBookmarkletPEMS_();
  try {
    await navigator.clipboard.writeText(text);
    toast('Bookmarklet Proactive Bridge disalin. Buat bookmark baru lalu paste ke kolom URL.', 'success', 6500);
  } catch (_) {
    window.prompt('Copy URL bookmarklet ini:', text);
  }
}

function clearProactiveBridgePayloadPEMS_() {
  state.proactiveImportPayload = null;
  try { sessionStorage.removeItem(PROACTIVE_BRIDGE_KEY); } catch (_) {}
  if (state.currentPage === 'admin' && state.adminSection === 'proactive-import') renderAdmin();
}

function parseProactivePayloadTextareaPEMS_() {
  const raw = String(document.getElementById('proactivePayloadJson')?.value || '').trim();
  if (!raw) { toast('Paste payload JSON dulu.', 'warning'); return; }
  try {
    const parsed = JSON.parse(raw);
    state.proactiveImportPayload = Array.isArray(parsed) ? { project:{}, boq:parsed, capturedAt:new Date().toISOString() } : parsed;
    sessionStorage.setItem(PROACTIVE_BRIDGE_KEY, JSON.stringify(state.proactiveImportPayload));
    renderAdmin();
    toast('Payload Proactive berhasil dibaca.', 'success');
  } catch (err) {
    toast('JSON tidak valid: ' + humanError(err), 'danger', 6500);
  }
}

function proactiveNormPEMS_(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g,' ');
}

function proactiveGuessOptionPEMS_(options, candidates) {
  const list = (options || []).map(v => String(v || '').trim()).filter(Boolean);
  const cands = (candidates || []).map(proactiveNormPEMS_).filter(Boolean);
  for (const c of cands) {
    const exact = list.find(v => proactiveNormPEMS_(v) === c);
    if (exact) return exact;
  }
  return '';
}

function proactiveExtractStoPEMS_(projectName) {
  const s = String(projectName || '').toUpperCase();
  const m = s.match(/(?:MD\d{4}|HEMO?\d{2}|HEM\d{2})[-\s]+([A-Z0-9]{3})[-\s]/);
  return m ? m[1] : '';
}

function proactiveNumPEMS_(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/,/g,''));
  return Number.isFinite(n) ? n : 0;
}

function renderProactiveImportPanelPEMS_(masterOptions) {
  const payload = state.proactiveImportPayload || null;
  const p = payload?.project || {};
  const boq = Array.isArray(payload?.boq) ? payload.boq : [];
  const stoGuess = proactiveExtractStoPEMS_(p.projectName);
  const stakeholderGuess = proactiveGuessOptionPEMS_(masterOptions?.stakeholders, [p.program, p.customer]);
  const projectTypeGuess = proactiveGuessOptionPEMS_(masterOptions?.projectTypes, [p.projectType, p.portfolio]);
  const stoSelected = proactiveGuessOptionPEMS_(masterOptions?.stos, [stoGuess]);
  const optionHtml = (items, selected, placeholder) => `<option value="">${escapeHtml(placeholder)}</option>${(items||[]).map(v=>`<option value="${escapeAttr(v)}" ${String(v)===String(selected)?'selected':''}>${escapeHtml(v)}</option>`).join('')}`;
  const totalQty = boq.reduce((n,x)=>n+proactiveNumPEMS_(x.qty ?? x.volume),0);
  const tableRows = boq.slice(0,120).map((x,i)=>`<tr><td>${i+1}</td><td><b>${escapeHtml(x.designator||'')}</b></td><td>${escapeHtml(x.uraian||x.description||'')}</td><td>${escapeHtml(x.satuan||x.unit||'')}</td><td>${escapeHtml(x.harga_material||x.material_price||'')}</td><td>${escapeHtml(x.harga_jasa||x.service_price||'')}</td><td>${escapeHtml(x.qty??x.volume??'')}</td></tr>`).join('');
  return `
      <section class="admin-section hidden" data-admin-panel="proactive-import">
        <div class="card">
          <div class="section-head">
            <div><h2>Proactive → PEMS Import</h2><div class="small muted">Browser Bridge membaca project + BOQ dari sesi Proactive yang sudah login. Password, cookie, session, dan CSRF Proactive tidak dikirim ke PEMS.</div></div>
            <span class="badge info">R11N-P5</span>
          </div>
          <div class="status-box neutral" style="margin-top:12px">
            <b>Pasang sekali:</b> seret tombol <b>PEMS ← Proactive</b> ke Bookmark Bar Chrome. Setelah itu buka Detail Project → Step 2 BoQ di Proactive, lalu klik bookmark tersebut.
            <div class="row-actions" style="margin-top:10px;align-items:center">
              <a id="proactiveBridgeBookmark" class="btn secondary" href="#">PEMS ← Proactive</a>
              <button id="copyProactiveBookmarkletBtn" class="btn ghost" type="button">Copy Bookmarklet</button>
            </div>
          </div>
          ${payload ? `
            <div class="status-box success" style="margin-top:12px"><b>Payload diterima.</b> ${escapeHtml(String(boq.length))} item BOQ · Qty total ${escapeHtml(String(totalQty))} · capture ${escapeHtml(formatDateTime(payload.capturedAt || new Date().toISOString()))}</div>
            <div class="grid three" style="margin-top:12px">
              <div class="field"><label>PID / Project ID Proactive (master) *</label><input id="proactiveProjectId" class="input" value="${escapeAttr(p.proactiveProjectId||p.projectId||'')}"></div>
              <div class="field"><label>Project ID PEMS (SAP 26KT...) *</label><input id="proactiveProjectIdSap" class="input" value="${escapeAttr(p.projectIdSap||'')}"></div>
              <div class="field"><label>Nimon ID</label><input id="proactiveNimonId" class="input" value="${escapeAttr(p.nimonId||'')}"></div>
            </div>
            <div class="field" style="margin-top:10px"><label>Nama Project *</label><input id="proactiveProjectName" class="input" value="${escapeAttr(p.projectName||'')}"></div>
            <div class="grid three" style="margin-top:10px">
              <div class="field"><label>Program Proactive</label><input id="proactiveProgram" class="input" value="${escapeAttr(p.program||'')}" readonly></div>
              <div class="field"><label>Customer Proactive</label><input id="proactiveCustomer" class="input" value="${escapeAttr(p.customer||'')}" readonly></div>
              <div class="field"><label>Status Proactive</label><input id="proactiveStatus" class="input" value="${escapeAttr(p.proactiveStatus||'')}" readonly></div>
            </div>
            <div class="grid three" style="margin-top:10px">
              <div class="field"><label>Stakeholder PEMS *</label><select id="proactivePemsStakeholder" class="select">${optionHtml(masterOptions?.stakeholders, stakeholderGuess, 'Pilih Stakeholder')}</select></div>
              <div class="field"><label>Project Type PEMS</label><select id="proactivePemsProjectType" class="select">${optionHtml(masterOptions?.projectTypes, projectTypeGuess, 'Pilih Project Type')}</select></div>
              <div class="field"><label>STO</label><select id="proactivePemsSto" class="select">${optionHtml(masterOptions?.stos, stoSelected, 'Pilih STO')}</select></div>
            </div>
            <div class="grid three" style="margin-top:10px">
              <div class="field"><label>Regional</label><input id="proactivePemsRegional" class="input" value="REGIONAL IV"></div>
              <div class="field"><label>Witel / Branch</label><input id="proactivePemsWitel" class="input" value="PONTIANAK / KALBAR"></div>
              <div class="field"><label>Area</label><input id="proactivePemsArea" class="input" value="Pontianak"></div>
            </div>
            <div class="row-actions" style="margin-top:12px">
              <button id="importProactiveBtn" class="btn secondary">Import Project + ${boq.length} BOQ ke PEMS</button>
              <button id="clearProactivePayloadBtn" class="btn ghost">Buang Preview</button>
            </div>
            <div class="table-wrap" style="margin-top:16px;max-height:520px;overflow:auto"><table><thead><tr><th>#</th><th>Designator</th><th>Uraian</th><th>Unit</th><th>Harga Material</th><th>Harga Jasa</th><th>Qty</th></tr></thead><tbody>${tableRows || '<tr><td colspan="7">BOQ belum ditemukan.</td></tr>'}</tbody></table></div>
            ${boq.length>120?`<div class="tiny muted" style="margin-top:6px">Preview menampilkan 120 dari ${boq.length} item. Semua item tetap akan diimport.</div>`:''}
          ` : `
            <div class="status-box warning" style="margin-top:12px"><b>Belum ada payload.</b> Buka project di Proactive → Step 2 BoQ → klik bookmark <b>PEMS ← Proactive</b>. PEMS akan membuka halaman ini otomatis.</div>
          `}
          <details style="margin-top:16px"><summary class="small"><b>Fallback: Paste JSON manual</b></summary><div class="field" style="margin-top:10px"><textarea id="proactivePayloadJson" class="input" rows="8" placeholder="Paste payload JSON bridge di sini..."></textarea></div><button id="parseProactivePayloadBtn" class="btn ghost" style="margin-top:8px">Baca JSON</button></details>
        </div>
      </section>`;
}

async function importProactivePayloadPEMS_() {
  const payload = state.proactiveImportPayload || {};
  const boq = Array.isArray(payload.boq) ? payload.boq : [];
  const btn = document.getElementById('importProactiveBtn');
  const source = {
    ...(payload.project || {}),
    proactiveProjectId: value('proactiveProjectId'),
    projectIdSap: value('proactiveProjectIdSap'),
    nimonId: value('proactiveNimonId'),
    projectName: value('proactiveProjectName'),
    program: value('proactiveProgram') || payload.project?.program || '',
    customer: value('proactiveCustomer') || payload.project?.customer || '',
    proactiveStatus: value('proactiveStatus') || payload.project?.proactiveStatus || '',
    sourceUrl: payload.sourceUrl || payload.project?.sourceUrl || ''
  };
  const pems = {
    stakeholder: value('proactivePemsStakeholder'),
    projectType: value('proactivePemsProjectType'),
    sto: value('proactivePemsSto'),
    regional: value('proactivePemsRegional'),
    witelBranch: value('proactivePemsWitel'),
    area: value('proactivePemsArea')
  };
  if (!source.projectIdSap || !source.proactiveProjectId || !source.projectName) { toast('Project ID SAP 26KT..., PID/Project ID Proactive, dan Nama Project wajib ada.', 'warning'); return; }
  if (!pems.stakeholder) { toast('Pilih Stakeholder PEMS dulu.', 'warning'); return; }
  if (!boq.length) { toast('BOQ Proactive belum terbaca.', 'warning'); return; }
  try {
    setButtonLoadingPEMS_(btn, true, `Import ${boq.length} BOQ...`);
    const data = await api('/admin/proactive-import', { method:'POST', body:{ source, pems, boq } });
    if (data?.project) upsertAdminProjectLocalPEMS_(data.project);
    state.adminCache = {};
    state.adminCacheAt = {};
    toast(`${source.projectIdSap} berhasil diimport · source ${source.proactiveProjectId} · BOQ V${data.boqVersion} · ${data.boqItems} item.`, 'success', 7500);
    state.adminSection = 'project-setup';
    await renderAdmin();
    fillAdminProjectForm(source.projectIdSap);
  } catch (err) {
    toast(humanError(err), 'danger', 8500);
  } finally {
    setButtonLoadingPEMS_(btn, false);
  }
}

function adminLoadingLabelPEMS_(section) {
  return ({'project-setup':'Project Setup','project-list':'Daftar Project','proactive-import':'Proactive Import','master-data':'Master Data','users':'Daftar User','config':'App Config Operasional','assignments':'Assignment Aktif'})[section] || 'Admin';
}

async function renderAdmin() {
  if (!hasPermission('project.manage') && !hasPermission('user.manage') && !hasPermission('assignment.manage')) {
    el.content.innerHTML = '<div class="empty">Role ini tidak memiliki menu Admin.</div>';
    return;
  }
  if (!navigator.onLine) {
    el.content.innerHTML = '<div class="empty">Admin master data membutuhkan koneksi server.</div>';
    return;
  }
  try {
    const section = state.adminSection || 'project-setup';
    state.adminStaleNotice = '';
    el.content.innerHTML = `<div class="empty">Memuat ${escapeHtml(adminLoadingLabelPEMS_(section))}...</div>`;

    const needProjects = ['project-setup','project-list','assignments'].includes(section);
    const needMaster = ['project-setup','proactive-import','master-data'].includes(section);
    const needUsers = ['users','assignments'].includes(section);
    const needAssignments = section === 'assignments';
    const needConfig = section === 'config';

    const projectData = needProjects ? await adminFetchPEMS_('projects','/admin/projects') : (state.adminCache.projects || {projects:state.adminProjects||[],masterOptions:state.adminMasterOptions||{},canPublish:state.adminCanPublish});
    const masterData = needMaster ? await adminFetchPEMS_('master','/admin/master-data') : (state.adminCache.master || {items:state.adminMasterData||[],activeOptions:state.adminMasterOptions||{}});
    const usersData = needUsers ? await adminFetchPEMS_('users','/admin/users') : (state.adminCache.users || {users:[]});
    const assignData = needAssignments ? await adminFetchPEMS_('assignments','/admin/assignments') : (state.adminCache.assignments || {assignments:[]});
    const configData = needConfig ? await adminFetchPEMS_('config','/admin/config') : (state.adminCache.config || {config:state.config||{}});

    const projects = projectData.projects || [];
    const users = usersData.users || [];
    const assignments = assignData.assignments || [];
    const adminConfig = configData.config || {};
    const masterItems = masterData.items || [];
    const masterOptions = masterData.activeOptions || projectData.masterOptions || state.adminMasterOptions || { stakeholders: [], projectTypes: [], stos: [] };
    const canPublish = projectData.canPublish !== undefined ? !!projectData.canPublish : !!state.adminCanPublish;
    state.adminProjects = projects;
    state.adminMasterOptions = masterOptions;
    state.adminMasterData = masterItems;
    state.adminCanPublish = canPublish;
    if (state.bootstrap) state.bootstrap.projects = projects;

    const tcBadge = p => {
      const tc = String(p.timeCritical || 'NO_SLA').toUpperCase();
      const tone = tc === 'OVERDUE' ? 'danger' : tc === 'CRITICAL' ? 'warning' : tc === 'ATTENTION' ? 'warning' : tc === 'COMPLETED' ? 'success' : tc === 'NORMAL' ? 'success' : 'neutral';
      return `<span class="badge ${tone}">${escapeHtml(tc)}</span>`;
    };

    const optionsHtml = (items, placeholder) => `
      <option value="">${escapeHtml(placeholder || 'Pilih')}</option>
      ${(items || []).map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('')}`;

    el.content.innerHTML = `
      ${state.adminStaleNotice ? `<div class="status-box warning" style="margin-bottom:12px"><b>Koneksi dipulihkan otomatis.</b> ${escapeHtml(state.adminStaleNotice)}</div>` : ''}
      <section class="admin-section" data-admin-panel="project-setup">
        <div class="card">
          <div class="section-head">
            <div>
              <h2>Project Setup</h2>
              <div class="small muted">Buat master project dari web. Sheet 01_PROJECTS hanya menjadi storage backend.</div>
            </div>
            <span class="badge info">R11N-P5</span>
          </div>

          <div class="status-box neutral" style="margin-top:12px">
            <b>Flow:</b> Draft → Upload Plan → Plan Review → Ready for Execution → Publish → Reconciliation → Finalized.
            <div class="tiny muted" style="margin-top:4px">File plan di-upload dari web, disimpan ke folder project di Drive, lalu File ID + versi dicatat otomatis ke 01_PROJECTS.</div>
          </div>

          <div class="grid three" style="margin-top:14px">
            <div class="field"><label>Project ID *</label><input id="prjProjectId" class="input" placeholder="26KT...-0017"></div>
            <div class="field"><label>Stakeholder *</label><select id="prjStakeholder" class="select">${optionsHtml(masterOptions.stakeholders, 'Pilih Stakeholder')}</select></div>
            <div class="field"><label>Project Type</label><select id="prjProjectType" class="select">${optionsHtml(masterOptions.projectTypes, 'Pilih Project Type')}</select></div>
          </div>
          <div class="field" style="margin-top:10px"><label>Nama Surat Pesanan / Project Name *</label><input id="prjProjectName" class="input" placeholder="Nama/judul Surat Pesanan"></div>

          <div class="grid three" style="margin-top:10px">
            <div class="field"><label>Contract</label><input id="prjContract" class="input"></div>
            <div class="field"><label>Surat Pesanan / WO</label><input id="prjSuratPesanan" class="input"></div>
            <div class="field"><label>Status Project</label><select id="prjStatusProject" class="select"><option>NOT_STARTED</option><option>ON_PROGRESS</option><option>HOLD</option><option>RFS</option><option>COMPLETED</option><option>CLOSED</option></select></div>
          </div>

          <div class="grid three" style="margin-top:10px">
            <div class="field"><label>Regional</label><input id="prjRegional" class="input" placeholder="REGIONAL IV"></div>
            <div class="field"><label>Witel / Branch</label><input id="prjWitelBranch" class="input" placeholder="PONTIANAK / KALBAR"></div>
            <div class="field"><label>Area</label><input id="prjArea" class="input" placeholder="Pontianak"></div>
          </div>

          <div class="grid three" style="margin-top:10px">
            <div class="field"><label>Detail Project Name / Span / SF / MF / Cluster</label><input id="prjDetailProject" class="input" placeholder="Contoh: PTK-PHASE4A-DF020 / Span 01 / Cluster A"></div>
            <div class="field"><label>STO</label><select id="prjSto" class="select">${optionsHtml(masterOptions.stos, 'Pilih STO')}</select></div>
            <div class="field"><label>Pelaksana</label><input id="prjPelaksana" class="input"></div>
          </div>

          <div class="grid three" style="margin-top:10px">
            <div class="field"><label>Mitra</label><input id="prjMitra" class="input"></div>
            <div class="field"><label>Start Date</label><input id="prjStartDate" class="input" type="date"></div>
            <div class="field"><label>Target Selesai</label><input id="prjTargetSelesai" class="input" type="date"></div>
          </div>

          <div class="grid three" style="margin-top:10px">
            <div class="field"><label>Realisasi Selesai</label><input id="prjRealisasiSelesai" class="input" type="date"></div>
            <div class="field" style="grid-column:span 2"><label>Catatan</label><input id="prjNotes" class="input" placeholder="Catatan project"></div>
          </div>

          <div id="projectSlaPreview" class="status-box neutral" style="margin-top:12px">Isi Start Date dan Target Selesai untuk menghitung SLA otomatis.</div>
          <div class="row-actions" style="margin-top:12px">
            <button id="saveProjectBtn" class="btn secondary">Simpan Draft Project</button>
            <button id="resetProjectBtn" class="btn ghost">Form Baru</button>
          </div>
          <div id="projectPublishBox" class="status-box neutral" style="margin-top:12px">Simpan Draft Project terlebih dahulu. Setelah tanggal + BOQ + KML lengkap, PM/LEADER dapat Publish.</div>
          <div class="row-actions" style="margin-top:10px">
            <button id="publishProjectBtn" class="btn success hidden" type="button">Publish Project</button>
          </div>
          <div class="tiny muted" style="margin-top:8px">${canPublish ? 'PM/LEADER dapat Publish setelah kelengkapan minimum terpenuhi.' : 'ADMIN menyiapkan/edit master project. Publish final tetap hak PM/LEADER.'}</div>

          <div class="plan-files-box" style="margin-top:18px">
            <div class="section-head">
              <div>
                <h3>Plan Files</h3>
                <div class="small muted">Simpan Draft Project terlebih dahulu, lalu upload file plan untuk Project ID tersebut.</div>
              </div>
              <span class="badge neutral">BOQ + KML</span>
            </div>
            <div class="grid two" style="margin-top:12px">
              <div class="plan-upload-card">
                <div class="field">
                  <label>BOQ Plan</label>
                  <input id="boqPlanFile" class="input" type="file" accept=".xlsx,.xls,.csv">
                </div>
                <div id="boqPlanStatus" class="tiny muted" style="margin-top:8px">Belum ada BOQ Plan pada project yang dipilih.</div>
                <button id="uploadBoqPlanBtn" class="btn secondary full" style="margin-top:10px" type="button">Upload BOQ Plan</button>
              </div>
              <div class="plan-upload-card">
                <div class="field">
                  <label>KML / KMZ Plan</label>
                  <input id="kmlPlanFile" class="input" type="file" accept=".kml,.kmz">
                </div>
                <div id="kmlPlanStatus" class="tiny muted" style="margin-top:8px">Belum ada KML/KMZ Plan pada project yang dipilih.</div>
                <button id="uploadKmlPlanBtn" class="btn secondary full" style="margin-top:10px" type="button">Upload KML/KMZ Plan</button>
              </div>
            </div>
            <div class="status-box neutral" style="margin-top:12px"><b>R11N-P5:</b> BOQ Proactive dibaca direct; KML dipetakan ke physical BOQ family (M/J satu family). Point referensi seperti DEMAND tidak dianggap mismatch.</div>
            <div class="plan-review-box" style="margin-top:14px">
              <div class="section-head"><div><h3>Plan Review — BOQ vs KML/KMZ</h3><div class="small muted">AUTO REVIEW = analisis sistem. ADMIN REVIEW = mapping & pengecekan plan. PM REVIEW = keputusan Publish for Field Execution.</div></div><span id="planReviewBadge" class="badge neutral">NOT_REVIEWED</span></div>
              <div class="grid three" style="margin-top:10px">
                <div class="status-box neutral"><b>AUTO REVIEW</b><div><span id="planAutoBadge" class="badge neutral">NOT_REVIEWED</span></div></div>
                <div class="status-box neutral"><b>ADMIN REVIEW</b><div><span id="planAdminBadge" class="badge neutral">PENDING</span></div></div>
                <div class="status-box neutral"><b>PM REVIEW</b><div><span id="planPmBadge" class="badge neutral">PENDING</span></div></div>
              </div>
              <div id="planReviewSummary" class="status-box neutral" style="margin-top:10px">Upload BOQ + KML/KMZ lalu jalankan Auto Review.</div>
              <div class="row-actions" style="margin-top:10px">
                <button id="runPlanReviewBtn" class="btn secondary" type="button">Auto Review / Refresh</button>
                <button id="loadBoqMappingBtn" class="btn ghost" type="button">Atur Mapping BOQ</button>
                <button id="completeAdminReviewBtn" class="btn ghost" type="button">Admin Review Selesai</button>
                <button id="viewPlanReviewBtn" class="btn ghost" type="button">Lihat Temuan</button>
              </div>
              <div id="boqMappingPanel" class="hidden status-box neutral" style="margin-top:10px">
                <b>Profile & Mapping BOQ</b><div class="tiny muted">Satu stakeholder dapat punya beberapa format BOQ. Simpan profile per Stakeholder + Project Type, lalu reuse untuk file berikutnya.</div>
                <div class="grid three" style="margin-top:10px">
                  <div class="field"><label>Nama Profile</label><input id="boqProfileName" class="input" list="boqProfileList" placeholder="Contoh: TIF HEM / MITRATEL WO / MYREP"><datalist id="boqProfileList"></datalist></div>
                  <div class="field"><label>Sheet Excel</label><select id="boqMapSheet" class="select"></select></div>
                  <div class="field"><label>Header Row</label><input id="boqMapHeaderRow" class="input" type="number" min="1" placeholder="Auto"></div>
                </div>
                <div class="grid four" style="margin-top:10px">
                  <div class="field"><label>Designator</label><select id="boqMapDesignator" class="select"></select></div>
                  <div class="field"><label>Description/Uraian</label><select id="boqMapDescription" class="select"></select></div>
                  <div class="field"><label>QTY/Volume</label><select id="boqMapQty" class="select"></select></div>
                  <div class="field"><label>Unit/Satuan</label><select id="boqMapUnit" class="select"></select></div>
                </div>
                <div class="grid two" style="margin-top:10px">
                  <div class="field"><label>Harga Satuan (opsional)</label><select id="boqMapUnitPrice" class="select"></select></div>
                  <div class="field"><label>&nbsp;</label><div class="tiny muted">Jika stakeholder tidak punya harga satuan, biarkan kosong.</div></div>
                </div>
                <div class="row-actions" style="margin-top:10px">
                  <button id="saveBoqMappingBtn" class="btn secondary" type="button">Simpan Profile & Analisis Ulang</button>
                  <button id="loadBoqItemsBtn" class="btn ghost" type="button">Preview / Koreksi BOQ</button>
                </div>
                <div id="boqMappingHint" class="tiny muted" style="margin-top:8px"></div>
                <div id="boqItemsPanel" class="hidden" style="margin-top:12px">
                  <div class="section-head"><div><b>BOQ Normalized</b><div class="tiny muted">Hasil Excel dinormalisasi ke Designator · Uraian · Qty · Unit · Harga. Bisa dikoreksi/tambah manual tanpa mengubah file sumber.</div></div><span id="boqItemsCount" class="badge info">0 item</span></div>
                  <div class="grid two" style="margin-top:10px">
                    <div class="field"><label>Tampilkan</label><select id="boqItemsFilter" class="select"><option value="HAS_QTY">Ada Qty/Volume</option><option value="ALL">Semua Item</option><option value="POSITIVE">Qty &gt; 0</option><option value="EMPTY_ZERO">Qty kosong / 0</option><option value="MANUAL">Manual / Koreksi</option></select></div>
                    <div class="field"><label>Cari Designator / Uraian</label><input id="boqItemsSearch" class="input" placeholder="Contoh: AC-OF-SM-24D"></div>
                  </div>
                  <div class="grid five" style="margin-top:10px">
                    <div class="field"><label>Designator</label><input id="boqItemDesignator" class="input"></div>
                    <div class="field"><label>Uraian</label><input id="boqItemDescription" class="input"></div>
                    <div class="field"><label>Qty</label><input id="boqItemQty" class="input" inputmode="decimal"></div>
                    <div class="field"><label>Unit</label><input id="boqItemUnit" class="input"></div>
                    <div class="field"><label>Harga Satuan</label><input id="boqItemUnitPrice" class="input" inputmode="decimal"></div>
                  </div>
                  <input id="boqItemManualId" type="hidden"><input id="boqItemSourceRowNo" type="hidden">
                  <div class="row-actions" style="margin-top:8px"><button id="saveBoqItemBtn" class="btn secondary" type="button">Simpan Item Manual/Koreksi</button><button id="resetBoqItemBtn" class="btn ghost" type="button">Item Baru</button></div>
                  <div id="boqItemsHint" class="tiny muted" style="margin-top:8px"></div>
                  <div id="boqItemsTable" class="table-wrap" style="margin-top:10px"></div>
                </div>
              </div>
              <div id="planReviewFindings" class="hidden" style="margin-top:10px"></div>
            </div>
          </div>
        </div>
      </section>

      <section class="admin-section hidden" data-admin-panel="project-list">
        <div class="card"><div class="section-head"><h2>Daftar Project</h2><span class="badge info">${projects.length} project</span></div>
          <div class="field" style="margin:12px 0"><label>Cari Project</label><input id="adminProjectSearch" class="input" placeholder="Cari PID, stakeholder, detail pekerjaan, STO..."></div>
          <div class="table-wrap"><table><thead><tr><th>PID</th><th>Stakeholder</th><th>Detail Pekerjaan / STO</th><th>Plan File</th><th>Plan Review</th><th>Admin / PM Review</th><th>Setup</th><th>Status</th><th>SLA</th><th>Time of Critical</th><th>Aksi</th></tr></thead><tbody>
            ${projects.length ? projects.map(p=>{ const pub=adminProjectPublishStatePEMS_(p); return `<tr data-project-row data-search="${escapeAttr([p.projectId,p.stakeholder,p.projectType,p.detailProject||p.lop,p.sto,p.statusProject,p.setupStatus].filter(Boolean).join(' ').toLowerCase())}">
              <td><b>${escapeHtml(p.projectId)}</b></td>
              <td>${escapeHtml(p.stakeholder || '-')}<div class="tiny muted">${escapeHtml(p.projectType || '-')}</div></td>
              <td><b>${escapeHtml(p.detailProject || p.lop || '-')}</b><div class="tiny muted">STO: ${escapeHtml(p.sto || '-')}</div></td>
              <td>
                <div class="tiny plan-file-row"><b>BOQ</b> ${p.boqPlanFileId ? `V${escapeHtml(String(p.boqVersion || 1))} ✓ <a class="inline-link" href="${escapeAttr(adminDriveFileUrlPEMS_(p.boqPlanFileId))}" target="_blank" rel="noopener">Buka</a>` : '—'}</div>
                <div class="tiny plan-file-row"><b>KML</b> ${p.kmlPlanFileId ? `V${escapeHtml(String(p.kmlPlanVersion || 1))} ✓ <a class="inline-link" href="${escapeAttr(adminDriveFileUrlPEMS_(p.kmlPlanFileId))}" target="_blank" rel="noopener">Buka</a>` : '—'}</div>
              </td>
              <td>${adminPlanReviewBadgePEMS_(p)}<div class="tiny muted">${Number(p.planWarningCount||0)} warning · ${Number(p.planBlockerCount||0)} blocker</div></td>
              <td><div class="tiny"><b>ADMIN</b> ${reviewStageBadgePEMS_(p.planAdminReviewStatus||'PENDING')}</div><div class="tiny" style="margin-top:4px"><b>PM</b> ${reviewStageBadgePEMS_(p.planPmReviewStatus||'PENDING')}</div></td>
              <td><span class="badge ${String(p.setupStatus).toUpperCase()==='PUBLISHED'?'success':'warning'}">${escapeHtml(p.setupStatus || 'DRAFT')}</span>${String(p.setupStatus).toUpperCase()!=='PUBLISHED' ? `<div class="tiny muted" style="margin-top:4px">${pub.ready?'Siap Publish':'Kurang: '+escapeHtml(pub.missing.join(', '))}</div>` : ''}</td>
              <td>${escapeHtml(p.statusProject || '-')}</td>
              <td>${p.slaDays === '' || p.slaDays == null ? '-' : `${escapeHtml(String(p.elapsedDays || 0))} / ${escapeHtml(String(p.slaDays))} hari`}<div class="tiny muted">${p.slaUsagePct === '' || p.slaUsagePct == null ? '' : `${escapeHtml(String(p.slaUsagePct))}%`}</div></td>
              <td>${tcBadge(p)}<div class="tiny muted">${escapeHtml(p.timeCriticalLabel || '')}</div></td>
              <td><div class="row-actions compact"><button class="btn ghost small" data-edit-project="${escapeAttr(p.projectId)}">Edit / Plan</button>${canPublish && String(p.setupStatus).toUpperCase()!=='PUBLISHED' ? `<button class="btn ${pub.overrideAvailable&&!pub.ready?'warning':'success'} small" data-publish-project="${escapeAttr(p.projectId)}" ${(pub.ready||pub.overrideAvailable)?'':'disabled'}>${pub.overrideAvailable&&!pub.ready?'Override':'Publish'}</button>` : ''}</div></td>
            </tr>`}).join('') : '<tr><td colspan="11" class="muted">Belum ada project.</td></tr>'}
          </tbody></table></div>
        </div>
      </section>


      <section class="admin-section hidden" data-admin-panel="master-data">
        <div class="card">
          <div class="section-head">
            <div>
              <h2>Master Data</h2>
              <div class="small muted">Stakeholder, Project Type, dan STO dikelola dari web. Dropdown Project Setup membaca data aktif di sini.</div>
            </div>
            <span class="badge info">${masterItems.filter(m => m.active).length} aktif</span>
          </div>

          <div class="field" style="margin-top:12px"><label>Cari Master Data</label><input id="adminMasterSearch" class="input" placeholder="Cari code, nama, area, type..."></div>
          <input id="masterDataId" type="hidden">
          <div class="grid three" style="margin-top:14px">
            <div class="field">
              <label>Master Type *</label>
              <select id="masterDataType" class="select">
                <option value="STAKEHOLDER">STAKEHOLDER</option>
                <option value="PROJECT_TYPE">PROJECT TYPE</option>
                <option value="STO">STO</option>
              </select>
            </div>
            <div class="field"><label>Code *</label><input id="masterDataCode" class="input" placeholder="Contoh: MITRATEL / FTTT / PTK"></div>
            <div class="field"><label>Nama</label><input id="masterDataName" class="input" placeholder="Nama tampil"></div>
          </div>
          <div class="grid three" style="margin-top:10px">
            <div class="field"><label>Area <span class="tiny muted">(opsional, terutama STO)</span></label><input id="masterDataArea" class="input" placeholder="Pontianak"></div>
            <div class="field"><label>Urutan</label><input id="masterDataSort" class="input" type="number" value="100"></div>
            <div class="field"><label>Status</label><select id="masterDataActive" class="select"><option value="TRUE">AKTIF</option><option value="FALSE">NONAKTIF</option></select></div>
          </div>
          <div class="field" style="margin-top:10px"><label>Keterangan</label><input id="masterDataDescription" class="input" placeholder="Catatan master data"></div>
          <div class="row-actions" style="margin-top:12px">
            <button id="saveMasterDataBtn" class="btn secondary">Simpan Master Data</button>
            <button id="resetMasterDataBtn" class="btn ghost">Form Baru</button>
          </div>

          ${['STAKEHOLDER','PROJECT_TYPE','STO'].map(type => {
            const rows = masterItems.filter(m => m.type === type);
            const label = type === 'PROJECT_TYPE' ? 'Project Type' : type === 'STO' ? 'STO' : 'Stakeholder';
            return `
              <div style="margin-top:20px">
                <div class="section-head">
                  <h3>${label}</h3>
                  <span class="badge neutral">${rows.length}</span>
                </div>
                <div class="table-wrap" style="margin-top:8px">
                  <table>
                    <thead><tr><th>Code</th><th>Nama</th><th>Area</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      ${rows.length ? rows.map(m => `
                        <tr data-master-row data-search="${escapeAttr([m.type,m.code,m.name,m.area].filter(Boolean).join(' ').toLowerCase())}">
                          <td><b>${escapeHtml(m.code)}</b></td>
                          <td>${escapeHtml(m.name || '-')}</td>
                          <td>${escapeHtml(m.area || '-')}</td>
                          <td><span class="badge ${m.active ? 'success' : 'neutral'}">${m.active ? 'AKTIF' : 'NONAKTIF'}</span></td>
                          <td>
                            <div class="row-actions">
                              <button class="btn ghost small" data-edit-master="${escapeAttr(m.masterId)}">Edit</button>
                              <button class="btn ghost small" data-toggle-master="${escapeAttr(m.masterId)}">${m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                            </div>
                          </td>
                        </tr>`).join('') : '<tr><td colspan="5" class="muted">Belum ada data.</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>`;
          }).join('')}
          <div class="status-box neutral" style="margin-top:16px">
            <b>Catatan:</b> data tidak dihapus permanen. Gunakan Nonaktifkan agar project lama tetap memiliki referensi historis.
          </div>
        </div>
      </section>

      ${renderProactiveImportPanelPEMS_(masterOptions)}

      <section class="admin-section hidden" data-admin-panel="users">
        <div class="card">
          <div class="section-head"><h2>User & Role</h2><span class="badge info">${users.length} user</span></div>
          <div class="form-row"><div class="field"><label>Email</label><input id="adminUserEmail" class="input" placeholder="nama@domain.com"></div><div class="field"><label>Nama</label><input id="adminUserName" class="input"></div></div>
          <div class="form-row" style="margin-top:10px"><div class="field"><label>Role</label><select id="adminUserRole" class="select"><option>LAPANGAN</option><option>ADMIN</option><option>VERIFIER</option><option>PM_LEADER</option></select></div><div class="field"><label>Area</label><input id="adminUserArea" class="input" placeholder="Pontianak"></div></div>
          <button id="saveUserBtn" class="btn secondary" style="margin-top:12px">Simpan User</button>
          <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Area</th><th>Aktif</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.fullName)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.area)}</td><td>${u.active?'YES':'NO'}</td></tr>`).join('')}</tbody></table></div>
        </div>
      </section>

      <section class="admin-section hidden" data-admin-panel="config">
        <div class="card"><h2>App Config Operasional</h2>
          <div class="grid three" style="margin-top:12px">
            <div class="field"><label>GPS Policy</label><select id="cfgGpsPolicy" class="select"><option ${String(adminConfig.GPS_POLICY).toUpperCase()==='DEV'?'selected':''}>DEV</option><option ${String(adminConfig.GPS_POLICY).toUpperCase()==='FIELD'?'selected':''}>FIELD</option></select></div>
            <div class="field"><label>GPS Field Block (m)</label><input id="cfgGpsBlock" class="input" type="number" value="${escapeAttr(adminConfig.GPS_FIELD_BLOCK_M ?? 50)}"></div>
            <div class="field"><label>Distance Warning (m)</label><input id="cfgDistanceWarn" class="input" type="number" value="${escapeAttr(adminConfig.POINT_DISTANCE_WARNING_M ?? 30)}"></div>
          </div>
          <button id="saveOperationalConfigBtn" class="btn secondary" style="margin-top:12px">Simpan Config</button>
          <div class="small muted" style="margin-top:8px">Gunakan DEV selama test laptop. Ganti FIELD sebelum pilot tim lapangan.</div>
        </div>
      </section>

      <section class="admin-section hidden" data-admin-panel="assignments">
        <div class="card">
          <div class="section-head"><h2>Assignment Aktif</h2><span class="badge info">${assignments.length} aktif</span></div>
          <div class="grid two" style="margin-top:12px">
            <div class="field"><label>User</label><input id="assignUserSearch" class="input" placeholder="Cari user..." style="margin-bottom:8px"><select id="assignUser" class="select">${users.map(u=>`<option value="${escapeAttr(u.email)}">${escapeHtml(u.fullName || u.email)} — ${escapeHtml(u.role)}</option>`).join('')}</select></div>
            <div class="field"><label>Project</label><input id="assignProjectSearch" class="input" placeholder="Cari PID / detail..." style="margin-bottom:8px"><select id="assignProject" class="select">${projects.map(p=>`<option value="${escapeAttr(p.projectId)}">${escapeHtml(adminProjectLabelPEMS_(p))}</option>`).join('')}</select></div>
          </div>
          <div class="grid two" style="margin-top:10px"><div class="field"><label>Scope</label><select id="assignScope" class="select"><option>PROJECT</option><option>POINT</option></select></div><div class="field"><label>Scope Value</label><input id="assignScopeValue" class="input" placeholder="Kosong untuk PROJECT / PS-... untuk POINT"></div></div>
          <button id="saveAssignmentBtn" class="btn secondary" style="margin-top:12px">Simpan Assignment</button>
          <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>User</th><th>Project</th><th>Scope</th><th>Value</th><th>Status</th></tr></thead><tbody>${assignments.map(a=>`<tr><td>${escapeHtml(a.userEmail)}</td><td>${escapeHtml(a.projectId)}</td><td>${escapeHtml(a.scopeType)}</td><td>${escapeHtml(a.scopeValue)}</td><td>${escapeHtml(a.status)}</td></tr>`).join('')}</tbody></table></div>
        </div>
      </section>
    `;

    document.getElementById('saveProjectBtn')?.addEventListener('click', saveAdminProject);
    document.getElementById('resetProjectBtn')?.addEventListener('click', resetAdminProjectForm);
    document.getElementById('prjStartDate')?.addEventListener('change', updateAdminProjectSlaPreview);
    document.getElementById('prjTargetSelesai')?.addEventListener('change', updateAdminProjectSlaPreview);
    document.getElementById('prjRealisasiSelesai')?.addEventListener('change', updateAdminProjectSlaPreview);
    document.getElementById('prjStatusProject')?.addEventListener('change', updateAdminProjectSlaPreview);
    document.getElementById('uploadBoqPlanBtn')?.addEventListener('click', () => uploadAdminPlanFile('BOQ'));
    document.getElementById('uploadKmlPlanBtn')?.addEventListener('click', () => uploadAdminPlanFile('KML'));
    document.getElementById('publishProjectBtn')?.addEventListener('click', () => publishAdminProjectPEMS_(value('prjProjectId'), document.getElementById('publishProjectBtn')));
    document.getElementById('runPlanReviewBtn')?.addEventListener('click', runAdminPlanReviewPEMS_);
    document.getElementById('loadBoqMappingBtn')?.addEventListener('click', loadAdminBoqMappingPEMS_);
    document.getElementById('saveBoqMappingBtn')?.addEventListener('click', saveAdminBoqMappingPEMS_);
    document.getElementById('loadBoqItemsBtn')?.addEventListener('click', loadAdminBoqItemsPEMS_);
    document.getElementById('boqItemsFilter')?.addEventListener('change', e => { state.adminBoqFilter = String(e.target.value || 'HAS_QTY'); renderAdminBoqItemsTablePEMS_(); });
    document.getElementById('boqItemsSearch')?.addEventListener('input', e => { state.adminBoqSearch = String(e.target.value || ''); renderAdminBoqItemsTablePEMS_(); });
    document.getElementById('saveBoqItemBtn')?.addEventListener('click', saveAdminBoqItemPEMS_);
    document.getElementById('resetBoqItemBtn')?.addEventListener('click', resetAdminBoqItemFormPEMS_);
    document.getElementById('completeAdminReviewBtn')?.addEventListener('click', completeAdminPlanReviewPEMS_);
    document.getElementById('viewPlanReviewBtn')?.addEventListener('click', viewAdminPlanReviewPEMS_);
    el.content.querySelectorAll('[data-publish-project]').forEach(btn => btn.addEventListener('click', () => publishAdminProjectPEMS_(btn.dataset.publishProject, btn)));
    el.content.querySelectorAll('[data-edit-project]').forEach(btn => btn.addEventListener('click', () => {
      state.adminSection = 'project-setup';
      showAdminSection('project-setup');
      renderNavigation();
      fillAdminProjectForm(btn.dataset.editProject);
    }));
    document.getElementById('parseProactivePayloadBtn')?.addEventListener('click', parseProactivePayloadTextareaPEMS_);
    document.getElementById('clearProactivePayloadBtn')?.addEventListener('click', clearProactiveBridgePayloadPEMS_);
    document.getElementById('copyProactiveBookmarkletBtn')?.addEventListener('click', copyProactiveBookmarkletPEMS_);
    document.getElementById('importProactiveBtn')?.addEventListener('click', importProactivePayloadPEMS_);
    const proactiveBookmark = document.getElementById('proactiveBridgeBookmark');
    if (proactiveBookmark) proactiveBookmark.setAttribute('href', proactiveBookmarkletPEMS_());
    document.getElementById('saveMasterDataBtn')?.addEventListener('click', saveAdminMasterData);
    document.getElementById('resetMasterDataBtn')?.addEventListener('click', resetAdminMasterForm);
    el.content.querySelectorAll('[data-edit-master]').forEach(btn => btn.addEventListener('click', () => fillAdminMasterForm(btn.dataset.editMaster)));
    el.content.querySelectorAll('[data-toggle-master]').forEach(btn => btn.addEventListener('click', () => toggleAdminMasterData(btn.dataset.toggleMaster)));
    document.getElementById('saveUserBtn')?.addEventListener('click', saveAdminUser);
    document.getElementById('saveAssignmentBtn')?.addEventListener('click', saveAdminAssignment);
    document.getElementById('saveOperationalConfigBtn')?.addEventListener('click', saveOperationalConfig);
    bindTextFilterPEMS_('adminProjectSearch', '[data-project-row]');
    bindTextFilterPEMS_('adminMasterSearch', '[data-master-row]');
    bindSelectSearchPEMS_('assignUserSearch', 'assignUser');
    bindSelectSearchPEMS_('assignProjectSearch', 'assignProject');

    showAdminSection(state.adminSection || 'project-setup');

    if (projectData.schemaMigration?.changed && !state.projectSchemaMigrationShown) {
      state.projectSchemaMigrationShown = true;
      toast('Schema 01_PROJECTS diperbarui otomatis.', 'success', 4500);
    }
  } catch(err) {
    el.content.innerHTML = `<div class="status-box danger"><b>Data Admin belum berhasil dimuat.</b><div style="margin-top:6px">${escapeHtml(humanError(err))}</div><button class="btn secondary" id="retryAdminBtn" style="margin-top:10px">Coba Lagi</button></div>`;
    document.getElementById('retryAdminBtn')?.addEventListener('click', () => renderAdmin());
  }
}

function showAdminSection(section) {
  const valid = ['project-setup','project-list','proactive-import','master-data','users','config','assignments'];
  section = valid.includes(section) ? section : 'project-setup';
  state.adminSection = section;
  el.content?.querySelectorAll('[data-admin-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.adminPanel !== section);
  });
  const labels = {
    'project-setup': 'Project Setup',
    'project-list': 'Daftar Project',
    'proactive-import': 'Proactive Import',
    'master-data': 'Master Data',
    'users': 'Daftar User',
    'config': 'App Config Operasional',
    'assignments': 'Assignment Aktif'
  };
  if (state.currentPage === 'admin') el.pageSubtitle.textContent = labels[section] || 'Admin';
}


function adminProjectLabelPEMS_(p) {
  if (!p) return '';
  const pid = String(p.projectId || '').trim();
  const detail = String(p.detailProject || p.lop || p.lopRing || '').trim();
  return detail ? `${pid} — ${detail}` : pid;
}

function adminDriveFileUrlPEMS_(fileId) {
  const id = String(fileId || '').trim();
  return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : '';
}

function reviewStageBadgePEMS_(status) {
  const s=String(status||'PENDING').toUpperCase();
  const tone=['COMPLETE','APPROVED'].includes(s)?'success':s==='OVERRIDE_APPROVED'?'warning':s==='BLOCKED'?'danger':'neutral';
  return `<span class="badge ${tone}">${escapeHtml(s)}</span>`;
}
function adminProjectPublishStatePEMS_(p) {
  const missing = [];
  if (!String(p?.projectId || '').trim()) missing.push('PID');
  if (!String(p?.stakeholder || '').trim()) missing.push('Stakeholder');
  if (!String(p?.projectName || '').trim()) missing.push('Nama Surat Pesanan');
  if (!String(p?.detailProject || p?.lop || '').trim()) missing.push('Detail Pekerjaan');
  if (!String(p?.startDate || '').trim()) missing.push('Start Date');
  if (!String(p?.targetSelesai || '').trim()) missing.push('Target Selesai');
  if (!String(p?.boqPlanFileId || '').trim()) missing.push('BOQ Plan');
  if (!String(p?.kmlPlanFileId || '').trim()) missing.push('KML/KMZ Plan');
  const review = String(p?.planReviewStatus || 'NOT_REVIEWED').toUpperCase();
  const adminReview = String(p?.planAdminReviewStatus || 'PENDING').toUpperCase();
  const hardBlock = Number(p?.planBlockerCount || 0) > 0 || review === 'BLOCKED';
  if (hardBlock) missing.push('Hard Blocker Plan');
  const baseReady = missing.length===0;
  const normalReady = baseReady && ['READY','READY_WITH_WARNINGS'].includes(review) && adminReview==='COMPLETE';
  const overrideAvailable = baseReady && !hardBlock && review==='INCOMPLETE';
  if (!normalReady && !overrideAvailable) {
    if (!['READY','READY_WITH_WARNINGS','INCOMPLETE'].includes(review)) missing.push('Auto Review');
    if (['READY','READY_WITH_WARNINGS'].includes(review) && adminReview!=='COMPLETE') missing.push('Admin Review');
  }
  return { ready: normalReady, overrideAvailable, hardBlock, missing:[...new Set(missing)] };
}
function adminPlanReviewBadgePEMS_(p) {
  const s=String(p?.planReviewStatus||'NOT_REVIEWED').toUpperCase();
  const tone=s==='READY'?'success':s==='READY_WITH_WARNINGS'?'warning':s==='INCOMPLETE'?'warning':s==='BLOCKED'?'danger':s==='PENDING_REVIEW'?'info':'neutral';
  return `<span class="badge ${tone}">${escapeHtml(s)}</span>`;
}
function updateAdminPlanReviewPanelPEMS_(p) {
  const badge=document.getElementById('planReviewBadge'), auto=document.getElementById('planAutoBadge'), adm=document.getElementById('planAdminBadge'), pm=document.getElementById('planPmBadge'), box=document.getElementById('planReviewSummary'), run=document.getElementById('runPlanReviewBtn'), view=document.getElementById('viewPlanReviewBtn'), complete=document.getElementById('completeAdminReviewBtn'), mapBtn=document.getElementById('loadBoqMappingBtn');
  if(!badge||!box)return;
  const s=String(p?.planReviewStatus||'NOT_REVIEWED').toUpperCase(), adminS=String(p?.planAdminReviewStatus||'PENDING').toUpperCase(), pmS=String(p?.planPmReviewStatus||'PENDING').toUpperCase();
  const tone=s==='READY'?'success':s==='READY_WITH_WARNINGS'?'warning':s==='INCOMPLETE'?'warning':s==='BLOCKED'?'danger':s==='PENDING_REVIEW'?'info':'neutral';
  badge.className='badge '+tone; badge.textContent=s; if(auto){auto.className='badge '+tone;auto.textContent=s;} if(adm){adm.className='badge '+(adminS==='COMPLETE'?'success':'neutral');adm.textContent=adminS;} if(pm){pm.className='badge '+(['APPROVED'].includes(pmS)?'success':pmS==='OVERRIDE_APPROVED'?'warning':'neutral');pm.textContent=pmS;}
  if(!p?.projectId){box.className='status-box neutral';box.innerHTML='Simpan Draft Project, upload BOQ + KML/KMZ, lalu jalankan Auto Review.'; if(run)run.disabled=true;if(view)view.disabled=true;if(complete)complete.disabled=true;if(mapBtn)mapBtn.disabled=true;return;}
  const hasFiles=!!p.boqPlanFileId&&!!p.kmlPlanFileId, proactiveBoq=String(p?.boqSourceType||'').toUpperCase()==='PROACTIVE'; if(run)run.disabled=!hasFiles;if(view)view.disabled=!p.planReviewAt;if(mapBtn){mapBtn.disabled=!p.boqPlanFileId;mapBtn.textContent=proactiveBoq?'Preview BOQ Proactive':'Atur Mapping BOQ';}if(complete)complete.disabled=!p.planReviewAt||s==='BLOCKED'||s==='NOT_REVIEWED';
  if(!p.planReviewAt){box.className='status-box '+(hasFiles?'warning':'neutral');box.innerHTML=hasFiles?'<b>Belum Auto Review.</b> File sudah ada; jalankan analisis.':'Upload BOQ + KML/KMZ terlebih dahulu.';return;}
  box.className='status-box '+(s==='READY'?'success':s==='READY_WITH_WARNINGS'||s==='INCOMPLETE'?'warning':'danger');
  box.innerHTML=`<b>${escapeHtml(s)}</b> · BOQ ${Number(p.planBoqDesignatorCount||0)} designator / ${Number(p.planBoqItemCount||0)} row · KML/KMZ ${Number(p.planKmlPointCount||0)} point<br><span class="tiny">Unmapped ${Number(p.planUnmappedCount||0)} · Invalid Coordinate ${Number(p.planInvalidCoordCount||0)} · Evidence Rule Missing ${Number(p.planEvidenceRuleMissingCount||0)} · Warning ${Number(p.planWarningCount||0)} · Blocker ${Number(p.planBlockerCount||0)}</span>`;
}
function renderPlanReviewFindingsPEMS_(data) {
  const box=document.getElementById('planReviewFindings'); if(!box)return; const fs=data?.findings||[]; box.classList.remove('hidden'); box.innerHTML=fs.length?`<div class="list">${fs.map(f=>`<div class="list-item"><div><b>${escapeHtml(f.code||'INFO')}</b><div class="small muted">${escapeHtml(f.entityRef||'')}</div><div class="small">${escapeHtml(f.message||'')}</div></div><span class="badge ${String(f.severity).toUpperCase()==='BLOCKER'?'danger':String(f.severity).toUpperCase()==='WARNING'?'warning':'neutral'}">${escapeHtml(f.severity||'INFO')}</span></div>`).join('')}</div>`:'<div class="status-box success">Tidak ada temuan aktif.</div>';
}
async function runAdminPlanReviewPEMS_() {
  const pid=value('prjProjectId'),btn=document.getElementById('runPlanReviewBtn'); if(!pid){toast('Pilih Project terlebih dahulu.','warning');return;}
  try{setButtonLoadingPEMS_(btn,true,'Menganalisis BOQ + KML/KMZ... bisa 30–90 detik'); const data=await api(`/admin/projects/${encodeURIComponent(pid)}/plan-review`,{method:'POST',body:{},timeoutMs:120000,maxAttempts:1}); const p=(state.adminProjects||[]).find(x=>x.projectId===pid)||{}; const updated={...p,planReviewStatus:data.status,planReviewAt:new Date().toISOString(),planAdminReviewStatus:data.adminReviewStatus||'PENDING',planPmReviewStatus:data.pmReviewStatus||'PENDING',planWarningCount:Number(data.summary?.warnings||0),planBlockerCount:Number(data.summary?.blockers||0),planBoqItemCount:Number(data.summary?.boqItems||0),planBoqDesignatorCount:Number(data.summary?.boqDesignators||0),planKmlPointCount:Number(data.summary?.kmlPoints||0),planUnmappedCount:Number(data.summary?.unmapped||0),planInvalidCoordCount:Number(data.summary?.invalidCoordinates||0),planEvidenceRuleMissingCount:Number(data.summary?.evidenceRuleMissing||0)}; upsertAdminProjectLocalPEMS_(updated); updateAdminPlanReviewPanelPEMS_(updated); updateAdminPublishPanelPEMS_(updated); renderPlanReviewFindingsPEMS_(data); if(data.boqSourceMode!=='PROACTIVE_DIRECT' && data.boqHeaders?.length && (!data.boqParseOk || data.status==='INCOMPLETE')) renderBoqMappingPanelPEMS_({headers:data.boqHeaders,mapping:data.boqMapping||{}}); toast(`Auto Review: ${data.status} · ${Number(data.summary?.warnings||0)} warning · ${Number(data.summary?.blockers||0)} blocker.`,data.status==='BLOCKED'?'danger':data.status==='READY_WITH_WARNINGS'||data.status==='INCOMPLETE'?'warning':'success',7000);}catch(err){toast(humanError(err),'danger',8000);}finally{setButtonLoadingPEMS_(btn,false);}
}
async function viewAdminPlanReviewPEMS_(){const pid=value('prjProjectId');if(!pid)return;try{const data=await api(`/admin/projects/${encodeURIComponent(pid)}/plan-review`);renderPlanReviewFindingsPEMS_(data);}catch(err){toast(humanError(err),'danger',6500);}}
function renderBoqMappingPanelPEMS_(data){
  const panel=document.getElementById('boqMappingPanel');if(!panel)return;panel.classList.remove('hidden');
  const headers=(data?.headers||[]).filter(Boolean),mapping=data?.mapping||{},profiles=data?.profiles||[],sheets=data?.sheetNames||[],locked=!!data?.mappingLocked||String(data?.sourceMode||'').toUpperCase()==='PROACTIVE_DIRECT';
  const build=(selected)=>`<option value="">-- tidak dipakai --</option>${headers.map(h=>`<option value="${escapeAttr(h)}" ${String(h)===String(selected||'')?'selected':''}>${escapeHtml(h)}</option>`).join('')}`;
  [['boqMapDesignator',mapping.designatorHeader],['boqMapDescription',mapping.descriptionHeader],['boqMapQty',mapping.qtyHeader],['boqMapUnit',mapping.unitHeader],['boqMapUnitPrice',mapping.unitPriceHeader]].forEach(([id,val])=>{const x=document.getElementById(id);if(x)x.innerHTML=build(val);});
  const profile=document.getElementById('boqProfileName');if(profile)profile.value=data?.selectedProfileName||mapping.profileName||'DEFAULT';
  const dl=document.getElementById('boqProfileList');if(dl)dl.innerHTML=profiles.map(p=>`<option value="${escapeAttr(p.profileName||'DEFAULT')}">${escapeHtml((p.sheetName||'')+(p.headerRow?' · row '+p.headerRow:''))}</option>`).join('');
  const sh=document.getElementById('boqMapSheet');if(sh)sh.innerHTML=`<option value="">-- auto detect --</option>${sheets.map(n=>`<option value="${escapeAttr(n)}" ${String(n)===String(mapping.sheetName||data?.sheetName||'')?'selected':''}>${escapeHtml(n)}</option>`).join('')}`;
  const hr=document.getElementById('boqMapHeaderRow');if(hr)hr.value=Number(mapping.headerRow||data?.headerRow||0)||'';
  const hint=document.getElementById('boqMappingHint');if(hint)hint.textContent=locked?'Sumber: PROACTIVE DIRECT · mapping Excel tidak diperlukan. Data dibaca dari snapshot normalized Proactive.':(data?.previewError?`Preview BOQ: ${data.previewError}`:`Sheet: ${data?.sheetName||mapping.sheetName||'auto'} · Header row: ${data?.headerRow||mapping.headerRow||'auto'} · Kolom: ${headers.join(' | ') || 'belum ditemukan'}`);
  ['boqProfileName','boqMapSheet','boqMapHeaderRow','boqMapDesignator','boqMapDescription','boqMapQty','boqMapUnit','boqMapUnitPrice','saveBoqMappingBtn'].forEach(id=>{const x=document.getElementById(id);if(x)x.disabled=locked;});
  const save=document.getElementById('saveBoqMappingBtn');if(save)save.classList.toggle('hidden',locked);
}
async function loadAdminBoqMappingPEMS_(){const pid=value('prjProjectId');if(!pid){toast('Pilih Project terlebih dahulu.','warning');return;}try{const data=await api(`/admin/projects/${encodeURIComponent(pid)}/boq-mapping`);renderBoqMappingPanelPEMS_(data);if(data?.mappingLocked||data?.sourceMode==='PROACTIVE_DIRECT')await loadAdminBoqItemsPEMS_();}catch(err){toast(humanError(err),'danger',7000);}}
async function saveAdminBoqMappingPEMS_(){
  const pid=value('prjProjectId'),btn=document.getElementById('saveBoqMappingBtn');if(!pid)return;
  try{setButtonLoadingPEMS_(btn,true,'Menyimpan Profile...');await api(`/admin/projects/${encodeURIComponent(pid)}/boq-mapping`,{method:'POST',body:{profileName:value('boqProfileName')||'DEFAULT',sheetName:value('boqMapSheet'),headerRow:Number(value('boqMapHeaderRow')||0),designatorHeader:value('boqMapDesignator'),descriptionHeader:value('boqMapDescription'),qtyHeader:value('boqMapQty'),unitHeader:value('boqMapUnit'),unitPriceHeader:value('boqMapUnitPrice')}});toast('Profile BOQ tersimpan. Menjalankan Auto Review ulang...','success',3500);await runAdminPlanReviewPEMS_();}catch(err){toast(humanError(err),'danger',7000);}finally{setButtonLoadingPEMS_(btn,false);}
}
function resetAdminBoqItemFormPEMS_(){['boqItemDesignator','boqItemDescription','boqItemQty','boqItemUnit','boqItemUnitPrice','boqItemManualId','boqItemSourceRowNo'].forEach(id=>{const x=document.getElementById(id);if(x)x.value='';});}
function boqQtyFilledPEMS_(v){
  return v !== null && v !== undefined && String(v).trim() !== '';
}
function boqQtyNumberPEMS_(v){
  if(!boqQtyFilledPEMS_(v)) return null;
  if(typeof v === 'number') return Number.isFinite(v) ? v : null;
  let x=String(v).trim().replace(/\s/g,'');
  if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x=x.replace(/\./g,'').replace(',','.');
  else if(/^-?\d+(,\d+)$/.test(x)) x=x.replace(',','.');
  const n=Number(x);return Number.isFinite(n)?n:null;
}
function getFilteredAdminBoqItemsPEMS_(){
  const filter=String(state.adminBoqFilter||'HAS_QTY').toUpperCase();
  const q=String(state.adminBoqSearch||'').trim().toLowerCase();
  return (state.adminBoqItems||[]).map((x,i)=>({x,i})).filter(({x})=>{
    const filled=boqQtyFilledPEMS_(x.qtyPlan),num=boqQtyNumberPEMS_(x.qtyPlan);
    let pass=true;
    if(filter==='HAS_QTY') pass=filled;
    else if(filter==='POSITIVE') pass=num!==null&&num>0;
    else if(filter==='EMPTY_ZERO') pass=!filled||(num!==null&&num===0);
    else if(filter==='MANUAL') pass=String(x.sourceType||'').toUpperCase()!=='IMPORT';
    if(!pass)return false;
    if(!q)return true;
    return [x.designator,x.description,x.unit,x.rowNo].some(v=>String(v??'').toLowerCase().includes(q));
  });
}
function renderAdminBoqItemsTablePEMS_(){
  const table=document.getElementById('boqItemsTable'),count=document.getElementById('boqItemsCount'),hint=document.getElementById('boqItemsHint');
  if(!table)return;
  const total=Number(state.adminBoqTotalItems||state.adminBoqItems?.length||0),filtered=getFilteredAdminBoqItemsPEMS_(),visible=filtered.length;
  if(count)count.textContent=`${visible} / ${total} item`;
  const filter=String(state.adminBoqFilter||'HAS_QTY').toUpperCase();
  if(hint){
    const parse=state.adminBoqParseError?`Parser file: ${state.adminBoqParseError} · `:'';
    hint.textContent=`${parse}Profile: ${state.adminBoqProfileName||'DEFAULT'} · Manual/override: ${Number(state.adminBoqManualCount||0)} · Menampilkan ${visible} dari ${total} item.`;
  }
  if(!visible){
    const msg=filter==='HAS_QTY'&&total>0
      ? `Tidak ada item dengan Qty/Volume pada hasil BOQ ini. Total ${total} item tetap tersimpan dan dapat dilihat lewat filter “Semua Item”.`
      : `Tidak ada item yang cocok dengan filter/pencarian saat ini. Total BOQ: ${total} item.`;
    table.innerHTML=`<div class="status-box ${total?'neutral':'warning'}">${escapeHtml(msg)}</div>`;
    return;
  }
  table.innerHTML=`<table><thead><tr><th>Row</th><th>Designator</th><th>Uraian</th><th>Qty</th><th>Unit</th><th>Harga</th><th>Sumber</th><th>Aksi</th></tr></thead><tbody>${filtered.map(({x,i})=>`<tr><td>${escapeHtml(String(x.rowNo||'-'))}</td><td><b>${escapeHtml(x.designator||'')}</b></td><td>${escapeHtml(x.description||'')}</td><td>${escapeHtml(String(x.qtyPlan??''))}</td><td>${escapeHtml(x.unit||'')}</td><td>${escapeHtml(String(x.unitPrice??''))}</td><td><span class="badge neutral">${escapeHtml(x.sourceType||'IMPORT')}</span></td><td><button class="btn ghost btn-sm" type="button" data-boq-edit="${i}">Edit</button> <button class="btn ghost btn-sm" type="button" data-boq-delete="${i}">Hapus</button></td></tr>`).join('')}</tbody></table>`;
  table.querySelectorAll('[data-boq-edit]').forEach(b=>b.addEventListener('click',()=>editAdminBoqItemPEMS_(Number(b.dataset.boqEdit))));
  table.querySelectorAll('[data-boq-delete]').forEach(b=>b.addEventListener('click',()=>deleteAdminBoqItemPEMS_(Number(b.dataset.boqDelete))));
}
function renderAdminBoqItemsPEMS_(data){
  const panel=document.getElementById('boqItemsPanel');if(!panel)return;panel.classList.remove('hidden');
  state.adminBoqItems=data?.items||[];
  state.adminBoqTotalItems=Number(data?.totalItems||state.adminBoqItems.length);
  state.adminBoqParseError=String(data?.parseError||'');
  state.adminBoqProfileName=String(data?.profileName||'DEFAULT');
  state.adminBoqManualCount=Number(data?.manualCount||0);
  const filter=document.getElementById('boqItemsFilter'),search=document.getElementById('boqItemsSearch');
  if(filter)filter.value=state.adminBoqFilter||'HAS_QTY';
  if(search)search.value=state.adminBoqSearch||'';
  renderAdminBoqItemsTablePEMS_();
}
function editAdminBoqItemPEMS_(i){const x=(state.adminBoqItems||[])[i];if(!x)return;document.getElementById('boqItemDesignator').value=x.designator||'';document.getElementById('boqItemDescription').value=x.description||'';document.getElementById('boqItemQty').value=x.qtyPlan??'';document.getElementById('boqItemUnit').value=x.unit||'';document.getElementById('boqItemUnitPrice').value=x.unitPrice??'';document.getElementById('boqItemManualId').value=x.manualId||'';document.getElementById('boqItemSourceRowNo').value=x.rowNo||0;document.getElementById('boqItemDesignator').focus();}
async function loadAdminBoqItemsPEMS_(){const pid=value('prjProjectId'),btn=document.getElementById('loadBoqItemsBtn');if(!pid)return;try{setButtonLoadingPEMS_(btn,true,'Memuat BOQ...');const data=await api(`/admin/projects/${encodeURIComponent(pid)}/boq-items`);renderAdminBoqItemsPEMS_(data);}catch(err){toast(humanError(err),'danger',7000);}finally{setButtonLoadingPEMS_(btn,false);}}
async function saveAdminBoqItemPEMS_(){const pid=value('prjProjectId'),btn=document.getElementById('saveBoqItemBtn');if(!pid)return;const body={manualId:value('boqItemManualId'),sourceRowNo:Number(value('boqItemSourceRowNo')||0),designator:value('boqItemDesignator'),description:value('boqItemDescription'),qtyPlan:value('boqItemQty'),unit:value('boqItemUnit'),unitPrice:value('boqItemUnitPrice'),action:'UPSERT'};if(!body.designator&&!body.description){toast('Isi Designator atau Uraian.','warning');return;}try{setButtonLoadingPEMS_(btn,true,'Menyimpan Item...');await api(`/admin/projects/${encodeURIComponent(pid)}/boq-items`,{method:'POST',body});resetAdminBoqItemFormPEMS_();await loadAdminBoqItemsPEMS_();toast('BOQ manual/koreksi tersimpan. Jalankan Auto Review untuk memakai perubahan.','success',5000);}catch(err){toast(humanError(err),'danger',7000);}finally{setButtonLoadingPEMS_(btn,false);}}
async function deleteAdminBoqItemPEMS_(i){const x=(state.adminBoqItems||[])[i],pid=value('prjProjectId');if(!x||!pid)return;if(!confirm(`Hapus/nonaktifkan item ${x.designator||x.description||''} dari BOQ normalized?`))return;try{await api(`/admin/projects/${encodeURIComponent(pid)}/boq-items`,{method:'POST',body:{manualId:x.manualId||'',sourceRowNo:Number(x.rowNo||0),designator:x.designator||'',description:x.description||'',qtyPlan:x.qtyPlan??'',unit:x.unit||'',unitPrice:x.unitPrice??'',action:'DELETE'}});await loadAdminBoqItemsPEMS_();toast('Item BOQ dinonaktifkan dari BOQ normalized.','success',3500);}catch(err){toast(humanError(err),'danger',7000);}}
async function completeAdminPlanReviewPEMS_(){const pid=value('prjProjectId'),btn=document.getElementById('completeAdminReviewBtn');if(!pid)return;const note=window.prompt('Catatan Admin Review (opsional):','')||'';try{setButtonLoadingPEMS_(btn,true,'Menyimpan Review...');await api(`/admin/projects/${encodeURIComponent(pid)}/admin-review-complete`,{method:'POST',body:{note}});const p=(state.adminProjects||[]).find(x=>x.projectId===pid)||{};const updated={...p,planAdminReviewStatus:'COMPLETE',planAdminReviewAt:new Date().toISOString(),planAdminReviewBy:state.user?.email||''};upsertAdminProjectLocalPEMS_(updated);updateAdminPlanReviewPanelPEMS_(updated);updateAdminPublishPanelPEMS_(updated);toast('Admin Review = COMPLETE. Menunggu keputusan PM/LEADER.','success',5000);}catch(err){toast(humanError(err),'danger',7000);}finally{setButtonLoadingPEMS_(btn,false);}}

function setButtonLoadingPEMS_(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.pemsOriginalHtml) btn.dataset.pemsOriginalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escapeHtml(label || 'Memproses...')}</span>`;
  } else {
    btn.classList.remove('is-loading');
    if (btn.dataset.pemsOriginalHtml) {
      btn.innerHTML = btn.dataset.pemsOriginalHtml;
      delete btn.dataset.pemsOriginalHtml;
    }
    btn.disabled = false;
  }
}

function updateAdminPublishPanelPEMS_(project) {
  const box=document.getElementById('projectPublishBox'),btn=document.getElementById('publishProjectBtn'); if(!box||!btn)return;
  if(!project?.projectId){box.className='status-box neutral';box.innerHTML='Simpan Draft Project terlebih dahulu. Setelah upload + Auto Review + Admin Review, PM/LEADER memutuskan Publish.';btn.classList.add('hidden');return;}
  const setup=String(project.setupStatus||'DRAFT').toUpperCase(); if(setup==='PUBLISHED'){box.className='status-box success';box.innerHTML=`<b>PUBLISHED.</b> PM Review: ${escapeHtml(project.planPmReviewStatus||'APPROVED')} · Baseline BOQ V${escapeHtml(String(project.publishedBoqVersion||project.boqVersion||'-'))} + KML V${escapeHtml(String(project.publishedKmlVersion||project.kmlPlanVersion||'-'))}.`;btn.classList.add('hidden');return;}
  const pub=adminProjectPublishStatePEMS_(project);
  if(pub.ready){box.className='status-box success';box.innerHTML=state.adminCanPublish?'<b>READY FOR EXECUTION.</b> Auto Review + Admin Review selesai. PM/LEADER dapat Publish.':'<b>READY FOR EXECUTION.</b> Menunggu PM/LEADER Publish.';if(state.adminCanPublish){btn.classList.remove('hidden');btn.className='btn success';btn.textContent='Publish for Field Execution';btn.disabled=false;}else btn.classList.add('hidden');}
  else if(pub.overrideAvailable){box.className='status-box warning';box.innerHTML='<b>PLAN REVIEW INCOMPLETE.</b> PM/LEADER dapat Override Publish hanya dengan alasan yang dicatat di Audit.';if(state.adminCanPublish){btn.classList.remove('hidden');btn.className='btn warning';btn.textContent='Override Publish';btn.disabled=false;}else btn.classList.add('hidden');}
  else{box.className='status-box warning';box.innerHTML=`<b>Belum siap Publish.</b> Lengkapi: ${escapeHtml(pub.missing.join(', '))}.`;btn.classList.add('hidden');}
}
async function publishAdminProjectPEMS_(projectId, button) {
  projectId=String(projectId||'').trim(); const project=(state.adminProjects||[]).find(p=>p.projectId===projectId); if(!projectId||!project){toast('Project belum dipilih.','warning',4500);return;}
  const pub=adminProjectPublishStatePEMS_(project); if(!pub.ready&&!pub.overrideAvailable){toast(`Belum siap Publish: ${pub.missing.join(', ')}.`, 'warning',6500);return;} if(!state.adminCanPublish){toast('Publish hanya dapat dilakukan PM/LEADER.','warning',5000);return;}
  const warn=Number(project.planWarningCount||0),review=String(project.planReviewStatus||'').toUpperCase(),override=!pub.ready&&pub.overrideAvailable; let note='';
  if(override){note=String(window.prompt('Override Publish wajib memiliki alasan PM/LEADER:','Field Execution perlu berjalan meski Plan Review belum lengkap.')||'').trim();if(!note){toast('Override dibatalkan karena alasan kosong.','warning',4500);return;}}
  else {const confirmText=warn>0?`Publish ${projectId} untuk Field Execution dengan ${warn} warning? Warning tetap disimpan untuk reconciliation akhir.`:`Publish ${projectId} untuk Field Execution? Baseline BOQ V${project.boqVersion||'-'} + KML V${project.kmlPlanVersion||'-'} akan dicatat.`; if(!window.confirm(confirmText))return; note=`Publish for Field Execution · Review ${review} · Warning ${warn}`;}
  try{setButtonLoadingPEMS_(button,true,override?'Override Publishing...':'Publishing...');const data=await api(`/admin/projects/${encodeURIComponent(projectId)}/publish`,{method:'POST',body:{note,override}});const updated={...project,setupStatus:'PUBLISHED',planPmReviewStatus:data.pmReviewStatus|| (override?'OVERRIDE_APPROVED':'APPROVED'),planOverrideUsed:!!data.overrideUsed,publishedBoqVersion:data.publishedBoqVersion||project.boqVersion,publishedKmlVersion:data.publishedKmlVersion||project.kmlPlanVersion};upsertAdminProjectLocalPEMS_(updated);toast(`${projectId} berhasil PUBLISHED${override?' dengan OVERRIDE':''}.`,'success',5500);updateAdminPlanReviewPanelPEMS_(updated);updateAdminPublishPanelPEMS_(updated);setTimeout(()=>refreshNotifications(true,true).catch(()=>{}),50);}catch(err){toast(humanError(err),'danger',7000);}finally{setButtonLoadingPEMS_(button,false);}
}

function updateAdminPlanFileStatus(project) {
  const boq = document.getElementById('boqPlanStatus');
  const kml = document.getElementById('kmlPlanStatus');
  if (boq) {
    boq.innerHTML = project?.boqPlanFileId
      ? `<b>Aktif:</b> ${escapeHtml(project.boqPlanFileName || 'BOQ Plan')} · V${escapeHtml(String(project.boqVersion || 1))} · <a class="inline-link" href="${escapeAttr(adminDriveFileUrlPEMS_(project.boqPlanFileId))}" target="_blank" rel="noopener">Buka BOQ</a>`
      : 'Belum ada BOQ Plan pada project yang dipilih.';
  }
  if (kml) {
    kml.innerHTML = project?.kmlPlanFileId
      ? `<b>Aktif:</b> ${escapeHtml(project.kmlPlanFileName || 'KML/KMZ Plan')} · V${escapeHtml(String(project.kmlPlanVersion || 1))} · <a class="inline-link" href="${escapeAttr(adminDriveFileUrlPEMS_(project.kmlPlanFileId))}" target="_blank" rel="noopener">Buka KML</a>`
      : 'Belum ada KML/KMZ Plan pada project yang dipilih.';
  }
}

function adminFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      const chunkSize = 0x8000;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
      }
      resolve(btoa(binary));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function uploadAdminPlanFile(kind) {
  if (state.adminPlanUploading) return;
  const projectId = value('prjProjectId');
  const input = document.getElementById(kind === 'BOQ' ? 'boqPlanFile' : 'kmlPlanFile');
  const file = input?.files?.[0];
  if (!projectId) {
    toast('Isi dan Simpan Draft Project terlebih dahulu.', 'warning', 5000);
    return;
  }
  if (!file) {
    toast(`Pilih file ${kind === 'BOQ' ? 'BOQ Plan' : 'KML/KMZ Plan'} terlebih dahulu.`, 'warning', 5000);
    return;
  }
  const maxBytes = 12 * 1024 * 1024;
  if (file.size > maxBytes) {
    toast('File terlalu besar. Maksimum 12 MB dari web.', 'danger', 6000);
    return;
  }
  try {
    state.adminPlanUploading = true;
    const btn = document.getElementById(kind === 'BOQ' ? 'uploadBoqPlanBtn' : 'uploadKmlPlanBtn');
    setButtonLoadingPEMS_(btn, true, 'Mengunggah...');
    const base64 = await adminFileToBase64(file);
    const result = await api(`/admin/projects/${encodeURIComponent(projectId)}/plan-file`, {
      method: 'POST',
      body: { kind, fileName: file.name, mimeType: file.type || 'application/octet-stream', base64 }
    });
    toast(`${kind} Plan tersimpan · V${result.version}.`, 'success', 5000);
    await renderAdmin();
    state.adminSection = 'project-setup';
    showAdminSection('project-setup');
    fillAdminProjectForm(projectId);
  } catch (err) {
    toast(humanError(err), 'danger', 7000);
  } finally {
    state.adminPlanUploading = false;
    const btn = document.getElementById(kind === 'BOQ' ? 'uploadBoqPlanBtn' : 'uploadKmlPlanBtn');
    setButtonLoadingPEMS_(btn, false);
  }
}

function adminDateDiffDays(a, b) {
  if (!a || !b) return null;
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function updateAdminProjectSlaPreview() {
  const box = document.getElementById('projectSlaPreview');
  if (!box) return;
  const start = value('prjStartDate');
  const target = value('prjTargetSelesai');
  const actual = value('prjRealisasiSelesai');
  const status = value('prjStatusProject').toUpperCase();
  const sla = adminDateDiffDays(start, target);
  if (sla == null) {
    box.className = 'status-box neutral';
    box.innerHTML = 'Isi Start Date dan Target Selesai untuk menghitung SLA otomatis.';
    return;
  }
  if (sla < 0) {
    box.className = 'status-box danger';
    box.innerHTML = '<b>Tanggal tidak valid.</b> Target Selesai tidak boleh lebih awal dari Start Date.';
    return;
  }
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (actual || ['COMPLETED','CLOSED'].includes(status)) {
    const done = actual || todayIso;
    const delta = adminDateDiffDays(target, done) || 0;
    box.className = 'status-box success';
    box.innerHTML = `<b>SLA ${sla} hari.</b> ${delta < 0 ? `Selesai ${Math.abs(delta)} hari lebih cepat.` : delta > 0 ? `Selesai ${delta} hari terlambat.` : 'Selesai tepat waktu.'}`;
    return;
  }
  const elapsed = Math.max(0, adminDateDiffDays(start, todayIso) || 0);
  const remaining = adminDateDiffDays(todayIso, target) || 0;
  const usage = sla > 0 ? Math.max(0, Math.round((elapsed / sla) * 100)) : (remaining < 0 ? 101 : 0);
  const tc = remaining < 0 || usage > 100 ? 'OVERDUE' : usage > 85 ? 'CRITICAL' : usage > 70 ? 'ATTENTION' : 'NORMAL';
  box.className = `status-box ${tc === 'OVERDUE' ? 'danger' : tc === 'CRITICAL' || tc === 'ATTENTION' ? 'warning' : 'success'}`;
  box.innerHTML = `<b>SLA ${sla} hari · ${usage}% terpakai · ${tc}</b><div class="tiny" style="margin-top:4px">Elapsed ${elapsed} hari · ${remaining >= 0 ? `sisa ${remaining} hari` : `terlambat ${Math.abs(remaining)} hari`}.</div>`;
}

function resetAdminProjectForm() {
  ['prjProjectId','prjStakeholder','prjProjectType','prjProjectName','prjContract','prjSuratPesanan','prjRegional','prjWitelBranch','prjArea','prjDetailProject','prjSto','prjPelaksana','prjMitra','prjStartDate','prjTargetSelesai','prjRealisasiSelesai','prjNotes'].forEach(id => {
    const node = document.getElementById(id); if (node) node.value = '';
  });
  const status = document.getElementById('prjStatusProject'); if (status) status.value = 'NOT_STARTED';
  const id = document.getElementById('prjProjectId'); if (id) id.readOnly = false;
  const boqInput = document.getElementById('boqPlanFile'); if (boqInput) boqInput.value = '';
  const kmlInput = document.getElementById('kmlPlanFile'); if (kmlInput) kmlInput.value = '';
  updateAdminPlanFileStatus(null);
  updateAdminProjectSlaPreview();
  updateAdminPublishPanelPEMS_(null);
}

function fillAdminProjectForm(projectId) {
  const p = (state.adminProjects || []).find(x => x.projectId === projectId);
  if (!p) return;
  const set = (id, val) => { const node = document.getElementById(id); if (node) node.value = val ?? ''; };
  const setSelect = (id, val) => {
    const node = document.getElementById(id);
    const v = val ?? '';
    if (!node) return;
    if (v && !Array.from(node.options).some(o => o.value === v)) node.add(new Option(`${v} (legacy/nonaktif)`, v));
    node.value = v;
  };
  set('prjProjectId', p.projectId); setSelect('prjStakeholder', p.stakeholder); setSelect('prjProjectType', p.projectType);
  set('prjProjectName', p.projectName); set('prjContract', p.contract); set('prjSuratPesanan', p.suratPesanan);
  set('prjRegional', p.regional); set('prjWitelBranch', p.witelBranch); set('prjArea', p.area); set('prjDetailProject', p.detailProject || p.lop);
  setSelect('prjSto', p.sto); set('prjPelaksana', p.pelaksana); set('prjMitra', p.mitra); set('prjStartDate', p.startDate);
  set('prjTargetSelesai', p.targetSelesai); set('prjRealisasiSelesai', p.realisasiSelesai);
  const statusNode = document.getElementById('prjStatusProject');
  const statusValue = p.statusProject || 'NOT_STARTED';
  if (statusNode && !Array.from(statusNode.options).some(o => o.value === statusValue)) {
    statusNode.add(new Option(statusValue, statusValue));
  }
  set('prjStatusProject', statusValue);
  set('prjNotes', p.notes);
  const id = document.getElementById('prjProjectId'); if (id) id.readOnly = true;
  updateAdminPlanFileStatus(p);
  updateAdminProjectSlaPreview();
  updateAdminPlanReviewPanelPEMS_(p);
  updateAdminPublishPanelPEMS_(p);
  document.getElementById('prjProjectId')?.scrollIntoView({behavior:'smooth', block:'center'});
}

async function saveAdminProject() {
  const btn = document.getElementById('saveProjectBtn');
  try {
    setButtonLoadingPEMS_(btn, true, 'Menyimpan...');
    const body = {
      projectId: value('prjProjectId'), stakeholder: value('prjStakeholder'), projectType: value('prjProjectType'), projectName: value('prjProjectName'),
      contract: value('prjContract'), suratPesanan: value('prjSuratPesanan'), regional: value('prjRegional'), witelBranch: value('prjWitelBranch'),
      area: value('prjArea'), detailProject: value('prjDetailProject'), sto: value('prjSto'), pelaksana: value('prjPelaksana'), mitra: value('prjMitra'),
      startDate: value('prjStartDate'), targetSelesai: value('prjTargetSelesai'), realisasiSelesai: value('prjRealisasiSelesai'),
      statusProject: value('prjStatusProject'), notes: value('prjNotes'), active: true
    };
    const result = await api('/admin/projects/upsert', {method:'POST', body});
    const saved = result?.project || { ...body, setupStatus:'DRAFT', active:true };
    upsertAdminProjectLocalPEMS_(saved);
    toast('Project disimpan.', 'success');
    fillAdminProjectForm(body.projectId);
    setButtonLoadingPEMS_(btn, false);
    // Refresh tambahan tidak menghambat user.
    setTimeout(() => refreshNotifications(true, true).catch(() => {}), 50);
  } catch(err) {
    toast(humanError(err), 'danger', 6000);
    setButtonLoadingPEMS_(btn, false);
  }
}

function resetAdminMasterForm() {
  const set = (id, val) => { const node = document.getElementById(id); if (node) node.value = val; };
  set('masterDataId', '');
  set('masterDataType', 'STAKEHOLDER');
  set('masterDataCode', '');
  set('masterDataName', '');
  set('masterDataArea', '');
  set('masterDataSort', '100');
  set('masterDataActive', 'TRUE');
  set('masterDataDescription', '');
  const code = document.getElementById('masterDataCode');
  if (code) code.readOnly = false;
}

function fillAdminMasterForm(masterId) {
  const item = (state.adminMasterData || []).find(m => m.masterId === masterId);
  if (!item) return;
  const set = (id, val) => { const node = document.getElementById(id); if (node) node.value = val ?? ''; };
  set('masterDataId', item.masterId);
  set('masterDataType', item.type);
  set('masterDataCode', item.code);
  set('masterDataName', item.name);
  set('masterDataArea', item.area);
  set('masterDataSort', String(item.sortOrder ?? 100));
  set('masterDataActive', item.active ? 'TRUE' : 'FALSE');
  set('masterDataDescription', item.description);
  document.getElementById('masterDataCode')?.scrollIntoView({behavior:'smooth', block:'center'});
}

async function saveAdminMasterData() {
  const btn = document.getElementById('saveMasterDataBtn');
  try {
    setButtonLoadingPEMS_(btn, true, 'Menyimpan...');
    const body = {
      masterId: value('masterDataId'),
      type: value('masterDataType'),
      code: value('masterDataCode'),
      name: value('masterDataName'),
      area: value('masterDataArea'),
      description: value('masterDataDescription'),
      sortOrder: Number(value('masterDataSort') || 0),
      active: value('masterDataActive') === 'TRUE'
    };
    const result = await api('/admin/master-data', { method:'POST', body });
    if (result?.item) upsertAdminMasterLocalPEMS_(result.item);
    toast('Master Data disimpan.', 'success', 4000);
    resetAdminMasterForm();
    state.adminSection = 'master-data';
    await renderAdmin(); // cache lokal -> render instan; refresh server di background
    showAdminSection('master-data');
  } catch(err) {
    toast(humanError(err), 'danger', 6500);
    setButtonLoadingPEMS_(btn, false);
  }
}

async function toggleAdminMasterData(masterId) {
  const item = (state.adminMasterData || []).find(m => m.masterId === masterId);
  if (!item) return;
  try {
    await api('/admin/master-data', {
      method:'POST',
      body: {
        masterId: item.masterId,
        type: item.type,
        code: item.code,
        name: item.name,
        area: item.area,
        description: item.description,
        sortOrder: item.sortOrder,
        active: !item.active,
        reason: item.active ? 'Nonaktifkan dari Admin Web' : 'Aktifkan kembali dari Admin Web'
      }
    });
    state.adminCache.master = null; state.adminCache.projects = null;
    toast(`${item.code} ${item.active ? 'dinonaktifkan' : 'diaktifkan kembali'}.`, 'success', 4500);
    state.adminSection = 'master-data';
    await renderAdmin();
    showAdminSection('master-data');
  } catch(err) {
    toast(humanError(err), 'danger', 6500);
  }
}

async function saveAdminUser() {
  const btn = document.getElementById('saveUserBtn');
  try {
    setButtonLoadingPEMS_(btn, true, 'Menyimpan...');
    const body={email:value('adminUserEmail'),fullName:value('adminUserName'),role:value('adminUserRole'),area:value('adminUserArea'),active:true};
    const result=await api('/admin/users/upsert', {method:'POST', body});
    const cache=state.adminCache.users || {users:[]};
    const users=[...(cache.users||[])];
    const idx=users.findIndex(u=>String(u.email).toLowerCase()===String(body.email).toLowerCase());
    const row={...(idx>=0?users[idx]:{}),...body,userId:result?.userId||users[idx]?.userId||''};
    if(idx>=0) users[idx]=row; else users.push(row);
    state.adminCache.users={...cache,users}; state.adminCacheAt.users=Date.now();
    toast('User disimpan.', 'success');
    setButtonLoadingPEMS_(btn, false);
    setTimeout(()=>refreshNotifications(true,true).catch(()=>{}),50);
  } catch(err){
    toast(humanError(err),'danger',6000);
    setButtonLoadingPEMS_(btn, false);
  }
}

async function saveAdminAssignment() {
  const btn = document.getElementById('saveAssignmentBtn');
  try {
    setButtonLoadingPEMS_(btn, true, 'Menyimpan...');
    const body={userEmail:value('assignUser'),projectId:value('assignProject'),scopeType:value('assignScope'),scopeValue:value('assignScopeValue'),status:'ACTIVE',active:true};
    const result=await api('/admin/assignments/upsert', {method:'POST', body});
    const cache=state.adminCache.assignments || {assignments:[]};
    let rows=[...(cache.assignments||[])];
    const key=a=>[String(a.userEmail||'').toLowerCase(),a.projectId,a.scopeType,a.scopeValue||''].join('|');
    const idx=rows.findIndex(a=>key(a)===key(body));
    const row={...(idx>=0?rows[idx]:{}),...body,assignmentId:result?.assignmentId||rows[idx]?.assignmentId||''};
    if(idx>=0) rows[idx]=row; else rows.push(row);
    state.adminCache.assignments={...cache,assignments:rows}; state.adminCacheAt.assignments=Date.now();
    toast('Assignment disimpan.', 'success');
    setButtonLoadingPEMS_(btn, false);
    setTimeout(()=>refreshNotifications(true,true).catch(()=>{}),50);
  } catch(err){
    toast(humanError(err),'danger',6000);
    setButtonLoadingPEMS_(btn, false);
  }
}

async function saveOperationalConfig() {
  const btn = document.getElementById('saveOperationalConfigBtn');
  try {
    setButtonLoadingPEMS_(btn, true, 'Menyimpan...');
    const updates = [
      ['GPS_POLICY', value('cfgGpsPolicy')],
      ['GPS_FIELD_BLOCK_M', value('cfgGpsBlock')],
      ['POINT_DISTANCE_WARNING_M', value('cfgDistanceWarn')]
    ];
    await Promise.all(updates.map(([key,val]) => api('/admin/config', { method:'POST', body:{key,value:val} })));
    const next={...(state.config||{})}; updates.forEach(([k,v])=>next[k]=v); state.config=next;
    if(state.bootstrap) state.bootstrap.config=next;
    state.adminCache.config={config:next}; state.adminCacheAt.config=Date.now();
    await cachePut('bootstrap', state.bootstrap);
    toast('Config operasional disimpan.', 'success');
    setButtonLoadingPEMS_(btn, false);
  } catch (err) {
    toast(humanError(err), 'danger', 6000);
    setButtonLoadingPEMS_(btn, false);
  }
}

async function renderOutput() {
  let caps = state.bootstrap?.outputCapabilities || {};
  if (navigator.onLine) {
    try { caps = await api('/outputs/capabilities'); } catch {}
  }

  const projects = state.bootstrap?.projects || [];
  const preferred = state.outputSelectedProjectId || state.selectedProjectId || localStorage.getItem(SELECTED_PROJECT_KEY) || '';
  const selected = projects.some(p => String(p.projectId||'') === String(preferred))
    ? preferred
    : (projects[0]?.projectId || '');
  state.outputSelectedProjectId = selected;

  const options = projects.map(p => {
    const label = [p.projectId, p.detailProject || p.projectName].filter(Boolean).join(' — ');
    return `<option value="${escapeAttr(p.projectId || '')}" ${String(p.projectId||'')===String(selected)?'selected':''}>${escapeHtml(label)}</option>`;
  }).join('');

  const mode = hasPermission('output.final') ? 'FINAL' : 'PREVIEW';
  const modeText = mode === 'FINAL'
    ? 'FINAL · hanya latest VERIFIED evidence'
    : 'PREVIEW · hanya latest VERIFIED evidence';

  el.content.innerHTML = `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Output Generation Layer</h2>
          <div class="small muted">Verified Material Evidence → KML/KMZ Realisasi + Word/PDF Evidence Report. Satu Point Session dapat menghasilkan beberapa material/output item.</div>
        </div>
        <span class="badge ${mode==='FINAL'?'success':'warning'}">${mode}</span>
      </div>

      <div class="grid two" style="margin-top:14px">
        <div>
          <label>Project</label>
          <select id="outputProjectSelect" class="input">${options || '<option value="">Belum ada project</option>'}</select>
        </div>
        <div>
          <label>Mode Output</label>
          <div class="status-box ${mode==='FINAL'?'success':'warning'}" style="margin-top:6px">${escapeHtml(modeText)}</div>
        </div>
      </div>

      <div id="outputProjectSummary" class="status-box neutral" style="margin-top:14px">Pilih project untuk membaca VERIFIED evidence.</div>

      <div class="grid two" style="margin-top:14px">
        <div class="card compact">
          <h3>KML / KMZ Realisasi</h3>
          <div class="small muted">Generate 3 file dari VERIFIED Material Evidence. Grouping mengikuti material: Tiang, ODP, ODC, Closure, Slack, Aksesoris/Helical/Corong, Riser, Splicing, dst.</div>
          <button id="generateKmlKmzBtn" class="btn primary full" style="margin-top:12px" type="button" disabled>Generate 3 Output KML/KMZ</button>
        </div>
        <div class="card compact">
          <h3>Word / PDF Evidence Report</h3>
          <div class="small muted">Template MITRATEL A4 · 3×2 evidence · photo contain/no crop · DOCX + PDF per material + PDF FINAL gabungan.</div>
          <button id="generateWordPdfBtn" class="btn primary full" style="margin-top:12px" type="button" disabled>Generate Word + PDF</button>
          <div class="list" style="margin-top:12px">
            ${statusRow('Word Evidence Report', caps.wordEvidence || caps.word || 'READY', 'success')}
            ${statusRow('PDF Evidence Report', caps.pdfEvidence || caps.pdf || 'READY', 'success')}
            ${statusRow('PDF FINAL Gabungan', caps.pdfEvidence || caps.pdf || 'READY', 'success')}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="section-head">
          <h3>Generated Files</h3>
          <div class="toolbar compact">
            <button id="syncOutputDriveAccessBtn" class="btn outline" type="button">Perbaiki Akses Drive</button>
            <button id="refreshOutputBtn" class="btn secondary" type="button">Refresh</button>
          </div>
        </div>
        <div id="outputFilesList" class="small muted" style="margin-top:10px">Belum dibaca.</div>
      </div>

      <div class="status-box neutral" style="margin-top:14px"><b>Rule:</b> satu Point Session boleh punya beberapa material. Generator membaca latest <b>VERIFIED Material Evidence</b>; setiap material menjadi placemark di folder kategorinya. KML/KMZ PHOTO membawa foto tertanam, KML NONPHOTO tanpa foto. Akses semua file KML/KMZ/Word/PDF disinkronkan untuk user output PEMS dan tidak dibuat public.</div>
    </div>`;

  document.getElementById('outputProjectSelect')?.addEventListener('change', async (event) => {
    state.outputSelectedProjectId = String(event.target.value || '');
    await loadOutputProjectStatusPEMS_(state.outputSelectedProjectId);
  });
  document.getElementById('refreshOutputBtn')?.addEventListener('click', async () => {
    await loadOutputProjectStatusPEMS_(state.outputSelectedProjectId, true);
  });
  document.getElementById('syncOutputDriveAccessBtn')?.addEventListener('click', syncOutputDriveAccessPEMS_);
  document.getElementById('generateKmlKmzBtn')?.addEventListener('click', generateOutputKmlKmzPEMS_);
  document.getElementById('generateWordPdfBtn')?.addEventListener('click', generateWordPdfPEMS_);

  if (!selected) {
    document.getElementById('outputProjectSummary').innerHTML = 'Belum ada project yang dapat dipilih.';
    return;
  }
  await loadOutputProjectStatusPEMS_(selected);
}

function outputBytesPEMS_(value) {
  const n = Number(value || 0);
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n/1024))} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}

function renderOutputProjectStatusPEMS_(data) {
  state.outputProjectStatus = data || null;
  const box = document.getElementById('outputProjectSummary');
  const list = document.getElementById('outputFilesList');
  const btn = document.getElementById('generateKmlKmzBtn');
  const reportBtn = document.getElementById('generateWordPdfBtn');
  if (!box || !list || !btn) return;

  if (!data) {
    box.className = 'status-box danger';
    box.innerHTML = 'Status output tidak tersedia.';
    btn.disabled = true;
    if (reportBtn) reportBtn.disabled = true;
    list.innerHTML = '—';
    return;
  }

  const verified = Number(data.verifiedEvidenceCount || 0);
  const eligible = Number(data.eligiblePointCount || 0);
  const invalid = Number(data.invalidCoordinateCount || 0);
  const finalMode = hasPermission('output.final');
  const canGenerate = finalMode ? !!data.canGenerateFinal : !!data.canGeneratePreview;
  btn.disabled = !canGenerate || eligible <= 0 || state.outputGenerating;
  btn.textContent = finalMode ? 'Generate FINAL · 3 Output' : 'Generate PREVIEW · 3 Output';
  if (reportBtn) {
    reportBtn.disabled = !canGenerate || verified <= 0 || state.outputReportGenerating;
    reportBtn.textContent = finalMode ? 'Generate FINAL · Word + PDF' : 'Generate PREVIEW · Word + PDF';
  }

  box.className = `status-box ${eligible>0?'success':verified>0?'warning':'neutral'}`;
  box.innerHTML = `<b>${escapeHtml(data.projectId || '')}</b> · ${escapeHtml(data.projectName || '')}<br><span class="tiny">VERIFIED Material Evidence ${verified} · Placemark Eligible ${eligible} · Invalid/Skipped ${invalid}</span>`;

  const files = data.files || [];
  if (!files.length) {
    list.innerHTML = 'Belum ada output KML/KMZ/Word/PDF untuk project ini.';
    return;
  }
  list.innerHTML = `<div class="list">${files.map(f => `
    <div class="status-box neutral">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div><b>${escapeHtml(f.type || '')}</b> · ${escapeHtml(f.fileName || '')}<div class="tiny muted">${escapeHtml(outputBytesPEMS_(f.sizeBytes))} · ${escapeHtml(formatDate(f.updatedAt || ''))}</div></div>
        <a class="btn secondary" href="${escapeAttr(f.url || '')}" target="_blank" rel="noopener">Buka di Drive</a>
      </div>
    </div>`).join('')}</div>`;
}

async function loadOutputProjectStatusPEMS_(projectId, force = false) {
  projectId = String(projectId || '').trim();
  const box = document.getElementById('outputProjectSummary');
  const btn = document.getElementById('generateKmlKmzBtn');
  if (!projectId) {
    if (box) box.innerHTML = 'Pilih project.';
    if (btn) btn.disabled = true;
    return;
  }
  if (!navigator.onLine) {
    if (box) { box.className='status-box warning'; box.innerHTML='Output Center membutuhkan koneksi ke server.'; }
    if (btn) btn.disabled = true;
    return;
  }
  try {
    if (box) { box.className='status-box neutral'; box.innerHTML='Membaca VERIFIED evidence dan output terakhir...'; }
    const data = await api(`/outputs/projects/${encodeURIComponent(projectId)}`, { timeoutMs:45000, maxAttempts: force?1:2 });
    renderOutputProjectStatusPEMS_(data);
  } catch (err) {
    if (box) { box.className='status-box danger'; box.innerHTML=escapeHtml(humanError(err)); }
    if (btn) btn.disabled = true;
  }
}

async function generateOutputKmlKmzPEMS_() {
  const projectId = String(state.outputSelectedProjectId || '').trim();
  const btn = document.getElementById('generateKmlKmzBtn');
  if (!projectId || !btn || state.outputGenerating) return;
  const finalMode = hasPermission('output.final');
  const mode = finalMode ? 'FINAL' : 'PREVIEW';
  const status = state.outputProjectStatus || {};
  if (Number(status.eligiblePointCount || 0) <= 0) {
    toast('Belum ada VERIFIED evidence dengan koordinat valid.', 'warning', 6000);
    return;
  }
  if (!window.confirm(`Generate ${mode} 3 output (KMZ + PHOTO, KML + PHOTO, KML NONPHOTO) dari ${Number(status.eligiblePointCount||0)} VERIFIED material evidence?`)) return;

  state.outputGenerating = true;
  try {
    setButtonLoadingPEMS_(btn, true, 'Generating 3 output...');
    const data = await api(`/outputs/projects/${encodeURIComponent(projectId)}/kml-kmz`, {
      method:'POST',
      body:{ mode, note:'Output Center R13C Material Evidence Triple Output' },
      timeoutMs:120000,
      maxAttempts:1
    });
    toast(`3 output ${data.mode || mode} selesai · ${Number(data.generatedPointCount||0)} placemark material · ${Number(data.embeddedPhotoCount||0)} photo preview.`, 'success', 8000);
    await loadOutputProjectStatusPEMS_(projectId, true);
  } catch (err) {
    toast(humanError(err), 'danger', 9000);
  } finally {
    state.outputGenerating = false;
    setButtonLoadingPEMS_(btn, false);
    if (state.outputProjectStatus) renderOutputProjectStatusPEMS_(state.outputProjectStatus);
  }
}


async function generateWordPdfPEMS_() {
  const projectId = String(state.outputSelectedProjectId || '').trim();
  const btn = document.getElementById('generateWordPdfBtn');
  if (!projectId || !btn || state.outputReportGenerating) return;
  const finalMode = hasPermission('output.final');
  const mode = finalMode ? 'FINAL' : 'PREVIEW';
  const status = state.outputProjectStatus || {};
  if (Number(status.verifiedEvidenceCount || 0) <= 0) {
    toast('Belum ada VERIFIED Material Evidence untuk dibuat report.', 'warning', 6000);
    return;
  }
  if (!window.confirm(`Generate ${mode} Word/PDF Evidence Report dari ${Number(status.verifiedEvidenceCount||0)} VERIFIED material evidence?`)) return;

  state.outputReportGenerating = true;
  try {
    setButtonLoadingPEMS_(btn, true, 'Generating Word/PDF...');
    const data = await api(`/outputs/projects/${encodeURIComponent(projectId)}/evidence-report`, {
      method:'POST',
      body:{ mode, note:'Output Center R13C Word/PDF Evidence Report' },
      timeoutMs:300000,
      maxAttempts:1
    });
    const warningCount = Array.isArray(data.warnings) ? data.warnings.length : 0;
    toast(`Word/PDF ${data.mode || mode} selesai · ${Number(data.materialOutputs||0)} material · ${Number(data.verifiedEvidenceCount||0)} evidence${warningCount?` · ${warningCount} warning`:''}.`, warningCount?'warning':'success', 10000);
    await loadOutputProjectStatusPEMS_(projectId, true);
  } catch (err) {
    toast(humanError(err), 'danger', 12000);
  } finally {
    state.outputReportGenerating = false;
    setButtonLoadingPEMS_(btn, false);
    if (state.outputProjectStatus) renderOutputProjectStatusPEMS_(state.outputProjectStatus);
  }
}


async function syncOutputDriveAccessPEMS_() {
  const projectId = String(state.outputSelectedProjectId || '').trim();
  const btn = document.getElementById('syncOutputDriveAccessBtn');

  if (!projectId || !btn) return;

  if (!navigator.onLine) {
    toast('Sinkron akses Drive membutuhkan koneksi server.', 'warning', 6000);
    return;
  }

  try {
    setButtonLoadingPEMS_(btn, true, 'Sinkron akses...');
    const data = await api(
      `/outputs/projects/${encodeURIComponent(projectId)}/drive-access`,
      {
        method: 'POST',
        body: {},
        timeoutMs: 90000,
        maxAttempts: 1
      }
    );

    const failed = Number(data.failedCount || 0);
    const viewers = Array.isArray(data.viewerEmails)
      ? data.viewerEmails.length
      : 0;

    if (failed > 0) {
      toast(
        `Akses Drive disinkronkan ke ${viewers} user, tetapi ada ${failed} grant yang gagal. Cek policy Google Drive/domain.`,
        'warning',
        9000
      );
    } else {
      toast(
        `Akses Drive selesai · ${Number(data.fileCount || 0)} file · ${viewers} user privileged PEMS.`,
        'success',
        7000
      );
    }

    await loadOutputProjectStatusPEMS_(projectId, true);
  }
  catch (err) {
    toast(humanError(err), 'danger', 9000);
  }
  finally {
    setButtonLoadingPEMS_(btn, false);
  }
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
  const method = String(options.method || 'GET').toUpperCase();
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

  const retryableMethod = method === 'GET' || method === 'HEAD' || options.safeRetry === true;
  const maxAttempts = Math.max(1, Number(options.maxAttempts || (retryableMethod ? 3 : 1)));
  const retryStatuses = new Set([404,408,425,429,500,502,503,504]);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(5000, Number(options.timeoutMs || 30000)));
      try {
        response = await fetch(`${state.apiBase}${path}`, { method, headers, body, cache:'no-store', signal:controller.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = new Error(err?.name === 'AbortError' ? 'Request ke server timeout.' : 'Tidak dapat terhubung ke API Gateway.');
      lastError.networkError = true;
      if (!retryableMethod || attempt >= maxAttempts) throw lastError;
      await sleepMs(apiRetryDelayMs(attempt));
      continue;
    }

    let data;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      lastError = new Error(`API response bukan JSON (HTTP ${response.status}).`);
      lastError.status = response.status;
      if (retryableMethod && retryStatuses.has(Number(response.status)) && attempt < maxAttempts) {
        await sleepMs(apiRetryDelayMs(attempt));
        continue;
      }
      throw lastError;
    }

    if (!response.ok || data.ok === false) {
      lastError = apiError(data, response.status);
      if (retryableMethod && retryStatuses.has(Number(lastError.status || response.status)) && attempt < maxAttempts) {
        await sleepMs(apiRetryDelayMs(attempt));
        continue;
      }
      throw lastError;
    }
    return data;
  }
  throw lastError || new Error('API gagal setelah beberapa percobaan.');
}

function apiRetryDelayMs(attempt) {
  const delays = [0,700,1600,3200];
  return delays[Math.min(3, Math.max(1, Number(attempt || 1)))] + Math.floor(Math.random()*250);
}
function sleepMs(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0)))); }

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

function bindSelectSearchPEMS_(searchId, selectId) {
  const input=document.getElementById(searchId); const select=document.getElementById(selectId);
  if(!input||!select) return;
  input.addEventListener('input',()=>{
    const q=String(input.value||'').trim().toLowerCase();
    Array.from(select.options).forEach(opt=>{ opt.hidden=!!q && !String(opt.textContent||'').toLowerCase().includes(q); });
    const first=Array.from(select.options).find(o=>!o.hidden);
    if(q && select.selectedOptions[0]?.hidden && first){ select.value=first.value; select.dispatchEvent(new Event('change',{bubbles:true})); }
  });
}
function bindTextFilterPEMS_(inputId, rowSelector) {
  const input=document.getElementById(inputId); if(!input) return;
  input.addEventListener('input',()=>{
    const q=String(input.value||'').trim().toLowerCase();
    el.content.querySelectorAll(rowSelector).forEach(row=>{ const hay=String(row.dataset.search||row.textContent||'').toLowerCase(); row.hidden=!!q && !hay.includes(q); });
  });
}
function rebuildAdminMasterOptionsLocalPEMS_(){
  const rows=state.adminMasterData||[];
  state.adminMasterOptions={
    stakeholders:rows.filter(r=>r.type==='STAKEHOLDER'&&r.active).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(r=>r.code),
    projectTypes:rows.filter(r=>r.type==='PROJECT_TYPE'&&r.active).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(r=>r.code),
    stos:rows.filter(r=>r.type==='STO'&&r.active).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(r=>r.code)
  };
}
function upsertAdminMasterLocalPEMS_(item){
  if(!item) return;
  const rows=[...(state.adminMasterData||[])]; const idx=rows.findIndex(r=>r.masterId===item.masterId || (r.type===item.type&&r.code===item.code));
  if(idx>=0) rows[idx]={...rows[idx],...item}; else rows.push(item);
  state.adminMasterData=rows; rebuildAdminMasterOptionsLocalPEMS_();
  state.adminCache.master={types:['STAKEHOLDER','PROJECT_TYPE','STO'],items:rows,activeOptions:state.adminMasterOptions};
  state.adminCacheAt.master=Date.now();
  if(state.adminCache.projects){ state.adminCache.projects={...state.adminCache.projects,masterOptions:state.adminMasterOptions}; state.adminCacheAt.projects=Date.now(); }
}
function upsertAdminProjectLocalPEMS_(project){
  if(!project?.projectId) return;
  const rows=[...(state.adminProjects||[])]; const idx=rows.findIndex(p=>p.projectId===project.projectId);
  if(idx>=0) rows[idx]={...rows[idx],...project}; else rows.push(project);
  state.adminProjects=rows;
  state.adminCache.projects={...(state.adminCache.projects||{}),projects:rows,masterOptions:state.adminMasterOptions,canPublish:state.adminCanPublish};
  state.adminCacheAt.projects=Date.now();
  if(state.bootstrap) state.bootstrap.projects=rows;
}

function projectSelectHtml(projects, selected, id) {
  return `<select id="${escapeAttr(id)}" class="select">${projects.map(p=>`<option value="${escapeAttr(p.projectId)}" ${p.projectId===selected?'selected':''}>${escapeHtml(adminProjectLabelPEMS_(p))}</option>`).join('')}</select>`;
}
function kpi(label,value,sub='') { return `<div class="card kpi-card"><div class="value">${escapeHtml(String(value ?? 0))}</div><div class="label">${escapeHtml(label)}${sub?` • ${escapeHtml(sub)}`:''}</div></div>`; }
function statusRow(label,value,badge='neutral') { return `<div class="list-item"><div><div class="item-title">${escapeHtml(label)}</div></div><span class="badge ${badge}">${escapeHtml(String(value ?? '-'))}</span></div>`; }
function workflowBadge(status) { const s=String(status||'').toUpperCase(); if(['VERIFIED','SYNCED','COMPLETE','REVISION_RESOLVED'].includes(s))return 'success'; if(['SUBMITTED','QUEUED','SYNCING','NEED_REVISION','REOPENED'].includes(s))return 'warning'; if(['REJECTED','FAILED','SYNC_ERROR'].includes(s))return 'danger'; if(['DRAFT_SERVER'].includes(s))return 'info'; return 'neutral'; }
function roleLabel(role) { return {LAPANGAN:'LAPANGAN',ADMIN:'ADMIN',VERIFIER:'VERIFIER',PM_LEADER:'PM / LEADER'}[String(role||'').toUpperCase()] || String(role||'-'); }
function formatNumber(v) { const n=Number(v); return Number.isFinite(n)?(Math.round(n*10)/10).toLocaleString('id-ID'):'-'; }
function formatCoord(v) { const n=Number(v); return Number.isFinite(n)?n.toFixed(6):'-'; }
function formatBytes(bytes) { const n=Number(bytes)||0; if(n<1024)return `${n} B`; if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }
function formatDate(v) { if(!v)return '-'; const d=new Date(v); return isNaN(d)?escapeHtml(String(v)):d.toLocaleString('id-ID'); }
function formatDateTime(v) { return formatDate(v); }
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
