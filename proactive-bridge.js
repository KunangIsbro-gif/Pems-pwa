(async () => {
  'use strict';

  const BRIDGE_VERSION = 'R11N-P0';
  if (!/^(?:https?:\/\/)?apps\.telkomakses\.co\.id$/i.test(location.host) && location.hostname !== 'apps.telkomakses.co.id') {
    alert('PEMS Proactive Bridge hanya dijalankan pada apps.telkomakses.co.id/proactive.');
    return;
  }
  if (!location.pathname.toLowerCase().includes('/proactive/')) {
    alert('Buka halaman Proactive terlebih dahulu.');
    return;
  }

  const scriptSrc = document.currentScript?.src || 'https://kunangisbro-gif.github.io/Pems-pwa/proactive-bridge.js';
  const pemsBase = new URL('./', scriptSrc);
  const pemsOrigin = pemsBase.origin;
  const pemsUrl = pemsBase.href.replace(/#.*$/, '') + '#/admin/proactive-import';

  const clean = v => String(v ?? '').trim();
  const selectedText = el => el?.tagName === 'SELECT'
    ? clean(el.options?.[el.selectedIndex]?.text || el.value)
    : clean(el?.value);

  function bridgeToast(message, tone = 'ok') {
    let box = document.getElementById('pems-proactive-bridge-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pems-proactive-bridge-toast';
      Object.assign(box.style, {
        position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647',
        maxWidth: '360px', padding: '12px 14px', borderRadius: '10px',
        font: '13px/1.4 Arial,sans-serif', boxShadow: '0 10px 30px rgba(0,0,0,.25)'
      });
      document.body.appendChild(box);
    }
    box.style.background = tone === 'bad' ? '#7f1d1d' : '#0f5132';
    box.style.color = '#fff';
    box.textContent = message;
    setTimeout(() => box?.remove(), 7000);
  }

  const controls = [...document.querySelectorAll('input,select,textarea')].map(el => {
    const id = clean(el.id);
    const name = clean(el.name);
    const label = id ? clean(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.innerText) : '';
    return {
      el, id, name, label,
      key: `${id} ${name} ${label} ${clean(el.placeholder)}`.toLowerCase(),
      value: selectedText(el),
      type: clean(el.type).toLowerCase(),
      tag: el.tagName
    };
  });

  const isBoqField = f => /^(?:dsg|uraian|satuan|material|jasa|buy_material|buy_jasa|volume|total)/i.test(f.id || f.name || '');
  const masterFields = controls.filter(f => !isBoqField(f));

  function pick(patterns, fallback = '') {
    for (const pattern of patterns) {
      const hit = masterFields.find(f => pattern.test(f.key) && f.value);
      if (hit) return hit.value;
    }
    return fallback;
  }

  function valueMatching(regex) {
    const hit = masterFields.find(f => regex.test(f.value));
    return hit ? hit.value : '';
  }

  const projectIdFromUrl = clean(new URL(location.href).searchParams.get('project_id'));
  const projectName = pick([
    /nama[_\s-]*project/, /project[_\s-]*name/, /nama[_\s-]*proyek/
  ], clean(masterFields.find(f => f.tag === 'TEXTAREA' && f.value.length > 8)?.value));

  async function lookupAllProject(term) {
    if (!term) return null;
    try {
      const params = new URLSearchParams();
      params.set('draw', '1');
      params.set('start', '0');
      params.set('length', '10');
      params.set('search[value]', term);
      params.set('search[regex]', 'false');
      for (let i = 0; i < 15; i += 1) {
        params.set(`columns[${i}][data]`, String(i));
        params.set(`columns[${i}][name]`, '');
        params.set(`columns[${i}][searchable]`, 'true');
        params.set(`columns[${i}][orderable]`, 'true');
        params.set(`columns[${i}][search][value]`, '');
        params.set(`columns[${i}][search][regex]`, 'false');
      }
      params.set('order[0][column]', '0');
      params.set('order[0][dir]', 'asc');
      params.set('regional', 'PAMASUKA');
      params.set('witel', '38');
      params.set('jenis_eksekusi', '');
      params.set('project_status_id', '');
      params.set('kategori_project', 'after_sap');
      const response = await fetch('/proactive/all_project_server_data.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: params.toString()
      });
      if (!response.ok) return null;
      const json = await response.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      if (!rows.length) return null;
      const exact = rows.find(r => clean(r?.[0]).toUpperCase() === term.toUpperCase()) || rows[0];
      const action = clean(exact?.[14]);
      const hrefId = action.match(/project_id=([^'"&>]+)/i)?.[1] || '';
      return {
        proactiveProjectId: clean(exact?.[0]) && clean(exact?.[0]) !== '-' ? clean(exact?.[0]) : decodeURIComponent(hrefId || term),
        projectIdSap: clean(exact?.[1]),
        projectName: clean(exact?.[2]),
        portfolio: clean(exact?.[3]),
        contractNo: clean(exact?.[4]),
        program: clean(exact?.[5]),
        executionType: clean(exact?.[6]),
        startDate: clean(exact?.[8]),
        endDate: clean(exact?.[9]),
        projectType: clean(exact?.[10]),
        proactiveStatus: clean(exact?.[11]),
        customer: clean(exact?.[12]),
        recordStatus: clean(exact?.[13])
      };
    } catch (_) {
      return null;
    }
  }

  const masterLookup = await lookupAllProject(projectIdFromUrl) || await lookupAllProject(projectName);

  const project = {
    proactiveProjectId: clean(masterLookup?.proactiveProjectId || projectIdFromUrl),
    projectIdSap: clean(masterLookup?.projectIdSap || valueMatching(/^\d{2}KT\d{2}R\d{3}-\d{4}$/i)),
    projectName: clean(masterLookup?.projectName || projectName),
    projectType: clean(masterLookup?.projectType || pick([/tipe[_\s-]*project/, /project[_\s-]*type/])),
    contractType: pick([/tipe[_\s-]*kontrak/, /contract[_\s-]*type/]),
    contractNo: clean(masterLookup?.contractNo || pick([/nomor[_\s-]*kontrak/, /no[_\s-]*kontrak/, /contract[_\s-]*(?:no|number)/])),
    customer: clean(masterLookup?.customer || pick([/customer/, /pelanggan/])),
    startDate: clean(masterLookup?.startDate || pick([/tanggal[_\s-]*mulai/, /tgl[_\s-]*mulai/, /start[_\s-]*date/])),
    endDate: clean(masterLookup?.endDate || pick([/tanggal[_\s-]*selesai/, /tgl[_\s-]*selesai/, /end[_\s-]*date/, /target[_\s-]*(?:date|selesai)/])),
    portfolio: clean(masterLookup?.portfolio || pick([/portofolio/, /portfolio/])),
    program: clean(masterLookup?.program || pick([/program/])),
    executionType: clean(masterLookup?.executionType || pick([/jenis[_\s-]*eksekusi/, /execution[_\s-]*type/])),
    proactiveStatus: clean(masterLookup?.proactiveStatus || pick([/project[_\s-]*status/, /status[_\s-]*project/])),
    recordStatus: clean(masterLookup?.recordStatus || pick([/record[_\s-]*status/])),
    nimonId: valueMatching(/^WORTL-/i),
    package: pick([/package/]),
    location: pick([/(?:^|[_\s-])lokasi(?:$|[_\s-])/]),
    detailLocation: pick([/detail[_\s-]*lokasi/]),
    sourceUrl: location.href
  };

  function rowValue(row, prefix) {
    const el = row.querySelector(`input[id^="${prefix}"],select[id^="${prefix}"],textarea[id^="${prefix}"]`);
    return el ? selectedText(el) : '';
  }

  const boq = [...document.querySelectorAll('select[id^="dsg"]')]
    .map((dsg, index) => {
      const row = dsg.closest('tr');
      if (!row) return null;
      const designator = selectedText(dsg);
      if (!designator) return null;
      return {
        no: index + 1,
        designator,
        uraian: rowValue(row, 'uraian'),
        satuan: rowValue(row, 'satuan'),
        harga_material: rowValue(row, 'material_h') || rowValue(row, 'material'),
        harga_jasa: rowValue(row, 'jasa_h') || rowValue(row, 'jasa'),
        buy_material: rowValue(row, 'buy_material_h') || rowValue(row, 'buy_material'),
        buy_jasa: rowValue(row, 'buy_jasa_h') || rowValue(row, 'buy_jasa'),
        qty: rowValue(row, 'volume'),
        total: rowValue(row, 'total'),
        buy_total: rowValue(row, 'buy_total')
      };
    })
    .filter(Boolean);

  if (!project.proactiveProjectId) {
    bridgeToast('Project ID belum terbaca. Jalankan bridge dari halaman Detail Project (show_initiation.php).', 'bad');
    return;
  }
  if (!boq.length) {
    bridgeToast('BOQ belum terbaca. Buka Step 2 BoQ terlebih dahulu lalu klik bridge lagi.', 'bad');
    return;
  }

  const payload = {
    bridgeVersion: BRIDGE_VERSION,
    capturedAt: new Date().toISOString(),
    sourceUrl: location.href,
    project,
    boq,
    diagnostics: {
      fieldCount: controls.length,
      boqCount: boq.length
    }
  };

  const win = window.open(pemsUrl, 'PEMS_PROACTIVE_IMPORT');
  if (!win) {
    bridgeToast('Popup PEMS diblokir browser. Izinkan popup untuk site Proactive lalu coba lagi.', 'bad');
    return;
  }

  let sent = 0;
  const timer = setInterval(() => {
    try {
      win.postMessage({ type:'PEMS_PROACTIVE_IMPORT_V1', payload }, pemsOrigin);
      sent += 1;
      if (sent === 1) bridgeToast(`Mengirim ${boq.length} item BOQ ke PEMS...`);
      if (sent >= 30) clearInterval(timer);
    } catch (_) {
      clearInterval(timer);
    }
  }, 400);
})();
