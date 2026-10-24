// NAS simulation checks (plan .claude/docs/06):
//  1) NAS contract: log in at the mock NAS directly as the broker client and inspect the ID token it returns.
//  2) Broker sign-in for every persona: portal client -> Keycloak (aqarat-poc) -> broker `nas` -> code + PKCE.
//  3) Wrong broker client secret (N8): temporarily breaks the IdP secret through the admin API, then restores it.
// Run from appian-keyclock/:  NODE_EXTRA_CA_CERTS=certs/ca.crt node scripts/verify-broker-login.mjs
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const KC_BASE = 'https://keycloak.aqarat.lab:8443';
const KC = `${KC_BASE}/realms/aqarat-poc/protocol/openid-connect`;
const NAS = 'https://nas.aqarat.lab:8445/realms/nas/protocol/openid-connect';
const BROKER_ENDPOINT = `${KC_BASE}/realms/aqarat-poc/broker/nas/endpoint`;
const REDIRECT = 'https://portal.aqarat.lab:4200/callback';
const b64json = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

// Cookie jar keyed by host + path + name (the two Keycloaks are now on different hosts).
function browser() {
  const jar = new Map();
  const header = (url) => {
    const u = new URL(url);
    return [...jar.values()].filter((c) => c.host === u.host && u.pathname.startsWith(c.path)).map((c) => `${c.name}=${c.value}`).join('; ');
  };
  return async function go(url, init = {}) {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...init.headers, cookie: header(url) } });
    const host = new URL(url).host;
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';').map((s) => s.trim());
      const i = pair.indexOf('=');
      const path = attrs.find((a) => /^path=/i.test(a))?.slice(5) || '/';
      jar.set(`${host}|${path}|${pair.slice(0, i)}`, { host, name: pair.slice(0, i), path, value: pair.slice(i + 1) });
    }
    return res;
  };
}
const decodeHtml = (s) => s.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"');
const pageMessage = (html) => {
  const title = /id="kc-page-title"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1];
  const msg = /class="[^"]*(?:kc-feedback-text|alert__title|instruction|input-error)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p|h4)>/.exec(html)?.[1];
  return [title, msg].filter(Boolean).map((s) => decodeHtml(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).join(' | ');
};

// Follows redirects, logs in at the NAS page, auto-submits Keycloak forms. Returns { code } or { stopped, message }.
async function signIn(go, startUrl, username, stopAt) {
  let res = await go(startUrl);
  let posted = false;
  let lastAction = '';
  for (let hop = 0; hop < 25; hop++) {
    const loc = res.headers.get('location');
    if (loc?.startsWith(stopAt)) {
      const q = new URL(loc).searchParams;
      return q.get('code') ? { code: q.get('code') } : { stopped: 'error-redirect', message: `${q.get('error')}: ${q.get('error_description')}` };
    }
    if (loc) { res = await go(new URL(loc, res.url || startUrl).href); continue; }
    const html = await res.text();
    const action = /<form[^>]*action="([^"]+)"/.exec(html)?.[1];
    if (!action) return { stopped: `HTTP ${res.status}`, message: pageMessage(html) || html.slice(0, 200) };
    if (/name="password"/.test(html)) {
      if (posted) return { stopped: 'login-page-again', message: pageMessage(html) };
      posted = true;
      res = await go(decodeHtml(action), { method: 'POST', body: new URLSearchParams({ username, password: env.MOCK_USER_PASSWORD }) });
      continue;
    }
    // e.g. first-broker-login "review profile": submit the prefilled values once; a second identical page means refused.
    if (action === lastAction) return { stopped: 'form-repeated', message: pageMessage(html) };
    lastAction = action;
    const fields = Object.fromEntries([...html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)].map((m) => [m[1], decodeHtml(m[2])]));
    res = await go(decodeHtml(action), { method: 'POST', body: new URLSearchParams(fields) });
  }
  return { stopped: 'too-many-hops' };
}

