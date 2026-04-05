import {
  BadRequestException,
  Body,
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
  async socialLogin(@Query('provider') provider: string) {
    if (!provider) throw new BadRequestException('provider is required');
    const secrets = await this.secretsService.getSecret();
    const cognitoAuthUrl = secrets.COGNITO_AUTH_URL;
    const cognitoClientId = secrets.COGNITO_CLIENT_ID;
    if (!cognitoAuthUrl || !cognitoClientId) {
      throw new InternalServerErrorException('Authentication configuration is missing.');
    }

    const codeVerifier = PKCEUtils.generateVerifier();
    const codeChallenge = PKCEUtils.generateChallenge(codeVerifier);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5005';
    const callbackUrl = `${frontendUrl}/auth/callback`;

    const redirectUri = new URL(`${cognitoAuthUrl}/oauth2/authorize`);
    redirectUri.searchParams.set('response_type', 'code');
    redirectUri.searchParams.set('client_id', cognitoClientId);
    redirectUri.searchParams.set('redirect_uri', callbackUrl);
    redirectUri.searchParams.set('scope', 'email profile openid');
    redirectUri.searchParams.set('identity_provider', provider);
    redirectUri.searchParams.set('code_challenge', codeChallenge);
    redirectUri.searchParams.set('code_challenge_method', 'S256');
    redirectUri.searchParams.set('prompt', 'select_account');

    return { redirectUrl: redirectUri.toString(), codeVerifier };
  }

  @Get('social/exchange')
  async socialLoginExchange(
    @Query('code') code: string,
    @Query('codeVerifier') codeVerifier: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!code || !codeVerifier) throw new BadRequestException('code and codeVerifier are required');
    const secrets = await this.secretsService.getSecret();
    const cognitoAuthUrl = secrets.COGNITO_AUTH_URL;
    const cognitoClientId = secrets.COGNITO_CLIENT_ID;

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5005';
    const callbackUrl = `${frontendUrl}/auth/callback`;

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', cognitoClientId);
    params.append('code', code);
    params.append('redirect_uri', callbackUrl);
    params.append('code_verifier', codeVerifier);

    let tokenData: { access_token: string; refresh_token: string; id_token: string; expires_in: number };
    try {
      const response = await axios.post(`${cognitoAuthUrl}/oauth2/token`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      tokenData = response.data;
    } catch (err) {
      throw new BadRequestException(err?.response?.data?.error_description || 'Token exchange failed');
    }

    const cookieOptions = getCookieOptions(this.isLocal);
    res.cookie('accessToken', tokenData.access_token, {
      ...cookieOptions,
      maxAge: tokenData.expires_in * 1000,
    });
    res.cookie('refreshToken', tokenData.refresh_token, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { message: 'Signed in successfully' };
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
}
