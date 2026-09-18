import { Global, Module } from '@nestjs/common';
import { SessionRegistry } from '@understudy/session';

@Global()
@Module({
  providers: [
    {
      provide: SessionRegistry,
      useFactory: () => new SessionRegistry(),
    },
  ],
  exports: [SessionRegistry],
})
export class SessionModule {}
