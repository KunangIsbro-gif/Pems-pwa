// PEMS V15 — Cosmic FX (desktop saja). Tidak mengubah app.js: hanya mengamati tombol & DOM.
(function () {
  var MQ = "(min-width: 900px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
  if (!window.matchMedia || !window.matchMedia(MQ).matches) return;
  var ROUTE = "M20 88C58 18 92 104 132 58S212 18 258 42";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function sceneKMZ() {
    return '<svg class="fx-map" viewBox="0 0 280 110">' +
      '<g class="fx-grid"><path d="M0 22H280M0 55H280M0 88H280M56 0V110M112 0V110M168 0V110M224 0V110"/></g>' +
      '<g class="fx-contour"><path d="M10 40C60 10 110 70 170 30S250 60 275 20"/><path d="M5 100C70 70 130 105 200 80S260 95 280 70"/></g>' +
      '<path class="fx-route" pathLength="1" d="' + ROUTE + '"/>' +
      '<path class="fx-scrib" pathLength="1" d="M138 28c12-16 34-10 28 6s-30 14-22 30 36 6 44-8"/>' +
      '<circle class="fx-pin" style="animation-delay:.1s" cx="20" cy="88" r="5"/>' +
      '<circle class="fx-pin" style="animation-delay:.9s" cx="132" cy="58" r="5"/>' +
      '<circle class="fx-pin" style="animation-delay:1.55s" cx="258" cy="42" r="5"/>' +
      '<circle class="fx-pen" r="4"><animateMotion dur="1.6s" fill="freeze" path="' + ROUTE +
      '" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1"/></circle></svg>';
  }

  function sceneWORD(target) {
    var title = ("Laporan " + target).slice(0, 24), n = title.length;
    var lines = [[92, 1], [78, 1.4], [96, 1.8], [64, 2.2]];
    return '<div class="fx-doc"><div class="fx-doc-title"><span class="fx-type" style="--n:' + n +
      ';animation-timing-function:steps(' + n + '),step-end">' + esc(title) + '</span></div>' +
      lines.map(function (l) { return '<i style="--w:' + l[0] + '%;--d:' + l[1] + 's"></i>'; }).join("") + '</div>';
  }

  function scenePDF() {
    var pics = [
      '<svg viewBox="0 0 100 70"><rect width="100" height="70" fill="#1d3a63"/><circle cx="72" cy="20" r="9" fill="#ffd36e"/><path d="M0 70L28 30l18 22 14-14 40 32z" fill="#46e3ad"/></svg>',
      '<svg viewBox="0 0 100 70"><rect width="100" height="70" fill="#27345e"/><path d="M50 12a14 14 0 0 1 14 14c0 11-14 28-14 28S36 37 36 26a14 14 0 0 1 14-14z" fill="#ff6b6b"/><circle cx="50" cy="26" r="5" fill="#fff"/></svg>',
      '<svg viewBox="0 0 100 70"><rect width="100" height="70" fill="#1a3b4d"/><path d="M14 58V38h14v20zm22 0V22h14v36zm22 0V30h14v28zm22 0V12h8v46z" fill="#39d9ed"/></svg>'
    ];
    var rot = [-4, 3, 0];
    return '<div class="fx-printer"><i class="fx-slot"></i><b class="fx-led"></b></div><div class="fx-out">' +
      pics.map(function (p, i) {
        return '<div class="fx-sheet" style="--d:' + (i * 0.85) + 's;--r:' + rot[i] + 'deg">' + p + '</div>';
      }).join("") + '</div>';
  }


  var TRASH = '<svg class="trash-ico" viewBox="0 0 24 24" aria-hidden="true"><g class="t-lid"><rect x="4" y="5" width="16" height="2.4" rx="1"/><rect x="9" y="2.6" width="6" height="2.4" rx="1"/></g><path class="t-bin" d="M6 8.6h12l-1 11.2a1.6 1.6 0 0 1-1.6 1.4H8.6A1.6 1.6 0 0 1 7 19.8z"/><rect class="t-p t-p1" x="9" y="0" width="2.4" height="3" rx=".5"/><rect class="t-p t-p2" x="13" y="0" width="2.4" height="3" rx=".5"/></svg>';
  var JOBS = {
    generateKmlKmzBtn:  { kind: "KMZ",     title: "🗺 GENERATE KML / KMZ",   msg: "Menggambar jalur peta…",         ok: "✓ Selesai" },
    generateWordPdfBtn: { kind: "WORDPDF", title: "📄 GENERATE WORD + PDF", msg: "Menulis dokumen, lalu mencetak…", ok: "✓ Job dikirim — berjalan di background" }
  };
  var wrap = null, loop = null, running = null, flip = false;

  function target() {
    var s = document.getElementById("outputProjectSelect");
    return s && s.selectedOptions && s.selectedOptions[0] ? s.selectedOptions[0].text : "Project";
  }
  function render() {
    if (!wrap) return;
    var s;
    if (JOBS[running].kind === "KMZ") s = sceneKMZ();
    else { flip = !flip; s = flip ? sceneWORD(target()) : scenePDF(); }
    wrap.querySelector(".fx-stage").innerHTML = s;
  }
  function start(id) {
    if (wrap) wrap.remove();
    clearInterval(loop);
    running = id;
    var j = JOBS[id];
    wrap = document.createElement("div");
    wrap.className = "fx-wrap fx-live";
    wrap.innerHTML = '<div class="fx-card"><div class="fx-head"><b>' + j.title + '</b><span>' + esc(target()) +
      '</span></div><div class="fx-stage"></div><div class="fx-bar"><i></i></div><div class="fx-msg">' + j.msg + '</div></div>';
    document.body.appendChild(wrap);
    render();
    loop = setInterval(render, 3300);
  }
  function finish() {
    var w = wrap, j = JOBS[running];
    clearInterval(loop); loop = null; wrap = null; running = null;
    if (!w) return;
    setTimeout(function () {
      var t = document.getElementById("toast");
      var bad = t && !t.classList.contains("hidden") && t.classList.contains("danger");
      w.classList.remove("fx-live"); w.classList.add(bad ? "fx-fail" : "fx-done");
      w.querySelector(".fx-msg").textContent = bad ? "✗ Gagal — lihat pesan di layar" : j.ok;
      setTimeout(function () { w.classList.add("fx-out-anim"); }, 1000);
      setTimeout(function () { w.remove(); }, 1300);
    }, 300);
  }

  // Tombol Generate memakai kelas .is-loading saat proses berjalan (setButtonLoadingPEMS_)
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      var el = m.target;
      if (!JOBS[el.id]) return;
      var on = el.classList.contains("is-loading");
      if (on && running !== el.id) start(el.id);
      else if (!on && running === el.id) finish();
    });
  }).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });

  // Ikon tong sampah di tombol Hapus
  var SEL = '[data-delete-server-photo],[data-delete-photo],[data-boq-delete],#fieldActualResetBtn';
  function decorate() {
    document.querySelectorAll(SEL).forEach(function (b) {
      if (b.classList.contains("trash-host")) return;
      b.classList.add("trash-host");
      b.insertAdjacentHTML("afterbegin", TRASH);
    });
  }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; decorate(); });
  }).observe(document.body, { childList: true, subtree: true });
  decorate();

  // Ledakan cahaya saat klik + animasi tong sampah
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".btn,.notif-btn");
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect();
    b.style.setProperty("--cx", (e.clientX - r.left) + "px");
    b.style.setProperty("--cy", (e.clientY - r.top) + "px");
    b.classList.remove("cosmic-burst"); void b.offsetWidth; b.classList.add("cosmic-burst");
    setTimeout(function () { b.classList.remove("cosmic-burst"); }, 700);
    if (b.classList.contains("trash-host")) {
      b.classList.remove("trash-go"); void b.offsetWidth; b.classList.add("trash-go");
      setTimeout(function () { b.classList.remove("trash-go"); }, 1000);
    }
  }, true);
})();
