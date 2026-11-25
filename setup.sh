#!/usr/bin/env bash
# Setup otomatis cluster SiRuang (macOS / Linux / Git Bash di Windows)
# Jalankan dari folder ini:  bash setup.sh
set -e
cd "$(dirname "$0")"

echo "[1/6] Menyalakan 17 kontainer (unduhan pertama bisa beberapa menit)..."
docker compose up -d

tunggu_mongo() { # tunggu mongod/mongos bisa diajak bicara
  until docker exec "$1" mongosh --quiet --eval "db.adminCommand({ping:1}).ok" >/dev/null 2>&1; do sleep 2; done
}
tunggu_primary() {
  until docker exec "$1" mongosh --quiet --eval "rs.status().members.some(m => m.stateStr == 'PRIMARY')" 2>/dev/null | grep -q true; do sleep 2; done
}
jalankan_js() { # $1 = kontainer, $2 = file js
  docker cp "scripts/mongo/$2" "$1:/tmp/$2" >/dev/null
  docker exec "$1" mongosh --quiet "/tmp/$2"
}

echo "[2/6] Menunggu semua node MongoDB siap..."
for c in cfg1 cfg2 cfg3 shard01-a shard01-b shard01-c shard02-a shard02-b shard02-c; do tunggu_mongo "$c"; done

echo "[3/6] rs.initiate untuk cfgRS, shard01, shard02..."
for pair in "cfg1 init-cfg.js" "shard01-a init-shard01.js" "shard02-a init-shard02.js"; do
  set -- $pair
  until docker exec "$1" mongosh --quiet --eval "rs.status().ok" >/dev/null 2>&1; do
    jalankan_js "$1" "$2" >/dev/null 2>&1 || true
    sleep 3
  done
  echo "  $1: replica set terbentuk"
done

echo "[4/6] Menunggu election (PRIMARY terpilih)..."
for c in cfg1 shard01-a shard02-a; do tunggu_primary "$c"; echo "  $c: PRIMARY sudah terpilih"; done
tunggu_mongo mongos

echo "[5/6] Sharding, zona, indeks, dan data contoh (lewat mongos)..."
jalankan_js mongos setup-sharding.js

echo "[6/6] Membentuk Redis Cluster (3 master + 3 replika)..."
sleep 3
if docker exec redis-1 redis-cli cluster info | grep -q "cluster_state:ok"; then
  echo "  Redis Cluster sudah terbentuk, dilewati"
else
  docker exec redis-1 redis-cli --cluster create \
    172.30.0.31:6379 172.30.0.32:6379 172.30.0.33:6379 \
    172.30.0.34:6379 172.30.0.35:6379 172.30.0.36:6379 \
    --cluster-replicas 1 --cluster-yes
fi
sleep 3
docker exec redis-1 redis-cli cluster info | grep -E "cluster_state|cluster_known_nodes"

echo
echo "SELESAI."
echo "  Compass  : mongodb://127.0.0.1:27017/?directConnection=true  (lalu tempel scripts/mongo/fungsi.js di panel MONGOSH)"
echo "  Shard01  : mongodb://127.0.0.1:27018/?directConnection=true"
echo "  Shard02  : mongodb://127.0.0.1:27019/?directConnection=true"
echo "  RedisInsight: http://localhost:5540  -> Add database: host 172.30.0.31, port 6379"
