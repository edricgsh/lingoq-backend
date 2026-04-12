import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Request, Response } from 'express';
import {
  AuthService,
  ConfirmSignUpDto,
  ForgotPasswordDto,
  RefreshTokenDto,
  ResendConfirmationDto,
  ResetPasswordDto,
  SignInDto,
  SignUpDto,
  SyncUserDto,
} from './auth.service';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { PKCEUtils } from 'src/shared/utils/pkce';

function getCookieOptions(isLocal: boolean) {
  if (isLocal) {
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    domain: '.lingoq.study',
    path: '/',
  };
}

// Extension auth uses sameSite: 'none' so cookies are sent from cross-origin
// contexts (content scripts on youtube.com fetching localhost:5007).
// Mobile browsers like Safari enforce strict sameSite policies, so the main
// auth flow stays on 'lax'. The extension has its own dedicated endpoints.
function getExtensionCookieOptions(isLocal: boolean) {
  if (isLocal) {
    return {
      httpOnly: true,
      secure: false, // Chrome allows sameSite=none without secure on localhost
      sameSite: 'none' as const,
      path: '/',
    };
  }
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    domain: '.lingoq.study',
    path: '/',
  };
}

// Extension auth success: redirect to /auth/extension/done with token in the URL fragment.
// The background service worker monitors tab navigations for this URL pattern and extracts
// the token from the fragment — no window.opener needed (which breaks after redirect chains).
function extensionSuccessRedirectUrl(backendUrl: string, email: string, accessToken: string): string {
  const params = new URLSearchParams({ email })
  return `${backendUrl}/auth/extension/done?${params.toString()}#token=${encodeURIComponent(accessToken)}`
}

