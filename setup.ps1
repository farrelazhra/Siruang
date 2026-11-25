# Setup otomatis cluster SiRuang (Windows PowerShell)
# Jalankan dari folder ini:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Tunggu-Mongo($c) {
  do { Start-Sleep 2; $r = docker exec $c mongosh --quiet --eval "db.adminCommand({ping:1}).ok" 2>$null } until ("$r" -match "1")
}
function Tunggu-Primary($c) {
  do { Start-Sleep 2; $r = docker exec $c mongosh --quiet --eval "rs.status().members.some(m => m.stateStr == 'PRIMARY')" 2>$null } until ("$r" -match "true")
}
function Jalankan-Js($c, $f) {
  docker cp "scripts/mongo/$f" "${c}:/tmp/$f" | Out-Null
  docker exec $c mongosh --quiet "/tmp/$f"
}

Write-Host "[1/6] Menyalakan 17 kontainer (unduhan pertama bisa beberapa menit)..."
docker compose up -d

Write-Host "[2/6] Menunggu semua node MongoDB siap..."
foreach ($c in "cfg1","cfg2","cfg3","shard01-a","shard01-b","shard01-c","shard02-a","shard02-b","shard02-c") { Tunggu-Mongo $c }

Write-Host "[3/6] rs.initiate untuk cfgRS, shard01, shard02..."
$init = @{ "cfg1"="init-cfg.js"; "shard01-a"="init-shard01.js"; "shard02-a"="init-shard02.js" }
foreach ($c in "cfg1","shard01-a","shard02-a") {
  $ok = docker exec $c mongosh --quiet --eval "rs.status().ok" 2>$null
  while ("$ok" -notmatch "1") {
    Jalankan-Js $c $init[$c] 2>$null | Out-Null
    Start-Sleep 3
    $ok = docker exec $c mongosh --quiet --eval "rs.status().ok" 2>$null
  }
  Write-Host "  ${c}: replica set terbentuk"
}

Write-Host "[4/6] Menunggu election (PRIMARY terpilih)..."
foreach ($c in "cfg1","shard01-a","shard02-a") { Tunggu-Primary $c; Write-Host "  ${c}: PRIMARY sudah terpilih" }
Tunggu-Mongo "mongos"

Write-Host "[5/6] Sharding, zona, indeks, dan data contoh (lewat mongos)..."
Jalankan-Js "mongos" "setup-sharding.js"

Write-Host "[6/6] Membentuk Redis Cluster (3 master + 3 replika)..."
Start-Sleep 3
$ci = docker exec redis-1 redis-cli cluster info
if ("$ci" -match "cluster_state:ok") { Write-Host "  Redis Cluster sudah terbentuk, dilewati" }
else {
  docker exec redis-1 redis-cli --cluster create 172.30.0.31:6379 172.30.0.32:6379 172.30.0.33:6379 172.30.0.34:6379 172.30.0.35:6379 172.30.0.36:6379 --cluster-replicas 1 --cluster-yes
}
Start-Sleep 3
docker exec redis-1 redis-cli cluster info | Select-String "cluster_state","cluster_known_nodes"

Write-Host ""
Write-Host "SELESAI."
Write-Host "  Compass  : mongodb://127.0.0.1:27017/?directConnection=true  (lalu tempel scripts/mongo/fungsi.js di panel MONGOSH)"
Write-Host "  Shard01  : mongodb://127.0.0.1:27018/?directConnection=true"
Write-Host "  Shard02  : mongodb://127.0.0.1:27019/?directConnection=true"
Write-Host "  RedisInsight: http://localhost:5540  -> Add database: host 172.30.0.31, port 6379"
