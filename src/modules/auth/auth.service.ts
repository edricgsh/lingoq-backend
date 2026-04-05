import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  ListUsersCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  NotAuthorizedException,
  UsernameExistsException,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotConfirmedException,
} from '@aws-sdk/client-cognito-identity-provider';
import { User } from 'src/entities/user.entity';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { AllowedEmail } from 'src/entities/allowed-email.entity';
import { UserRole } from 'src/enums/user-role.enum';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

export interface SyncUserDto {
  cognitoId: string;
  email: string;
  name?: string;
}

export interface SignUpDto {
  email: string;
  password: string;
  name: string;
}

export interface SignInDto {
  email: string;
  password: string;
}

export interface ConfirmSignUpDto {
  email: string;
  code: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface ResendConfirmationDto {
  email: string;
}

@Injectable()
export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;

  private readonly isBetaMode: boolean;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserOnboarding)
    private readonly onboardingRepository: Repository<UserOnboarding>,
    @InjectRepository(AllowedEmail)
    private readonly allowedEmailRepository: Repository<AllowedEmail>,
    private readonly secretsService: AwsSecretsService,
    private readonly configService: ConfigService,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.cognitoClient = new CognitoIdentityProviderClient({ region });
    this.isBetaMode = this.configService.get<string>('BETA_MODE') === 'true';
  }

  private async assertAllowlisted(email: string): Promise<void> {
    if (!this.isBetaMode) return;
    const entry = await this.allowedEmailRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!entry) {
      throw new ForbiddenException(
        'This app is currently in beta. Your email is not on the allowlist.',
      );
    }
  }

  /**
   * Looks up existing Cognito users by email and returns the provider name
   * if the email is already registered with a different method.
   * Returns null if no conflict.
   */
  private async detectProviderConflict(
    email: string,
    currentUsernamePrefix: 'google_' | null,
  ): Promise<string | null> {
    const secrets = await this.secretsService.getSecret();
    const userPoolId = secrets.COGNITO_USERPOOLID;
    if (!userPoolId) return null;

    const result = await this.cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email.toLowerCase()}"`,
      }),
    );

    if (!result.Users || result.Users.length === 0) return null;

    for (const user of result.Users) {
      const username = user.Username ?? '';
      if (currentUsernamePrefix === null) {
        // Caller is trying to use email/password — conflict if a Google user exists
        if (username.startsWith('google_')) return 'Google';
      } else {
        // Caller is trying to use SSO — conflict if a native (email) user exists
        if (!username.startsWith('google_')) return 'email';
      }
    }
    return null;
  }

  async signUp(dto: SignUpDto) {
    await this.assertAllowlisted(dto.email);

    const conflictProvider = await this.detectProviderConflict(dto.email, null);
    if (conflictProvider) {
      throw new ConflictException(`USER_EXISTS_WITH_${conflictProvider.toUpperCase()}`);
    }

    const secrets = await this.secretsService.getSecret();
    try {
      await this.cognitoClient.send(
        new SignUpCommand({
          ClientId: secrets.COGNITO_CLIENT_ID,
          Username: dto.email,
          Password: dto.password,
          UserAttributes: [
            { Name: 'email', Value: dto.email },
            { Name: 'name', Value: dto.name },
          ],
        }),
      );
      return { message: 'Sign up successful. Check your email for a confirmation code.' };
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        // Resend code so frontend can move directly to confirm step
        await this.resendConfirmation({ email: dto.email }).catch(() => null);
        throw new ConflictException('USER_EXISTS_UNCONFIRMED');
      }
      throw new BadRequestException(error.message);
    }
  }

  async signIn(dto: SignInDto) {
    await this.assertAllowlisted(dto.email);
    const secrets = await this.secretsService.getSecret();
    try {
      const result = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: secrets.COGNITO_CLIENT_ID,
          AuthParameters: {
            USERNAME: dto.email,
            PASSWORD: dto.password,
          },
        }),
      );
      return {
        accessToken: result.AuthenticationResult.AccessToken,
        refreshToken: result.AuthenticationResult.RefreshToken,
        idToken: result.AuthenticationResult.IdToken,
        expiresIn: result.AuthenticationResult.ExpiresIn,
      };
    } catch (error) {
      if (error instanceof NotAuthorizedException) {
        // Check if this email belongs to a Google SSO account
        const conflictProvider = await this.detectProviderConflict(dto.email, null);
        if (conflictProvider) {
          throw new UnauthorizedException(`USER_EXISTS_WITH_${conflictProvider.toUpperCase()}`);
        }
        throw new UnauthorizedException('Invalid email or password');
      }
      if (error instanceof UserNotConfirmedException) {
        throw new BadRequestException('USER_NOT_CONFIRMED');
      }
      throw new BadRequestException(error.message);
    }
  }

  async confirmSignUp(dto: ConfirmSignUpDto) {
    const secrets = await this.secretsService.getSecret();
    try {
      await this.cognitoClient.send(
        new ConfirmSignUpCommand({
          ClientId: secrets.COGNITO_CLIENT_ID,
          Username: dto.email,
          ConfirmationCode: dto.code,
        }),
      );
      return { message: 'Account confirmed successfully' };
    } catch (error) {
      if (error instanceof CodeMismatchException) {
        throw new BadRequestException('Invalid confirmation code');
      }
      if (error instanceof ExpiredCodeException) {
        throw new BadRequestException('Confirmation code has expired');
      }
      throw new BadRequestException(error.message);
    }
  }

  async refreshToken(dto: RefreshTokenDto) {
    const secrets = await this.secretsService.getSecret();
    try {
      const result = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: secrets.COGNITO_CLIENT_ID,
          AuthParameters: {
            REFRESH_TOKEN: dto.refreshToken,
          },
        }),
      );
      return {
        accessToken: result.AuthenticationResult.AccessToken,
        idToken: result.AuthenticationResult.IdToken,
        expiresIn: result.AuthenticationResult.ExpiresIn,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(accessToken: string) {
    try {
      await this.cognitoClient.send(
        new GlobalSignOutCommand({ AccessToken: accessToken }),
      );
    } catch {
      // Ignore errors — token may already be invalid
    }
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const secrets = await this.secretsService.getSecret();
    try {
      await this.cognitoClient.send(
        new ForgotPasswordCommand({
          ClientId: secrets.COGNITO_CLIENT_ID,
          Username: dto.email,
        }),
      );
      return { message: 'Password reset code sent to your email' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const secrets = await this.secretsService.getSecret();
    try {
      await this.cognitoClient.send(
        new ConfirmForgotPasswordCommand({
          ClientId: secrets.COGNITO_CLIENT_ID,
          Username: dto.email,
          ConfirmationCode: dto.code,
          Password: dto.newPassword,
        }),
      );
      return { message: 'Password reset successfully' };
    } catch (error) {
      if (error instanceof CodeMismatchException) {
        throw new BadRequestException('Invalid reset code');
      }
      if (error instanceof ExpiredCodeException) {
        throw new BadRequestException('Reset code has expired');
      }
      throw new BadRequestException(error.message);
    }
  }

  async resendConfirmation(dto: ResendConfirmationDto) {
    const secrets = await this.secretsService.getSecret();
    try {
      await this.cognitoClient.send(
        new ResendConfirmationCodeCommand({
          ClientId: secrets.COGNITO_CLIENT_ID,
          Username: dto.email,
        }),
      );
      return { message: 'Confirmation code resent' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async checkSocialProviderConflict(email: string, cognitoUsername: string): Promise<string | null> {
    const secrets = await this.secretsService.getSecret();
    const userPoolId = secrets.COGNITO_USERPOOLID;
    if (!userPoolId) return null;

    const result = await this.cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email.toLowerCase()}"`,
      }),
    );

    if (!result.Users || result.Users.length === 0) return null;

    const otherUsers = result.Users.filter((u) => u.Username !== cognitoUsername);
    const hasNativeUser = otherUsers.some((u) => !u.Username?.startsWith('google_'));
    return hasNativeUser ? 'email' : null;
  }

  async syncUser(dto: SyncUserDto): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { cognitoId: dto.cognitoId },
    });

    if (!user) {
      user = this.userRepository.create({
        id: uuidv4(),
        cognitoId: dto.cognitoId,
        email: dto.email,
        name: dto.name,
        role: UserRole.USER,
        isActive: true,
      });
      await this.userRepository.save(user);

      const onboarding = this.onboardingRepository.create({
        id: uuidv4(),
        userId: user.id,
        isComplete: false,
      });
      await this.onboardingRepository.save(onboarding);
    } else {
      user.email = dto.email;
      if (dto.name) user.name = dto.name;
      await this.userRepository.save(user);
    }

    return user;
  }
}
