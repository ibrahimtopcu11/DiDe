#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# GeoServer WFS Setup — DiDe V3 (Fixed)
# ============================================================================
# FIX 1: GeoServer SQL Views (virtualTable) with explicit PK → no duplicates
# FIX 2: SVG files copied to GeoServer data/styles/ → icons work in WMS/preview
# FIX 3: --skip-nginx flag → won't break existing SSL config
# FIX 4: No more PostgreSQL views needed (GeoServer handles filtering internally)
# ============================================================================

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
USERS_ROLE_COL="role"
USERS_ROLE_VALUE="supervisor"

SVG_SOURCE_DIR=""
ENV_FILE=""
SKIP_NGINX=false

die()              { echo "ERROR: $*" >&2; exit 1; }
log()              { echo -e "\n=== $* ==="; }
need_cmd()         { command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"; }
is_root()          { [[ "${EUID:-$(id -u)}" -eq 0 ]]; }
sql_quote_literal() { local s="$1"; s="${s//\'/\'\'}"; printf "'%s'" "$s"; }

usage() {
cat <<'USAGE'
Usage:
  sudo bash GEOSERVER_WFS_setup.sh [options]

Required:
  --env-file PATH
  --gs-admin-user USER
  --gs-admin-pass PASS

Optional:
  --event-icons "o_id,icon.svg" ...   Per-event-type SVG icons
  --svg-source-dir PATH               Where SVG files are (default: ./public)
  --skip-nginx                         Don't touch Nginx config (preserves SSL)
  --server-name DOMAIN                 e.g. dide.hacettepe.edu.tr
  --workspace NAME
  --datastore NAME
  --db-schema NAME
  --geoserver-version VER
  --node-upstream HOST:PORT

Example (with existing SSL — recommended):
  sudo bash GEOSERVER_WFS_setup.sh \
    --env-file ./.env \
    --gs-admin-user admin \
    --gs-admin-pass geoserver \
    --event-icons "1,WC.svg" "2,Coworking.svg" "3,ATM.svg" \
    --svg-source-dir ./public \
    --skip-nginx

Example (first install, let script configure Nginx):
  sudo bash GEOSERVER_WFS_setup.sh \
    --env-file ./.env \
    --gs-admin-user admin \
    --gs-admin-pass geoserver \
    --event-icons "1,WC.svg" "2,Coworking.svg" "3,ATM.svg" \
    --svg-source-dir ./public \
    --server-name dide.hacettepe.edu.tr
USAGE
}

GS_ADMIN_USER=""
GS_ADMIN_PASS=""
NGINX_SERVER_NAME="_"
declare -a EVENT_ICON_SPECS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)           ENV_FILE="$2"; shift 2;;
    --gs-admin-user)      GS_ADMIN_USER="$2"; shift 2;;
    --gs-admin-pass)      GS_ADMIN_PASS="$2"; shift 2;;
    --workspace)          WORKSPACE="$2"; shift 2;;
    --datastore)          DATASTORE="$2"; shift 2;;
    --db-schema)          DB_SCHEMA="$2"; shift 2;;
    --svg-source-dir)     SVG_SOURCE_DIR="$2"; shift 2;;
    --skip-nginx)         SKIP_NGINX=true; shift;;
    --geoserver-version)
      GEOSERVER_VERSION="$2"
      GEOSERVER_ZIP_URL="https://sourceforge.net/projects/geoserver/files/GeoServer/${GEOSERVER_VERSION}/geoserver-${GEOSERVER_VERSION}-bin.zip/download"
      shift 2;;
    --node-upstream)      NODE_UPSTREAM="$2"; shift 2;;
    --server-name)        NGINX_SERVER_NAME="$2"; shift 2;;
    --event-icons)
      shift
      while [[ $# -gt 0 && "$1" != --* ]]; do
        EVENT_ICON_SPECS+=("$1")
        shift
      done;;
    -h|--help) usage; exit 0;;
    *) die "Unknown argument: $1";;
  esac
done

