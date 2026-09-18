import { Module } from '@nestjs/common';
import { InterventionsController } from './interventions.controller.js';
import { InterventionsService } from './interventions.service.js';

@Module({
  controllers: [InterventionsController],
  providers: [InterventionsService],
  exports: [InterventionsService],
})
export class InterventionsModule {}
