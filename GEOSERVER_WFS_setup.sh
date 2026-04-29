#!/usr/bin/env bash
set -euo pipefail

GEOSERVER_VERSION="2.25.2"
GEOSERVER_ZIP_URL="https://sourceforge.net/projects/geoserver/files/GeoServer/${GEOSERVER_VERSION}/geoserver-${GEOSERVER_VERSION}-bin.zip/download"
GEOSERVER_HOME="/opt/geoserver"
GEOSERVER_DATA_DIR="/opt/geoserver_data"
GEOSERVER_TMP="/tmp/geoserver-setup"

AUTH_HOME="/opt/geoserver-auth"
AUTH_ENV_FILE="/etc/geoserver-auth.env"
AUTH_BIND="127.0.0.1:5000"

NGINX_SITE_NAME="dide"
NODE_UPSTREAM="127.0.0.1:3000"
GEOSERVER_UPSTREAM="127.0.0.1:8080"

WORKSPACE="dide_workspace"
DATASTORE="dide_datastore"
DB_SCHEMA="public"

USERS_TABLE="public.users"
USERS_USERNAME_COL="username"
USERS_ACTIVE_COL="is_active"
USERS_PWHASH_COL="password_hash"

ENV_FILE=""
declare -a TABLE_SPECS=()

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo -e "\n=== $* ==="; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"; }
is_root() { [[ "${EUID:-$(id -u)}" -eq 0 ]]; }

sanitize_ident() { echo "$1" | sed -E 's/[^a-zA-Z0-9_]+/_/g' | sed -E 's/^_+|_+$//g' | cut -c1-60; }
sql_quote_literal() { local s="$1"; s="${s//\'/\'\'}"; printf "'%s'" "$s"; }
looks_numeric() { [[ "$1" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; }

usage() {
  cat <<'USAGE'
Usage:
  sudo bash GEOSERVER_WFS_setup.sh [options] --tables "table,col,val" ["table,col,val" ...]

Required:
  --env-file PATH
  --gs-admin-user USER
  --gs-admin-pass PASS
  --tables "t,c,v" ...    (repeatable)

Optional:
  --workspace NAME
  --datastore NAME
  --db-schema NAME
  --users-table schema.table
  --users-username-col COL
  --users-active-col COL
  --users-pwhash-col COL
  --geoserver-version VER
  --node-upstream HOST:PORT
  --server-name NAME
USAGE
}

GS_ADMIN_USER=""
GS_ADMIN_PASS=""
NGINX_SERVER_NAME="_"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2;;
    --gs-admin-user) GS_ADMIN_USER="$2"; shift 2;;
    --gs-admin-pass) GS_ADMIN_PASS="$2"; shift 2;;
    --workspace) WORKSPACE="$2"; shift 2;;
    --datastore) DATASTORE="$2"; shift 2;;
    --db-schema) DB_SCHEMA="$2"; shift 2;;

    --users-table) USERS_TABLE="$2"; shift 2;;
    --users-username-col) USERS_USERNAME_COL="$2"; shift 2;;
    --users-active-col) USERS_ACTIVE_COL="$2"; shift 2;;
    --users-pwhash-col) USERS_PWHASH_COL="$2"; shift 2;;

    --geoserver-version)
      GEOSERVER_VERSION="$2"
      GEOSERVER_ZIP_URL="https://sourceforge.net/projects/geoserver/files/GeoServer/${GEOSERVER_VERSION}/geoserver-${GEOSERVER_VERSION}-bin.zip/download"
      shift 2
      ;;
    --node-upstream) NODE_UPSTREAM="$2"; shift 2;;
    --server-name) NGINX_SERVER_NAME="$2"; shift 2;;

    --tables)
      shift
      while [[ $# -gt 0 && "$1" != --* ]]; do
        TABLE_SPECS+=("$1")
        shift
      done
      ;;
    -h|--help) usage; exit 0;;
    *) die "Unknown argument: $1 (use --help)";;
  esac
done

