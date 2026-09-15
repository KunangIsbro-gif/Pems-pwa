PEMS V15.6.1 BOQ Hybrid R11M-P1 — Qty/Volume Filter Patch

Scope: FRONTEND ONLY. Backend tetap R11M.

Perubahan:
1. BOQ Normalized default filter = "Ada Qty/Volume".
2. Filter tersedia:
   - Ada Qty/Volume
   - Semua Item
   - Qty > 0
   - Qty kosong / 0
   - Manual / Koreksi
3. Search Designator / Uraian.
4. Badge counter = item tampil / total item.
5. Hint menampilkan "Menampilkan X dari Y item".
6. Jika tidak ada Qty/Volume tetapi data BOQ ada, tampil pesan bahwa semua item tetap tersimpan dan dapat dilihat via "Semua Item".
7. Edit/Hapus tetap mengacu ke index item asli walaupun tabel sedang difilter.
8. Data backend tidak dihapus/diubah oleh filter.
9. Service Worker cache name dibump agar browser mengambil frontend patch terbaru.

Deploy:
1. Full replace file frontend GitHub dengan isi ZIP ini.
2. Commit ke main.
3. Tunggu GitHub Pages/Cloudflare update.
4. Hard refresh PEMS (Ctrl+Shift+R) satu kali.
5. Buka Admin > Project Setup > Preview / Koreksi BOQ.
6. Default harus tampil "Ada Qty/Volume".

Catatan:
- Patch ini belum mengubah parser multi-level/merged header BOQ. Itu isu engine terpisah dari filter tampilan.
- Backend Apps Script R11M tidak perlu diganti untuk patch ini.
