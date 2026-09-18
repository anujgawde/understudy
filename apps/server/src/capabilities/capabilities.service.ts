import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Capability } from '@understudy/schemas';

@Injectable()
export class CapabilitiesService {
  private capabilities = new Map<string, Capability>();

  save(data: unknown): Capability {
    const parsed = Capability.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    this.capabilities.set(parsed.data.capabilityId, parsed.data);
    return parsed.data;
  }

  findAll(): Capability[] {
    return [...this.capabilities.values()];
  }

  findOne(capabilityId: string): Capability {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }
    return capability;
  }

  approve(capabilityId: string): Capability {
    const approved: Capability = { ...this.findOne(capabilityId), status: 'approved' };
    this.capabilities.set(capabilityId, approved);
    return approved;
  }
}
