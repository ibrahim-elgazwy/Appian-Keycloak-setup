import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
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

  signOut() {
    // Portal + Keycloak end_session. Appian's own session is ended by Appian's OIDC
    // end-session setting or its logout URL (decision D7, test T9).
    sessionStorage.removeItem(APPIAN_BOOTSTRAP_FLAG);
    this.auth.logoff().subscribe();
  }
}
