#!/bin/sh
# 외장하드(미니PC /mnt/backup, FAT32)로 매일 복제한다. docs/deploy.md "외장하드 백업"
# - 녹음 파일 버킷 → /external/tapeletter-backup/files (sync. 지워진 파일은 files-deleted/<날짜>로 옮겨 보관)
# - Postgres 백업 파일 → /external/tapeletter-backup/postgres (copy)
# 외장하드가 빠져 있으면 /external은 내장 저장소의 빈 폴더다. 거기에 쌓이지 않도록
# 외장하드 안의 표식 파일(tapeletter-backup/.target)이 있을 때만 돈다.
set -eu
DEST=/external/tapeletter-backup
if [ ! -f "$DEST/.target" ]; then
  echo "[external] $DEST/.target이 없어 건너뜁니다 (외장하드가 연결·마운트됐는지 확인)" >&2
  exit 1
fi
TODAY=$(date -u +%Y%m%d)
KEEP_DELETED="${EXTERNAL_DELETED_RETENTION:-90d}"
KEEP_PG="${EXTERNAL_POSTGRES_RETENTION:-90d}"
# FAT32는 수정 시각이 2초 단위라 비교할 때 오차를 둔다
FLAGS="--modify-window 2s --transfers 4"

echo "[external] 녹음 파일 → $DEST/files"
rclone sync "store:${S3_BUCKET}" "$DEST/files" --backup-dir "$DEST/files-deleted/${TODAY}" $FLAGS

echo "[external] Postgres 백업 → $DEST/postgres"
rclone copy /backups/postgres "$DEST/postgres" $FLAGS

echo "[external] 보관 기간 지난 파일 정리 (postgres ${KEEP_PG}, files-deleted ${KEEP_DELETED})"
rclone delete "$DEST/postgres" --min-age "$KEEP_PG" || true
rclone delete "$DEST/files-deleted" --min-age "$KEEP_DELETED" --rmdirs || true

date -u +%Y-%m-%dT%H:%M:%SZ > "$DEST/LAST_SUCCESS"
echo "[external] 완료"
