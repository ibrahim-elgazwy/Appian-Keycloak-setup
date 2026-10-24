import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AppianEmbedService } from '../appian/appian-embed.service';
import { settings } from '../settings';

type AppianElement = HTMLElement & { destroy?: () => void };

@Component({
  selector: 'app-broker-renewal',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <h1>Broker licence renewal</h1>
    <p class="muted">Embedded Appian action, served by {{ appianBaseUrl }}.</p>
    @switch (state()) {
      @case ('loading') {
        <p>Loading Appian…</p>
      }
      @case ('error') {
        <div class="alert">
          <strong>The Appian embedded script did not load.</strong>
          <p>{{ error() }}</p>
          <ul>
            <li>Is <code>appian.aqarat.lab</code> reachable and its certificate trusted by this browser?</li>
            <li>Is <code>{{ origin }}</code> on Appian's Embedded Interfaces allowed origins?</li>
          </ul>
        </div>
      }
    }
    @if (uuidMissing) {
      <div class="alert">Set <code>processModelUuid</code> in <code>src/app/settings.ts</code>.</div>
    }
    <div class="embed" [hidden]="state() !== 'ready' || uuidMissing">
      <appian-action #action [attr.processModelUuid]="processModelUuid"></appian-action>
    </div>
  `,
})
export class BrokerRenewal implements OnInit, OnDestroy {
  private readonly embed = inject(AppianEmbedService);
  private readonly action = viewChild<ElementRef<AppianElement>>('action');

  protected readonly appianBaseUrl = settings.appianBaseUrl;
  protected readonly processModelUuid = settings.processModelUuid;
  protected readonly uuidMissing = settings.processModelUuid.startsWith('REPLACE');
  protected readonly origin = window.location.origin;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal('');

  ngOnInit() {
    this.embed.load().then(
      () => this.state.set('ready'),
      (e: Error) => {
        this.error.set(e.message);
        this.state.set('error');
      },
    );
  }

  ngOnDestroy() {
    this.action()?.nativeElement.destroy?.();
  }
}
