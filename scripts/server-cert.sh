#!/usr/bin/env bash
# TLS certificate from AQ-DC01-CA (AD CS) for the lab server — see ../.claude/docs/07-lab-server-deployment.md, Phase C.
# One certificate covers keycloak., portal., api. and nas.aqarat.lab. The private key is created here and never leaves the server.
#
#   bash scripts/server-cert.sh request                       # 1) key + CSR in certs/adcs/  -> take sso.csr to the CA
#   bash scripts/server-cert.sh install <issued.cer> <ca.cer> # 2) check and install the issued cert + the AQ-DC01-CA cert
#   bash scripts/server-cert.sh status                        # show what certs/ currently serves
#
# Issue on the CA (domain machine):  certreq -submit -attrib "CertificateTemplate:WebServer" sso.csr sso.cer
# CA certificate:                     certutil -ca.cert aq-dc01-ca.cer
# Both files may be Base64 (PEM) or binary (DER). CERT_DIR overrides the target folder (default: certs).
set -euo pipefail
cd "$(dirname "$0")/.."

CERT_DIR=${CERT_DIR:-certs}
WORK=$CERT_DIR/adcs
HOSTS=(keycloak.aqarat.lab portal.aqarat.lab api.aqarat.lab nas.aqarat.lab)
CA_CN=AQ-DC01-CA
die() { echo "ERROR: $*" >&2; exit 1; }

to_pem() { # <in> <out>: accept PEM or DER
  if grep -q "BEGIN CERTIFICATE-----" "$1" 2>/dev/null; then openssl x509 -in "$1" -out "$2"
  else openssl x509 -inform DER -in "$1" -out "$2" 2>/dev/null || die "$1 is not a certificate (PEM or DER)"; fi
}

cmd_request() {
  mkdir -p "$WORK"
  [ -f "$WORK/tls.key" ] && die "$WORK/tls.key already exists. Remove $WORK/ first if you really want a new key."
  local san; san=$(printf 'DNS:%s, ' "${HOSTS[@]}"); san=${san%, }
  cat > "$WORK/request.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions = ext
prompt = no
[dn]
CN = ${HOSTS[0]}
O = AQARAT POC
[ext]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = $san
EOF
  (umask 077; openssl req -new -newkey rsa:2048 -nodes -sha256 -keyout "$WORK/tls.key" -out "$WORK/sso.csr" -config "$WORK/request.cnf" 2>/dev/null)
  openssl req -in "$WORK/sso.csr" -noout -verify >/dev/null 2>&1 || die "CSR self-check failed"
  echo "Created $WORK/tls.key (private, stays here) and $WORK/sso.csr"
  openssl req -in "$WORK/sso.csr" -noout -subject
  openssl req -in "$WORK/sso.csr" -noout -text | grep -A1 "Alternative Name" | tail -1 | sed 's/^ */SAN: /'
  echo
  echo "Next: copy $WORK/sso.csr (NOT tls.key) to a domain machine and run:"
  echo '  certreq -submit -attrib "CertificateTemplate:WebServer" sso.csr sso.cer     (choose AQ-DC01-CA)'
  echo '  certutil -ca.cert aq-dc01-ca.cer'
  echo "Bring both files back, then: bash scripts/server-cert.sh install <sso.cer> <aq-dc01-ca.cer>"
}

