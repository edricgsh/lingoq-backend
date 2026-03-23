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
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private jwksClient: jwksRsa.JwksClient | undefined;

  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly logger: LoggerService,
    private readonly secretService: AwsSecretsService,
  ) {
    // logger is not yet assigned when super() runs, so capture it in a local ref
    const log = logger;

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => request?.cookies?.accessToken ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider: async (request, accessToken, done) => {
        try {
          await this.initialize();
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
            done(null, key.getPublicKey());
          } catch (err: any) {
            log.error(`[JwtStrategy] getSigningKey error for kid ${kid}: ${err?.message}`, err?.stack);
            return done(new UnauthorizedException('Unable to get signing key'), null);
          }
        } catch (error: any) {
          log.error(`[JwtStrategy] secretOrKeyProvider unexpected error: ${error?.message}`, error?.stack);
          done(new UnauthorizedException('Failed to process token'), null);
        }
      },
    });
  }

  private initializePromise: Promise<void> | null = null;

  private initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.secretService.getSecret().then((secretData) => {
      const region = secretData.COGNITO_REGION || 'us-east-1';
      const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${secretData.COGNITO_USERPOOLID}/.well-known/jwks.json`;
      this.logger.log(`[JwtStrategy] Initializing JWKS client with URI: ${jwksUri}`);
      this.jwksClient = jwksRsa({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
        cacheMaxAge: 86400000,
        cacheMaxEntries: 5,
        timeout: 30000,
      });
    });
    return this.initializePromise;
  }

  async validate(payload: any): Promise<UserDTO> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid payload');
    }
    let user = await this.userService.findByCognitoId(payload.sub);
    if (!user) {
      user = await this.authService.syncUser({
        cognitoId: payload.sub,
        email: payload.email || payload['cognito:username'] || payload.sub,
        name: payload.name,
      });
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
