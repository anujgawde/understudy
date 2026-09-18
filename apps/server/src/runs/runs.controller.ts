import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { RunLog, RunLogEntry } from '@understudy/schemas';
import { RunsService } from './runs.service.js';

@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  findAll(@Query('capabilityId') capabilityId?: string): RunLog[] {
    return capabilityId ? this.runs.findByCapability(capabilityId) : this.runs.findAll();
  }

  @Get(':runId')
  findOne(@Param('runId') runId: string): RunLog {
    return this.runs.findOne(runId);
  }

  @Post()
  save(@Body() body: unknown): RunLog {
    return this.runs.save(body);
  }

  // How a runner feeds a live run: each entry posted here also reaches every
  // socket subscribed to this run.
  @Post(':runId/entries')
  appendEntry(@Param('runId') runId: string, @Body() body: unknown): RunLogEntry {
    return this.runs.appendEntry(runId, body);
  }
}
