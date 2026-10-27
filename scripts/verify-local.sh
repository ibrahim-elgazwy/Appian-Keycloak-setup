#!/usr/bin/env bash
# Smoke checks for the local stack (Keycloak, mock NAS, mock backend API, test T11).
# Run from appian-keyclock/:  bash scripts/verify-local.sh
# Other targets (e.g. OpenShift, see openshift/04-verify.sh): set AQ_KEYCLOAK_URL, AQ_NAS_URL, AQ_API_URL, AQ_PORTAL_URL,
# ENV_FILE (secrets) and optionally AQ_RESOLVE_IP (reach the hosts at that IP without hosts-file entries).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . "${ENV_FILE:-./.env}"; set +a

KC=${AQ_KEYCLOAK_URL:-https://keycloak.aqarat.lab:8443}
API=${AQ_API_URL:-https://api.aqarat.lab:8444}
ORIGIN=${AQ_PORTAL_URL:-https://portal.aqarat.lab:4200}
C=(--cacert certs/ca.crt --ssl-no-revoke -s)   # --ssl-no-revoke: Windows schannel curl; harmless elsewhere
if [ -n "${AQ_RESOLVE_IP:-}" ]; then
  for u in "$KC" "$API" "${AQ_NAS_URL:-https://nas.aqarat.lab:8445}"; do
    hp=${u#https://}; h=${hp%%[:/]*}; p=443; [[ $hp == *:* ]] && p=${hp#*:} && p=${p%%/*}
    C+=(--resolve "$h:$p:$AQ_RESOLVE_IP")
  done
fi
json() { node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(($1)(d))"; }
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1 ($2)"; pass=$((pass+1)); else echo "FAIL  $1 (got $2, want $3)"; fail=$((fail+1)); fi; }

echo "Waiting for Keycloak..."
for _ in $(seq 1 60); do
  [ "$(curl "${C[@]}" -o /dev/null -w '%{http_code}' $KC/realms/aqarat-poc/.well-known/openid-configuration)" = 200 ] && break
  sleep 3
done

check "aqarat-poc issuer" "$(curl "${C[@]}" $KC/realms/aqarat-poc/.well-known/openid-configuration | json 'd=>d.issuer')" "$KC/realms/aqarat-poc"
NAS=${AQ_NAS_URL:-https://nas.aqarat.lab:8445}/realms/nas
check "mock NAS issuer (separate host)" "$(curl "${C[@]}" $NAS/.well-known/openid-configuration | json 'd=>d.issuer')" "$NAS"
check "mock NAS: code flow + PKCE S256 only" "$(curl "${C[@]}" $NAS/.well-known/openid-configuration | json 'd=>d.code_challenge_methods_supported.includes("S256")')" true

token() { curl "${C[@]}" -d grant_type=password -d client_id=aqarat-dev-tester -d username=local_dev.tester \
  --data-urlencode "password=$DEV_TESTER_PASSWORD" -d "scope=openid${1:+ $1}" $KC/realms/aqarat-poc/protocol/openid-connect/token | json 'd=>d.access_token'; }
GOOD=$(token aqarat-api); NOAUD=$(token)
check "token with aqarat-api scope has aud" "$(node -pe "[].concat(JSON.parse(Buffer.from('${GOOD}'.split('.')[1],'base64url')).aud).includes('aqarat-api')")" true
check "token has given_name (profile scope)" "$(node -pe "JSON.parse(Buffer.from('${GOOD}'.split('.')[1],'base64url')).given_name")" Dev

code() { curl "${C[@]}" -o /dev/null -w '%{http_code}' "$@"; }
check "T11 no token -> 401" "$(code $API/aqarat/me)" 401
check "T11 wrong audience -> 401" "$(code -H "Authorization: Bearer $NOAUD" $API/aqarat/me)" 401
check "T11 tampered signature -> 401" "$(code -H "Authorization: Bearer ${GOOD%?????}AAAAA" $API/aqarat/me)" 401
check "T11 valid token -> 200" "$(code -H "Authorization: Bearer $GOOD" $API/aqarat/me)" 200
check "Appian call: user token not sent to Appian" "$(curl "${C[@]}" -H "Authorization: Bearer $GOOD" $API/appian/properties | json 'd=>d.outboundHeaderNames.includes("authorization")')" false
check "Appian call: backend uses its API key" "$(curl "${C[@]}" -H "Authorization: Bearer $GOOD" $API/appian/properties | json 'd=>d.outboundHeaderNames.includes("appian-api-key")')" true
check "CORS portal origin allowed" "$(curl "${C[@]}" -o /dev/null -D - -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: GET' $API/aqarat/me | grep -ci "^access-control-allow-origin: $ORIGIN")" 1
check "CORS other origin refused" "$(curl "${C[@]}" -o /dev/null -D - -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' $API/aqarat/me | grep -ci '^access-control-allow-origin' || true)" 0

echo "----- $pass passed, $fail failed"
[ "$fail" = 0 ]
