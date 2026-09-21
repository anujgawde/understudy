import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Subject, filter, map, type Observable } from 'rxjs';
import { RunLog, RunLogEntry } from '@understudy/schemas';
import { JsonStore } from '../json-store.js';

@Injectable()
export class RunsService {
  private store = new JsonStore<RunLog>('runs');
  private appended = new Subject<{ runId: string; entry: RunLogEntry }>();

  save(data: unknown): RunLog {
    const parsed = RunLog.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    this.store.set(parsed.data.runId, parsed.data);
    return parsed.data;
  }

  findAll(): RunLog[] {
    return this.store.all();
  }

  findOne(runId: string): RunLog {
    const runLog = this.store.get(runId);
    if (!runLog) {
      throw new NotFoundException(`Run "${runId}" not found`);
    }
    return runLog;
  }

  findByCapability(capabilityId: string): RunLog[] {
    return this.store.all().filter((runLog) => runLog.capabilityId === capabilityId);
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
    this.store.set(runId, runLog);
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
