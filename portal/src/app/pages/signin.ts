import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { settings } from '../settings';

// Combined sign-in page for Appian: citizens and residents go through Keycloak + NAS (OIDC provider in Appian),
// staff use Appian's own username/password page. The page only links to those two pages; it never handles passwords.
// Texts are kept here so the business can review the Arabic wording in one place.
type Lang = 'en' | 'ar';
const LANG_KEY = 'aqarat.signin.lang';

const TEXT = {
  en: {
    switchTo: 'العربية',
    env: 'Lab environment',
    brand: 'AQARAT',
    tagline: 'Real estate services, in one place.',
    points: [
      'Property registration and transfers',
      'Broker licences and renewals',
      'Track your requests online',
    ],
    title: 'Sign in',
    subtitle: 'Choose how you want to sign in.',
    nasBadge: 'Citizens & residents',
    nasTitle: 'National Authentication (NAS)',
    nasText: 'Use your national digital identity. Your QID is verified by NAS.',
    nasButton: 'Continue with NAS',
    staffBadge: 'AQARAT staff',
    staffTitle: 'Staff account',
    staffText: 'Sign in with your AQARAT username and password.',
    staffButton: 'Staff sign-in',
    note: 'You will be taken to a secure sign-in page. This page never asks for your password.',
    portal: 'Go to the e-services portal',
  },
  ar: {
    switchTo: 'English',
    env: 'بيئة تجريبية',
    brand: 'عقارات',
    tagline: 'الخدمات العقارية في مكان واحد.',
    points: ['تسجيل العقارات ونقل ملكيتها', 'تراخيص الوسطاء وتجديدها', 'متابعة طلباتك إلكترونياً'],
    title: 'تسجيل الدخول',
    subtitle: 'اختر طريقة تسجيل الدخول.',
    nasBadge: 'المواطنون والمقيمون',
    nasTitle: 'نظام التوثيق الوطني',
    nasText: 'استخدم هويتك الرقمية الوطنية. يتم التحقق من رقمك الشخصي عبر نظام التوثيق الوطني.',
    nasButton: 'المتابعة عبر التوثيق الوطني',
    staffBadge: 'موظفو عقارات',
    staffTitle: 'حساب الموظف',
    staffText: 'سجّل الدخول باسم المستخدم وكلمة المرور الخاصة بك في عقارات.',
    staffButton: 'دخول الموظفين',
    note: 'سيتم تحويلك إلى صفحة تسجيل دخول آمنة. هذه الصفحة لا تطلب منك كلمة المرور.',
    portal: 'الانتقال إلى بوابة الخدمات الإلكترونية',
  },
} satisfies Record<Lang, unknown>;

function savedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

