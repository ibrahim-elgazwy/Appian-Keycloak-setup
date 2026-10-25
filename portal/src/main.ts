import { bootstrapApplication } from '@angular/platform-browser';
import { settings } from './app/settings';

// Optional runtime overrides: a deployment (e.g. OpenShift) serves /config.json with its own URLs, so one image
// works everywhere. Without it (ng serve, laptop) the values in settings.ts are used.
fetch('/config.json', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then((overrides) => {
    Object.assign(settings, overrides);
    // Loaded only now, because app.config reads settings when the module is evaluated.
    return Promise.all([import('./app/app.config'), import('./app/app')]);
  })
  .then(([{ appConfig }, { App }]) => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
