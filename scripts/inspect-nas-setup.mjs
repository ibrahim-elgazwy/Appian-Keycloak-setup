// Admin-API check that both realms were imported as intended (user profile, personas, broker `nas`).
// Run from appian-keyclock/:  NODE_EXTRA_CA_CERTS=certs/ca.crt node scripts/inspect-nas-setup.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
async function admin(base) {
  const r = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: env.KC_ADMIN_USERNAME, password: env.KC_ADMIN_PASSWORD }),
  });
  const { access_token } = await r.json();
  return async (path) => (await fetch(`${base}/admin/realms/${path}`, { headers: { authorization: `Bearer ${access_token}` } })).json();
}
let fail = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`); if (!ok) fail++; };

const nas = await admin('https://nas.aqarat.lab:8445');
const nasProfile = (await nas('nas/users/profile')).attributes.map((a) => a.name);
check('nas user profile declares qid + NAS attributes', ['qid', 'name_ar', 'nationality', 'user_type', 'phoneNumber'].every((n) => nasProfile.includes(n)), nasProfile);
const ahmed = (await nas('nas/users?username=28463400001&exact=true'))[0];
check('persona 28463400001 has qid + Arabic name', ahmed?.attributes?.qid?.[0] === '28463400001' && !!ahmed?.attributes?.name_ar, ahmed?.attributes);
const users = await nas('nas/users?max=50');
check('6 personas imported', users.length === 6, users.map((u) => u.username));
const client = (await nas('nas/clients?clientId=aqarat-sso'))[0];
check('client aqarat-sso: confidential, PKCE S256, no refresh tokens',
  client && !client.publicClient && client.attributes['pkce.code.challenge.method'] === 'S256' && client.attributes['use.refresh.tokens'] === 'false', client?.attributes);

const kc = await admin('https://keycloak.aqarat.lab:8443');
const pocProfile = (await kc('aqarat-poc/users/profile')).attributes;
const nid = pocProfile.find((a) => a.name === 'national_id');
check('aqarat-poc profile: national_id required + admin-only edit', !!nid?.required && JSON.stringify(nid.permissions.edit) === '["admin"]', nid);
const idps = await kc('aqarat-poc/identity-provider/instances');
check('only one identity provider: nas', idps.length === 1 && idps[0].alias === 'nas', idps.map((i) => i.alias));
const mappers = await kc('aqarat-poc/identity-provider/instances/nas/mappers');
check('username mapper ext_${CLAIM.qid}', mappers.some((m) => m.config.template === 'ext_${CLAIM.qid}'), mappers.map((m) => m.name));
check('13 broker mappers', mappers.length === 13, mappers.length);
const groups = await kc('aqarat-poc/groups');
check('group external-users exists', groups.some((g) => g.name === 'external-users'), groups);
console.log(`----- ${fail === 0 ? 'all passed' : `${fail} failed`}`);
process.exit(fail ? 1 : 0);
