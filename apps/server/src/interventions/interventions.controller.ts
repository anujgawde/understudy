import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { Intervention, LedgerEntry, Session } from '@understudy/session';
import { InterventionsService } from './interventions.service.js';

@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventions: InterventionsService) {}

  // Everything recorded, whichever process raised it. Declared before the
  // parameterised routes below, which would otherwise swallow "ledger".
  @Get()
  findAll(@Query('sessionId') sessionId?: string): Intervention[] {
    return sessionId ? this.interventions.findOpen(sessionId) : this.interventions.findAll();
  }

  @Get('ledger')
  findLedger(): LedgerEntry[] {
    return this.interventions.findLedger();
  }

  /** Records an intervention a CLI run raised in its own process. */
  @Post()
  record(
    @Body() body: { intervention: Intervention; ledger?: LedgerEntry[] },
  ): Intervention {
    return this.interventions.record(body.intervention, body.ledger);
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
