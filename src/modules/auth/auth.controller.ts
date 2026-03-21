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
  ResetPasswordDto,
  SignInDto,
  SignUpDto,
  SyncUserDto,
} from './auth.service';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly secretsService: AwsSecretsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  async signUp(@Body() body: SignUpDto) {
    return this.authService.signUp(body);
  }

  @Post('signin')
  async signIn(@Body() body: SignInDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.signIn(body);
    res.cookie('accessToken', tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: tokens.expiresIn * 1000,
    });
    res.cookie('refreshToken', tokens.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return { message: 'Signed in successfully' };
  }

  @Post('signup/confirmation')
  async confirmSignUp(@Body() body: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(body);
  }

  @Post('refresh-token')
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }
    const tokens = await this.authService.refreshToken({ refreshToken });
    res.cookie('accessToken', tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: tokens.expiresIn * 1000,
    });
    return { message: 'Token refreshed' };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = req.cookies?.accessToken;
    await this.authService.logout(accessToken);
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
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
    if (apiKey !== secrets.LEARN_SPANISH_BE_API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.authService.syncUser(body);
  }
}
