import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../common/api-error';
import { JwtVerifierService } from './jwt-verifier.service';
import { UserService } from './user.service';

export type Principal =
  | { kind: 'user'; userId: string }
  | { kind: 'link'; shareToken: string }
  | { kind: 'anonymous' };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private users: UserService,
    private jwt: JwtVerifierService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    const shareToken = req.headers['x-share-token'];

    if (bearer) {
      let claims;
      try {
        claims = await this.jwt.verify(bearer);
      } catch {
        throw new AppError('FORBIDDEN', 'Invalid or expired session', 401);
      }
      const user = await this.users.upsertFromClaims(claims);
      req.principal = { kind: 'user', userId: user.id };
      return true;
    }

    req.principal = shareToken
      ? { kind: 'link', shareToken: String(shareToken) }
      : { kind: 'anonymous' };
    return true;
  }
}
