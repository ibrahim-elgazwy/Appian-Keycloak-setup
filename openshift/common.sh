# Shared settings for the openshift/*.sh scripts (sourced, not run). Override any of them in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."

NS=${NS:-aqarat}
REGISTRY=${REGISTRY:-default-route-openshift-image-registry.apps-crc.testing}   # external route (push from a PC)
CLUSTER_IP=${CLUSTER_IP:-192.168.52.12}                                         # router: *.aqarat.lab -> here
TAG=${TAG:-$(git rev-parse --short HEAD)}
IMAGES=(aqarat-sso-mock-api:mock-api aqarat-sso-portal:portal)                   # <image name>:<build folder>
PATH=$HOME/bin:$PATH

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

need_login() {
  oc whoami >/dev/null 2>&1 || die "not logged in to OpenShift - run: oc login https://api.crc.testing:6443 --token=..."
  [ "$(oc project -q)" = "$NS" ] || oc project "$NS" >/dev/null
}
need_can() { # <verb> <resource>...
  local r
  for r in "${@:2}"; do
    [ "$(oc auth can-i "$1" "$r" -n "$NS" 2>/dev/null)" = yes ] \
      || die "$(oc whoami) may not $1 $r in project $NS - ask the OpenShift admin for the 'edit' role on $NS"
  done
}