[[ -n "$ENV_FILE" ]] || die "--env-file is required"
[[ -f "$ENV_FILE" ]] || die "env file not found: $ENV_FILE"
[[ -n "$GS_ADMIN_USER" ]] || die "--gs-admin-user is required"
[[ -n "$GS_ADMIN_PASS" ]] || die "--gs-admin-pass is required"
[[ ${#TABLE_SPECS[@]} -gt 0 ]] || die "--tables is required (at least one spec)"
is_root || die "Run as root (use sudo)."

log "Loading environment from $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${PGHOST:?PGHOST missing in env file}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE missing in env file}"
: "${PGUSER:?PGUSER missing in env file}"
: "${PGPASSWORD:?PGPASSWORD missing in env file}"
export PGPASSWORD

if [[ "$NODE_UPSTREAM" == "127.0.0.1:3000" && -n "${PORT:-}" ]]; then
  NODE_UPSTREAM="127.0.0.1:${PORT}"
fi

log "Installing packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y unzip curl wget openjdk-17-jre-headless python3-venv python3-pip postgresql-client nginx

need_cmd curl
need_cmd psql
need_cmd nginx
need_cmd java
need_cmd unzip

log "Creating system users and directories"
adduser --system --group --home "$GEOSERVER_HOME" --shell /usr/sbin/nologin geoserver >/dev/null 2>&1 || true
adduser --system --group --home "$AUTH_HOME" --shell /usr/sbin/nologin geoserver-auth >/dev/null 2>&1 || true

# Ensure dide-app group exists and add geoserver + geoserver-auth to it
groupadd dide-app 2>/dev/null || true
usermod -aG dide-app geoserver 2>/dev/null || true
usermod -aG dide-app geoserver-auth 2>/dev/null || true

# Ensure .env file is readable by dide-app group
if [[ -f "$ENV_FILE" ]]; then
  ENV_DIR="$(dirname "$ENV_FILE")"
  chgrp dide-app "$ENV_FILE" 2>/dev/null || true
  chmod g+r "$ENV_FILE" 2>/dev/null || true
  chmod g+rx "$ENV_DIR" 2>/dev/null || true
fi

mkdir -p "$GEOSERVER_HOME" "$GEOSERVER_DATA_DIR" "$GEOSERVER_TMP"
chown -R geoserver:geoserver "$GEOSERVER_HOME" "$GEOSERVER_DATA_DIR" "$GEOSERVER_TMP"

mkdir -p "$AUTH_HOME"
chown -R geoserver-auth:geoserver-auth "$AUTH_HOME"

if [[ ! -f "$GEOSERVER_HOME/start.jar" ]]; then
  log "Downloading and installing GeoServer ${GEOSERVER_VERSION}"
  tmpzip="/tmp/geoserver-${GEOSERVER_VERSION}-bin.zip"
  rm -f "$tmpzip"
  wget -O "$tmpzip" "$GEOSERVER_ZIP_URL"

  rm -rf "$GEOSERVER_TMP/geoserver-unpack"
  mkdir -p "$GEOSERVER_TMP/geoserver-unpack"
  unzip -q "$tmpzip" -d "$GEOSERVER_TMP/geoserver-unpack"

  inner_dir="$(find "$GEOSERVER_TMP/geoserver-unpack" -maxdepth 1 -type d -name 'geoserver-*' | head -n 1 || true)"
  if [[ -z "$inner_dir" ]]; then
    inner_dir="$GEOSERVER_TMP/geoserver-unpack"
  fi
  rm -rf "${GEOSERVER_HOME:?}"/*
  shopt -s dotglob
  mv "$inner_dir"/* "$GEOSERVER_HOME"/
  shopt -u dotglob
  chown -R geoserver:geoserver "$GEOSERVER_HOME"
fi

log "Configuring systemd service for GeoServer"
cat >/etc/systemd/system/geoserver.service <<EOF
[Unit]
Description=GeoServer (Jetty)
After=network.target

[Service]
User=geoserver
Group=geoserver
WorkingDirectory=${GEOSERVER_HOME}
Environment=GEOSERVER_DATA_DIR=${GEOSERVER_DATA_DIR}
ExecStart=/usr/bin/java -Xms512m -Xmx2048m -DGEOSERVER_DATA_DIR=${GEOSERVER_DATA_DIR} -jar start.jar
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now geoserver

log "Waiting for GeoServer on ${GEOSERVER_UPSTREAM}"
for i in {1..60}; do
  if curl -fsS "http://${GEOSERVER_UPSTREAM}/geoserver/web/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

log "Writing auth service env file"
cat >"$AUTH_ENV_FILE" <<EOF
PGHOST=${PGHOST}
PGPORT=${PGPORT}
PGDATABASE=${PGDATABASE}
PGUSER=${PGUSER}
PGPASSWORD=${PGPASSWORD}

USERS_TABLE=${USERS_TABLE}
USERS_USERNAME_COL=${USERS_USERNAME_COL}
USERS_ACTIVE_COL=${USERS_ACTIVE_COL}
USERS_PWHASH_COL=${USERS_PWHASH_COL}
EOF
chown root:geoserver-auth "$AUTH_ENV_FILE"
chmod 640 "$AUTH_ENV_FILE"

log "Installing auth service (Flask/Gunicorn)"
cat >"${AUTH_HOME}/app.py" <<'PY'
import base64
import os
from flask import Flask, request, Response
import psycopg2
import bcrypt

app = Flask(__name__)

def get_env(name: str, default=None):
    v = os.getenv(name)
    return v if v not in (None, "") else default

def get_conn():
    return psycopg2.connect(
        host=get_env("PGHOST", "127.0.0.1"),
        port=int(get_env("PGPORT", "5432")),
        dbname=get_env("PGDATABASE"),
        user=get_env("PGUSER"),
        password=get_env("PGPASSWORD"),
    )

USERS_TABLE = get_env("USERS_TABLE", "public.users")
USERS_USERNAME_COL = get_env("USERS_USERNAME_COL", "username")
USERS_ACTIVE_COL = get_env("USERS_ACTIVE_COL", "is_active")
USERS_PWHASH_COL = get_env("USERS_PWHASH_COL", "password_hash")

def check_user(username: str, password: str) -> bool:
    sql = f"SELECT {USERS_PWHASH_COL} FROM {USERS_TABLE} WHERE {USERS_USERNAME_COL}=%s AND {USERS_ACTIVE_COL}=true LIMIT 1"
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (username,))
                row = cur.fetchone()
                if not row or not row[0]:
                    return False
                pw_hash = row[0]
                pw_hash_bytes = pw_hash if isinstance(pw_hash, (bytes, bytearray)) else str(pw_hash).encode("utf-8")
                return bcrypt.checkpw(password.encode("utf-8"), pw_hash_bytes)
    except Exception:
        return False

def parse_basic_auth(auth_header: str):
    if not auth_header or not auth_header.lower().startswith("basic "):
        return None, None
    try:
        raw = auth_header.split(" ", 1)[1].strip()
        decoded = base64.b64decode(raw).decode("utf-8")
        if ":" not in decoded:
            return None, None
        u, p = decoded.split(":", 1)
        return u, p
    except Exception:
        return None, None

@app.get("/auth")
def auth():
    u, p = parse_basic_auth(request.headers.get("Authorization", ""))
    if not u or p is None:
        return Response("Unauthorized", status=401)
    if check_user(u, p):
        return Response("OK", status=200)
    return Response("Unauthorized", status=401)
PY

chown geoserver-auth:geoserver-auth "${AUTH_HOME}/app.py"

if [[ ! -x "${AUTH_HOME}/venv/bin/python" ]]; then
  sudo -u geoserver-auth python3 -m venv "${AUTH_HOME}/venv"
fi
sudo -u geoserver-auth "${AUTH_HOME}/venv/bin/pip" install --upgrade pip >/dev/null
sudo -u geoserver-auth "${AUTH_HOME}/venv/bin/pip" install flask gunicorn psycopg2-binary bcrypt >/dev/null

cat >/etc/systemd/system/geoserver-auth.service <<EOF
[Unit]
Description=GeoServer WFS Auth Service (Flask/Gunicorn)
After=network.target

[Service]
User=geoserver-auth
Group=geoserver-auth
WorkingDirectory=${AUTH_HOME}
EnvironmentFile=${AUTH_ENV_FILE}
ExecStart=${AUTH_HOME}/venv/bin/gunicorn --bind ${AUTH_BIND} --workers 2 --timeout 30 app:app
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now geoserver-auth

log "Configuring Nginx reverse proxy + WFS auth_request"

# ── Detect SSL certificates (Let's Encrypt or custom) ──
SSL_CERT=""
SSL_KEY=""
SSL_DOMAIN=""

# Try to detect domain from existing nginx configs
for f in /etc/nginx/sites-available/*; do
  [[ -f "$f" ]] || continue
  d="$(grep -oP 'server_name\s+\K[^;_\s]+' "$f" 2>/dev/null | head -1)"
  if [[ -n "$d" && "$d" != "_" && "$d" != "localhost" ]]; then
    SSL_DOMAIN="$d"
    break
  fi
done

# Use --server-name if provided and not "_"
if [[ "$NGINX_SERVER_NAME" != "_" && -n "$NGINX_SERVER_NAME" ]]; then
  SSL_DOMAIN="$NGINX_SERVER_NAME"
fi

# Check for Let's Encrypt cert
if [[ -n "$SSL_DOMAIN" ]]; then
  LE_CERT="/etc/letsencrypt/live/${SSL_DOMAIN}/fullchain.pem"
  LE_KEY="/etc/letsencrypt/live/${SSL_DOMAIN}/privkey.pem"
  if [[ -f "$LE_CERT" && -f "$LE_KEY" ]]; then
    SSL_CERT="$LE_CERT"
    SSL_KEY="$LE_KEY"
    log "Found Let's Encrypt SSL for: ${SSL_DOMAIN}"
  fi
fi

# ── Write Nginx config ──
NGINX_CONF="/etc/nginx/sites-available/${NGINX_SITE_NAME}"

# Backup existing config
if [[ -f "$NGINX_CONF" ]]; then
  cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%s)"
fi

# WFS location blocks (shared between HTTP and HTTPS)
WFS_LOCATIONS=$(cat <<'WFSBLOCKS'
    location = /_auth_wfs {
        internal;
        proxy_pass http://AUTH_BIND_PLACEHOLDER/auth;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://NODE_UPSTREAM_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }

    location /geoserver/ {
        proxy_pass http://GS_UPSTREAM_PLACEHOLDER/geoserver/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 120;
    }

    location ^~ /wfs {
        auth_request /_auth_wfs;
        error_page 401 = @wfs_401;
        proxy_set_header Authorization "";
        proxy_pass http://GS_UPSTREAM_PLACEHOLDER/geoserver/wfs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_redirect off;
    }

    location ^~ /geoserver/wfs {
        auth_request /_auth_wfs;
        error_page 401 = @wfs_401;
        proxy_set_header Authorization "";
        proxy_pass http://GS_UPSTREAM_PLACEHOLDER/geoserver/wfs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_redirect off;
    }

    location @wfs_401 {
        add_header WWW-Authenticate 'Basic realm="DiDe WFS"' always;
        return 401;
    }
WFSBLOCKS
)

# Replace placeholders
WFS_LOCATIONS="${WFS_LOCATIONS//AUTH_BIND_PLACEHOLDER/${AUTH_BIND}}"
WFS_LOCATIONS="${WFS_LOCATIONS//NODE_UPSTREAM_PLACEHOLDER/${NODE_UPSTREAM}}"
WFS_LOCATIONS="${WFS_LOCATIONS//GS_UPSTREAM_PLACEHOLDER/${GEOSERVER_UPSTREAM}}"

if [[ -n "$SSL_CERT" && -n "$SSL_KEY" ]]; then
  # ── SSL + HTTP redirect config ──
  cat >"$NGINX_CONF" <<EOF
# HTTPS server (DiDe + GeoServer + WFS)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${SSL_DOMAIN};

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

${WFS_LOCATIONS}
}

# HTTP → HTTPS redirect
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SSL_DOMAIN};
    return 301 https://\$host\$request_uri;
}
EOF
  log "Nginx configured with SSL for ${SSL_DOMAIN}"
else
  # ── HTTP-only config (no SSL) ──
  cat >"$NGINX_CONF" <<EOF
# HTTP server (DiDe + GeoServer + WFS) — no SSL
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${NGINX_SERVER_NAME};

${WFS_LOCATIONS}
}
EOF
  log "Nginx configured (HTTP only, no SSL certificate found)"
fi

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
# Remove only the default site, NOT other custom sites
rm -f /etc/nginx/sites-enabled/default || true
nginx -t
systemctl reload nginx

log "Checking Postgres connectivity"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1;" >/dev/null

GS_REST="http://${GEOSERVER_UPSTREAM}/geoserver/rest"
GS_AUTH="${GS_ADMIN_USER}:${GS_ADMIN_PASS}"

gs_post_xml() {
  local url="$1"
  local xml_file="$2"
  local code
  code="$(curl -sS -o /tmp/gs_resp.txt -w "%{http_code}" -u "$GS_AUTH" -XPOST -H "Content-Type: text/xml" -d @"$xml_file" "$url" || true)"
  if [[ "$code" == "409" || "$code" == "201" || "$code" == "200" ]]; then
    return 0
  fi
  echo "GeoServer REST failed ($code) for POST $url" >&2
  cat /tmp/gs_resp.txt >&2 || true
  return 1
}

gs_put_xml() {
  local url="$1"
  local xml_file="$2"
  local code
  code="$(curl -sS -o /tmp/gs_resp.txt -w "%{http_code}" -u "$GS_AUTH" -XPUT -H "Content-Type: text/xml" -d @"$xml_file" "$url" || true)"
  if [[ "$code" == "200" ]]; then
    return 0
  fi
  echo "GeoServer REST failed ($code) for PUT $url" >&2
  cat /tmp/gs_resp.txt >&2 || true
  return 1
}

log "Creating workspace '${WORKSPACE}' (if needed)"
cat >/tmp/gs_workspace.xml <<EOF
<workspace><name>${WORKSPACE}</name></workspace>
EOF
gs_post_xml "${GS_REST}/workspaces" /tmp/gs_workspace.xml

log "Creating/updating PostGIS datastore '${DATASTORE}'"
cat >/tmp/gs_datastore.xml <<EOF
<dataStore>
  <name>${DATASTORE}</name>
  <type>PostGIS</type>
  <enabled>true</enabled>
  <connectionParameters>
    <entry key="dbtype">postgis</entry>
    <entry key="host">${PGHOST}</entry>
    <entry key="port">${PGPORT}</entry>
    <entry key="database">${PGDATABASE}</entry>
    <entry key="schema">${DB_SCHEMA}</entry>
    <entry key="user">${PGUSER}</entry>
    <entry key="passwd">${PGPASSWORD}</entry>
    <entry key="Expose primary keys">true</entry>
    <entry key="validate connections">true</entry>
    <entry key="Test while idle">true</entry>
  </connectionParameters>
</dataStore>
EOF

if ! gs_post_xml "${GS_REST}/workspaces/${WORKSPACE}/datastores" /tmp/gs_datastore.xml; then
  gs_put_xml "${GS_REST}/workspaces/${WORKSPACE}/datastores/${DATASTORE}" /tmp/gs_datastore.xml
fi

log "Publishing WFS layers"
PUBLISH_ERRORS=0
for spec in "${TABLE_SPECS[@]}"; do
  IFS=',' read -r TABLE_NAME FILTER_COL FILTER_VAL <<<"$spec" || true
  if [[ -z "${TABLE_NAME:-}" ]]; then
    echo "WARNING: Bad --tables spec: '$spec' — skipping" >&2
    PUBLISH_ERRORS=$((PUBLISH_ERRORS+1))
    continue
  fi

  FILTER_COL="${FILTER_COL:-*}"
  FILTER_VAL="${FILTER_VAL:-*}"

  schema="$DB_SCHEMA"
  table="$TABLE_NAME"
  if [[ "$TABLE_NAME" == *.* ]]; then
    schema="${TABLE_NAME%%.*}"
    table="${TABLE_NAME##*.}"
  fi

  exists="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT 1 FROM information_schema.tables WHERE table_schema=$(sql_quote_literal "$schema") AND table_name=$(sql_quote_literal "$table") LIMIT 1;")"
  if [[ "$exists" != "1" ]]; then
    echo "WARNING: Table not found: ${schema}.${table} — skipping" >&2
    PUBLISH_ERRORS=$((PUBLISH_ERRORS+1))
    continue
  fi

  geom_col="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT f_geometry_column FROM geometry_columns WHERE f_table_schema=$(sql_quote_literal "$schema") AND f_table_name=$(sql_quote_literal "$table") LIMIT 1;")"
  if [[ -z "$geom_col" ]]; then
    echo "WARNING: No geometry column found on ${schema}.${table} — skipping" >&2
    PUBLISH_ERRORS=$((PUBLISH_ERRORS+1))
    continue
  fi

  log "Found geometry column '${geom_col}' on ${schema}.${table}"

  srid="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT srid FROM geometry_columns WHERE f_table_schema=$(sql_quote_literal "$schema") AND f_table_name=$(sql_quote_literal "$table") AND f_geometry_column=$(sql_quote_literal "$geom_col") LIMIT 1;")"
  if [[ -z "$srid" || "$srid" == "0" ]]; then
    srid="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COALESCE(NULLIF(ST_SRID(\"${geom_col}\"),0), 4326) FROM ${schema}.${table} WHERE \"${geom_col}\" IS NOT NULL LIMIT 1;" 2>/dev/null || true)"
    [[ -n "$srid" ]] || srid="4326"
  fi

  publish_name="$table"
  native_name="$table"

  if [[ "$FILTER_COL" != "*" && "$FILTER_VAL" != "*" ]]; then
    view_suffix="$(sanitize_ident "${table}_${FILTER_COL}_${FILTER_VAL}")"
    view_name="wfs_${view_suffix}"

    if looks_numeric "$FILTER_VAL"; then
      where_expr="\"${FILTER_COL}\" = ${FILTER_VAL}"
    else
      where_expr="\"${FILTER_COL}\" = $(sql_quote_literal "$FILTER_VAL")"
    fi

    log "Creating/Updating VIEW ${schema}.${view_name} AS SELECT * FROM ${schema}.${table} WHERE ${where_expr}"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "CREATE OR REPLACE VIEW ${schema}.${view_name} AS SELECT * FROM ${schema}.${table} WHERE ${where_expr};"

    publish_name="$view_name"
    native_name="$view_name"
  else
    log "Publishing full table ${schema}.${table}"
  fi

  cat >/tmp/gs_featuretype.xml <<EOF
<featureType>
  <name>${publish_name}</name>
  <nativeName>${native_name}</nativeName>
  <title>${publish_name}</title>
  <srs>EPSG:${srid}</srs>
  <projectionPolicy>FORCE_DECLARED</projectionPolicy>
  <enabled>true</enabled>
</featureType>
EOF

  if gs_post_xml "${GS_REST}/workspaces/${WORKSPACE}/datastores/${DATASTORE}/featuretypes" /tmp/gs_featuretype.xml; then
    log "Published: ${publish_name} (EPSG:${srid}, geom: ${geom_col})"
  else
    echo "WARNING: Failed to publish ${publish_name} — skipping" >&2
    PUBLISH_ERRORS=$((PUBLISH_ERRORS+1))
  fi
done

if [[ $PUBLISH_ERRORS -gt 0 ]]; then
  echo "WARNING: ${PUBLISH_ERRORS} table(s) had errors (see above)" >&2
fi

log "Sanity checks"
curl -fsS "http://${GEOSERVER_UPSTREAM}/geoserver/rest/workspaces/${WORKSPACE}/datastores/${DATASTORE}/featuretypes.json" -u "$GS_AUTH" | head -n 50 || true

echo ""
echo " Done."
if [[ -n "$SSL_CERT" && -n "$SSL_DOMAIN" ]]; then
  echo "Site:          https://${SSL_DOMAIN}/"
  echo "GeoServer UI:  https://${SSL_DOMAIN}/geoserver/"
  echo "WFS URL:       https://${SSL_DOMAIN}/geoserver/wfs?service=WFS&request=GetCapabilities"
  echo "Test:"
  echo "  curl -sk https://${SSL_DOMAIN}/geoserver/wfs?service=WFS&request=GetCapabilities | head"
  echo "  curl -sku 'USERNAME:PASSWORD' https://${SSL_DOMAIN}/wfs?service=WFS&request=GetCapabilities | head"
else
  echo "GeoServer UI:  http://<SERVER_IP>/geoserver/"
  echo "WFS URL:       http://<SERVER_IP>/geoserver/wfs?service=WFS&request=GetCapabilities"
  echo "Test:"
  echo "  curl -I http://<SERVER_IP>/geoserver/wfs?service=WFS&request=GetCapabilities"
  echo "  curl -u 'USERNAME:PASSWORD' http://<SERVER_IP>/geoserver/wfs?service=WFS&request=GetCapabilities | head"
fi