cmd_install() {
  local issued=${1:-} ca=${2:-}
  [ -n "$issued" ] && [ -n "$ca" ] || die "usage: server-cert.sh install <issued.cer> <ca.cer>"
  [ -f "$issued" ] || die "$issued not found"
  [ -f "$ca" ] || die "$ca not found"
  [ -f "$WORK/tls.key" ] || die "$WORK/tls.key not found — the certificate must be issued for the CSR created by 'request' on this server"
  to_pem "$issued" "$WORK/tls.crt"
  to_pem "$ca" "$WORK/ca.crt"
  local leaf=$WORK/tls.crt cacrt=$WORK/ca.crt

  echo "== checks"
  openssl x509 -in "$leaf" -noout -subject -issuer -enddate
  # Common mix-ups: the CA certificate or the request instead of the issued certificate.
  openssl x509 -in "$leaf" -noout -ext basicConstraints 2>/dev/null | grep -q "CA:TRUE" \
    && die "the first file is a CA certificate, not the issued server certificate (subject must be CN=${HOSTS[0]})"
  openssl x509 -in "$cacrt" -noout -subject | grep -q "CN *= *$CA_CN" || die "the second file is not the $CA_CN certificate"
  openssl x509 -in "$leaf" -noout -issuer | grep -q "CN *= *$CA_CN" || die "the certificate is not issued by $CA_CN"
  openssl verify -CAfile "$cacrt" "$leaf" >/dev/null || die "the certificate does not chain to $ca"
  [ "$(openssl x509 -in "$leaf" -noout -pubkey | openssl sha256)" = "$(openssl pkey -in "$WORK/tls.key" -pubout | openssl sha256)" ] \
    || die "the certificate does not match $WORK/tls.key (issued for a different CSR?)"
  local san; san=$(openssl x509 -in "$leaf" -noout -ext subjectAltName)
  for h in "${HOSTS[@]}"; do echo "$san" | grep -q "DNS:$h" || die "SAN is missing $h"; done
  openssl x509 -in "$leaf" -noout -ext extendedKeyUsage | grep -q "TLS Web Server Authentication" || die "not a server-authentication certificate"
  openssl x509 -in "$leaf" -noout -checkend 2592000 >/dev/null || echo "WARNING: the certificate expires within 30 days"
  echo "OK: issued by $CA_CN, matches the key, SAN has ${#HOSTS[@]} hosts, server auth"

  echo "== install into $CERT_DIR/ (previous files -> $CERT_DIR/backup-<time>/)"
  local bk; bk="$CERT_DIR/backup-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$bk"
  for f in tls.crt tls.key ca.crt; do [ -f "$CERT_DIR/$f" ] && cp -p "$CERT_DIR/$f" "$bk/"; done
  cp "$leaf" "$CERT_DIR/tls.crt"
  cp "$WORK/tls.key" "$CERT_DIR/tls.key"
  cp "$cacrt" "$CERT_DIR/ca.crt"    # trust for Keycloak (KC_TRUSTSTORE_PATHS), mock-api (NODE_EXTRA_CA_CERTS) and the scripts
  chmod 600 "$CERT_DIR/tls.key"
  # keycloak and mock-api run as uid 1000 and must read the key; nginx reads it as root.
  if [ "$(uname -s)" = Linux ]; then
    if [ "$(id -u)" = 0 ]; then chown 1000:1000 "$CERT_DIR/tls.key"
    elif sudo -n true 2>/dev/null; then sudo chown 1000:1000 "$CERT_DIR/tls.key"
    else echo "WARNING: run 'sudo chown 1000:1000 $CERT_DIR/tls.key' so the keycloak/mock-api containers can read it"; fi
  fi
  # The repo tracks the laptop's dev tls.crt/ca.crt: keep the server's versions local.
  git update-index --skip-worktree "$CERT_DIR/tls.crt" "$CERT_DIR/ca.crt" 2>/dev/null || true
  echo "Installed. Backup in $bk"
  echo
  echo "Next: docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --force-recreate"
  echo "Rollback: cp $bk/* $CERT_DIR/ && docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --force-recreate"
}

cmd_status() {
  for f in tls.crt ca.crt; do
    [ -f "$CERT_DIR/$f" ] || { echo "$CERT_DIR/$f: missing"; continue; }
    echo "== $CERT_DIR/$f"; openssl x509 -in "$CERT_DIR/$f" -noout -subject -issuer -enddate
  done
  openssl x509 -in "$CERT_DIR/tls.crt" -noout -ext subjectAltName 2>/dev/null | tail -1 | sed 's/^ */SAN: /'
  [ -f "$CERT_DIR/tls.key" ] && [ "$(openssl x509 -in "$CERT_DIR/tls.crt" -noout -pubkey | openssl sha256)" = "$(openssl pkey -in "$CERT_DIR/tls.key" -pubout | openssl sha256)" ] \
    && echo "key: matches tls.crt" || echo "key: MISSING or does not match tls.crt"
}

case "${1:-}" in
  request) cmd_request ;;
  install) shift; cmd_install "$@" ;;
  status)  cmd_status ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
