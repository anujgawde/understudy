import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { Capability } from '@understudy/schemas';
import { CapabilitiesService } from './capabilities.service.js';

@Controller('capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get()
  findAll(): Capability[] {
    return this.capabilities.findAll();
  }

  @Get(':capabilityId')
  findOne(@Param('capabilityId') capabilityId: string): Capability {
    return this.capabilities.findOne(capabilityId);
  }

  @Post()
  save(@Body() body: unknown): Capability {
    return this.capabilities.save(body);
  }

  @Post(':capabilityId/approve')
  approve(@Param('capabilityId') capabilityId: string): Capability {
    return this.capabilities.approve(capabilityId);
  }
}
