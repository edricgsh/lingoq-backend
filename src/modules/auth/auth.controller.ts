import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    return { message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
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
