import { Module } from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service.js';

@Module({
  providers: [CapabilitiesService],
  exports: [CapabilitiesService],
})
export class CapabilitiesModule {}