[[ -n "$ENV_FILE"      ]] || die "--env-file is required"
[[ -f "$ENV_FILE"      ]] || die "env file not found: $ENV_FILE"
[[ -n "$GS_ADMIN_USER" ]] || die "--gs-admin-user is required"
[[ -n "$GS_ADMIN_PASS" ]] || die "--gs-admin-pass is required"
is_root                    || die "Run as root (use sudo)."

[[ -z "$SVG_SOURCE_DIR" ]] && SVG_SOURCE_DIR="$(cd "$(dirname "$ENV_FILE")" && pwd)/public"

log "Loading environment from $ENV_FILE"
set -a; source "$ENV_FILE"; set +a
: "${PGHOST:?PGHOST missing}"; : "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE missing}"; : "${PGUSER:?PGUSER missing}"; : "${PGPASSWORD:?PGPASSWORD missing}"
export PGPASSWORD
[[ "$NODE_UPSTREAM" == "127.0.0.1:3000" && -n "${PORT:-}" ]] && NODE_UPSTREAM="127.0.0.1:${PORT}"

# ============================================================================
# 1) PACKAGES
# ============================================================================
log "Installing packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  unzip curl wget openjdk-17-jre-headless python3-venv python3-pip postgresql-client nginx
need_cmd curl; need_cmd psql; need_cmd nginx; need_cmd java; need_cmd unzip

# ============================================================================
# 2) SYSTEM USERS
# ============================================================================
log "System users and directories"
adduser --system --group --home "$GEOSERVER_HOME" --shell /usr/sbin/nologin geoserver >/dev/null 2>&1 || true
adduser --system --group --home "$AUTH_HOME" --shell /usr/sbin/nologin geoserver-auth >/dev/null 2>&1 || true
groupadd dide-app 2>/dev/null || true
usermod -aG dide-app geoserver 2>/dev/null || true
usermod -aG dide-app geoserver-auth 2>/dev/null || true
if [[ -f "$ENV_FILE" ]]; then
  chgrp dide-app "$ENV_FILE" 2>/dev/null || true
  chmod g+r "$ENV_FILE" 2>/dev/null || true
  chmod g+rx "$(dirname "$ENV_FILE")" 2>/dev/null || true
fi
mkdir -p "$GEOSERVER_HOME" "$GEOSERVER_DATA_DIR" "$GEOSERVER_TMP"
chown -R geoserver:geoserver "$GEOSERVER_HOME" "$GEOSERVER_DATA_DIR" "$GEOSERVER_TMP"
mkdir -p "$AUTH_HOME"
chown -R geoserver-auth:geoserver-auth "$AUTH_HOME"

