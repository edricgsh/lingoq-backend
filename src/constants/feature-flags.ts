/**
 * Feature flags — change these constants to toggle behaviour at build/start time.
 * Do NOT rely on runtime env vars here; this file is the single source of truth.
 */

export enum EmailProvider {
  SES = 'ses',
  RESEND = 'resend',
}

/**
 * Controls which email provider is used throughout the app.
 * Switch between EmailProvider.SES and EmailProvider.RESEND.
 */
export const EMAIL_PROVIDER: EmailProvider = EmailProvider.RESEND;
