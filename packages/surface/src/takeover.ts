import type { CDPSession, Page } from 'playwright';
import type { OperatorInput, ScreencastFrame } from '@understudy/schemas';
import type { ScreencastOptions } from './types.js';

export class OperatorTakeover {
  private page: Page;
  private cdpSession: CDPSession | undefined;

  constructor(page: Page) {
    this.page = page;
  }

  async startScreencast(
    onFrame: (frame: ScreencastFrame) => void | Promise<void>,
    options?: ScreencastOptions,
  ): Promise<void> {
    if (this.cdpSession) {
      throw new Error('Screencast already running');
    }

    const cdpSession = await this.page.context().newCDPSession(this.page);
    this.cdpSession = cdpSession;

    cdpSession.on('Page.screencastFrame', (frame) => {
      void (async () => {
        // A consumer that throws must not stall the stream, but one that is
        // merely slow should: awaiting it before the ack is what applies
        // backpressure.
        await Promise.resolve(onFrame({ data: frame.data, capturedAt: new Date().toISOString() }))
          .catch(() => undefined);
        // Chrome withholds the next frame until this ack lands, so acking only
        // once the consumer has taken this one turns the stream pull-based: a
        // slow operator connection drops frames instead of queueing them.
        await cdpSession
          .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
          .catch(() => undefined);
      })();
    });

    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: options?.quality ?? 70,
      maxWidth: options?.maxWidth ?? 1280,
      maxHeight: options?.maxHeight ?? 720,
      everyNthFrame: 1,
    });
  }

  async stopScreencast(): Promise<void> {
    if (!this.cdpSession) return;
    await this.cdpSession.send('Page.stopScreencast');
    await this.cdpSession.detach().catch(() => undefined);
    this.cdpSession = undefined;
  }

  async dispatch(input: OperatorInput): Promise<void> {
    switch (input.inputType) {
      case 'mouse_move':
        await this.page.mouse.move(input.x, input.y);
        break;
      case 'mouse_click':
        await this.page.mouse.click(input.x, input.y, {
          button: input.button,
          clickCount: input.clickCount,
        });
        break;
      case 'scroll':
        await this.page.mouse.move(input.x, input.y);
        await this.page.mouse.wheel(input.deltaX, input.deltaY);
        break;
      case 'key_press':
        await this.page.keyboard.press(input.key);
        break;
      case 'type_text':
        await this.page.keyboard.type(input.text);
        break;
    }
  }
}
