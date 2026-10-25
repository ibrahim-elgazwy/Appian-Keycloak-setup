#!/usr/bin/env bash
# Print the values for Appian's OIDC provider form (Admin Console -> Authentication -> Single Sign-On -> OpenID Connect).
# The client secret is shown only with --show-secret; hand it to the Appian admin directly, never by chat or email.
# Usage: bash openshift/05-appian-sheet.sh [--show-secret]
source "$(dirname "$0")/common.sh"
KC=https://keycloak.aqarat.lab
R=$KC/realms/aqarat-poc

secret="(run with --show-secret, or Keycloak admin console: aqarat-poc -> Clients -> aqarat-appian -> Credentials)"
if [ "${1:-}" = --show-secret ]; then
  need_login
  C=(-s --cacert certs/ca.crt --ssl-no-revoke --resolve "keycloak.aqarat.lab:443:$CLUSTER_IP")
  env=$(oc extract secret/aqarat-sso-env --keys=KC_ADMIN_USERNAME,KC_ADMIN_PASSWORD --to=- 2>/dev/null | awk '/^# /{k=$2; next} {print k "=" $0}')
  user=$(echo "$env" | sed -n 's/^KC_ADMIN_USERNAME=//p'); pass=$(echo "$env" | sed -n 's/^KC_ADMIN_PASSWORD=//p')
  tok=$(curl "${C[@]}" --data-urlencode "username=$user" --data-urlencode "password=$pass" -d grant_type=password -d client_id=admin-cli \
    "$KC/realms/master/protocol/openid-connect/token" | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
  id=$(curl "${C[@]}" -H "Authorization: Bearer $tok" "$KC/admin/realms/aqarat-poc/clients?clientId=aqarat-appian" | node -pe "JSON.parse(require('fs').readFileSync(0))[0].id")
  secret=$(curl "${C[@]}" -H "Authorization: Bearer $tok" "$KC/admin/realms/aqarat-poc/clients/$id/client-secret" | node -pe "JSON.parse(require('fs').readFileSync(0)).value")
fi

cat <<EOF
Appian OIDC identity provider
-----------------------------
Description               AQARAT Keycloak
Web Address Identifier    aqarat
Client ID                 aqarat-appian
Client Secret             $secret
Protocol                  OpenID Connect Discovery 1.0
Discovery Endpoint        $R/.well-known/openid-configuration
UserInfo Endpoint         (leave empty)
End Session Endpoint      $R/protocol/openid-connect/logout
Scope                     openid profile email
Username Claim            preferred_username
Authentication Group      AQARAT OIDC Users
First / Last name, Email  given_name / family_name / email
Create new users          On
Update existing users     On
Group membership sync     Off

Embedded Interfaces       add CORS allowed origin: portal.aqarat.lab
Appian server hosts file  $CLUSTER_IP keycloak.aqarat.lab nas.aqarat.lab api.aqarat.lab portal.aqarat.lab
Check from Appian server  curl -sS $R/.well-known/openid-configuration | head -c 200

After saving in Appian: copy its Callback URL and set it as the only Valid redirect URI of client aqarat-appian
(Keycloak admin console, realm aqarat-poc), replacing https://appian.aqarat.lab/suite/*.
EOF
