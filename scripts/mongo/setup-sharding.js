// Dijalankan otomatis oleh setup.sh / setup.ps1 lewat mongos.
// Isinya sama dengan Bab 3.1.4 dan 3.1.5 laporan + data contoh.

function langkah(t) { print("\n=== " + t + " ==="); }
function coba(f) { try { return f(); } catch (e) { print("  (dilewati: " + e.message + ")"); } }

langkah("a. Mendaftarkan shard");
coba(() => sh.addShard("shard01/shard01-a:27017,shard01-b:27017,shard01-c:27017"));
coba(() => sh.addShard("shard02/shard02-a:27017,shard02-b:27017,shard02-c:27017"));
printjson(db.adminCommand({ listShards: 1 }).shards.map(s => s._id));

langkah("b. enableSharding + primary shard = shard01");
coba(() => sh.enableSharding("siruang"));
const infoDb = db.getSiblingDB("config").databases.findOne({ _id: "siruang" });
if (infoDb && infoDb.primary !== "shard01") {
  coba(() => db.adminCommand({ movePrimary: "siruang", to: "shard01" }));
}
print("  primary shard: " + db.getSiblingDB("config").databases.findOne({ _id: "siruang" }).primary);

langkah("c. Zona per fakultas (rentang bersambung, urut abjad)");
coba(() => sh.addShardToZone("shard01", "ZONA_A"));
coba(() => sh.addShardToZone("shard02", "ZONA_B"));
var URUTAN = [ ["FEB","ZONA_B"], ["FH","ZONA_B"], ["FIB","ZONA_B"],
               ["FILKOM","ZONA_A"], ["FISIP","ZONA_B"],
               ["FMIPA","ZONA_A"], ["FT","ZONA_A"] ];
var KOLEKSI = [ { ns: "siruang.ruangan",         field2: "_id" },
                { ns: "siruang.pengajuan",       field2: "ruang_id" },
                { ns: "siruang.reservasi_slots", field2: "ruang_id" } ];
for (const k of KOLEKSI) {
  URUTAN.forEach(([fak, zona], i) => {
    const min = { fakultas_id: fak, [k.field2]: MinKey() };
    const max = (i + 1 < URUTAN.length)
      ? { fakultas_id: URUTAN[i + 1][0], [k.field2]: MinKey() }
      : { fakultas_id: MaxKey(), [k.field2]: MaxKey() };
    coba(() => sh.updateZoneKeyRange(k.ns, min, max, zona));
  });
}

langkah("d. shardCollection");
coba(() => sh.shardCollection("siruang.ruangan",         { fakultas_id: 1, _id: 1 }));
coba(() => sh.shardCollection("siruang.pengajuan",       { fakultas_id: 1, ruang_id: 1 }));
coba(() => sh.shardCollection("siruang.reservasi_slots", { fakultas_id: 1, ruang_id: 1 }));
coba(() => sh.shardCollection("siruang.notifikasi",      { user_id: "hashed" }));

langkah("Indexing (3.1.5)");
const d = db.getSiblingDB("siruang");
d.users.createIndex({ email: 1 }, { unique: true });
d.users.createIndex({ "internal.nim_nip": 1 }, { unique: true, partialFilterExpression: { jenis: "internal" } });
d.ruangan.createIndex({ fakultas_id: 1, jenis: 1, kapasitas: 1 });
d.reservasi_slots.createIndex({ fakultas_id: 1, ruang_id: 1, tanggal: 1, sesi: 1 }, { unique: true });
d.pengajuan.createIndex({ fakultas_id: 1, status: 1, dibuat_pada: -1 });
d.pengajuan.createIndex({ "peminjam.user_id": 1, dibuat_pada: -1 });
d.pengajuan.createIndex({ status: 1, batas_proses: 1 });
d.notifikasi.createIndex({ user_id: 1, dibuat_pada: -1 });
d.notifikasi.createIndex({ dibuat_pada: 1 }, { expireAfterSeconds: 7776000 });
print("  indeks dibuat");

