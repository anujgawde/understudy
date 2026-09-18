import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Policy } from '@understudy/schemas';

@Injectable()
export class PolicyService {
  private policies = new Map<string, Policy>();

  save(data: unknown): Policy {
    const parsed = Policy.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    this.policies.set(parsed.data.policyId, parsed.data);
    return parsed.data;
  }

  findAll(): Policy[] {
    return [...this.policies.values()];
  }

  findOne(policyId: string): Policy {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new NotFoundException(`Policy "${policyId}" not found`);
    }
    return policy;
  }
}