function extensionDonePage(email: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>LingoQ — Signed in</title>
  <style>body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f7ff;}
  .box{text-align:center;padding:40px;border-radius:16px;background:#fff;border:2px solid #ede9fe;max-width:360px;}
  h2{color:#7c3aed;margin:0 0 8px;}p{color:#6b7280;font-size:14px;margin:0 0 20px;}
  .email{font-weight:700;color:#1f2937;}.hint{font-size:12px;color:#9ca3af;}</style></head>
  <body><div class="box"><div style="font-size:48px">🧠</div><h2>Signed in!</h2>
  <p>Welcome, <span class="email">${email}</span>.</p>
  <p class="hint">This tab will close automatically.</p>
  </div></body></html>`
}

function extensionEmailSigninFormPage(errorMessage?: string): string {
  const errorHtml = errorMessage
    ? `<div class="error">${errorMessage}</div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>LingoQ — Sign in</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f7ff;}
    .box{width:100%;max-width:360px;padding:32px 28px;border-radius:16px;background:#fff;border:2px solid #ede9fe;}
    h2{color:#7c3aed;margin:0 0 4px;font-size:20px;}
    .subtitle{color:#6b7280;font-size:13px;margin:0 0 24px;}
    label{display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;}
    input{display:block;width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:10px;font-size:14px;outline:none;margin-bottom:14px;}
    input:focus{border-color:#7c3aed;}
    button[type=submit]{width:100%;padding:12px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px;}
    button[type=submit]:hover{background:#6d28d9;}
    .divider{display:flex;align-items:center;gap:8px;margin:16px 0;color:#9ca3af;font-size:12px;}
    .divider::before,.divider::after{content:'';flex:1;height:1px;background:#e5e7eb;}
    .google-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px;border:1.5px solid #d1d5db;border-radius:10px;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:pointer;text-decoration:none;}
    .google-btn:hover{background:#f9fafb;}
    .error{background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:14px;}
  </style></head>
  <body><div class="box">
    <div style="font-size:40px;margin-bottom:8px">🧠</div>
    <h2>Sign in to LingoQ</h2>
    <p class="subtitle">Enter your email and password to continue</p>
    ${errorHtml}
    <form method="POST" action="/auth/extension/email-signin">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="••••••••" required>
      <button type="submit">Sign in</button>
    </form>
    <div class="divider">or</div>
    <a href="/auth/extension/login" class="google-btn">
      <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Continue with Google
    </a>
  </div></body></html>`;
}

function extensionErrorPage(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>LingoQ — Error</title>
  <style>body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2;}
  .box{text-align:center;padding:40px;border-radius:16px;background:#fff;border:2px solid #fecaca;max-width:360px;}
  h2{color:#ef4444;margin:0 0 8px;}p{color:#6b7280;font-size:14px;margin:0;}</style></head>
  <body><div class="box"><div style="font-size:48px">⚠️</div><h2>Sign in failed</h2>
  <p>${message}</p></div></body></html>`
}

@Controller('auth')
export class AuthController {
  private readonly isLocal: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly secretsService: AwsSecretsService,
    private readonly configService: ConfigService,
  ) {
    this.isLocal = this.configService.get<string>('NODE_ENV') === 'local';
  }

  @Post('signup')
  async signUp(@Body() body: SignUpDto) {
    return this.authService.signUp(body);
  }

  @Post('signin')
  async signIn(@Body() body: SignInDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.signIn(body);
    const cookieOptions = getCookieOptions(this.isLocal);
    res.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: tokens.expiresIn * 1000,
    });
    res.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return { message: 'Signed in successfully' };
  }

  @Post('signup/confirmation')
  async confirmSignUp(@Body() body: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(body);
  }

  @Post('signup/resend')
  async resendConfirmation(@Body() body: ResendConfirmationDto) {
    return this.authService.resendConfirmation(body);
  }

  @Post('refresh-token')
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }
    const tokens = await this.authService.refreshToken({ refreshToken });
    res.cookie('accessToken', tokens.accessToken, {
      ...getCookieOptions(this.isLocal),
      maxAge: tokens.expiresIn * 1000,
    });
    return { message: 'Token refreshed' };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = req.cookies?.accessToken;
    await this.authService.logout(accessToken);
    const opts = getCookieOptions(this.isLocal);
    const clearOpts: any = { path: opts.path, httpOnly: opts.httpOnly, secure: opts.secure, sameSite: opts.sameSite };
    if ('domain' in opts) clearOpts.domain = (opts as any).domain;
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);

    const secrets = await this.secretsService.getSecret();
    const cognitoAuthUrl = secrets.COGNITO_AUTH_URL;
    const cognitoClientId = secrets.COGNITO_CLIENT_ID;
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5005';

    let cognitoLogoutUrl: string | null = null;
    if (cognitoAuthUrl && cognitoClientId) {
      const url = new URL(`${cognitoAuthUrl}/logout`);
      url.searchParams.set('client_id', cognitoClientId);
      url.searchParams.set('logout_uri', `${frontendUrl}/login`);
      cognitoLogoutUrl = url.toString();
    }

    return { message: 'Logged out successfully', cognitoLogoutUrl };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Get('social')
  async socialLogin(
    @Query('provider') provider: string,
    @Query('client') client: string,
    @Res() res: Response,
  ) {
    if (!provider) throw new BadRequestException('provider is required');
    const secrets = await this.secretsService.getSecret();
    const cognitoAuthUrl = secrets.COGNITO_AUTH_URL;
    const cognitoClientId = secrets.COGNITO_CLIENT_ID;
    if (!cognitoAuthUrl || !cognitoClientId) {
      throw new InternalServerErrorException('Authentication configuration is missing.');
    }

    const codeVerifier = PKCEUtils.generateVerifier();
    const codeChallenge = PKCEUtils.generateChallenge(codeVerifier);
    const isExtension = client === 'extension';

    // Extension flow: callback goes to backend so the backend can set sameSite:none cookies
    // and render a close-tab success page, without needing the frontend to be involved.
    // Frontend flow: callback goes to the frontend /auth/callback page.
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:5007';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5005';
    const callbackUrl = isExtension
      ? `${backendUrl}/auth/social/exchange?client=extension`
      : `${frontendUrl}/auth/callback`;

    const authUrl = new URL(`${cognitoAuthUrl}/oauth2/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', cognitoClientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('scope', 'email profile openid');
    authUrl.searchParams.set('identity_provider', provider);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'select_account');

    if (isExtension) {
      // Store codeVerifier in a short-lived lax cookie; redirect directly to Cognito
      res.cookie('ext_code_verifier', codeVerifier, {
        httpOnly: true,
        secure: this.isLocal ? false : true,
        sameSite: 'lax' as const,
        maxAge: 10 * 60 * 1000,
        path: '/',
      });
      return res.redirect(authUrl.toString());
    }

    // Standard frontend flow — return JSON for the client to handle
    return res.json({ redirectUrl: authUrl.toString(), codeVerifier });
  }

  @Get('social/exchange')
  async socialLoginExchange(
    @Query('code') code: string,
    @Query('codeVerifier') codeVerifier: string,
    @Query('client') client: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const isExtension = client === 'extension';

    // Extension flow reads codeVerifier from cookie (set during the redirect);
    // frontend flow receives it as a query param from its own callback handler.
    const resolvedVerifier = isExtension ? req.cookies?.ext_code_verifier : codeVerifier;

    if (!code || !resolvedVerifier) {
      if (isExtension) return res.status(400).send(extensionErrorPage('Missing authorization code or verifier. Please try again.'));
      throw new BadRequestException('code and codeVerifier are required');
    }

    const secrets = await this.secretsService.getSecret();
    const cognitoAuthUrl = secrets.COGNITO_AUTH_URL;
    const cognitoClientId = secrets.COGNITO_CLIENT_ID;

    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:5007';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5005';
    const callbackUrl = isExtension
      ? `${backendUrl}/auth/social/exchange?client=extension`
      : `${frontendUrl}/auth/callback`;

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', cognitoClientId);
    params.append('code', code);
    params.append('redirect_uri', callbackUrl);
    params.append('code_verifier', resolvedVerifier);

    let tokenData: { access_token: string; refresh_token: string; expires_in: number };
    try {
      const response = await axios.post(`${cognitoAuthUrl}/oauth2/token`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      tokenData = response.data;
    } catch (err) {
      const msg = err?.response?.data?.error_description || 'Token exchange failed';
      if (isExtension) return res.status(400).send(extensionErrorPage(msg));
      throw new BadRequestException(msg);
    }

    // Fetch user info from Cognito userInfo endpoint — always includes email
    const userInfo: { sub: string; email: string; username: string; name?: string } = await axios
      .get(`${cognitoAuthUrl}/oauth2/userInfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      .then((r) => r.data)
      .catch(() => null);

    if (!userInfo?.email) {
      await this.authService.logout(tokenData.access_token).catch(() => null);
      if (isExtension) return res.status(400).send(extensionErrorPage('Unable to retrieve user email from provider.'));
      throw new BadRequestException('Unable to retrieve user email from provider');
    }

    try {
      await this.authService.assertAllowlisted(userInfo.email);
    } catch (err) {
      await this.authService.logout(tokenData.access_token).catch(() => null);
      if (isExtension) return res.status(403).send(extensionErrorPage('Your account is not on the allowlist.'));
      throw err;
    }

    const conflictProvider = await this.authService.checkSocialProviderConflict(
      userInfo.email,
      userInfo.username,
    ).catch(() => null);
    if (conflictProvider === 'email') {
      await this.authService.logout(tokenData.access_token).catch(() => null);
      if (isExtension) return res.status(409).send(extensionErrorPage('An account with this email already exists. Please sign in with email/password.'));
      throw new ConflictException('USER_EXISTS_WITH_EMAIL');
    }

    await this.authService.syncUser({
      cognitoId: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
    });

    // Extension gets sameSite:none so cookies are sent from cross-origin fetch (youtube.com → localhost:5007)
    // Frontend/mobile gets sameSite:lax which Safari and other mobile browsers require
    const cookieOptions = isExtension
      ? getExtensionCookieOptions(this.isLocal)
      : getCookieOptions(this.isLocal);

    res.cookie('accessToken', tokenData.access_token, {
      ...cookieOptions,
      maxAge: tokenData.expires_in * 1000,
    });
    res.cookie('refreshToken', tokenData.refresh_token, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    if (isExtension) {
      res.clearCookie('ext_code_verifier', { path: '/' });
      const successUrl = extensionSuccessRedirectUrl(backendUrl, userInfo.email, tokenData.access_token);
      return res.redirect(successUrl);
    }

    return res.json({ message: 'Signed in successfully' });
  }

  @Post('sync')
  async syncUser(
    @Headers('x-api-key') apiKey: string,
    @Body() body: SyncUserDto,
  ) {
    const secrets = await this.secretsService.getSecret();
    if (apiKey !== secrets.LINGOQ_BE_API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.authService.syncUser(body);
  }

  // ── Extension convenience redirect ────────────────────────────────────────
  // GET /auth/extension/login → delegates to /auth/social?provider=Google&client=extension
  // Kept so the extension only needs to know one fixed URL.

  @Get('extension/login')
  extensionLogin(@Res() res: Response) {
    return res.redirect('/auth/social?provider=Google&client=extension');
  }

  // ── Extension email sign-in ───────────────────────────────────────────────
  // GET  /auth/extension/email-signin  → serve HTML login form
  // POST /auth/extension/email-signin  → process credentials, set extension cookies, return success page

  // ── Extension auth completion page ───────────────────────────────────────
  // The background service worker detects when a tab navigates to this URL,
  // reads the #token fragment, stores it, then closes the tab.
  // This page is just a human-readable fallback in case the tab isn't auto-closed.

  @Get('extension/done')
  extensionDone(@Query('email') email: string, @Res() res: Response) {
    return res.send(extensionDonePage(email || ''));
  }

  @Get('extension/email-signin')
  extensionEmailSigninPage(@Res() res: Response) {
    return res.send(extensionEmailSigninFormPage());
  }

  @Post('extension/email-signin')
  async extensionEmailSignin(
    @Body() body: { email: string; password: string },
    @Res() res: Response,
  ) {
    try {
      const tokens = await this.authService.signIn({ email: body.email, password: body.password });
      const cookieOptions = getExtensionCookieOptions(this.isLocal);
      res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: tokens.expiresIn * 1000,
      });
      res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:5007';
      const successUrl = extensionSuccessRedirectUrl(backendUrl, body.email, tokens.accessToken);
      return res.redirect(successUrl);
    } catch (err: any) {
      const message = err?.response?.message || err?.message || 'Invalid email or password';
      return res.status(400).send(extensionEmailSigninFormPage(message));
    }
  }
}
