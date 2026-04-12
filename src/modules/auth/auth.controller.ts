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

function extensionSuccessPage(email: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>LingoQ — Signed in</title>
  <style>body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f7ff;}
  .box{text-align:center;padding:40px;border-radius:16px;background:#fff;border:2px solid #ede9fe;max-width:360px;}
  h2{color:#7c3aed;margin:0 0 8px;}p{color:#6b7280;font-size:14px;margin:0 0 20px;}
  .email{font-weight:700;color:#1f2937;}.hint{font-size:12px;color:#9ca3af;}</style></head>
  <body><div class="box"><div style="font-size:48px">🧠</div><h2>Signed in!</h2>
  <p>Welcome, <span class="email">${email}</span>.</p>
  <p class="hint">You can close this tab and return to YouTube.</p>
  <script>setTimeout(()=>window.close(),2000)</script>
  </div></body></html>`
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
      return res.send(extensionSuccessPage(userInfo.email));
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
}
