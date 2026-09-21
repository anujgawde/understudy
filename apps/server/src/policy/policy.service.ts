import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Policy } from '@understudy/schemas';
import { JsonStore } from '../json-store.js';

@Injectable()
export class PolicyService {
  private store = new JsonStore<Policy>('policies');

  save(data: unknown): Policy {
    const parsed = Policy.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    this.store.set(parsed.data.policyId, parsed.data);
    return parsed.data;
  }

  findAll(): Policy[] {
    return this.store.all();
  }

  findOne(policyId: string): Policy {
    const policy = this.store.get(policyId);
    if (!policy) {
      throw new NotFoundException(`Policy "${policyId}" not found`);
    }
    return policy;
  }
}
