// Local lab settings. Hostnames resolve via the hosts file (see ../../README.md).
export const settings = {
  keycloakAuthority: 'https://keycloak.aqarat.lab:8443/realms/aqarat-poc',
  clientId: 'aqarat-portal',
  // AQARAT backend API (mock). The portal calls it directly; the bearer token is attached to this origin only.
  apiBaseUrl: 'https://api.aqarat.lab:8444/',
  appianBaseUrl: 'https://appian.aqarat.lab',
  // Web Address Identifier of the Keycloak OIDC provider in Appian (Admin Console -> Single Sign-On); used by /signin.
  appianSignInIdentifier: 'aqarat',
  // UUID of the test process model (Appian Phase 4).
  processModelUuid: 'REPLACE-WITH-PROCESS-MODEL-UUID',
  // Set only if Keycloak is not Appian's default sign-in method (data-signin on the bootstrap script).
  appianSignInIdp: '',
  // Phase 1 spike switch:
  //  'none'      -> rely on Appian's embedded sign-in dialog/popup (option B)
  //  'top-level' -> navigate to appianBootstrapUrl + encoded return URL once per login (option A)
  appianSessionBootstrap: 'none' as 'none' | 'top-level',
  appianBootstrapUrl: '',
};