@Component({
  selector: 'app-signin',
  imports: [RouterLink],
  template: `
    <div class="page" [attr.dir]="lang() === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang()">
      <aside class="hero">
        <div class="hero-top">
          <span class="logo" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path d="M8 40V20L24 8l16 12v20H30V28H18v12z" /></svg>
          </span>
          <span class="brand">{{ t().brand }}</span>
        </div>
        <div class="hero-body">
          <h2>{{ t().tagline }}</h2>
          <ul>
            @for (p of t().points; track p) {
              <li>{{ p }}</li>
            }
          </ul>
        </div>
        <span class="env">{{ t().env }}</span>
      </aside>

      <section class="panel">
        <div class="panel-top">
          <button type="button" class="lang" (click)="toggleLang()">{{ t().switchTo }}</button>
        </div>

        <div class="content">
          <h1>{{ t().title }}</h1>
          <p class="subtitle">{{ t().subtitle }}</p>

          <a class="option primary" [href]="nasUrl">
            <span class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
                <path class="tick" d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>
            </span>
            <span class="body">
              <span class="badge">{{ t().nasBadge }}</span>
              <strong>{{ t().nasTitle }}</strong>
              <span class="text">{{ t().nasText }}</span>
              <span class="cta"
                >{{ t().nasButton }} <span class="arrow" aria-hidden="true">→</span></span
              >
            </span>
          </a>

          <a class="option" [href]="staffUrl">
            <span class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
              </svg>
            </span>
            <span class="body">
              <span class="badge">{{ t().staffBadge }}</span>
              <strong>{{ t().staffTitle }}</strong>
              <span class="text">{{ t().staffText }}</span>
              <span class="cta"
                >{{ t().staffButton }} <span class="arrow" aria-hidden="true">→</span></span
              >
            </span>
          </a>

          <p class="note">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {{ t().note }}
          </p>
          <a class="portal" routerLink="/">{{ t().portal }}</a>
        </div>
      </section>
    </div>
  `,
  styles: `
    :host {
      --maroon: #8a1538;
      --maroon-dark: #5e0e26;
      --ink: #1f1a1c;
      --muted: #6b6266;
      --line: #e7dde1;
      position: fixed;
      inset: 0;
      overflow: auto;
      background: #faf7f8;
      color: var(--ink);
      z-index: 10;
    }
    .page {
      min-height: 100%;
      display: grid;
      grid-template-columns: minmax(320px, 5fr) 7fr;
      font-family:
        'Segoe UI',
        system-ui,
        -apple-system,
        sans-serif;
    }
    .page[dir='rtl'] {
      font-family: 'Segoe UI', 'Noto Naskh Arabic', Tahoma, system-ui, sans-serif;
    }

    /* Brand panel */
    .hero {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 48px;
      color: #fff;
      background:
        radial-gradient(circle at 85% 15%, rgb(255 255 255 / 12%) 0 120px, transparent 121px),
        radial-gradient(circle at 10% 95%, rgb(255 255 255 / 8%) 0 180px, transparent 181px),
        linear-gradient(160deg, var(--maroon) 0%, var(--maroon-dark) 100%);
      overflow: hidden;
    }
    .hero-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgb(255 255 255 / 16%);
    }
    .logo svg {
      width: 26px;
      height: 26px;
      fill: #fff;
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .page[dir='rtl'] .brand {
      letter-spacing: 0;
    }
    .hero h2 {
      max-width: 14em;
      margin: 0 0 24px;
      font-size: 34px;
      line-height: 1.25;
      font-weight: 600;
    }
    .hero ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 12px;
    }
    .hero li {
      display: flex;
      align-items: center;
      gap: 10px;
      opacity: 0.92;
    }
    .hero li::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f3c1cf;
      flex: none;
    }
    .env {
      align-self: flex-start;
      padding: 4px 10px;
      border: 1px solid rgb(255 255 255 / 40%);
      border-radius: 999px;
      font-size: 12px;
      letter-spacing: 0.04em;
    }

    /* Sign-in panel */
    .panel {
      display: flex;
      flex-direction: column;
      padding: 24px 32px 40px;
    }
    .panel-top {
      display: flex;
      justify-content: flex-end;
    }
    .lang {
      padding: 6px 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--maroon);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }
    .lang:hover {
      border-color: var(--maroon);
    }
    .content {
      width: 100%;
      max-width: 460px;
      margin: auto;
      padding-top: 24px;
    }
    h1 {
      margin: 0;
      font-size: 32px;
    }
    .subtitle {
      margin: 6px 0 28px;
      color: var(--muted);
    }

    .option {
      display: flex;
      gap: 16px;
      padding: 20px;
      margin-bottom: 14px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      color: inherit;
      text-decoration: none;
      box-shadow: 0 1px 2px rgb(94 14 38 / 6%);
      transition:
        border-color 0.15s,
        box-shadow 0.15s,
        transform 0.15s;
    }
    .option:hover {
      border-color: var(--maroon);
      box-shadow: 0 8px 24px rgb(94 14 38 / 12%);
      transform: translateY(-1px);
    }
    .option:focus-visible {
      outline: 3px solid rgb(138 21 56 / 35%);
      outline-offset: 2px;
    }
    .option.primary {
      border-color: rgb(138 21 56 / 35%);
    }
    .icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #f6e8ec;
    }
    .icon svg {
      width: 26px;
      height: 26px;
      fill: none;
      stroke: var(--maroon);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .option.primary .icon {
      background: var(--maroon);
    }
    .option.primary .icon svg {
      stroke: #fff;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .badge {
      align-self: flex-start;
      padding: 2px 8px;
      border-radius: 999px;
      background: #f6e8ec;
      color: var(--maroon);
      font-size: 12px;
      font-weight: 600;
    }
    .body strong {
      font-size: 17px;
      margin-top: 4px;
    }
    .text {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .cta {
      margin-top: 8px;
      color: var(--maroon);
      font-weight: 600;
    }
    .option.primary .cta {
      align-self: flex-start;
      padding: 8px 16px;
      border-radius: 8px;
      background: var(--maroon);
      color: #fff;
    }
    .arrow {
      display: inline-block;
      transition: transform 0.15s;
    }
    .option:hover .arrow {
      transform: translateX(3px);
    }
    .page[dir='rtl'] .arrow {
      transform: scaleX(-1);
    }
    .page[dir='rtl'] .option:hover .arrow {
      transform: scaleX(-1) translateX(3px);
    }

    .note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 20px 0 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .note svg {
      flex: none;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
    }
    .portal {
      color: var(--maroon);
      font-size: 14px;
    }

    @media (max-width: 860px) {
      .page {
        grid-template-columns: 1fr;
      }
      .hero {
        padding: 24px;
        gap: 16px;
      }
      .hero h2 {
        font-size: 24px;
        margin-bottom: 12px;
      }
      .hero ul {
        display: none;
      }
      .panel {
        padding: 16px 16px 32px;
      }
      .content {
        margin-top: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .option,
      .arrow {
        transition: none;
      }
    }
  `,
})
export class SignIn {
  protected readonly lang = signal<Lang>(savedLang());
  protected readonly t = computed(() => TEXT[this.lang()]);
  protected readonly nasUrl = `${settings.appianBaseUrl}/suite/?signin=${encodeURIComponent(settings.appianSignInIdentifier)}`;
  protected readonly staffUrl = `${settings.appianBaseUrl}/suite/?signin=native`;

  toggleLang() {
    this.lang.update((l) => (l === 'en' ? 'ar' : 'en'));
    try {
      localStorage.setItem(LANG_KEY, this.lang());
    } catch {
      // private mode: the choice is just not remembered
    }
  }
}
