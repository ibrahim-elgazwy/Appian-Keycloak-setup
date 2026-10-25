# AQARAT SSO on OpenShift (lab CRC cluster, project `aqarat`)

Runs the same five services as `docker-compose.yml` (postgres, keycloak, mock NAS, mock API, portal) in project
`aqarat` on the lab cluster at 192.168.52.12. Public URLs have **no port**: the cluster router serves everything on 443.

| Name | URL | Route | Pod port |
|---|---|---|---|
| Keycloak | `https://keycloak.aqarat.lab` | `sso-keycloak` (passthrough) | 8443 |
| Mock NAS | `https://nas.aqarat.lab` | `sso-mock-nas` (passthrough) | 8445 |
| Mock API | `https://api.aqarat.lab` | `sso-mock-api` (passthrough) | 8444 |
| Portal | `https://portal.aqarat.lab` | `sso-portal` (passthrough) | 4200 |

The laptop setup is unchanged. The realm files use `${AQ_PORTAL_URL}`, `${AQ_NAS_URL}` and `${AQ_KEYCLOAK_URL}`, which
`docker-compose.yml` sets to the port URLs and the manifests set to the port-less ones. The portal reads its URLs
from `/config.json` (ConfigMap `sso-portal-config`) and falls back to `src/app/settings.ts`.

## Prerequisites (once)

1. `oc` CLI on your PATH, and a login with the **`edit`** role on project `aqarat`. The `registry-dev` account can
   push images and create Secrets, but cannot deploy.
2. Hosts entries on your PC (no DNS for these names):
   `192.168.52.12 api.crc.testing default-route-openshift-image-registry.apps-crc.testing`
3. Only for `BUILD=docker`: in Docker, add `default-route-openshift-image-registry.apps-crc.testing` to `insecure-registries`, then log in with
   `docker login default-route-openshift-image-registry.apps-crc.testing -u registry-dev --password-stdin < ~/.aqarat/registry-dev.token`

## Deploy

Run from the repository root (Git Bash on Windows, or Linux/macOS):

| Step | Command | What it does |
|---|---|---|
| 1 | `bash openshift/01-build-push.sh` | Builds `aqarat-sso-mock-api` and `aqarat-sso-portal` inside OpenShift from the committed code, tagged with the git commit (`BUILD=docker` builds locally and pushes) |
| 2 | `bash openshift/02-secrets.sh` | Creates `aqarat-sso-env` with new random secrets (never overwritten) and `aqarat-tls` from `certs/` |
| 3 | `bash openshift/03-deploy.sh` | Realm ConfigMaps, services, workloads, routes; waits until all are ready |
| 4 | `bash openshift/04-verify.sh` | Pods, TLS on all four names, API/token/CORS checks; Node checks once hosts point to the cluster |
| 5 | `bash openshift/05-appian-sheet.sh` | Prints the Appian OIDC values (`--show-secret` adds the client secret) |

Then put `192.168.52.12 keycloak.aqarat.lab nas.aqarat.lab api.aqarat.lab portal.aqarat.lab` in the hosts file of the
test PCs and the Appian server, and add `portal.aqarat.lab` to Appian's Embedded Interfaces origins.

## Certificate

`aqarat-tls` holds `tls.crt`, `tls.key` and `ca.crt`, and every pod serves it directly (passthrough routes).

- **Now:** the lab dev CA in `certs/`. Appian and the test PCs must trust `certs/ca.crt`: upload it to Appian's
  Trusted Server Certificates, and import it on the PCs.
- **Later:** the AQ-DC01-CA certificate. Put the three files in a folder, then run
  `CERT_DIR=<folder> bash openshift/02-secrets.sh` and `bash openshift/03-deploy.sh --restart`.

## Day-2

- **Testers' password:** `oc extract secret/aqarat-sso-env --keys=MOCK_USER_PASSWORD --to=-`. Share it through the
  password manager.
- **Logs:** `oc logs deployment/sso-keycloak` (also `sso-mock-nas`, `sso-mock-api`, `sso-portal`, `sso-postgres`).
- **Realm changes:** Keycloak imports `aqarat-poc` only on first start. Later changes go through the admin console, or
  through a fresh database (delete PVC `sso-postgres-data`). The mock NAS re-imports `nas.json` on every new pod.
- **Remove everything:** `oc delete all,configmap,pvc,route,secret -l app.kubernetes.io/part-of=aqarat-sso`.
  This deletes the Keycloak database.
