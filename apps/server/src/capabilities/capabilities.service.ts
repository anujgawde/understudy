import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Capability } from '@understudy/schemas';
import { JsonStore } from '../json-store.js';

@Injectable()
export class CapabilitiesService {
  private store = new JsonStore<Capability>('capabilities');

  save(data: unknown): Capability {
    const parsed = Capability.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    this.store.set(parsed.data.capabilityId, parsed.data);
    return parsed.data;
  }

  findAll(): Capability[] {
    return this.store.all();
  }

  findOne(capabilityId: string): Capability {
    const capability = this.store.get(capabilityId);
    if (!capability) {
      throw new NotFoundException(`Capability "${capabilityId}" not found`);
    }
    return capability;
  }

  approve(capabilityId: string): Capability {
    const approved: Capability = { ...this.findOne(capabilityId), status: 'approved' };
    this.store.set(capabilityId, approved);
    return approved;
  }
}
