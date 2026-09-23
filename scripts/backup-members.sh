#!/bin/bash
# 每日備份 members schema：pg_dump → age 加密 → commit 到 private repo。
# stocks schema 不備份（用爬蟲重建）。
# 排程：Windows 工作排程器每日執行 `bash scripts/backup-members.sh`（Git Bash）。
# 還原：age -d -i key.txt members-YYYYMMDD.sql.age | docker compose exec -T db psql -U postgres -d hub
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
: "${AGE_RECIPIENT:?AGE_RECIPIENT 未設定}"
: "${BACKUP_REPO:?BACKUP_REPO 未設定}"
command -v age >/dev/null || { echo "需要安裝 age：winget install FiloSottile.age" >&2; exit 1; }

out="$BACKUP_REPO/members-$(date +%Y%m%d).sql.age"
docker compose exec -T db pg_dump -U postgres -d hub -n members --no-owner --clean --if-exists \
  | age -r "$AGE_RECIPIENT" > "$out.tmp"
mv "$out.tmp" "$out"

git -C "$BACKUP_REPO" add "$(basename "$out")"
git -C "$BACKUP_REPO" commit -q -m "backup: members $(date +%F)" || echo "無變更"
git -C "$BACKUP_REPO" push -q
echo "備份完成：$out"
