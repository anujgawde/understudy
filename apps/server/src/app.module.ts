import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { SessionModule } from './session/session.module.js';
import { CapabilitiesModule } from './capabilities/capabilities.module.js';
import { RunsModule } from './runs/runs.module.js';
import { InterventionsModule } from './interventions/interventions.module.js';
import { PolicyModule } from './policy/policy.module.js';

@Module({
  imports: [
    SessionModule,
    CapabilitiesModule,
    RunsModule,
    InterventionsModule,
    PolicyModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
