import { CanActivateFn } from '@angular/router';
import { settings } from '../settings';

export const APPIAN_BOOTSTRAP_FLAG = 'appianBootstrapped';

// Once-per-login Appian session bootstrap. The mechanism is decided by the Phase 1 spike (Gate M1).
export const appianSessionGuard: CanActivateFn = (_route, state) => {
  if (settings.appianSessionBootstrap === 'none') return true;
  if (sessionStorage.getItem(APPIAN_BOOTSTRAP_FLAG)) return true;
  sessionStorage.setItem(APPIAN_BOOTSTRAP_FLAG, '1'); // set before leaving, so a failed bootstrap cannot loop
  const returnUrl = `${window.location.origin}${state.url}`;
  window.location.assign(settings.appianBootstrapUrl + encodeURIComponent(returnUrl));
  return false;
};
