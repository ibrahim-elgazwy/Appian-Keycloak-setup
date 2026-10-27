# AQARAT POC — local stack

These are the local pieces for the Keycloak → Appian embedded SSO POC. The plan is in `AQARAT_Keycloak_Appian_Implementation_Plan.docx` and in `../.claude/docs/`.

| Piece | URL | What it is |
|---|---|---|
| Keycloak 26.8.1 + Postgres | https://keycloak.aqarat.lab:8443 | Realm `aqarat-poc`: portal, Appian and dev-tester clients; `aqarat-api` scope; identity provider **`nas`** (OIDC) with username `ext_<qid>` |
| Mock NAS (second Keycloak) | https://nas.aqarat.lab:8445 | Realm `nas`, client `aqarat-sso`, 6 test personas. It sends the assumed NAS claims (`qid`, English/Arabic names, phone, nationality, user type, `acr`/`amr`), with no refresh token. **Lab only**; see `../.claude/docs/06-nas-oidc-simulation-plan.md`. |
| Mock backend API | https://api.aqarat.lab:8444 | Mock of the AQARAT backend API, called directly by the portal (no API gateway). It validates the Keycloak token itself (issuer, audience `aqarat-api`, expiry, signature), allows CORS for the portal only, rate-limits per user, and calls the Appian Web API server-side with its own API key. Data is mocked. |
| Angular portal | https://portal.aqarat.lab:4200 | Angular 22 + `angular-auth-oidc-client` (code + PKCE) and the embedded `<appian-action>` |
| Appian (existing) | https://appian.aqarat.lab | Lab Appian at 192.168.52.12 |

## One-time setup

1. **Hosts file** (already added on this laptop):
   ```
   127.0.0.1 keycloak.aqarat.lab
   127.0.0.1 portal.aqarat.lab
   127.0.0.1 api.aqarat.lab
   127.0.0.1 nas.aqarat.lab
   ```
2. **Trust the local dev CA in the browser.** Run this in an **elevated** PowerShell:
   ```powershell
   Import-Certificate -FilePath D:\ebla\aqarat\appian-keyclock\certs\ca.crt -CertStoreLocation Cert:\LocalMachine\Root
   ```
   About this CA:
   - `certs/ca.crt` is "AQARAT Lab Dev CA (local only)".
   - It is **name-constrained**: it can only vouch for `*.aqarat.lab` and `localhost`.
   - To remove it later, delete it from `certmgr.msc` → Trusted Root Certification Authorities.
   - Instead, you can replace `certs/tls.crt` and `certs/tls.key` with a certificate from **AQ-DC01-CA** covering `keycloak.`, `portal.`, `api.` and `nas.aqarat.lab`, then restart the stack.
3. **Secrets:** `.env` holds generated local secrets. It is created from `.env.example` and is never committed or shared.

## Run

```bash
docker compose up -d --build        # Keycloak, Postgres, mock NAS, mock backend API
cd portal && npx ng serve           # portal on https://portal.aqarat.lab:4200
```

- Keycloak admin console: https://keycloak.aqarat.lab:8443/admin. The username and password are `KC_ADMIN_USERNAME` / `KC_ADMIN_PASSWORD` in `.env`.
- Mock NAS personas (log in with the QID as username; the password is `MOCK_USER_PASSWORD` in `.env`):

  | Username | Who | Expected result |
  |---|---|---|
  | `28463400001` | Ahmed Al-Mansoori, Qatari citizen | Signed in as `ext_28463400001` |
  | `29035600002` | Priya Nair, resident | Signed in as `ext_29035600002` |
  | `29581800003` | Omar Hassan, resident, **no email** | Signed in as `ext_29581800003` |
  | `30163400004` | Fatima Al-Kuwari, citizen, **unverified email** | Signed in as `ext_30163400004` |
  | `noqid.test` | NAS sends **no QID** | Refused: "does not match the configured essential claim" |
  | `28863400006` | Disabled at NAS | Refused at the NAS page: "Account is disabled" |
- Mock NAS admin console: https://nas.aqarat.lab:8445/admin (same admin username and password as the main Keycloak).
- To re-import the realms after editing `keycloak/realms/aqarat-poc.json` or `keycloak/realms-nas/nas.json`, run `docker compose down -v && docker compose up -d`. This wipes Keycloak data. The mock NAS has no database volume, so it re-imports whenever its container is recreated.

## Verify

```bash
bash scripts/verify-local.sh                                              # 13 checks: realms, mock NAS, tokens, T11 (401/200), CORS, server-side Appian call
NODE_EXTRA_CA_CERTS=certs/ca.crt node scripts/inspect-nas-setup.mjs       # admin API: user profiles, personas, broker `nas`, mappers, group
NODE_EXTRA_CA_CERTS=certs/ca.crt node scripts/verify-broker-login.mjs     # NAS contract (ID token claims) + every persona + wrong secret (N1, N3-N5, N8)
```

