import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Subject, filter, map, type Observable } from 'rxjs';
import { RunLog, RunLogEntry } from '@understudy/schemas';

@Injectable()
export class RunsService {
  private runLogs = new Map<string, RunLog>();
  private appended = new Subject<{ runId: string; entry: RunLogEntry }>();

  save(data: unknown): RunLog {
    const parsed = RunLog.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    this.runLogs.set(parsed.data.runId, parsed.data);
    return parsed.data;
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
    return [...this.runLogs.values()].filter((runLog) => runLog.capabilityId === capabilityId);
  }

  appendEntry(runId: string, data: unknown): RunLogEntry {
    const runLog = this.findOne(runId);
    const parsed = RunLogEntry.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    runLog.entries.push(parsed.data);
    this.appended.next({ runId, entry: parsed.data });
    return parsed.data;
  }

  entryStream(runId: string): Observable<RunLogEntry> {
    return this.appended.pipe(
      filter((emitted) => emitted.runId === runId),
      map((emitted) => emitted.entry),
    );
  }
}
