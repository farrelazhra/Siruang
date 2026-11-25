# SiRuang: Sistem Informasi Peminjaman Ruang

Proyek akhir mata kuliah **Teknologi Basis Data Non Relational**.
Lapisan basis data untuk platform peminjaman ruangan lintas fakultas Universitas Brawijaya,
yang juga dapat dipakai peminjam dari luar UB.

## Anggota kelompok

| No | NIM | Nama |
|---|---|---|
| 1 | 235170200111017 | Alfaril Dzaky Praptana |
| 2 | 235150707111028 | Muhammad Naufal Farrel Azhra |
| 3 | 235150701111026 | Taqi Talenta Ilmi |

## Arsitektur

SiRuang memakai **polyglot persistence**:

- **MongoDB Sharded Cluster** sebagai penyimpanan utama (users, fakultas, ruangan, pengajuan, reservasi_slots, notifikasi)
  - 2 shard, masing-masing replica set 3 node (1 Primary, 2 Secondary)
  - Config server replica set 3 node (`cfgRS`) dan 1 query router (`mongos`)
  - Zone sharding per fakultas: **ZONA_A** (shard01) = FILKOM, FMIPA, FT; **ZONA_B** (shard02) = FEB, FH, FIB, FISIP
  - Shard key `{ fakultas_id, ruang_id }` untuk ruangan, pengajuan, dan reservasi_slots; `{ user_id: "hashed" }` untuk notifikasi
  - Double-booking dicegah oleh indeks unik `{ fakultas_id, ruang_id, tanggal, sesi }` di `reservasi_slots` dan multi-document transaction
- **Redis Cluster** 3 master + 3 replika untuk data sementara: sesi login, kode OTP, cache kalender, penghitung notifikasi

```
Compass / RedisInsight
   │                         │
 mongos ── config server     Redis Cluster (3 master + 3 replika)
   ├── shard01 (ZONA_A) + users, fakultas
   └── shard02 (ZONA_B)
```

Penjelasan lengkap ada di [`docs/Laporan_SiRuang.pdf`](docs/Laporan_SiRuang.pdf).

## Kebutuhan

- Docker Desktop (Windows: aktifkan WSL 2 / Virtual Machine Platform)
- MongoDB Compass
- RAM minimal 8 GB (17 kontainer berjalan bersamaan)

## Cara menjalankan

1. Clone repositori ini, lalu buka terminal di foldernya.
2. Jalankan setup otomatis (menyalakan 17 kontainer, rs.initiate, addShard, zona, shardCollection, indeks, data awal, dan Redis Cluster):
   - Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File .\setup.ps1`
   - macOS / Linux: `bash setup.sh`
3. Tunggu sampai muncul `SELESAI.`
4. **Compass**: hubungkan ke `mongodb://127.0.0.1:27017/?directConnection=true`, buka panel MONGOSH, lalu tempel isi `scripts/mongo/fungsi.js`.
5. **RedisInsight**: buka `http://localhost:5540` di browser → Add Redis database → host `172.30.0.31`, port `6379`.
   RedisInsight dijalankan sebagai kontainer karena Redis Cluster mengarahkan klien ke IP internal Docker (172.30.0.x).
6. Jalankan perintah demo di folder `scripts/demo/` sesuai urutan.

Mematikan: `docker compose stop` · menyalakan lagi: `docker compose start` · menghapus semua (data hilang): `docker compose down`

## Port

| Layanan | Alamat | Kegunaan |
|---|---|---|
| mongos | `127.0.0.1:27017` | Pintu utama aplikasi ke MongoDB |
| shard01-a | `127.0.0.1:27018` | Melihat isi shard01 (pembuktian) |
| shard02-a | `127.0.0.1:27019` | Melihat isi shard02 (pembuktian) |
| RedisInsight | `http://localhost:5540` | Menjalankan perintah Redis |
| Redis node | `172.30.0.31`–`.36:6379` | Hanya di jaringan Docker `siruang-net` |

## Struktur repositori

```
.
├── docker-compose.yml          Definisi 17 kontainer (Laporan 3.1.1)
├── setup.ps1 / setup.sh        Setup otomatis Laporan 3.1.2 – 3.1.6
├── scripts/
│   ├── mongo/
│   │   ├── init-cfg.js, init-shard01.js, init-shard02.js   rs.initiate (3.1.2)
│   │   ├── setup-sharding.js   addShard, zona, shardCollection, indeks, data awal (3.1.4, 3.1.5, 3.2 no. 1–3)
│   │   └── fungsi.js           pengajuanBaru, ajukanPeminjaman, setujuiAkhir, batalkan (3.2 no. 7–8)
│   └── demo/
│       ├── 01-bab3.1-cek-konfigurasi.txt   Pengecekan hasil konfigurasi cluster
│       ├── 02-bab3.2-mongodb.js            Demo Laporan 3.2 (sharding, explain, katalog, reservasi, approval, notifikasi)
│       ├── 03-bab4-tc01.txt                Skenario uji TC-01
│       └── 04-bab4-tc02.txt                Skenario uji TC-02
└── docs/
    └── Laporan_SiRuang.pdf
```
