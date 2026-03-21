import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserDTO } from 'src/dtos/user.dto';
import { TraceContext } from 'src/middleware/trace.middleware';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { UserService } from 'src/modules/user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private jwksClient: jwksRsa.JwksClient | undefined;

  constructor(
    private readonly userService: UserService,
    private readonly logger: LoggerService,
    private readonly secretService: AwsSecretsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.headers['authorization']?.split(' ')[1];
        },
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider: async (request, accessToken, done) => {
        try {
          const decoded = jwt.decode(accessToken, { complete: true });
          if (!decoded || !decoded.header || !decoded.header.kid) {
            return done(new UnauthorizedException('Invalid token format'), null);
          }

          const kid = decoded.header.kid;
          try {
            const key = await this.jwksClient.getSigningKey(kid);
            if (!key) {
              return done(new UnauthorizedException('Unable to get signing key'), null);
            }
            const signingKey = key.getPublicKey();
            done(null, signingKey);
          } catch (err: any) {
            this.logger.error('Error getting signing key:', err);
            return done(new UnauthorizedException('Unable to get signing key'), null);
          }
        } catch (error) {
          this.logger.error('Error processing token:', error);
          done(new UnauthorizedException('Failed to process token'), null);
        }
      },
    });

    void this.initialize();
  }

  private async initialize() {
    const secretData = await this.secretService.getSecret();
    const region = secretData.COGNITO_REGION || 'us-east-1';
    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${secretData.COGNITO_USERPOOLID}/.well-known/jwks.json`;

    this.jwksClient = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri,
      cacheMaxAge: 86400000,
      cacheMaxEntries: 5,
      timeout: 30000,
    });
  }

  async validate(payload: any): Promise<UserDTO> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid payload');
    }
    const user = await this.userService.findByCognitoId(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    try {
      TraceContext.getStore()?.set('userId', user.id);
      TraceContext.getStore()?.set('role', user.role);
    } catch {}
    return {
      userId: user.id,
      username: payload.email || payload['cognito:username'] || payload.sub,
      role: user.role,
    };
  }
}