# ============================================================================
# 3) INSTALL GEOSERVER
# ============================================================================
if [[ ! -f "$GEOSERVER_HOME/start.jar" ]]; then
  log "Downloading GeoServer ${GEOSERVER_VERSION}"
  tmpzip="/tmp/geoserver-${GEOSERVER_VERSION}-bin.zip"
  rm -f "$tmpzip"; wget -O "$tmpzip" "$GEOSERVER_ZIP_URL"
  rm -rf "$GEOSERVER_TMP/geoserver-unpack"
  mkdir -p "$GEOSERVER_TMP/geoserver-unpack"
  unzip -q "$tmpzip" -d "$GEOSERVER_TMP/geoserver-unpack"
  inner_dir="$(find "$GEOSERVER_TMP/geoserver-unpack" -maxdepth 1 -type d -name 'geoserver-*' | head -n 1 || true)"
  [[ -z "$inner_dir" ]] && inner_dir="$GEOSERVER_TMP/geoserver-unpack"
  rm -rf "${GEOSERVER_HOME:?}"/*
  shopt -s dotglob; mv "$inner_dir"/* "$GEOSERVER_HOME"/; shopt -u dotglob
  chown -R geoserver:geoserver "$GEOSERVER_HOME"
else
  log "GeoServer already installed at ${GEOSERVER_HOME}"
fi

# ============================================================================
# 4) GEOSERVER SYSTEMD
# ============================================================================
log "GeoServer systemd service"
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

log "Waiting for GeoServer"
for i in {1..90}; do
  curl -fsS "http://${GEOSERVER_UPSTREAM}/geoserver/web/" >/dev/null 2>&1 && { echo "GeoServer is up!"; break; }
  sleep 2
done

# ============================================================================
# 5) AUTH SERVICE
# ============================================================================
log "Auth service setup"
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
USERS_ROLE_COL=${USERS_ROLE_COL}
USERS_ROLE_VALUE=${USERS_ROLE_VALUE}
EOF
chown root:geoserver-auth "$AUTH_ENV_FILE"; chmod 640 "$AUTH_ENV_FILE"

cat >"${AUTH_HOME}/app.py" <<'PY'
import base64, os
from flask import Flask, request, Response
import psycopg2, bcrypt

app = Flask(__name__)
def ge(n,d=None):
    v=os.getenv(n); return v if v not in (None,"") else d
def get_conn():
    return psycopg2.connect(host=ge("PGHOST","127.0.0.1"),port=int(ge("PGPORT","5432")),
        dbname=ge("PGDATABASE"),user=ge("PGUSER"),password=ge("PGPASSWORD"))

UT=ge("USERS_TABLE","public.users"); UC=ge("USERS_USERNAME_COL","username")
AC=ge("USERS_ACTIVE_COL","is_active"); PC=ge("USERS_PWHASH_COL","password_hash")
RC=ge("USERS_ROLE_COL","role"); RV=ge("USERS_ROLE_VALUE","supervisor")

def check_user(username, password):
    sql=f"SELECT {PC} FROM {UT} WHERE {UC}=%s AND {AC}=true AND {RC}=%s LIMIT 1"
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql,(username,RV)); row=cur.fetchone()
                if not row or not row[0]: return False
                h=row[0] if isinstance(row[0],(bytes,bytearray)) else str(row[0]).encode("utf-8")
                return bcrypt.checkpw(password.encode("utf-8"),h)
    except: return False

@app.get("/auth")
def auth():
    ah=request.headers.get("Authorization","")
    if not ah or not ah.lower().startswith("basic "): return Response("Unauthorized",status=401)
    try:
        d=base64.b64decode(ah.split(" ",1)[1].strip()).decode("utf-8")
        if ":" not in d: return Response("Unauthorized",status=401)
        u,p=d.split(":",1)
    except: return Response("Unauthorized",status=401)
    if check_user(u,p): return Response("OK",status=200)
    return Response("Unauthorized",status=401)
PY
chown geoserver-auth:geoserver-auth "${AUTH_HOME}/app.py"

[[ ! -x "${AUTH_HOME}/venv/bin/python" ]] && sudo -u geoserver-auth python3 -m venv "${AUTH_HOME}/venv"
sudo -u geoserver-auth "${AUTH_HOME}/venv/bin/pip" install --upgrade pip >/dev/null
sudo -u geoserver-auth "${AUTH_HOME}/venv/bin/pip" install flask gunicorn psycopg2-binary bcrypt >/dev/null

cat >/etc/systemd/system/geoserver-auth.service <<EOF
[Unit]
Description=GeoServer WFS Auth
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

# ============================================================================
# 6) NGINX (skippable)
# ============================================================================
if [[ "$SKIP_NGINX" == "true" ]]; then
  log "SKIPPING Nginx config (--skip-nginx)"
  echo "  Make sure your Nginx has /geoserver/ and /wfs proxy blocks."
else
  log "Configuring Nginx"
  SSL_CERT=""; SSL_KEY=""; SSL_DOMAIN=""
  if [[ "$NGINX_SERVER_NAME" != "_" && -n "$NGINX_SERVER_NAME" ]]; then
    SSL_DOMAIN="$NGINX_SERVER_NAME"
  else
    for f in /etc/nginx/sites-available/*; do
      [[ -f "$f" ]] || continue
      d="$(grep -oP 'server_name\s+\K[^;_\s]+' "$f" 2>/dev/null | head -1)"
      [[ -n "$d" && "$d" != "_" && "$d" != "localhost" ]] && { SSL_DOMAIN="$d"; break; }
    done
  fi
  if [[ -n "$SSL_DOMAIN" ]]; then
    LE="/etc/letsencrypt/live/${SSL_DOMAIN}"
    [[ -f "$LE/fullchain.pem" && -f "$LE/privkey.pem" ]] && {
      SSL_CERT="$LE/fullchain.pem"; SSL_KEY="$LE/privkey.pem"
      log "Found SSL for ${SSL_DOMAIN}"
    }
  fi

  NGINX_CONF="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
  [[ -f "$NGINX_CONF" ]] && cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%s)"

  if [[ -n "$SSL_CERT" && -n "$SSL_KEY" ]]; then
    cat >"$NGINX_CONF" <<NGINXEOF
server {
    server_name ${SSL_DOMAIN};

    location = /_auth_wfs {
        internal;
        proxy_pass http://${AUTH_BIND}/auth;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Host \$host;
    }
    location / {
        proxy_pass http://${NODE_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
    }
    location /geoserver/ {
        proxy_pass http://${GEOSERVER_UPSTREAM}/geoserver/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 120;
    }
    location ^~ /wfs {
        auth_request /_auth_wfs;
        error_page 401 = @wfs_401;
        proxy_set_header Authorization "";
        proxy_pass http://${GEOSERVER_UPSTREAM}/geoserver/wfs;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_redirect off;
    }
    location ^~ /geoserver/wfs {
        auth_request /_auth_wfs;
        error_page 401 = @wfs_401;
        proxy_set_header Authorization "";
        proxy_pass http://${GEOSERVER_UPSTREAM}/geoserver/wfs;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_redirect off;
    }
    location @wfs_401 {
        add_header WWW-Authenticate 'Basic realm="DiDe WFS"' always;
        return 401;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate     ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
server {
    if (\$host = ${SSL_DOMAIN}) { return 301 https://\$host\$request_uri; }
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SSL_DOMAIN};
    return 404;
}
NGINXEOF
    log "Nginx: SSL for ${SSL_DOMAIN}"
  else
    cat >"$NGINX_CONF" <<NGINXEOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${NGINX_SERVER_NAME};

    location = /_auth_wfs {
        internal;
        proxy_pass http://${AUTH_BIND}/auth;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Host \$host;
    }
    location / {
        proxy_pass http://${NODE_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
    }
    location /geoserver/ {
        proxy_pass http://${GEOSERVER_UPSTREAM}/geoserver/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 120;
    }
    location ^~ /wfs {
        auth_request /_auth_wfs;
        error_page 401 = @wfs_401;
        proxy_set_header Authorization "";
        proxy_pass http://${GEOSERVER_UPSTREAM}/geoserver/wfs;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_redirect off;
    }
    location ^~ /geoserver/wfs {
        auth_request /_auth_wfs;
        error_page 401 = @wfs_401;
        proxy_set_header Authorization "";
        proxy_pass http://${GEOSERVER_UPSTREAM}/geoserver/wfs;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_redirect off;
    }
    location @wfs_401 {
        add_header WWW-Authenticate 'Basic realm="DiDe WFS"' always;
        return 401;
    }
}
NGINXEOF
    log "Nginx: HTTP only (no SSL found)"
  fi
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
  rm -f /etc/nginx/sites-enabled/default || true
  nginx -t && systemctl reload nginx
fi

# ============================================================================
# 7) GEOSERVER REST API — Workspace + Datastore
# ============================================================================
log "Checking Postgres"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1;" >/dev/null

GS_REST="http://${GEOSERVER_UPSTREAM}/geoserver/rest"
GS_AUTH="${GS_ADMIN_USER}:${GS_ADMIN_PASS}"

gs_api() {
  # $1=method $2=url $3=content-type $4=data-file-or-string
  local method="$1" url="$2" ct="$3" data="$4" code
  if [[ -f "$data" ]]; then
    code="$(curl -sS -o /tmp/gs_resp.txt -w "%{http_code}" -u "$GS_AUTH" -X"$method" -H "Content-Type: $ct" -d @"$data" "$url" || true)"
  else
    code="$(curl -sS -o /tmp/gs_resp.txt -w "%{http_code}" -u "$GS_AUTH" -X"$method" -H "Content-Type: $ct" -d "$data" "$url" || true)"
  fi
  if [[ "$code" =~ ^(200|201|409)$ ]]; then return 0; fi
  echo "GeoServer REST $method $url → HTTP $code" >&2
  cat /tmp/gs_resp.txt >&2 2>/dev/null || true
  return 1
}

log "Creating workspace '${WORKSPACE}'"
echo "<workspace><name>${WORKSPACE}</name></workspace>" > /tmp/gs_ws.xml
gs_api POST "${GS_REST}/workspaces" "text/xml" /tmp/gs_ws.xml || true

log "Creating datastore '${DATASTORE}'"
cat >/tmp/gs_ds.xml <<EOF
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
  </connectionParameters>
</dataStore>
EOF
gs_api POST "${GS_REST}/workspaces/${WORKSPACE}/datastores" "text/xml" /tmp/gs_ds.xml || \
  gs_api PUT "${GS_REST}/workspaces/${WORKSPACE}/datastores/${DATASTORE}" "text/xml" /tmp/gs_ds.xml || true

# ============================================================================
# 8) DETECT TABLE STRUCTURE
# ============================================================================
OLAY_TABLE="olay"
OLAY_SCHEMA="${DB_SCHEMA}"

log "Detecting olay table structure"
olay_exists="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c \
  "SELECT 1 FROM information_schema.tables WHERE table_schema=$(sql_quote_literal "$OLAY_SCHEMA") AND table_name=$(sql_quote_literal "$OLAY_TABLE") LIMIT 1;")"
[[ "$olay_exists" == "1" ]] || die "Table ${OLAY_SCHEMA}.${OLAY_TABLE} not found"

# Find primary key column
pk_col="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c "
  SELECT a.attname FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '${OLAY_SCHEMA}.${OLAY_TABLE}'::regclass AND i.indisprimary
  LIMIT 1;")"
[[ -n "$pk_col" ]] || pk_col="id"
log "Primary key column: ${pk_col}"

# Find geometry column
geom_col="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c \
  "SELECT f_geometry_column FROM geometry_columns WHERE f_table_schema=$(sql_quote_literal "$OLAY_SCHEMA") AND f_table_name=$(sql_quote_literal "$OLAY_TABLE") LIMIT 1;")"
[[ -n "$geom_col" ]] || die "No geometry column on ${OLAY_TABLE}"

srid="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c \
  "SELECT srid FROM geometry_columns WHERE f_table_schema=$(sql_quote_literal "$OLAY_SCHEMA") AND f_table_name=$(sql_quote_literal "$OLAY_TABLE") AND f_geometry_column=$(sql_quote_literal "$geom_col") LIMIT 1;")"
[[ -n "$srid" && "$srid" != "0" ]] || srid="4326"

geom_type="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c \
  "SELECT type FROM geometry_columns WHERE f_table_schema=$(sql_quote_literal "$OLAY_SCHEMA") AND f_table_name=$(sql_quote_literal "$OLAY_TABLE") AND f_geometry_column=$(sql_quote_literal "$geom_col") LIMIT 1;")"
[[ -n "$geom_type" ]] || geom_type="Geometry"

log "Geometry: ${geom_col} (${geom_type}, EPSG:${srid})"

# ============================================================================
# 9) SVG ICONS → GeoServer styles directory
# ============================================================================
GS_STYLES_DIR="${GEOSERVER_DATA_DIR}/styles"
mkdir -p "$GS_STYLES_DIR"

PUBLISH_ERRORS=0
declare -a ICON_OIDS=()

for spec in "${EVENT_ICON_SPECS[@]}"; do
  IFS=',' read -r OID ICON_FILE <<<"$spec" || true
  [[ -z "$OID" || -z "$ICON_FILE" ]] && { echo "WARNING: Bad spec '$spec'" >&2; continue; }
  ICON_OIDS+=("$OID")

  # Copy SVG to GeoServer styles directory
  SVG_SRC="${SVG_SOURCE_DIR}/${ICON_FILE}"
  if [[ -f "$SVG_SRC" ]]; then
    cp "$SVG_SRC" "${GS_STYLES_DIR}/${ICON_FILE}"
    chown geoserver:geoserver "${GS_STYLES_DIR}/${ICON_FILE}"
    chmod 644 "${GS_STYLES_DIR}/${ICON_FILE}"
    log "SVG copied: ${ICON_FILE} → ${GS_STYLES_DIR}/"
  else
    echo "WARNING: SVG not found at ${SVG_SRC}" >&2
    echo "  Make sure ${ICON_FILE} exists in ${SVG_SOURCE_DIR}/" >&2
  fi

  type_name="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tA -c \
    "SELECT o_adi FROM ${OLAY_SCHEMA}.olaylar WHERE o_id=${OID} AND active=true LIMIT 1;" 2>/dev/null || true)"
  [[ -n "$type_name" ]] || type_name="type_${OID}"

  layer_name="wfs_olay_type_${OID}"

  # ── FIX: SLD with just filename → GeoServer resolves from styles dir ──
  STYLE_NAME="style_olay_type_${OID}"
  cat >/tmp/gs_sld_${OID}.xml <<SLDEOF
<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd"
  xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NamedLayer>
    <Name>${layer_name}</Name>
    <UserStyle>
      <Title>${type_name}</Title>
      <FeatureTypeStyle>
        <Rule>
          <PointSymbolizer>
            <Graphic>
              <ExternalGraphic>
                <OnlineResource xlink:href="${ICON_FILE}"/>
                <Format>image/svg+xml</Format>
              </ExternalGraphic>
              <Size>32</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
SLDEOF

  # Upload SLD style
  gs_api POST "http://${GEOSERVER_UPSTREAM}/geoserver/rest/styles?name=${STYLE_NAME}" \
    "application/vnd.ogc.sld+xml" "/tmp/gs_sld_${OID}.xml" 2>/dev/null || \
  gs_api PUT "http://${GEOSERVER_UPSTREAM}/geoserver/rest/styles/${STYLE_NAME}" \
    "application/vnd.ogc.sld+xml" "/tmp/gs_sld_${OID}.xml" 2>/dev/null || true

  # ── FIX: Use GeoServer SQL View (virtualTable) with explicit PK → NO DUPLICATES ──
  log "Publishing SQL View: ${layer_name} (PK=${pk_col}, event type ${OID})"

  # Escape SQL for XML
  SQL_QUERY="SELECT * FROM ${OLAY_SCHEMA}.${OLAY_TABLE} WHERE active = true AND olay_turu = ${OID}"

  cat >/tmp/gs_ft_${OID}.xml <<FTEOF
<featureType>
  <name>${layer_name}</name>
  <nativeName>${layer_name}</nativeName>
  <title>${type_name}</title>
  <srs>EPSG:${srid}</srs>
  <projectionPolicy>FORCE_DECLARED</projectionPolicy>
  <enabled>true</enabled>
  <metadata>
    <entry key="JDBC_VIRTUAL_TABLE">
      <virtualTable>
        <name>${layer_name}</name>
        <sql>${SQL_QUERY}</sql>
        <escapeSql>false</escapeSql>
        <keyColumn>${pk_col}</keyColumn>
        <geometry>
          <name>${geom_col}</name>
          <type>${geom_type}</type>
          <srid>${srid}</srid>
        </geometry>
      </virtualTable>
    </entry>
  </metadata>
</featureType>
FTEOF

  if gs_api POST "${GS_REST}/workspaces/${WORKSPACE}/datastores/${DATASTORE}/featuretypes" \
    "text/xml" "/tmp/gs_ft_${OID}.xml"; then
    log "Published: ${layer_name} (${type_name}) with icon ${ICON_FILE}"
  else
    echo "WARNING: Failed to publish ${layer_name}" >&2
    PUBLISH_ERRORS=$((PUBLISH_ERRORS+1))
  fi

  # Apply SLD style to layer
  gs_api PUT "http://${GEOSERVER_UPSTREAM}/geoserver/rest/layers/${WORKSPACE}:${layer_name}" \
    "application/json" "{\"layer\":{\"defaultStyle\":{\"name\":\"${STYLE_NAME}\"}}}" 2>/dev/null || true
done

# ── Default layer: all other active events (no icon) ──
default_layer="wfs_olay_default"
if [[ ${#ICON_OIDS[@]} -gt 0 ]]; then
  exclude_list=$(IFS=,; echo "${ICON_OIDS[*]}")
  DEFAULT_SQL="SELECT * FROM ${OLAY_SCHEMA}.${OLAY_TABLE} WHERE active = true AND (olay_turu IS NULL OR olay_turu NOT IN (${exclude_list}))"
else
  DEFAULT_SQL="SELECT * FROM ${OLAY_SCHEMA}.${OLAY_TABLE} WHERE active = true"
fi

log "Publishing default SQL View: ${default_layer}"
cat >/tmp/gs_ft_default.xml <<FTEOF
<featureType>
  <name>${default_layer}</name>
  <nativeName>${default_layer}</nativeName>
  <title>Events (default)</title>
  <srs>EPSG:${srid}</srs>
  <projectionPolicy>FORCE_DECLARED</projectionPolicy>
  <enabled>true</enabled>
  <metadata>
    <entry key="JDBC_VIRTUAL_TABLE">
      <virtualTable>
        <name>${default_layer}</name>
        <sql>${DEFAULT_SQL}</sql>
        <escapeSql>false</escapeSql>
        <keyColumn>${pk_col}</keyColumn>
        <geometry>
          <name>${geom_col}</name>
          <type>${geom_type}</type>
          <srid>${srid}</srid>
        </geometry>
      </virtualTable>
    </entry>
  </metadata>
</featureType>
FTEOF

gs_api POST "${GS_REST}/workspaces/${WORKSPACE}/datastores/${DATASTORE}/featuretypes" \
  "text/xml" "/tmp/gs_ft_default.xml" || PUBLISH_ERRORS=$((PUBLISH_ERRORS+1))

[[ $PUBLISH_ERRORS -gt 0 ]] && echo "WARNING: ${PUBLISH_ERRORS} layer(s) had errors" >&2

# ============================================================================
# 10) CLEANUP OLD POSTGRESQL VIEWS (from previous script versions)
# ============================================================================
log "Cleaning up old PostgreSQL views (if any)"
for oid in "${ICON_OIDS[@]}"; do
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c \
    "DROP VIEW IF EXISTS ${OLAY_SCHEMA}.wfs_olay_type_${oid} CASCADE;" 2>/dev/null || true
done
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c \
  "DROP VIEW IF EXISTS ${OLAY_SCHEMA}.wfs_olay_default CASCADE;" 2>/dev/null || true

# ============================================================================
# 11) DONE
# ============================================================================
log "Verifying published layers"
curl -fsS "${GS_REST}/workspaces/${WORKSPACE}/datastores/${DATASTORE}/featuretypes.json" \
  -u "$GS_AUTH" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  fts=d.get('featureTypes',{}).get('featureType',[])
  for ft in fts: print(f\"  - {ft['name']}\")
except: pass
" 2>/dev/null || true

echo ""
echo "============================================"
echo " DONE — DiDe GeoServer WFS Setup"
echo "============================================"
echo ""
echo " SVG icons in: ${GS_STYLES_DIR}/"
ls -1 "${GS_STYLES_DIR}"/*.svg 2>/dev/null | while read f; do echo "   $(basename "$f")"; done
echo ""
echo " Layers published (SQL Views with PK=${pk_col}):"
echo "   - No duplicate data"
echo "   - active=true filter applied"
echo ""
echo " Auth: is_active=true AND role='supervisor'"
echo ""
echo " WFS (data):  .../geoserver/wfs?service=WFS&request=GetCapabilities"
echo " WMS (icons): .../geoserver/wms?service=WMS&request=GetCapabilities"
echo ""
echo " QGIS'te logolu görmek için WMS olarak ekleyin:"
echo "   Layer > Add Layer > Add WMS/WMTS Layer"
echo "   URL: https://YOUR_DOMAIN/geoserver/wms"
echo ""
echo " QGIS'te WFS olarak ekleyip logolu görmek için:"
echo "   WFS layer ekledikten sonra Layer Properties > Symbology"
echo "   Rule-based > olay_turu fieldina göre SVG marker atayın"
echo ""