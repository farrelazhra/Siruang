// Perintah demo Laporan 3.2 A (MONGOSH Compass, koneksi mongos :27017). Tempel scripts/mongo/fungsi.js lebih dulu.
// Jalankan satu blok per langkah, jangan sekaligus.

// ------------------------------------------------------------
// [Laporan 3.2 A no. 1–3] Data fakultas, users, ruangan
// Jalankan di: Compass (koleksi di siruang)
// (Compass → 127.0.0.1:27017 → siruang → buka fakultas, users, ruangan)
// Hasil yang diharapkan: fakultas 7 dokumen · users: Alfaril punya subdokumen internal, Rina punya subdokumen eksternal · ruangan: fasilitas tiap ruangan berbeda

// ------------------------------------------------------------
// [Laporan 3.2 A no. 4] Validasi sharding: jumlah per shard
// Jalankan di: Compass · MONGOSH
db.ruangan.getShardDistribution()
// Hasil yang diharapkan: shard01: docs 4 · shard02: docs 2 · Totals docs 6 (66,66% dan 33,33%)

// ------------------------------------------------------------
// [Laporan 3.2 A no. 4] Validasi sharding: isi tiap shard
// Jalankan di: Compass (koneksi shard01 dan shard02)
// mongodb://127.0.0.1:27018/?directConnection=true
// mongodb://127.0.0.1:27019/?directConnection=true
// Hasil yang diharapkan: shard01 → siruang → ruangan: 4 dokumen (FILKOM dan FT), users dan fakultas berisi semua data · shard02 → siruang → ruangan: 2 dokumen (FEB dan FISIP)

// ------------------------------------------------------------
// [Laporan 3.2 A no. 5] Explain: single shard
// Jalankan di: Compass · MONGOSH
db.ruangan.find({ fakultas_id: "FILKOM" }).explain().queryPlanner.winningPlan.stage
// Hasil yang diharapkan: SINGLE_SHARD

// ------------------------------------------------------------
// [Laporan 3.2 A no. 5] Explain: merge shard
// Jalankan di: Compass · MONGOSH
db.ruangan.find({ kapasitas: { $gte: 40 } }).explain().queryPlanner.winningPlan.stage
// Hasil yang diharapkan: SHARD_MERGE

// ------------------------------------------------------------
// [Laporan 3.2 A no. 6] Modul Katalog: tambah ruangan
// Jalankan di: Compass · MONGOSH
db.ruangan.insertOne({
  _id: "FILKOM-RAPAT-01", fakultas_id: "FILKOM", nama: "Ruang Rapat Lantai 8",
  jenis: "ruang_rapat", gedung: "Gedung F", lantai: 8, kapasitas: 20,
  fasilitas: { meja_rapat: true, tv_konferensi: true, webcam: "Logitech Rally" },
  aturan_peminjaman: { terbuka_eksternal: false, dokumen_wajib: { internal: ["surat_izin_kegiatan"] },
                       maks_sesi_per_pengajuan: 3, min_hari_sebelum: 1 },
  aktif: true })
// Hasil yang diharapkan: { acknowledged: true, insertedId: 'FILKOM-RAPAT-01' }

// ------------------------------------------------------------
// [Laporan 3.2 A no. 6] Modul Katalog: ubah kapasitas
// Jalankan di: Compass · MONGOSH
db.ruangan.updateOne(
  { fakultas_id: "FILKOM", _id: "FILKOM-RAPAT-01" },
  { $set: { kapasitas: 24, "fasilitas.kursi": 24 } })
// Hasil yang diharapkan: matchedCount: 1, modifiedCount: 1

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · A] Skenario 1: A memesan S02 + S03
// Jalankan di: Compass · MONGOSH
ajukanPeminjaman(pengajuanBaru("PGJ-0001", A, "FILKOM-AUD-01", "FILKOM", "2026-12-01", ["S02","S03"],
  [{ tahap: 1, jenis: "sarpras", penanggung: "Sarpras FILKOM", status: "menunggu" }]))
// Hasil yang diharapkan: BERHASIL: PGJ-0001

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · B] Skenario 2: B memesan S03 + S04 (bentrok di S03)
// Jalankan di: Compass · MONGOSH
ajukanPeminjaman(pengajuanBaru("PGJ-0002", B, "FILKOM-AUD-01", "FILKOM", "2026-12-01", ["S03","S04"],
  [{ tahap: 1, jenis: "verifikasi_identitas_dan_surat", penanggung: "Sarpras FILKOM", status: "menunggu" },
   { tahap: 2, jenis: "sarpras", penanggung: "Sarpras FILKOM", status: "belum_dimulai" }]))
