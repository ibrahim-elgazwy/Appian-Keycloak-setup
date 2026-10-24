import { Routes } from '@angular/router';
import { autoLoginPartialRoutesGuard } from 'angular-auth-oidc-client';
import { appianSessionGuard } from './appian/appian-session.guard';
import { BrokerRenewal } from './pages/broker-renewal';
import { Home } from './pages/home';

export const routes: Routes = [
  { path: '', component: Home },
  // The OIDC code is processed by the app-initializer auth check; this route only lands the user.
  { path: 'callback', redirectTo: '' },
  {
    path: 'services/renewal',
    component: BrokerRenewal,
    canActivate: [autoLoginPartialRoutesGuard, appianSessionGuard],
  },
  { path: '**', redirectTo: '' },
];
