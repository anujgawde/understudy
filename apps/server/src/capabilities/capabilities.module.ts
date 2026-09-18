import { Module } from '@nestjs/common';
import { CapabilitiesController } from './capabilities.controller.js';
import { CapabilitiesService } from './capabilities.service.js';

@Module({
  controllers: [CapabilitiesController],
  providers: [CapabilitiesService],
  exports: [CapabilitiesService],
})
export class CapabilitiesModule {}
