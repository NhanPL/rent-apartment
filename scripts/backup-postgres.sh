#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  BACKUP_DATABASE_URL
  BACKUP_ENCRYPTION_PASSWORD
  BACKUP_S3_BUCKET
  BACKUP_S3_KMS_KEY_ID
  AWS_REGION
)
for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required backup variable is missing: ${variable}" >&2
    exit 1
  fi
done

for command in docker openssl aws; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Required backup command is unavailable: ${command}" >&2
    exit 1
  }
done

work_directory="$(mktemp -d)"
trap 'rm -rf "${work_directory}"' EXIT

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
day_of_week="$(date -u +'%u')"
day_of_month="$(date -u +'%d')"
backup_prefix="${BACKUP_S3_PREFIX:-rent-apartment}"
dump_file="${work_directory}/rent-apartment-${timestamp}.dump"
encrypted_file="${dump_file}.enc"

docker run --rm \
  --env BACKUP_DATABASE_URL \
  --volume "${work_directory}:/backup" \
  postgres:17-alpine \
  sh -c 'pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file=/backup/'"$(basename "${dump_file}")"

docker run --rm \
  --volume "${work_directory}:/backup" \
  postgres:17-alpine \
  pg_restore --list "/backup/$(basename "${dump_file}")" >/dev/null

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "${dump_file}" \
  -out "${encrypted_file}" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD

(cd "${work_directory}" && sha256sum "$(basename "${encrypted_file}")" > "$(basename "${encrypted_file}").sha256")
daily_key="${backup_prefix}/daily/$(date -u +'%Y/%m/%d')/$(basename "${encrypted_file}")"

upload_file() {
  local source_file="$1"
  local object_key="$2"
  aws s3 cp "${source_file}" "s3://${BACKUP_S3_BUCKET}/${object_key}" \
    --only-show-errors \
    --checksum-algorithm SHA256 \
    --sse aws:kms \
    --sse-kms-key-id "${BACKUP_S3_KMS_KEY_ID}"
}

copy_object() {
  local source_key="$1"
  local destination_key="$2"
  aws s3 cp "s3://${BACKUP_S3_BUCKET}/${source_key}" \
    "s3://${BACKUP_S3_BUCKET}/${destination_key}" \
    --only-show-errors \
    --sse aws:kms \
    --sse-kms-key-id "${BACKUP_S3_KMS_KEY_ID}"
}

upload_file "${encrypted_file}" "${daily_key}"
upload_file "${encrypted_file}.sha256" "${daily_key}.sha256"

if [[ "${day_of_week}" == "7" ]]; then
  weekly_key="${backup_prefix}/weekly/$(date -u +'%G/week-%V')/$(basename "${encrypted_file}")"
  copy_object "${daily_key}" "${weekly_key}"
  copy_object "${daily_key}.sha256" "${weekly_key}.sha256"
fi

if [[ "${day_of_month}" == "01" ]]; then
  monthly_key="${backup_prefix}/monthly/$(date -u +'%Y/%m')/$(basename "${encrypted_file}")"
  copy_object "${daily_key}" "${monthly_key}"
  copy_object "${daily_key}.sha256" "${monthly_key}.sha256"
fi

aws s3api head-object \
  --bucket "${BACKUP_S3_BUCKET}" \
  --key "${daily_key}" \
  --checksum-mode ENABLED \
  --query ChecksumSHA256 \
  --output text | grep -Ev '^(None|null|)$' >/dev/null

verification_directory="${work_directory}/verification"
mkdir -p "${verification_directory}"
verified_encrypted_file="${verification_directory}/$(basename "${encrypted_file}")"
verified_dump_file="${verification_directory}/verified.dump"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${daily_key}" \
  "${verified_encrypted_file}" --only-show-errors
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${daily_key}.sha256" \
  "${verified_encrypted_file}.sha256" --only-show-errors
(cd "${verification_directory}" && sha256sum --check "$(basename "${verified_encrypted_file}").sha256")
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "${verified_encrypted_file}" \
  -out "${verified_dump_file}" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD
docker run --rm \
  --volume "${verification_directory}:/backup" \
  postgres:17-alpine \
  pg_restore --list "/backup/$(basename "${verified_dump_file}")" >/dev/null

if [[ "${RUN_RESTORE_TEST:-false}" == "true" ]]; then
  restore_container="rent-apartment-restore-${GITHUB_RUN_ID:-local}"
  trap 'docker rm -f "${restore_container}" >/dev/null 2>&1 || true; rm -rf "${work_directory}"' EXIT
  docker run --detach --name "${restore_container}" \
    --env POSTGRES_PASSWORD=restore-test-only \
    postgres:17-alpine >/dev/null
  for _ in {1..30}; do
    if docker exec "${restore_container}" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "${restore_container}" pg_isready -U postgres >/dev/null
  docker exec "${restore_container}" createdb -U postgres rent_apartment_restore
  docker cp "${verified_dump_file}" "${restore_container}:/tmp/restore.dump" >/dev/null
  docker exec "${restore_container}" pg_restore \
    --exit-on-error --no-owner --no-acl \
    --username postgres --dbname rent_apartment_restore /tmp/restore.dump
  docker exec "${restore_container}" psql \
    --username postgres --dbname rent_apartment_restore \
    --tuples-only --command 'SELECT count(*) FROM schema_migrations' >/dev/null
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "object_key=${daily_key}" >> "${GITHUB_OUTPUT}"
fi

echo "Encrypted PostgreSQL backup uploaded and verified: ${daily_key}"
