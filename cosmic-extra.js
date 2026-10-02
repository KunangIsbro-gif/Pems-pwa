// PEMS V15 — ikon tombol (semua perangkat) + efek tambahan (desktop saja). Tidak mengubah app.js.
(function () {
  var ICON = {
    save: '<svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l4 4v14H5z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/><path class="ic-check" d="M8 17l2.6 2.6L16 14"/></svg>',
    newfile: '<svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/></svg>',
    user: '<svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><circle class="ic-halo" cx="10" cy="8" r="5.5"/><circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"/><path class="ic-check" d="M16 6l2 2 3.5-3.5"/></svg>',
    worker: '<svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><circle class="ic-halo" cx="10" cy="9.5" r="5.5"/><circle cx="10" cy="9.5" r="2.9"/><path d="M4 21c0-3.4 2.7-5.4 6-5.4s6 2 6 5.4"/><path class="ic-helmet" d="M6.2 8a3.8 3.8 0 0 1 7.6 0z"/><path d="M5 8h10"/><path class="ic-check" d="M16 6l2 2 3.5-3.5"/></svg>'
  };
  var MAP = { saveProjectBtn: "save", saveMasterDataBtn: "save", resetProjectBtn: "newfile", resetMasterDataBtn: "newfile", saveUserBtn: "user", saveAssignmentBtn: "worker" };

  function decorate() {
    Object.keys(MAP).forEach(function (id) {
      var b = document.getElementById(id);
      if (!b || b.querySelector(".btn-ico")) return;
      b.insertAdjacentHTML("afterbegin", ICON[MAP[id]]);
    });
  }
  var pend = false;
  new MutationObserver(function () {
    if (pend) return; pend = true;
    requestAnimationFrame(function () { pend = false; decorate(); });
  }).observe(document.body, { childList: true, subtree: true });
  decorate();

  // ---- efek di bawah ini hanya untuk laptop/desktop ----
  if (!window.matchMedia || !window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;

  // 1. Login: sinyal jaringan
  var msg = document.getElementById("loginMessage");
  if (msg && !document.querySelector(".fx-signal")) {
    msg.insertAdjacentHTML("beforebegin", '<div class="fx-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>');
  }

  // 2. Loader halaman: ganti teks "Memuat..." bawaan dengan orbit planet
  var content = document.getElementById("content");
  if (content) {
    new MutationObserver(function () {
      var c = content.firstElementChild;
      if (content.children.length === 1 && c && c.classList.contains("empty") && c.textContent.trim() === "Memuat...") {
        c.className = "fx-load";
        c.innerHTML = '<div class="fx-orbit"><i class="fx-ring"></i><i class="fx-planet"></i><i class="fx-moon"></i><i class="fx-moon m2"></i></div><div class="fx-load-txt">MEMUAT DATA<span>...</span></div>';
      }
    }).observe(content, { childList: true });
  }

  // 7. Admin: animasi "tersimpan" setelah toast sukses
  var lastSave = null, toastEl = document.getElementById("toast");
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#saveProjectBtn,#saveMasterDataBtn,#saveUserBtn,#saveAssignmentBtn");
    if (b) lastSave = { el: b, t: Date.now() };
  }, true);
  if (toastEl) {
    new MutationObserver(function () {
      if (!lastSave || toastEl.classList.contains("hidden")) return;
      if (Date.now() - lastSave.t > 20000) { lastSave = null; return; }
      if (toastEl.classList.contains("success")) {
        var b = lastSave.el; lastSave = null;
        b.classList.remove("fx-saved"); void b.offsetWidth; b.classList.add("fx-saved");
        setTimeout(function () { b.classList.remove("fx-saved"); }, 1800);
      } else if (toastEl.classList.contains("danger") || toastEl.classList.contains("warning")) lastSave = null;
    }).observe(toastEl, { attributes: true, attributeFilter: ["class"] });
  }
})();
