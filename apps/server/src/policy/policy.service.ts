import { Injectable, NotFoundException } from '@nestjs/common';
import { Policy } from '@understudy/schemas';

@Injectable()
export class PolicyService {
  private policies = new Map<string, Policy>();

  create(data: unknown): Policy {
    const policy = Policy.parse(data);
    this.policies.set(policy.policyId, policy);
    return policy;
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

  upsert(data: unknown): Policy {
    const policy = Policy.parse(data);
    this.policies.set(policy.policyId, policy);
    return policy;
  }

  delete(policyId: string): void {
    if (!this.policies.delete(policyId)) {
      throw new NotFoundException(`Policy "${policyId}" not found`);
    }
  }
}
