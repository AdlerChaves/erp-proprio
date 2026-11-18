#!/usr/bin/env bash
# Copia o banco do ERP do notebook (Docker local) para o PostgreSQL do Railway. Uso único, na mudança.
#
# Uso:  scripts/migrar-para-railway.sh
#   O script pede o endereço público do banco do Railway (DATABASE_PUBLIC_URL, em Postgres > Variables)
#   sem mostrar na tela, e não o grava em lugar nenhum.
#
# O banco do Railway é SUBSTITUÍDO pelo do notebook (pg_restore --clean). Depois de rodar,
# reinicie o serviço da API no Railway para ela conferir as migrations.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
stamp="$(date +%Y-%m-%d_%H%M)"
arquivo="$HOME/backups/erp-proprio/erp-antes-railway-$stamp.dump"
mkdir -p "$(dirname "$arquivo")"

echo "1/3 Copiando o banco do notebook para $arquivo"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$arquivo"
chmod 600 "$arquivo"
docker compose exec -T db pg_restore --list < "$arquivo" > /dev/null
echo "    ok: $(du -h "$arquivo" | cut -f1)"

read -rsp "2/3 Cole o DATABASE_PUBLIC_URL do Postgres do Railway (não aparece na tela) e tecle Enter: " URL
echo
if [[ "$URL" != postgres* ]]; then
  echo "Isso não parece um endereço postgresql://... Nada foi alterado." >&2
  exit 1
fi

read -rp "    O banco do Railway será SUBSTITUÍDO pelo do notebook. Digite SUBSTITUIR para continuar: " confirma
if [[ "$confirma" != "SUBSTITUIR" ]]; then
  echo "Cancelado. Nada foi alterado no Railway."
  exit 1
fi

echo "3/3 Restaurando no Railway (pode levar alguns minutos)"
# Cliente do PostgreSQL 17: restaura dumps do 16 e conversa com servidor 16 ou 17.
docker run --rm -i --network host -e URL="$URL" postgres:17-alpine \
  sh -c 'pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error -d "$URL"' < "$arquivo"
echo "Pronto. Reinicie o serviço da API no Railway (Deployments > Restart)."
