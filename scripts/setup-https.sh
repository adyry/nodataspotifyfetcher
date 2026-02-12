#!/usr/bin/env zsh
set -euo pipefail

CERT_DIR=${CERT_DIR:-"$PWD/certs"}
KEY_PATH="$CERT_DIR/localhost.key"
CRT_PATH="$CERT_DIR/localhost.crt"
OPENSSL_CNF="$CERT_DIR/localhost-openssl.cnf"
ENV_FILE=".env"

mkdir -p "$CERT_DIR"

if [[ -f "$KEY_PATH" && -f "$CRT_PATH" ]]; then
  echo "✅ Certs already exist at $CERT_DIR"
else
  echo "🔐 Generating self-signed cert for localhost and 127.0.0.1..."
  cat > "$OPENSSL_CNF" <<'EOF'
[req]
distinguished_name = dn
req_extensions = v3_req
prompt = no

[dn]
CN = localhost

[v3_req]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$KEY_PATH" -out "$CRT_PATH" -days 365 -config "$OPENSSL_CNF" -extensions v3_req
  echo "✓ Generated:"
  echo "  Key: $KEY_PATH"
  echo "  Cert: $CRT_PATH"
fi

# Ensure .env exists
if [[ ! -f "$ENV_FILE" ]]; then
  echo "📄 Creating $ENV_FILE"
  : > "$ENV_FILE"
fi

# Function to upsert key=value in .env
upsert_env() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=.*" "$ENV_FILE"; then
    # Replace existing value
    sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

upsert_env "SSL_KEY_PATH" "$KEY_PATH"
upsert_env "SSL_CERT_PATH" "$CRT_PATH"
upsert_env "SPOTIFY_REDIRECT_URI" "https://127.0.0.1:3000/callback"

# Add placeholders for Spotify if not present
grep -qE '^SPOTIFY_CLIENT_ID=' "$ENV_FILE" || echo 'SPOTIFY_CLIENT_ID=your_client_id' >> "$ENV_FILE"
grep -qE '^SPOTIFY_CLIENT_SECRET=' "$ENV_FILE" || echo 'SPOTIFY_CLIENT_SECRET=your_client_secret' >> "$ENV_FILE"
grep -qE '^SPOTIFY_PLAYLIST_BASS=' "$ENV_FILE" || echo 'SPOTIFY_PLAYLIST_BASS=' >> "$ENV_FILE"
grep -qE '^SPOTIFY_PLAYLIST_TECHNO=' "$ENV_FILE" || echo 'SPOTIFY_PLAYLIST_TECHNO=' >> "$ENV_FILE"
grep -qE '^SPOTIFY_PLAYLIST_HOUSE=' "$ENV_FILE" || echo 'SPOTIFY_PLAYLIST_HOUSE=' >> "$ENV_FILE"
grep -qE '^SPOTIFY_PLAYLIST_DNB=' "$ENV_FILE" || echo 'SPOTIFY_PLAYLIST_DNB=' >> "$ENV_FILE"
grep -qE '^SPOTIFY_PLAYLIST_AMBIENT=' "$ENV_FILE" || echo 'SPOTIFY_PLAYLIST_AMBIENT=' >> "$ENV_FILE"
grep -qE '^SPOTIFY_PLAYLIST_REST=' "$ENV_FILE" || echo 'SPOTIFY_PLAYLIST_REST=' >> "$ENV_FILE"

echo "\n✅ Updated $ENV_FILE with SSL paths and SPOTIFY_REDIRECT_URI."
echo "👉 Ensure Spotify Redirect URIs include: https://127.0.0.1:3000/callback"
echo "👉 Fill in SPOTIFY_* values in $ENV_FILE if blank."
echo "\nRun the app:"
echo "  npm start"
