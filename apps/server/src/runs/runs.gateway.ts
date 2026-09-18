import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
  type WsResponse,
} from '@nestjs/websockets';
import { map, type Observable } from 'rxjs';
import type { RunLogEntry } from '@understudy/schemas';
import { RunsService } from './runs.service.js';

@WebSocketGateway({ path: '/ws' })
export class RunsGateway {
  constructor(private readonly runs: RunsService) {}

  @SubscribeMessage('run:subscribe')
  subscribe(@MessageBody() body: { runId?: string }): Observable<WsResponse<RunLogEntry>> {
    const runId = body?.runId;
    if (!runId) {
      throw new WsException('run:subscribe requires a runId');
    }
    // Resolved up front so an unknown run fails the subscribe rather than
    // leaving the socket waiting on a stream that will never emit.
    this.runs.findOne(runId);

    return this.runs
      .entryStream(runId)
      .pipe(map((entry) => ({ event: 'run:entry', data: entry })));
  }
}