langkah("Data contoh");
if (d.fakultas.countDocuments() === 0) {
  d.fakultas.insertMany([
    { _id: "FEB",    nama: "Fakultas Ekonomi dan Bisnis",     zona: "B", aktif: true },
    { _id: "FH",     nama: "Fakultas Hukum",                  zona: "B", aktif: true },
    { _id: "FIB",    nama: "Fakultas Ilmu Budaya",            zona: "B", aktif: true },
    { _id: "FILKOM", nama: "Fakultas Ilmu Komputer",          zona: "A", aktif: true },
    { _id: "FISIP",  nama: "Fakultas Ilmu Sosial dan Ilmu Politik", zona: "B", aktif: true },
    { _id: "FMIPA",  nama: "Fakultas MIPA",                   zona: "A", aktif: true },
    { _id: "FT",     nama: "Fakultas Teknik",                 zona: "A", aktif: true }
  ]);
  d.users.insertMany([
    { _id: "USR-000123", jenis: "internal", nama: "Alfaril Dzaky Praptana", email: "alfaril@student.ub.ac.id",
      peran: ["peminjam"], internal: { nim_nip: "235170200111017", fakultas_id: "FILKOM",
      organisasi: [{ nama: "BEM FILKOM", jabatan: "Staf Kementerian Advokesma" }] }, dibuat_pada: new Date() },
    { _id: "USR-009871", jenis: "eksternal", nama: "Rina Kartika", email: "rina.kartika@gmail.com",
      password_hash: "$2b$12$contoh", peran: ["peminjam"],
      eksternal: { instansi: "Himpunan Mahasiswa Informatika UM", jenis_instansi: "kampus_lain",
                   status_verifikasi: "terverifikasi" }, email_terverifikasi: true, dibuat_pada: new Date() },
    { _id: "USR-ADM-FILKOM-01", jenis: "internal", nama: "Admin Sarpras FILKOM", email: "sarpras.filkom@ub.ac.id",
      peran: ["admin_sarpras"], internal: { nim_nip: "1987000001", fakultas_id: "FILKOM" }, fakultas_kelola: "FILKOM" },
    { _id: "USR-ADM-FEB-01", jenis: "internal", nama: "Admin Sarpras FEB", email: "sarpras.feb@ub.ac.id",
      peran: ["admin_sarpras"], internal: { nim_nip: "1987000002", fakultas_id: "FEB" }, fakultas_kelola: "FEB" }
  ]);
  d.ruangan.insertMany([
    { _id: "FILKOM-AUD-01", fakultas_id: "FILKOM", nama: "Auditorium Algoritma", jenis: "auditorium",
      gedung: "Gedung G", lantai: 1, kapasitas: 400,
      fasilitas: { sound_system: { speaker: 8, mic_wireless: 4, mixer: true }, panggung: { luas_m2: 60 }, proyektor: 2 },
      aturan_peminjaman: { terbuka_eksternal: true,
        dokumen_wajib: { internal: ["surat_izin_kegiatan"], eksternal: ["surat_permohonan_instansi", "proposal_kegiatan"] },
        maks_sesi_per_pengajuan: 10, min_hari_sebelum: 7 }, aktif: true },
    { _id: "FILKOM-LAB-KOMP-03", fakultas_id: "FILKOM", nama: "Laboratorium Komputer 3", jenis: "laboratorium",
      gedung: "Gedung F", lantai: 3, kapasitas: 40,
      fasilitas: { pc: { jumlah: 40, spesifikasi: "Intel i7, RAM 16GB" }, proyektor: true, ac: 2 },
      aturan_peminjaman: { terbuka_eksternal: false, dokumen_wajib: { internal: ["surat_izin_kegiatan"] },
        maks_sesi_per_pengajuan: 4, min_hari_sebelum: 3 }, aktif: true },
    { _id: "FILKOM-GKM-02", fakultas_id: "FILKOM", nama: "Ruang Kelas GKM 2.2", jenis: "ruang_kelas",
      gedung: "Gedung Kreativitas Mahasiswa", lantai: 2, kapasitas: 60,
      fasilitas: { kursi: 60, proyektor: true },
      aturan_peminjaman: { terbuka_eksternal: true, maks_sesi_per_pengajuan: 6, min_hari_sebelum: 2 }, aktif: true },
    { _id: "FT-AUD-01", fakultas_id: "FT", nama: "Auditorium FT", jenis: "auditorium",
      gedung: "Gedung Dekanat FT", lantai: 1, kapasitas: 300, fasilitas: { proyektor: 2 },
      aturan_peminjaman: { terbuka_eksternal: true, maks_sesi_per_pengajuan: 8, min_hari_sebelum: 7 }, aktif: true },
    { _id: "FEB-AUD-01", fakultas_id: "FEB", nama: "Auditorium FEB", jenis: "auditorium",
      gedung: "Gedung Utama FEB", lantai: 1, kapasitas: 350, fasilitas: { proyektor: 2, sound_system: { speaker: 6 } },
      aturan_peminjaman: { terbuka_eksternal: true, maks_sesi_per_pengajuan: 10, min_hari_sebelum: 7 }, aktif: true },
    { _id: "FISIP-KELAS-01", fakultas_id: "FISIP", nama: "Ruang Kelas FISIP A1", jenis: "ruang_kelas",
      gedung: "Gedung A FISIP", lantai: 1, kapasitas: 50, fasilitas: { kursi: 50, proyektor: true },
      aturan_peminjaman: { terbuka_eksternal: false, maks_sesi_per_pengajuan: 4, min_hari_sebelum: 2 }, aktif: true }
  ]);
  print("  data contoh dimasukkan: 7 fakultas, 4 users, 6 ruangan");
} else {
  print("  data contoh sudah ada, dilewati");
}

langkah("Selesai. Ringkasan cluster:");
sh.status();
