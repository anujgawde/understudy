import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { Policy } from '@understudy/schemas';
import { PolicyService } from './policy.service.js';

@Controller('policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Get()
  findAll(): Policy[] {
    return this.policy.findAll();
  }

  @Get(':policyId')
  findOne(@Param('policyId') policyId: string): Policy {
    return this.policy.findOne(policyId);
  }

  @Post()
  save(@Body() body: unknown): Policy {
    return this.policy.save(body);
  }
}
