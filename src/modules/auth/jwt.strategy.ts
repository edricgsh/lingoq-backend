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
        (request: Request) => {
          const token = request?.cookies?.accessToken ?? null;
          if (token) {
            log.log('[JwtStrategy] Extracted token from httpOnly cookie');
          } else {
            const cookieKeys = Object.keys(request?.cookies ?? {});
            log.warn(`[JwtStrategy] No accessToken cookie found. Cookies present: [${cookieKeys.join(', ') || 'none'}]`);
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider: async (request, accessToken, done) => {
        try {
          log.log(`[JwtStrategy] secretOrKeyProvider called, token length: ${accessToken?.length}`);
          await this.initialize();
          const decoded = jwt.decode(accessToken, { complete: true });
          if (!decoded || !decoded.header || !decoded.header.kid) {
            log.error(`[JwtStrategy] Token decode failed or missing kid. header: ${JSON.stringify(decoded?.header)}`);
            return done(new UnauthorizedException('Invalid token format'), null);
          }

          const kid = decoded.header.kid;
          const payload = decoded.payload as any;
          const exp = payload?.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown';
          log.log(`[JwtStrategy] Token kid: ${kid} | iss: ${payload?.iss} | exp: ${exp}`);

          try {
            const key = await this.jwksClient.getSigningKey(kid);
            if (!key) {
              log.error(`[JwtStrategy] getSigningKey returned null for kid: ${kid}`);
              return done(new UnauthorizedException('Unable to get signing key'), null);
            }
            log.log('[JwtStrategy] Signing key retrieved successfully');
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
      this.logger.error('[JwtStrategy] validate called with invalid payload', JSON.stringify(payload));
      throw new UnauthorizedException('Invalid payload');
    }
    this.logger.log(`[JwtStrategy] validate called for sub: ${payload.sub}`);
    let user = await this.userService.findByCognitoId(payload.sub);
    if (!user) {
      this.logger.warn(`[JwtStrategy] User not found locally for sub: ${payload.sub}, syncing from Cognito`);
      user = await this.authService.syncUser({
        cognitoId: payload.sub,
        email: payload.email || payload['cognito:username'] || payload.sub,
        name: payload.name,
      });
    }
    this.logger.log(`[JwtStrategy] Authenticated user: ${user.id} (${user.role})`);
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
