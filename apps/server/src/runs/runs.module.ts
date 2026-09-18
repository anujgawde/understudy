import { Module } from '@nestjs/common';
import { RunsService } from './runs.service.js';

@Module({
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
