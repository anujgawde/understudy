import { Injectable, NotFoundException } from '@nestjs/common';
import { Capability } from '@understudy/schemas';

@Injectable()
export class CapabilitiesService {
  private capabilities = new Map<string, Capability>();

  create(data: unknown): Capability {
    const capability = Capability.parse(data);
    this.capabilities.set(capability.capabilityId, capability);
    return capability;
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
    const capability = this.findOne(capabilityId);
    const approved = { ...capability, status: 'approved' as const };
    this.capabilities.set(capabilityId, approved);
    return approved;
  }

  delete(capabilityId: string): void {
    if (!this.capabilities.delete(capabilityId)) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }
  }
}
