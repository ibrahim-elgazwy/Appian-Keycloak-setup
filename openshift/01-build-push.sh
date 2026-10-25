#!/usr/bin/env bash
# Build the mock-api and portal images and push them to the OpenShift registry (project aqarat).
# Needs Docker, the registry in Docker's insecure-registries list, and a registry login (done by you, once):
#   docker login default-route-openshift-image-registry.apps-crc.testing -u registry-dev --password-stdin < ~/.aqarat/registry-dev.token
# Usage: bash openshift/01-build-push.sh          (tag = current git commit; TAG=... to override)
source "$(dirname "$0")/common.sh"

[ -z "$(git status --porcelain -- mock-api portal)" ] || echo "WARNING: uncommitted changes in mock-api/ or portal/ are built into tag $TAG"
grep -q "\"$REGISTRY\"" ~/.docker/config.json 2>/dev/null || die "no docker login for $REGISTRY (see the command at the top of this script)"

for i in "${IMAGES[@]}"; do
  name=${i%%:*} dir=${i#*:} ref=$REGISTRY/$NS/${i%%:*}:$TAG
  step "build $name from $dir/ -> $ref"
  docker build -t "$ref" "$dir"
  docker push "$ref"
done
step "done: pushed tag $TAG - deploy it with: TAG=$TAG bash openshift/03-deploy.sh (the default when nothing was committed since)"
