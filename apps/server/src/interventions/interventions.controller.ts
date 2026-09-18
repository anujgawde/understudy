import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { Intervention, Session } from '@understudy/session';
import { InterventionsService } from './interventions.service.js';

@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventions: InterventionsService) {}

  @Get()
  findOpen(@Query('sessionId') sessionId?: string): Intervention[] {
    return this.interventions.findOpen(sessionId);
  }

  @Get(':sessionId')
  findBySession(@Param('sessionId') sessionId: string): Intervention[] {
    return this.interventions.findBySession(sessionId);
  }

  @Get(':sessionId/:interventionId')
  findOne(
    @Param('sessionId') sessionId: string,
    @Param('interventionId') interventionId: string,
  ): Intervention {
    return this.interventions.findOne(sessionId, interventionId);
  }

  @Post(':sessionId/handoff')
  handOff(
    @Param('sessionId') sessionId: string,
    @Body('operatorId') operatorId: string,
  ): Session {
    return this.interventions.handOff(sessionId, operatorId);
  }

  @Post(':sessionId/handback')
  handBack(
    @Param('sessionId') sessionId: string,
    @Body('operatorId') operatorId: string,
  ): Session {
    return this.interventions.handBack(sessionId, operatorId);
  }

  @Post(':sessionId/resolve')
  resolve(@Param('sessionId') sessionId: string): Session {
    return this.interventions.resolve(sessionId);
  }
}
