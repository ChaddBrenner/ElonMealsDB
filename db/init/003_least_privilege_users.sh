#!/bin/sh
set -eu

database="${MYSQL_DATABASE:-elon_meals}"
api_user="${MYSQL_API_USER:-elon_api}"
api_password="${MYSQL_API_PASSWORD:-}"
scraper_user="${MYSQL_SCRAPER_USER:-elon_scraper}"
scraper_password="${MYSQL_SCRAPER_PASSWORD:-}"

require_identifier() {
  name="$1"
  value="$2"
  case "$value" in
    ""|*[!A-Za-z0-9_]*)
      echo "Invalid ${name}; use letters, numbers, and underscores only." >&2
      exit 1
      ;;
  esac
}

sql_escape() {
  printf "%s" "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/''/g"
}

require_identifier "MYSQL_DATABASE" "$database"
require_identifier "MYSQL_API_USER" "$api_user"
require_identifier "MYSQL_SCRAPER_USER" "$scraper_user"

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  echo "MYSQL_ROOT_PASSWORD is required to apply database grants." >&2
  exit 1
fi

if [ -z "$api_password" ] || [ -z "$scraper_password" ]; then
  echo "MYSQL_API_PASSWORD and MYSQL_SCRAPER_PASSWORD are required." >&2
  exit 1
fi

if [ "$api_user" = "$scraper_user" ]; then
  echo "MYSQL_API_USER and MYSQL_SCRAPER_USER must be different accounts." >&2
  exit 1
fi

api_password_sql="$(sql_escape "$api_password")"
scraper_password_sql="$(sql_escape "$scraper_password")"

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot <<-EOSQL
CREATE USER IF NOT EXISTS '${api_user}'@'%' IDENTIFIED BY '${api_password_sql}';
ALTER USER '${api_user}'@'%' IDENTIFIED BY '${api_password_sql}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${api_user}'@'%';
GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO '${api_user}'@'%';

CREATE USER IF NOT EXISTS '${scraper_user}'@'%' IDENTIFIED BY '${scraper_password_sql}';
ALTER USER '${scraper_user}'@'%' IDENTIFIED BY '${scraper_password_sql}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${scraper_user}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.* TO '${scraper_user}'@'%';

FLUSH PRIVILEGES;
EOSQL
