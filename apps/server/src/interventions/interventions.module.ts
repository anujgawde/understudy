import { Module } from '@nestjs/common';
import { InterventionsService } from './interventions.service.js';

@Module({
  providers: [InterventionsService],
  exports: [InterventionsService],
})
export class InterventionsModule {}