async function adminApi() {
  const r = await fetch(`${KC_BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: env.KC_ADMIN_USERNAME, password: env.KC_ADMIN_PASSWORD }),
  });
  const { access_token } = await r.json();
  return async (path, init = {}) => {
    const res = await fetch(`${KC_BASE}/admin/realms/aqarat-poc/${path}`, {
      ...init, headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json', ...init.headers },
    });
    return res.status === 204 ? null : res.json();
  };
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!ok) failures++;
};

// ---------- 1. NAS contract (what the real NAS is assumed to return) ----------
{
  const go = browser();
  const { verifier, challenge } = pkce();
  const auth = `${NAS}/auth?` + new URLSearchParams({
    client_id: 'aqarat-sso', response_type: 'code', redirect_uri: BROKER_ENDPOINT, state: 'c1', nonce: 'n1',
    scope: 'openid profile email phone nas_identity', code_challenge: challenge, code_challenge_method: 'S256',
  });
  const r = await signIn(go, auth, '28463400001', BROKER_ENDPOINT);
  const tokenRes = await fetch(`${NAS}/token`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`aqarat-sso:${env.NAS_CLIENT_SECRET}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: r.code ?? '', redirect_uri: BROKER_ENDPOINT, code_verifier: verifier }),
  });
  const tokens = await tokenRes.json();
  const id = tokens.id_token ? b64json(tokens.id_token) : {};
  const shown = Object.fromEntries(Object.entries(id).filter(([k]) => !['exp', 'iat', 'jti', 'nonce', 'sid', 'at_hash', 'auth_time', 'typ', 'azp'].includes(k)));
  console.log('NAS ID token (contract sample):\n' + JSON.stringify(shown, null, 2));
  check('contract: issuer is the NAS realm', id.iss === 'https://nas.aqarat.lab:8445/realms/nas', id.iss);
  check('contract: aud = aqarat-sso', [].concat(id.aud).includes('aqarat-sso'), id.aud);
  check('contract: qid claim = 28463400001', id.qid === '28463400001', id.qid);
  check('contract: sub is opaque (not the QID)', id.sub && id.sub !== id.qid, id.sub);
  check('contract: English + Arabic names', id.given_name === 'Ahmed' && id.family_name === 'Al-Mansoori' && !!id.name_ar && !!id.given_name_ar, '');
  check('contract: phone, birthdate, gender, nationality, user_type', id.phone_number && id.birthdate && id.gender && id.nationality === 'QAT' && id.user_type === 'citizen', '');
  check('contract: acr / amr', id.acr === 'urn:nas:loa:substantial' && JSON.stringify(id.amr) === '["pwd"]', { acr: id.acr, amr: id.amr });
  check('contract: no refresh token', !tokens.refresh_token, Object.keys(tokens));
  check('contract: RS256 signature', JSON.parse(Buffer.from(tokens.id_token.split('.')[0], 'base64url')).alg === 'RS256', '');
}

// ---------- 2. Broker sign-in per persona ----------
const api = await adminApi();
async function brokerLogin(username) {
  const go = browser();
  const { verifier, challenge } = pkce();
  const auth = `${KC}/auth?` + new URLSearchParams({
    client_id: 'aqarat-portal', redirect_uri: REDIRECT, response_type: 'code', state: 's1', nonce: 'n1',
    scope: 'openid profile email aqarat-api', code_challenge: challenge, code_challenge_method: 'S256', kc_idp_hint: 'nas',
  });
  const r = await signIn(go, auth, username, REDIRECT);
  if (!r.code) return r;
  const tokens = await (await fetch(`${KC}/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'aqarat-portal', code: r.code, redirect_uri: REDIRECT, code_verifier: verifier }),
  })).json();
  return { claims: b64json(tokens.access_token) };
}
async function localUser(username) {
  const u = (await api(`users?username=${encodeURIComponent(username)}&exact=true`))[0];
  if (!u) return null;
  const groups = await api(`users/${u.id}/groups`);
  return { ...u, groups: groups.map((g) => g.path) };
}

const personas = [
  { user: '28463400001', test: 'N1 citizen', expect: 'ok' },
  { user: '29035600002', test: 'resident', expect: 'ok' },
  { user: '29581800003', test: 'N3 resident without email', expect: 'ok' },
  { user: '30163400004', test: 'unverified email', expect: 'ok' },
  { user: 'noqid.test', test: 'N4 no QID -> refused', expect: 'refused' },
  { user: '28863400006', test: 'N5 disabled at NAS', expect: 'refused' },
];
for (const p of personas) {
  const r = await brokerLogin(p.user);
  if (p.expect === 'ok') {
    const u = r.claims && (await localUser(`ext_${p.user}`));
    check(`${p.test}: signed in as ext_${p.user}`, r.claims?.preferred_username === `ext_${p.user}` && [].concat(r.claims.aud).includes('aqarat-api'),
      r.claims ? { email: r.claims.email ?? null, email_verified: r.claims.email_verified } : r);
    if (u) {
      check(`${p.test}: national_id, Arabic name, group, email not trusted`,
        u.attributes?.national_id?.[0] === p.user && !!u.attributes?.name_ar && u.groups.includes('/external-users') && u.emailVerified === false,
        { national_id: u.attributes?.national_id, name_ar: u.attributes?.name_ar, user_type: u.attributes?.user_type, groups: u.groups, emailVerified: u.emailVerified });
    }
  } else {
    const leaked = (await api('users?search=ext_&max=100')).filter((u) => !/^ext_\d{11}$/.test(u.username)).map((u) => u.username);
    check(`${p.test}`, !r.claims, r.claims ? { unexpected: r.claims.preferred_username } : `${r.stopped}: ${r.message}`);
    check(`${p.test}: no malformed ext_ account created`, leaked.length === 0, leaked);
  }
}

// ---------- 3. N8 wrong client secret ----------
{
  const idp = await api('identity-provider/instances/nas');
  await api('identity-provider/instances/nas', { method: 'PUT', body: JSON.stringify({ ...idp, config: { ...idp.config, clientSecret: 'wrong-secret' } }) });
  try {
    const r = await brokerLogin('28463400001');
    check('N8 wrong broker secret -> login fails', !r.claims, r.claims ? 'signed in anyway' : `${r.stopped}: ${r.message}`);
  } finally {
    await api('identity-provider/instances/nas', { method: 'PUT', body: JSON.stringify({ ...idp, config: { ...idp.config, clientSecret: env.NAS_CLIENT_SECRET } }) });
  }
  const again = await brokerLogin('28463400001');
  check('N8 secret restored -> login works again', again.claims?.preferred_username === 'ext_28463400001', '');
}

console.log(`----- ${failures === 0 ? 'all passed' : `${failures} failed`}`);
process.exit(failures ? 1 : 0);
