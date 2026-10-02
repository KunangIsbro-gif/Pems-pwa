// PEMS — penangkap error. Hanya mencatat; tidak mengubah alur aplikasi.
// Log disimpan lokal (30 terakhir). Opsional kirim ke server: isi ERROR_ENDPOINT (https) di config.js.
(function () {
  var KEY = "PEMS_ERROR_LOG", MAX = 30, last = { m: "", t: 0 }, sessionCount = 0;
  var cfg = window.PEMS_CONFIG || {};

  function clean(s, n) {
    return String(s == null ? "" : s)
      .replace(/Bearer\s+[\w.\-]+/gi, "Bearer ***")
      .replace(/([?&#](?:token|key|access_token|id_token|session)=)[^&\s]+/gi, "$1***")
      .slice(0, n || 600);
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-MAX))); } catch (_) {} }

  function record(type, msg, stack, src) {
    msg = clean(msg);
    if (!msg || /ResizeObserver loop/i.test(msg)) return;
    var now = Date.now();
    if (msg === last.m && now - last.t < 5000) return;
    last = { m: msg, t: now };
    var item = {
      t: new Date().toISOString(), type: type, msg: msg, stack: clean(stack, 500), src: clean(src, 200),
      page: clean(location.hash || location.pathname, 120), ver: cfg.APP_VERSION || "-",
      online: navigator.onLine, ua: String(navigator.userAgent).slice(0, 120)
    };
    var a = load(); a.push(item); save(a);
    sessionCount++;
    try {
      if (cfg.ERROR_ENDPOINT && /^https:\/\//.test(cfg.ERROR_ENDPOINT) && navigator.sendBeacon) {
        navigator.sendBeacon(cfg.ERROR_ENDPOINT, JSON.stringify(item));
      }
    } catch (_) {}
    showChip();
  }

  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {                       // gagal memuat file (bukan gambar/peta)
      if (t.tagName === "SCRIPT" || t.tagName === "LINK") record("resource", "Gagal memuat " + t.tagName.toLowerCase(), "", t.src || t.href);
      return;
    }
    record("error", e.message, e.error && e.error.stack, (e.filename || "") + ":" + (e.lineno || 0));
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    record("promise", r && r.message ? r.message : String(r), r && r.stack, "");
  });

  function text() {
    return load().slice(-10).map(function (x) {
      return "[" + x.t + "] " + x.type + " | " + x.msg + " | " + x.page + " | v" + x.ver + (x.online ? "" : " | offline") + (x.src ? "\n  " + x.src : "") + (x.stack ? "\n  " + x.stack.split("\n").slice(0, 3).join("\n  ") : "");
    }).join("\n\n");
  }

  var chip = null;
  function ensureStyle() {
    if (document.getElementById("pemsErrStyle")) return;
    var s = document.createElement("style"); s.id = "pemsErrStyle";
    s.textContent = ".pems-err-chip{position:fixed;left:12px;bottom:12px;z-index:9000;background:#3a1620;color:#ffd0d6;border:1px solid #7f1d3a;border-radius:999px;padding:7px 12px;font:700 12px 'Segoe UI',Arial,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.45)}" +
      ".pems-err-modal{position:fixed;inset:0;z-index:9001;display:grid;place-items:center;background:rgba(3,8,18,.7)}" +
      ".pems-err-box{width:min(640px,94vw);max-height:80vh;display:flex;flex-direction:column;gap:10px;background:#121e34;color:#eaf4ff;border:1px solid #29425f;border-radius:16px;padding:16px;font:13px 'Segoe UI',Arial,sans-serif}" +
      ".pems-err-box pre{margin:0;overflow:auto;background:#0b1626;border-radius:10px;padding:10px;font:11px/1.45 Consolas,monospace;white-space:pre-wrap;color:#c7d6ea}" +
      ".pems-err-box button{background:#1c3d73;color:#fff;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer}";
    document.head.appendChild(s);
  }
  function showChip() {
    if (!document.body) return;
    ensureStyle();
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button"; chip.className = "pems-err-chip";
      chip.addEventListener("click", openModal);
      document.body.appendChild(chip);
    }
    chip.textContent = "⚠ " + sessionCount + " error — lihat";
  }
  function openModal() {
    var m = document.createElement("div"); m.className = "pems-err-modal";
    m.innerHTML = '<div class="pems-err-box"><b>Catatan error (10 terakhir)</b><pre></pre><div style="display:flex;gap:8px;justify-content:flex-end"><button data-a="copy">Salin</button><button data-a="clear">Hapus log</button><button data-a="close">Tutup</button></div></div>';
    m.querySelector("pre").textContent = text() || "Belum ada error tercatat.";
    m.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "copy") { try { navigator.clipboard.writeText(text()); e.target.textContent = "Tersalin ✓"; } catch (_) {} }
      else if (a === "clear") { save([]); sessionCount = 0; m.remove(); if (chip) { chip.remove(); chip = null; } }
      else if (a === "close" || e.target === m) m.remove();
    });
    document.body.appendChild(m);
  }

  window.PEMSErrors = { list: load, dump: text, clear: function () { save([]); } };
})();