// Hasil yang diharapkan: DITOLAK: PGJ-0002 -> E11000 duplicate key error collection: siruang.reservasi_slots index: fakultas_id_1_ruang_id_1...

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · C] Bukti rollback
// Jalankan di: Compass · MONGOSH
db.pengajuan.find({ _id: "PGJ-0002" })
db.reservasi_slots.find({ pengajuan_id: "PGJ-0002" })
// Hasil yang diharapkan: Keduanya kosong

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · D] Skenario 3: B memesan sesi yang masih kosong
// Jalankan di: Compass · MONGOSH
ajukanPeminjaman(pengajuanBaru("PGJ-0003", B, "FILKOM-AUD-01", "FILKOM", "2026-12-01", ["S05","S06"],
  [{ tahap: 1, jenis: "verifikasi_identitas_dan_surat", penanggung: "Sarpras FILKOM", status: "menunggu" },
   { tahap: 2, jenis: "sarpras", penanggung: "Sarpras FILKOM", status: "belum_dimulai" }]))
// Hasil yang diharapkan: BERHASIL: PGJ-0003

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · E] Skenario 4: mahasiswa FILKOM memesan auditorium FEB
// Jalankan di: Compass · MONGOSH
ajukanPeminjaman(pengajuanBaru("PGJ-0004", A, "FEB-AUD-01", "FEB", "2026-12-01", ["S02","S03"],
  [{ tahap: 1, jenis: "verifikasi_asal", penanggung: "Pembina BEM FILKOM", status: "menunggu" },
   { tahap: 2, jenis: "sarpras", penanggung: "Sarpras FEB", status: "belum_dimulai" }]))
// Hasil yang diharapkan: BERHASIL: PGJ-0004 · di Compass koneksi shard02 → siruang → pengajuan, PGJ-0004 ada di sana

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · F] Melihat kalender: slot terisi Auditorium FILKOM 1 Desember
// Jalankan di: Compass · MONGOSH
db.reservasi_slots.find({ fakultas_id: "FILKOM", ruang_id: "FILKOM-AUD-01", tanggal: "2026-12-01" })
// Hasil yang diharapkan: 4 dokumen: S02, S03 (PGJ-0001) dan S05, S06 (PGJ-0003)

// ------------------------------------------------------------
// [Laporan 3.2 A no. 7 · G] Pembatalan
// Jalankan di: Compass · MONGOSH
batalkan("FILKOM", "FILKOM-AUD-01", "PGJ-0003", "USR-009871")
db.reservasi_slots.find({ pengajuan_id: "PGJ-0003" })
// Hasil yang diharapkan: PGJ-0003 dibatalkan, 2 slot dilepas · lalu kosong

// ------------------------------------------------------------
// [Laporan 3.2 A no. 8] Approval: PGJ-0001 (satu tahap)
// Jalankan di: Compass · MONGOSH
setujuiAkhir("FILKOM", "FILKOM-AUD-01", "PGJ-0001", 1, "USR-ADM-FILKOM-01")
// Hasil yang diharapkan: PGJ-0001 DISETUJUI

// ------------------------------------------------------------
// [Laporan 3.2 A no. 8] Approval: PGJ-0004 tahap 1 (bukan tahap terakhir)
// Jalankan di: Compass · MONGOSH
db.pengajuan.updateOne(
  { fakultas_id: "FEB", ruang_id: "FEB-AUD-01", _id: "PGJ-0004",
    alur_persetujuan: { $elemMatch: { tahap: 1, status: "menunggu" } } },
  { $set: { "alur_persetujuan.$[t].status": "disetujui", "alur_persetujuan.$[t].oleh": "Pembina BEM FILKOM",
            "alur_persetujuan.$[t].waktu": new Date(), "alur_persetujuan.$[u].status": "menunggu" },
    $push: { riwayat: { aksi: "disetujui_tahap_1", oleh: "Pembina BEM FILKOM", waktu: new Date() } } },
  { arrayFilters: [ { "t.tahap": 1 }, { "u.tahap": 2 } ] })
// Hasil yang diharapkan: matchedCount: 1, modifiedCount: 1

// ------------------------------------------------------------
// [Laporan 3.2 A no. 8 · A] Approval: PGJ-0004 tahap akhir oleh Sarpras FEB
// Jalankan di: Compass · MONGOSH
setujuiAkhir("FEB", "FEB-AUD-01", "PGJ-0004", 2, "USR-ADM-FEB-01")
db.pengajuan.findOne({ _id: "PGJ-0004", fakultas_id: "FEB" }, { status: 1, alur_persetujuan: 1, riwayat: 1 })
// Hasil yang diharapkan: PGJ-0004 DISETUJUI · dokumen: status disetujui, tahap 1 dan 2 disetujui, riwayat diajukan → disetujui_tahap_1 → disetujui_tahap_2

// ------------------------------------------------------------
// [Laporan 3.2 A no. 9] Notifikasi
// Jalankan di: Compass · MONGOSH
db.notifikasi.insertOne({ user_id: "USR-000123", jenis: "status_pengajuan", judul: "Pengajuan disetujui",
  pesan: "Auditorium Algoritma, 1 Des 2026, sesi 08.00-10.00 disetujui.",
  referensi: { pengajuan_id: "PGJ-0001", fakultas_id: "FILKOM" }, dibaca: false, dibuat_pada: new Date() })
db.notifikasi.find({ user_id: "USR-000123" })
// Hasil yang diharapkan: insertedId ... · lalu dokumen notifikasinya
