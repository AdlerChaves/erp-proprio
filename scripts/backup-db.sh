#!/usr/bin/env bash
# Backup do banco do ERP (pg_dump em formato custom, já comprimido).
#
# Uso:   scripts/backup-db.sh
# Cron:  0 3 * * * /caminho/erp-proprio/scripts/backup-db.sh >> ~/backups/erp-proprio/backup.log 2>&1
#
# Variáveis opcionais:
#   BACKUP_DIR       pasta local dos backups (padrão: ~/backups/erp-proprio)
#   BACKUP_COPY_DIR  segunda cópia, ex.: pasta do OneDrive no Windows (vazio = não copia)
#   BACKUP_KEEP_DAYS quantos dias manter em cada pasta (padrão: 30)
#
# Restaurar:
#   docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < arquivo.dump
# O certificado A1 no banco é cifrado com CHAVE_CERTIFICADOS (.env): guarde essa chave à parte.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/erp-proprio}"
BACKUP_COPY_DIR="${BACKUP_COPY_DIR:-}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

stamp="$(date +%Y-%m-%d_%H%M)"
file="$BACKUP_DIR/erp-$stamp.dump"
tmp="$file.partial"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

echo "[$(date '+%F %T')] iniciando backup -> $file"

# Usa usuário/banco do próprio container: nenhuma senha passa pela linha de comando.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"

# Valida o arquivo antes de considerá-lo um backup (pg_restore --list lê o índice inteiro).
if ! docker compose exec -T db pg_restore --list < "$tmp" > /dev/null; then
  echo "ERRO: dump inválido, mantido em $tmp para análise" >&2
  exit 1
fi
mv "$tmp" "$file"
chmod 600 "$file"
echo "ok: $(du -h "$file" | cut -f1)"

if [[ -n "$BACKUP_COPY_DIR" ]]; then
  mkdir -p "$BACKUP_COPY_DIR"
  cp "$file" "$BACKUP_COPY_DIR/"
  echo "copiado para $BACKUP_COPY_DIR"
  find "$BACKUP_COPY_DIR" -maxdepth 1 -name 'erp-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'erp-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
echo "[$(date '+%F %T')] backup concluído"
