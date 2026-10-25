#!/usr/bin/env bash
# Check the deployed stack from this PC through the cluster router.
#  1) pods ready and each public name answering with the expected certificate (works without hosts entries);
#  2) scripts/verify-local.sh against the port-less URLs (curl --resolve, works without hosts entries);
#  3) the two Node checks - only when *.aqarat.lab already resolve to the cluster on this PC (hosts file / DNS).
# Secrets are read from the aqarat-sso-env Secret into a private temp file that is removed on exit.
source "$(dirname "$0")/common.sh"
need_login
need_can get pods

export AQ_KEYCLOAK_URL=https://keycloak.aqarat.lab AQ_NAS_URL=https://nas.aqarat.lab
export AQ_API_URL=https://api.aqarat.lab AQ_PORTAL_URL=https://portal.aqarat.lab
fail=0

step "pods"
oc get pods -l app.kubernetes.io/part-of=aqarat-sso
[ -z "$(oc get pods -l app.kubernetes.io/part-of=aqarat-sso -o jsonpath='{range .items[*]}{.status.containerStatuses[0].ready}{"\n"}{end}' | grep -v true)" ] \
  || { echo "FAIL  not all pods are ready"; fail=1; }

step "TLS on the router ($CLUSTER_IP:443)"
for h in keycloak nas api portal; do
  issuer=$(echo | openssl s_client -connect "$CLUSTER_IP:443" -servername "$h.aqarat.lab" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null || true)
  code=$(curl -s --cacert certs/ca.crt --ssl-no-revoke --resolve "$h.aqarat.lab:443:$CLUSTER_IP" -o /dev/null -w '%{http_code}' "https://$h.aqarat.lab/" || true)
  printf '%-22s HTTP %s  %s\n' "$h.aqarat.lab" "$code" "${issuer:-no certificate}"
  [ -n "$issuer" ] && [ "$code" != 000 ] || fail=1
done

ENV_FILE=$(umask 077; mktemp); trap 'rm -f "$ENV_FILE"' EXIT; export ENV_FILE
oc extract secret/aqarat-sso-env --to=- 2>/dev/null | awk '/^# /{k=$2; next} {print k "=" $0}' > "$ENV_FILE"

step "API, tokens and CORS (scripts/verify-local.sh)"
AQ_RESOLVE_IP=$CLUSTER_IP bash scripts/verify-local.sh || fail=1

step "realm setup and broker logins (Node checks)"
resolved=$(node -e "require('dns').lookup('keycloak.aqarat.lab',(e,a)=>console.log(e?'':a))")
if [ "$resolved" = "$CLUSTER_IP" ]; then
  NODE_EXTRA_CA_CERTS=certs/ca.crt node scripts/inspect-nas-setup.mjs || fail=1
  NODE_EXTRA_CA_CERTS=certs/ca.crt node scripts/verify-broker-login.mjs || fail=1
else
  echo "SKIP  keycloak.aqarat.lab resolves to '${resolved:-nothing}' here, not $CLUSTER_IP - add the hosts entries, then re-run"
fi

echo
[ "$fail" = 0 ] && echo "ALL CHECKS PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
