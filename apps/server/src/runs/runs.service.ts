import { Injectable, NotFoundException } from '@nestjs/common';
import type { RunLog } from '@understudy/schemas';

@Injectable()
export class RunsService {
  private runLogs = new Map<string, RunLog>();

  save(runLog: RunLog): RunLog {
    this.runLogs.set(runLog.runId, runLog);
    return runLog;
  }

  findAll(): RunLog[] {
    return [...this.runLogs.values()];
  }

  findOne(runId: string): RunLog {
    const runLog = this.runLogs.get(runId);
    if (!runLog) {
      throw new NotFoundException(`Run "${runId}" not found`);
    }
    return runLog;
  }

  findByCapability(capabilityId: string): RunLog[] {
    return [...this.runLogs.values()].filter(
      (runLog) => runLog.capabilityId === capabilityId,
    );
  }
}