## Connecting Appian (next step)

Appian calls Keycloak **server-to-server**, so the Appian host (192.168.52.12) needs three things:

1. **Name resolution:** a hosts entry `192.168.1.2 keycloak.aqarat.lab` (this laptop's Wi-Fi IP).
2. **Network:** it must reach this laptop on TCP 8443. Check with `curl -vk https://keycloak.aqarat.lab:8443/realms/aqarat-poc/.well-known/openid-configuration` **from the Appian host**.
3. **Certificate trust:** either import `certs/ca.crt` into Appian's JVM truststore, or use an AQ-DC01-CA certificate for Keycloak (see step 2 of the setup).

Then, in the Appian Admin Console:

- **Authentication → OpenID Connect:**

  | Setting | Value |
  |---|---|
  | Discovery endpoint | `https://keycloak.aqarat.lab:8443/realms/aqarat-poc/.well-known/openid-configuration` |
  | Client ID | `aqarat-appian` |
  | Client secret | Keycloak → `aqarat-appian` → Credentials |
  | Scopes | `openid profile email` |
  | Username claim | `preferred_username` |
  | First / last name and email | `given_name`, `family_name`, `email` |
  | Authentication group | `AQARAT OIDC Users` |
  | End session endpoint | `https://keycloak.aqarat.lab:8443/realms/aqarat-poc/protocol/openid-connect/logout` |

- Copy Appian's read-only **callback URL** into Keycloak → `aqarat-appian` → Valid redirect URIs. It replaces the temporary `https://appian.aqarat.lab/suite/*`.
- Run **Test This Configuration**. Keep a native admin outside the OIDC group (break-glass: `/suite/?signin=native`).
- **Embedded Interfaces:** allow origin `https://portal.aqarat.lab:4200`.
- Create the test process model, give group `AQARAT Brokers` initiator rights, and put its UUID in `portal/src/app/settings.ts`.

## Lab server deployment

Full runbook: `../.claude/docs/07-lab-server-deployment.md`. The laptop workflow above is unchanged. The server adds three files:

| File | Purpose |
|---|---|
| `docker-compose.server.yml` | Override for the server: adds the **portal** container, `restart: unless-stopped` and log rotation (10 MB × 5) on every service |
| `portal/Dockerfile`, `portal/nginx.conf` | Production build of the portal, served by nginx on `https://portal.aqarat.lab:4200`. Same origin as `ng serve`, so no realm or CORS changes. Has an SPA fallback, security headers, no-store `index.html`, cached hashed bundles and a health check. |
| `scripts/server-cert.sh` | Certificate from **AQ-DC01-CA** for `keycloak.`, `portal.`, `api.` and `nas.aqarat.lab` |

```bash
# on the server, in the clone
bash scripts/server-cert.sh request                                   # key + certs/adcs/sso.csr (key never leaves the server)
#   on a domain machine: certreq -submit -attrib "CertificateTemplate:WebServer" sso.csr sso.cer ; certutil -ca.cert aq-dc01-ca.cer
bash scripts/server-cert.sh install sso.cer aq-dc01-ca.cer            # checks issuer/chain/key/SANs, backs up, installs tls.crt, tls.key, ca.crt
bash scripts/server-cert.sh status
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

- **Simpler commands:** put `COMPOSE_FILE=docker-compose.yml:docker-compose.server.yml` in the server's `.env` to use plain `docker compose ...`.
- **Install safety:** `install` refuses the common mix-ups: the CA certificate or the CSR in place of the issued certificate, a dev-CA certificate, or a certificate for another key.
- **Git hygiene:** `install` marks `certs/tls.crt` and `certs/ca.crt` as skip-worktree, so the server's certificates are never committed. `certs/adcs/` and `certs/backup-*/` are gitignored.

## OpenShift deployment (lab cluster, project `aqarat`)

The same stack also runs on the lab OpenShift cluster (192.168.52.12) on port-less URLs such as
`https://keycloak.aqarat.lab`. Run the numbered scripts in `openshift/` (build and push, secrets, deploy, verify,
Appian values). See [openshift/README.md](openshift/README.md).

## Dev-only items to remove before any shared environment

- Keycloak client `aqarat-dev-tester` (direct grant) and user `local_dev.tester`.
- The `mock-nas` container (`nas.aqarat.lab`, realm `nas`). In a real environment the broker `nas` points at the real NAS: only its URLs, client ID/secret and claim names change, never the alias.
- The local dev CA.
