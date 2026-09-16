import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { ok: boolean; app: string } {
    return { ok: true, app: 'understudy-server' };
  }
}
