import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { Observation, ObservedElement } from '@understudy/schemas';
import type { Surface } from './surface.js';
import { collectPageElements } from './enrichment.js';

export interface PlaywrightSurfaceOptions {
  screenshotDirectory?: string;
}

export class PlaywrightSurface implements Surface {
  private page: Page;
  private screenshotDirectory: string | undefined;

  constructor(page: Page, options?: PlaywrightSurfaceOptions) {
    this.page = page;
    this.screenshotDirectory = options?.screenshotDirectory;
  }

  async observe(): Promise<Observation> {
    const [url, pageTitle, rawElements] = await Promise.all([
      Promise.resolve(this.page.url()),
      this.page.title(),
      this.page.evaluate(collectPageElements),
    ]);

    let screenshotPath: string | undefined;
    if (this.screenshotDirectory) {
      await mkdir(this.screenshotDirectory, { recursive: true });
      const filename = `observe-${Date.now()}.png`;
      screenshotPath = join(this.screenshotDirectory, filename);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
    }

    return {
      url,
      pageTitle,
      elements: rawElements as ObservedElement[],
      screenshotPath,
      capturedAt: new Date().toISOString(),
    };
  }
}
