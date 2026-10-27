#!/usr/bin/env bash
# Create the two Secrets the stack needs. Values are generated here and go straight into OpenShift (never into git,
# files or the terminal).
#   aqarat-sso-env : passwords and client secrets. Created once; an existing one is never overwritten (new values would
#                    break the database password and the imported realms). Keys added in later versions (ROLE_API_KEY)
#                    are added to an existing Secret with a new random value; existing keys are left alone.
#   aqarat-tls     : tls.crt, tls.key, ca.crt from certs/ (CERT_DIR=... to use another folder, e.g. the AQ-DC01-CA set).
#                    Replaced on every run; then restart the pods: bash openshift/03-deploy.sh --restart
# Read one value later (e.g. for testers):  oc extract secret/aqarat-sso-env --keys=MOCK_USER_PASSWORD --to=-
source "$(dirname "$0")/common.sh"
CERT_DIR=${CERT_DIR:-certs}
need_login
need_can create secrets

rand() { openssl rand -base64 33 | tr -d '/+=' | cut -c1-32; }
GENERATED=(KC_DB_PASSWORD KC_ADMIN_PASSWORD NAS_CLIENT_SECRET MOCK_USER_PASSWORD DEV_TESTER_PASSWORD ROLE_API_KEY)

step "secret aqarat-sso-env"
# A private temp file instead of --from-literal keeps the values out of the process list.
tmp=$(umask 077; mktemp); trap 'rm -f "$tmp"' EXIT
if oc get secret aqarat-sso-env >/dev/null 2>&1; then
  have=$(oc get secret aqarat-sso-env -o go-template='{{range $k,$v := .data}}{{$k}}{{"\n"}}{{end}}')
  for v in "${GENERATED[@]}"; do grep -qx "$v" <<<"$have" || echo "$v=$(rand)"; done > "$tmp"
  if [ -s "$tmp" ]; then
    oc set data secret/aqarat-sso-env --from-env-file="$tmp" >/dev/null
    echo "exists - added missing keys: $(cut -d= -f1 "$tmp" | paste -sd' ')"
  else
    echo "exists - kept as is"
  fi
else
  { for v in "${GENERATED[@]}"; do echo "$v=$(rand)"; done
    echo KC_ADMIN_USERNAME=admin; echo APPIAN_API_KEY=mock-appian-api-key; } > "$tmp"
  oc create secret generic aqarat-sso-env --from-env-file="$tmp" >/dev/null
  oc label secret aqarat-sso-env app.kubernetes.io/part-of=aqarat-sso >/dev/null
  echo "created with new random values"
fi

step "secret aqarat-tls from $CERT_DIR/"
for f in tls.crt tls.key ca.crt; do [ -f "$CERT_DIR/$f" ] || die "$CERT_DIR/$f not found"; done
[ "$(openssl x509 -in "$CERT_DIR/tls.crt" -noout -pubkey | openssl sha256)" = "$(openssl pkey -in "$CERT_DIR/tls.key" -pubout | openssl sha256)" ] \
  || die "$CERT_DIR/tls.crt does not match $CERT_DIR/tls.key"
openssl verify -CAfile "$CERT_DIR/ca.crt" "$CERT_DIR/tls.crt" >/dev/null || die "$CERT_DIR/tls.crt does not chain to $CERT_DIR/ca.crt"
san=$(openssl x509 -in "$CERT_DIR/tls.crt" -noout -ext subjectAltName)
for h in keycloak portal api nas; do echo "$san" | grep -q "DNS:$h.aqarat.lab" || die "certificate SAN is missing $h.aqarat.lab"; done
oc create secret generic aqarat-tls --from-file="$CERT_DIR/tls.crt" --from-file="$CERT_DIR/tls.key" --from-file="$CERT_DIR/ca.crt" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
oc label secret aqarat-tls app.kubernetes.io/part-of=aqarat-sso --overwrite >/dev/null
openssl x509 -in "$CERT_DIR/tls.crt" -noout -subject -issuer -enddate | sed 's/^/  /'
echo "applied"
