import { Component, inject, signal } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { settings } from '../settings';

@Component({
  selector: 'app-home',
  imports: [AsyncPipe, JsonPipe, RouterLink],
  template: `
    @if ((auth.isAuthenticated$ | async)?.isAuthenticated) {
      @let user = (auth.userData$ | async)?.userData;
      <h1>Welcome, {{ user?.given_name }} {{ user?.family_name }}</h1>
      <p class="muted">Signed in to Keycloak as <code>{{ user?.preferred_username }}</code></p>

      <section class="tiles">
        <a class="tile" routerLink="/services/renewal">
          <strong>Broker licence renewal</strong>
          <span>Embedded Appian action</span>
        </a>
      </section>

      <h2>AQARAT backend API (mock)</h2>
      <div class="actions">
        <button (click)="call('aqarat/me')">GET /aqarat/me</button>
        <button (click)="call('aqarat/properties')">GET /aqarat/properties</button>
        <button (click)="call('appian/properties')">GET /appian/properties</button>
      </div>
      @if (result()) {
        <pre>{{ result() | json }}</pre>
      }
    } @else {
      <h1>AQARAT portal (POC)</h1>
      <p>Sign in with Keycloak to use the services.</p>
      <button class="primary" (click)="auth.authorize()">Sign in</button>
    }
  `,
})
export class Home {
  protected readonly auth = inject(OidcSecurityService);
  private readonly http = inject(HttpClient);
  protected readonly result = signal<unknown>(null);

  call(path: string) {
    this.http.get(settings.apiBaseUrl + path).subscribe({
      next: (body) => this.result.set({ status: 200, path, body }),
      error: (e: HttpErrorResponse) => this.result.set({ status: e.status, path, body: e.error }),
    });
  }
}
