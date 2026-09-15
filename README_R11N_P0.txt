PEMS V15.7.0 Proactive Bridge R11N-P0

Prototype integrasi Proactive -> PEMS tanpa menyimpan credential/session Proactive.

Fitur:
- Admin > Proactive Import.
- Bookmarklet one-time PEMS <- Proactive.
- Bridge membaca current Detail Project + Step 2 BoQ dari DOM Proactive.
- Mengirim payload melalui window.postMessage ke origin PEMS.
- PEMS memvalidasi origin apps.telkomakses.co.id.
- Preview project + BOQ sebelum import.
- Backend membuat/updates Draft Project dan snapshot CSV BOQ otomatis di Drive.
- Raw BOQ Proactive disimpan versioned di 15F_PROACTIVE_BOQ.
- Existing PUBLISHED project diblokir dari import ulang agar baseline tidak berubah diam-diam.
- R11M-P1 Qty filter tetap termasuk.

Tidak disimpan: password, cookie, PHP session, CSRF token, Authorization Proactive.
