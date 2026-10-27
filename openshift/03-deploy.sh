#!/usr/bin/env bash
# Deploy (or update) the stack in project aqarat: realm ConfigMaps, services, postgres, keycloak, mock NAS, mock API,
# portal and the four routes; then wait until every deployment is ready.
# Usage: bash openshift/03-deploy.sh             (images with tag = current git commit; TAG=... to override)
#        bash openshift/03-deploy.sh --restart   (same, then restart all pods, e.g. after a new aqarat-tls)
# Note: Keycloak imports a realm only when it does not exist yet. Changing a realm file later needs the admin console,
#       or a fresh database (delete PVC sso-postgres-data) - the mock NAS re-imports on every new pod anyway.
source "$(dirname "$0")/common.sh"
M=openshift/manifests
need_login
need_can create deployments services routes configmaps persistentvolumeclaims
need_can get pods
for s in aqarat-sso-env aqarat-tls; do oc get secret "$s" >/dev/null 2>&1 || die "secret $s missing - run openshift/02-secrets.sh first"; done
for i in "${IMAGES[@]}"; do
  oc get istag "${i%%:*}:$TAG" >/dev/null 2>&1 || die "image ${i%%:*}:$TAG not in the registry - run openshift/01-build-push.sh (or set TAG)"
done

apply_cm() { # <name> <file>
  oc create configmap "$1" --from-file="$2" --dry-run=client -o yaml | oc apply -f - >/dev/null
  oc label configmap "$1" app.kubernetes.io/part-of=aqarat-sso --overwrite >/dev/null
}
step "realm ConfigMaps"
apply_cm sso-realm-aqarat-poc keycloak/realms/aqarat-poc.json
apply_cm sso-realm-nas keycloak/realms-nas/nas.json

step "services"
oc apply -f $M/10-services.yaml
NAS_IP=$(oc get svc sso-mock-nas -o jsonpath='{.spec.clusterIP}')
KC_IP=$(oc get svc sso-keycloak -o jsonpath='{.spec.clusterIP}')
API_IP=$(oc get svc sso-mock-api -o jsonpath='{.spec.clusterIP}')
echo "nas.aqarat.lab -> $NAS_IP, keycloak.aqarat.lab -> $KC_IP, api.aqarat.lab -> $API_IP (inside the cluster)"

step "workloads and routes (tag $TAG)"
for f in $M/20-postgres.yaml $M/30-keycloak.yaml $M/40-mock-nas.yaml $M/50-mock-api.yaml $M/60-portal.yaml $M/70-routes.yaml; do
  sed -e "s/__NAS_SVC_IP__/$NAS_IP/g" -e "s/__KEYCLOAK_SVC_IP__/$KC_IP/g" -e "s/__API_SVC_IP__/$API_IP/g" -e "s/__TAG__/$TAG/g" "$f" | oc apply -f -
done

DEPLOYS=(sso-postgres sso-keycloak sso-mock-nas sso-mock-api sso-portal)
if [ "${1:-}" = --restart ]; then
  step "restart"
  for d in "${DEPLOYS[@]}"; do oc rollout restart deployment/$d; done
fi

step "waiting for the deployments (Keycloak's first start takes a few minutes)"
for d in "${DEPLOYS[@]}"; do
  oc rollout status deployment/$d --timeout=600s || { oc get pods -l app.kubernetes.io/name=$d; die "$d is not ready - check: oc logs deployment/$d"; }
done

step "routes"
oc get routes -l app.kubernetes.io/part-of=aqarat-sso -o custom-columns=NAME:.metadata.name,HOST:.spec.host,ADMITTED:.status.ingress[0].conditions[0].status
echo
echo "Deployed. Next: bash openshift/04-verify.sh"
