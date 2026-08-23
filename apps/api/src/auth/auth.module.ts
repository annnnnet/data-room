import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { JwtVerifierService } from './jwt-verifier.service';
import { UserService } from './user.service';

@Global()
@Module({
  providers: [AuthGuard, JwtVerifierService, UserService],
  exports: [AuthGuard, UserService, JwtVerifierService],
})
export class AuthModule {}
