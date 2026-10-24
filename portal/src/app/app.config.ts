import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { authInterceptor, provideAuth, withAppInitializerAuthCheck } from 'angular-auth-oidc-client';
import { routes } from './app.routes';
import { settings } from './settings';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor()])),
    provideAuth(
      {
        config: {
          authority: settings.keycloakAuthority,
          clientId: settings.clientId,
          redirectUrl: `${window.location.origin}/callback`,
          postLogoutRedirectUri: window.location.origin,
          scope: 'openid profile email aqarat-api',
          responseType: 'code', // Authorization Code + PKCE
          silentRenew: true,
          useRefreshToken: true,
          renewTimeBeforeTokenExpiresInSeconds: 30,
          secureRoutes: [settings.apiBaseUrl], // token goes to the AQARAT backend API only
        },
      },
      withAppInitializerAuthCheck(),
    ),
  ],
};
