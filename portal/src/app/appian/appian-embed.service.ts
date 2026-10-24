import { Injectable } from '@angular/core';
import { settings } from '../settings';

// Loads Appian's embedded bootstrap script once, at runtime, from the Appian server (never bundled).
@Injectable({ providedIn: 'root' })
export class AppianEmbedService {
  private loaded?: Promise<void>;

  load(): Promise<void> {
    return (this.loaded ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'appianEmbedded';
      script.src = `${settings.appianBaseUrl}/suite/tempo/ui/sail-client/embeddedBootstrap.nocache.js`;
      if (settings.appianSignInIdp) script.setAttribute('data-signin', settings.appianSignInIdp);
      script.onload = () => resolve();
      script.onerror = () => {
        this.loaded = undefined; // allow a retry
        script.remove();
        reject(new Error(`Could not load ${script.src}`));
      };
      document.head.appendChild(script);
    }));
  }
}
