#!/usr/bin/env sh
# Logical backup of the whole database with mongodump (requires MongoDB Database Tools).
# Prefer Atlas continuous/cloud backups in production; use this for ad-hoc copies and migrations.
#   MONGODB_URI=... sh scripts/backup.sh        restore: mongorestore --uri="$MONGODB_URI" --gzip --archive=<file>
set -eu
: "${MONGODB_URI:?Set MONGODB_URI}"
mkdir -p backups
out="backups/heritagehub-$(date +%Y-%m-%d-%H%M).archive.gz"
mongodump --uri="$MONGODB_URI" --gzip --archive="$out"
echo "Wrote $out"
