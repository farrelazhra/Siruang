// ===== Tempel SELURUH isi file ini ke panel MONGOSH di Compass (koneksi mongos :27017) =====
// Fungsi-fungsi ini hilang kalau Compass ditutup. Tempel ulang setiap membuka Compass.

db = db.getSiblingDB("siruang");

// Snapshot peminjam (variabel A dan B di laporan)
var A = { user_id: "USR-000123", nama: "Alfaril Dzaky Praptana", jenis: "internal",
          asal: { fakultas_id: "FILKOM", organisasi: "BEM FILKOM" } };
var B = { user_id: "USR-009871", nama: "Rina Kartika", jenis: "eksternal",
          asal: { instansi: "Himpunan Mahasiswa Informatika UM" } };

// Membuat dokumen pengajuan (data ruangan disalin sebagai snapshot)
function pengajuanBaru(id, peminjam, ruangId, fakultasId, tanggal, sesi, alur) {
  const r = db.getSiblingDB("siruang").ruangan.findOne({ fakultas_id: fakultasId, _id: ruangId });
  if (!r) throw new Error("ruangan " + ruangId + " tidak ditemukan");
  return {
    _id: id, fakultas_id: fakultasId, ruang_id: ruangId, peminjam: peminjam,
    ruangan: { nama: r.nama, gedung: r.gedung, kapasitas: r.kapasitas },
    tanggal: tanggal, sesi: sesi,
    kegiatan: { nama: "Kegiatan " + id, tujuan: "Latihan demo", perkiraan_peserta: 30 },
    dokumen: [], status: "menunggu",
    alur_persetujuan: alur || [ { tahap: 1, jenis: "sarpras", penanggung: "Sarpras " + fakultasId, status: "menunggu" } ],
    riwayat: [ { aksi: "diajukan", oleh: peminjam.user_id, waktu: new Date() } ],
    batas_proses: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    dibuat_pada: new Date()
  };
}

// Pengajuan + slot dalam satu transaksi (pencegah double-booking)
function ajukanPeminjaman(p) {
  const session = db.getMongo().startSession();
  const sdb = session.getDatabase("siruang");
  session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  try {
    sdb.pengajuan.insertOne(p);
    sdb.reservasi_slots.insertMany(p.sesi.map(sesi => ({
      fakultas_id: p.fakultas_id, ruang_id: p.ruang_id, tanggal: p.tanggal,
      sesi: sesi, pengajuan_id: p._id, status: "menunggu", dibuat_pada: new Date()
    })));
    session.commitTransaction();
    return "BERHASIL: " + p._id;
  } catch (e) {
    try { session.abortTransaction(); } catch (_) {}
    return "DITOLAK: " + p._id + " -> " + e.message;
  } finally {
    session.endSession();
  }
}

// Persetujuan tahap terakhir: pengajuan + slot berubah bersama
function setujuiAkhir(fakultasId, ruangId, pengajuanId, tahap, oleh) {
  const session = db.getMongo().startSession();
  const sdb = session.getDatabase("siruang");
  session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  try {
    const r = sdb.pengajuan.updateOne(
      { fakultas_id: fakultasId, ruang_id: ruangId, _id: pengajuanId,
        alur_persetujuan: { $elemMatch: { tahap: tahap, status: "menunggu" } } },
      { $set: { "alur_persetujuan.$[t].status": "disetujui",
                "alur_persetujuan.$[t].oleh": oleh,
                "alur_persetujuan.$[t].waktu": new Date(),
                status: "disetujui" },
        $push: { riwayat: { aksi: "disetujui_tahap_" + tahap, oleh: oleh, waktu: new Date() } } },
      { arrayFilters: [ { "t.tahap": tahap } ] }
    );
    if (r.matchedCount === 0) throw new Error("tahap " + tahap + " tidak sedang menunggu");
    sdb.reservasi_slots.updateMany(
      { fakultas_id: fakultasId, ruang_id: ruangId, pengajuan_id: pengajuanId },
      { $set: { status: "disetujui" } }
    );
    session.commitTransaction();
    return pengajuanId + " DISETUJUI";
  } catch (e) {
    try { session.abortTransaction(); } catch (_) {}
    return "Gagal: " + e.message;
  } finally {
    session.endSession();
  }
}

// Pembatalan: status diubah + slot dilepas dalam satu transaksi
function batalkan(fakultasId, ruangId, pengajuanId, oleh) {
  const session = db.getMongo().startSession();
  const sdb = session.getDatabase("siruang");
  session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  try {
    sdb.pengajuan.updateOne(
      { fakultas_id: fakultasId, ruang_id: ruangId, _id: pengajuanId },
      { $set: { status: "dibatalkan" },
        $push: { riwayat: { aksi: "dibatalkan", oleh: oleh, waktu: new Date() } } }
    );
    const r = sdb.reservasi_slots.deleteMany(
      { fakultas_id: fakultasId, ruang_id: ruangId, pengajuan_id: pengajuanId }
    );
    session.commitTransaction();
    return pengajuanId + " dibatalkan, " + r.deletedCount + " slot dilepas";
  } catch (e) {
    try { session.abortTransaction(); } catch (_) {}
    return "Gagal: " + e.message;
  } finally {
    session.endSession();
  }
}

"Fungsi siap: pengajuanBaru, ajukanPeminjaman, setujuiAkhir, batalkan (variabel A dan B juga siap)";
