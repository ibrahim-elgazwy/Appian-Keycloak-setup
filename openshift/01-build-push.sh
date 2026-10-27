#!/usr/bin/env bash
# Build the mock-api and portal images into the OpenShift registry (project aqarat), tagged with the git commit.
#   Default (BUILD=cluster): OpenShift builds them from the committed code (git archive -> binary Docker build).
#     Needs only an oc login with the edit role; no Docker, registry login or insecure-registries setting.
#   BUILD=docker: build locally and push. Needs the registry in Docker's insecure-registries and a registry login:
#     docker login default-route-openshift-image-registry.apps-crc.testing -u registry-dev --password-stdin < ~/.aqarat/registry-dev.token
# Usage: bash openshift/01-build-push.sh          (TAG=... to override the tag)
source "$(dirname "$0")/common.sh"
BUILD=${BUILD:-cluster}

[ -z "$(git status --porcelain -- mock-api portal)" ] || echo "WARNING: uncommitted changes in mock-api/ or portal/ are not in the build"

if [ "$BUILD" = docker ]; then
  grep -q "\"$REGISTRY\"" ~/.docker/config.json 2>/dev/null || die "no docker login for $REGISTRY (see the command at the top of this script)"
  for i in "${IMAGES[@]}"; do
    ref=$REGISTRY/$NS/${i%%:*}:$TAG
    step "build ${i%%:*} from ${i#*:}/ -> $ref"
    docker build -t "$ref" "${i#*:}"
    docker push "$ref"
  done
else
  need_login
  need_can create buildconfigs builds imagestreams
  work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
  for i in "${IMAGES[@]}"; do
    name=${i%%:*} dir=${i#*:}
    step "cluster build $name from $dir/ at $TAG"
    oc get bc "$name" >/dev/null 2>&1 || {
      oc new-build --binary --strategy=docker --name="$name" --to="$name:latest" >/dev/null
      oc label bc/"$name" is/"$name" app.kubernetes.io/part-of=aqarat-sso --overwrite >/dev/null
    }
    git archive --format=tar.gz -o "$work/$name.tgz" "$TAG:$dir"          # committed code only, no node_modules
    oc start-build "$name" --from-archive="$work/$name.tgz" --follow --wait >"$work/$name.log" 2>&1 \
      || { tail -30 "$work/$name.log"; die "build of $name failed - full log: oc logs bc/$name"; }
    oc tag "$name:latest" "$name:$TAG" >/dev/null
    echo "built $name:$TAG"
  done
fi
step "done: images tagged $TAG - next: bash openshift/02-secrets.sh, then bash openshift/03-deploy.sh"
