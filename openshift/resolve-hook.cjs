// Test helper (like curl --resolve): when AQ_RESOLVE_IP is set, *.aqarat.lab resolve to that IP inside this Node
// process only, so the checks can reach the cluster without hosts-file entries. Loaded with: node --require <this file>
const dns = require('node:dns');
const ip = process.env.AQ_RESOLVE_IP;
if (ip) {
  const lookup = dns.lookup;
  dns.lookup = function (host, opts, cb) {
    if (typeof opts === 'function') [cb, opts] = [opts, {}];
    if (!/\.aqarat\.lab$/i.test(host)) return lookup.call(this, host, opts, cb);
    return opts && opts.all ? process.nextTick(cb, null, [{ address: ip, family: 4 }]) : process.nextTick(cb, null, ip, 4);
  };
}
