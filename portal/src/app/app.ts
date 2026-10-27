import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AsyncPipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { APPIAN_BOOTSTRAP_FLAG } from './appian/appian-session.guard';

@Component({
  imports: [AsyncPipe, RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(OidcSecurityService);
  // /signin is a full-page design without the portal header.
  protected readonly fullPage = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/signin')),
    ),
    { initialValue: location.pathname.startsWith('/signin') },
  );

  signOut() {
    // Portal + Keycloak end_session. Appian's own session is ended by Appian's OIDC
    // end-session setting or its logout URL (decision D7, test T9).
    sessionStorage.removeItem(APPIAN_BOOTSTRAP_FLAG);
    this.auth.logoff().subscribe();
  }
}
