// Mock of the AQARAT backend API for local development (no API gateway in front of it).
// The backend is the OAuth resource server: CORS for the portal origin, JWT validation against Keycloak
// (issuer, audience, expiry, signature via JWKS) and a per-user rate limit. When it needs Appian data it
// calls the Appian Web API server-side with its own Appian-API-Key; the user's token never goes to Appian.
// Business data and the Appian call are mocked in-process.
// It also plays the external Role API that Keycloak calls once per NAS login (/internal/v1/users/{qid}/roles).
import https from 'node:https';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const cfg = {
  port: Number(process.env.PORT ?? 8444),
  issuer: process.env.OIDC_ISSUER,
  audience: process.env.API_AUDIENCE ?? 'aqarat-api',
  allowedOrigin: process.env.ALLOWED_ORIGIN,
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 100),
  appianApiKey: process.env.APPIAN_API_KEY ?? '',
  // Shared with Keycloak only (Secret). Production: client credentials or mTLS, as agreed with the Role API owner.
  roleApiKey: process.env.ROLE_API_KEY ?? '',
};
if (!cfg.issuer || !cfg.allowedOrigin) throw new Error('OIDC_ISSUER and ALLOWED_ORIGIN are required');

// Role assignments per QID (mock data). Not listed -> 404 (unknown user). The last two QIDs simulate Role API faults.
const roleAssignments = {
  '28463400001': ['PROPERTY_OWNER'],
  '29035600002': ['BROKER'],
  '29581800003': ['PROPERTY_OWNER', 'BROKER', 'SUPER_ADMIN'], // SUPER_ADMIN is not on Keycloak's allow-list
  '30163400004': [],
};
const ROLE_API_FAIL_QID = '28463400007'; // -> HTTP 500
const ROLE_API_SLOW_QID = '28463400008'; // -> answers after 5 s (Keycloak gives up after 2 s)

const jwks = createRemoteJWKSet(new URL(`${cfg.issuer}/protocol/openid-connect/certs`));
const hits = new Map(); // sub -> { windowStart, count }

const properties = [
  { id: 'P-1001', title: 'Villa, West Bay', status: 'Registered' },
  { id: 'P-1002', title: 'Apartment, Lusail Marina', status: 'Pending transfer' },
];

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function corsHeaders(req) {
  return req.headers.origin === cfg.allowedOrigin
    ? { 'Access-Control-Allow-Origin': cfg.allowedOrigin, Vary: 'Origin' }
    : {};
}

async function authenticate(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!m) return { error: 'missing bearer token' };
  try {
    const { payload } = await jwtVerify(m[1], jwks, { issuer: cfg.issuer, audience: cfg.audience });
    return { claims: payload };
  } catch (e) {
    return { error: e.code ?? e.message };
  }
}

function rateLimited(sub) {
  const now = Date.now();
  const entry = hits.get(sub);
  if (!entry || now - entry.windowStart >= 60_000) {
    hits.set(sub, { windowStart: now, count: 1 });
    return false;
  }
  return ++entry.count > cfg.rateLimitPerMin;
}

function roleApiKeyValid(req) {
  const given = Buffer.from(String(req.headers['x-role-api-key'] ?? ''));
  const expected = Buffer.from(cfg.roleApiKey);
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

// External Role API (server-to-server, called by Keycloak). No CORS, no user token: the service key authenticates Keycloak.
async function handleRoleApi(req, res, url) {
  const m = /^\/internal\/v1\/users\/([^/]+)\/roles$/.exec(url.pathname);
  if (req.method !== 'GET' || !m) return send(res, 404, { error: 'not_found' });
  if (!roleApiKeyValid(req)) return send(res, 401, { error: 'invalid_service_key' });
  const qid = decodeURIComponent(m[1]);
  if (qid === ROLE_API_FAIL_QID) return send(res, 500, { error: 'role_store_unavailable' });
  if (qid === ROLE_API_SLOW_QID) await new Promise((r) => setTimeout(r, 5000));
  if (!(qid in roleAssignments)) return send(res, 404, { error: 'unknown_user' });
  return send(res, 200, { userId: qid, roles: roleAssignments[qid], version: 'mock-roles-v1' });
}

async function handle(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  if (url.pathname.startsWith('/internal/')) return handleRoleApi(req, res, url);
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return send(res, 204, undefined, Object.keys(cors).length ? {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    } : {});
  }
  if (url.pathname === '/health') return send(res, 200, { status: 'UP' }, cors);

  const { claims, error } = await authenticate(req);
  if (error) {
    return send(res, 401, { error: 'invalid_token', detail: error }, {
      ...cors, 'WWW-Authenticate': 'Bearer error="invalid_token"',
    });
  }
  if (rateLimited(claims.sub)) return send(res, 429, { error: 'rate_limited' }, { ...cors, 'Retry-After': '60' });

  if (req.method === 'GET' && url.pathname === '/aqarat/me') {
    const { sub, preferred_username, given_name, family_name, email, aud, scope, exp } = claims;
    return send(res, 200, { sub, preferred_username, given_name, family_name, email, aud, scope, exp }, cors);
  }
  if (req.method === 'GET' && url.pathname === '/aqarat/properties') {
    // Authorization from the external roles that Keycloak put in the token (claim aqarat_roles).
    if (![].concat(claims.aqarat_roles ?? []).includes('PROPERTY_OWNER')) {
      return send(res, 403, { error: 'forbidden', requiredRole: 'PROPERTY_OWNER' }, cors);
    }
    return send(res, 200, properties, cors);
  }

  if (url.pathname.startsWith('/appian/')) {
    // The backend's own server-side request to https://appian.aqarat.lab/suite/webapi/... (mocked here).
    // Built from scratch: only the API key from the backend's secret store, never the caller's headers.
    const outbound = { accept: 'application/json', 'appian-api-key': cfg.appianApiKey ? '<from secret store>' : '<missing>' };
    return send(res, 200, {
      mock: 'appian-web-api',
      operation: `${req.method} /suite/webapi/${url.pathname.slice('/appian/'.length)}`,
      callerForAuditOnly: claims.preferred_username,
      outboundHeaderNames: Object.keys(outbound).sort(),
    }, cors);
  }
  return send(res, 404, { error: 'not_found' }, cors);
}

https.createServer({
  cert: fs.readFileSync('/certs/tls.crt'),
  key: fs.readFileSync('/certs/tls.key'),
}, (req, res) => {
  const started = Date.now();
  res.on('finish', () => {
    // Authorization / Appian-API-Key are never logged.
    console.log(JSON.stringify({ t: new Date().toISOString(), method: req.method, path: req.url, status: res.statusCode, ms: Date.now() - started }));
  });
  handle(req, res).catch((e) => {
    console.error(e);
    send(res, 500, { error: 'internal' });
  });
}).listen(cfg.port, () => console.log(`aqarat mock backend API listening on https://0.0.0.0:${cfg.port}`));
