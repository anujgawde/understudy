import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page, Locator as PlaywrightLocator } from 'playwright';
import type {
  Action,
  Locator,
  LocatorLadder,
  Observation,
  ObservedElement,
  WaitCondition,
} from '@understudy/schemas';
import type { PlaywrightSurfaceOptions, ResolveResult, Surface } from './types.js';
import { collectPageElements } from './enrichment.js';

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

  async act(action: Action, waitCondition?: WaitCondition): Promise<void> {
    switch (action.actionType) {
      case 'navigate': {
        await this.page.goto(action.url);
        if (waitCondition) {
          await this.applyWaitCondition(waitCondition);
        }
        break;
      }
      case 'click': {
        const { locator: target } = await this.resolveElement(action.target);
        if (waitCondition) {
          await Promise.all([
            this.applyWaitCondition(waitCondition),
            target.click(),
          ]);
        } else {
          await target.click();
        }
        break;
      }
      case 'fill': {
        const { locator: target } = await this.resolveElement(action.target);
        await target.fill(action.value);
        if (waitCondition) {
          await this.applyWaitCondition(waitCondition);
        }
        break;
      }
    }
  }

  async resolve(ladder: LocatorLadder): Promise<ResolveResult> {
    const { rungIndex, rung, matchCount } = await this.resolveElement(ladder);
    return { rungIndex, rung, matchCount };
  }

  async extractText(
    ladder: LocatorLadder,
  ): Promise<{ text: string; resolveResult: ResolveResult }> {
    const { rungIndex, rung, matchCount, locator } = await this.resolveElement(ladder);
    const raw = await locator.textContent();
    return {
      text: (raw ?? '').trim(),
      resolveResult: { rungIndex, rung, matchCount },
    };
  }

  private async resolveElement(
    ladder: LocatorLadder,
  ): Promise<ResolveResult & { locator: PlaywrightLocator }> {
    await this.page.evaluate(() => {
      document.querySelectorAll('[data-understudy-act-target]').forEach((el) => {
        el.removeAttribute('data-understudy-act-target');
      });
    });

    for (let rungIndex = 0; rungIndex < ladder.length; rungIndex++) {
      const rung = ladder[rungIndex]!;
      const locator = await this.buildLocator(rung);
      if (!locator) continue;
      const matchCount = await locator.count();
      if (matchCount > 0) return { rungIndex, rung, matchCount, locator: locator.first() };
    }

    const strategies = ladder.map((r) => r.strategy).join(', ');
    throw new Error(
      `No rung in the locator ladder matched an element on the page (tried: ${strategies})`,
    );
  }

  private async buildLocator(rung: Locator): Promise<PlaywrightLocator | null> {
    switch (rung.strategy) {
      case 'role': {
        const options: { name?: string } = {};
        if (rung.accessibleName) options.name = rung.accessibleName;
        let locator = this.page.getByRole(
          rung.role as Parameters<Page['getByRole']>[0],
          options,
        );
        if (rung.matchIndex !== undefined) locator = locator.nth(rung.matchIndex);
        return locator;
      }
      case 'text': {
        let locator = this.page.getByText(rung.text, {
          exact: rung.matchExactly ?? false,
        });
        if (rung.matchIndex !== undefined) locator = locator.nth(rung.matchIndex);
        return locator;
      }
      case 'css': {
        let locator = this.page.locator(rung.selector);
        if (rung.matchIndex !== undefined) locator = locator.nth(rung.matchIndex);
        return locator;
      }
      case 'adjacent': {
        return this.buildAdjacentLocator(rung);
      }
    }
  }

  private async buildAdjacentLocator(
    rung: Extract<Locator, { strategy: 'adjacent' }>,
  ): Promise<PlaywrightLocator | null> {
    const tempMarker = `_act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const found = await this.page.evaluate(
      ({ labelText, direction, targetRole, matchIndex, tempMarker }) => {
        const cells = document.querySelectorAll('td, th');
        const matchingCells: Element[] = [];

        for (const cell of cells) {
          const text = cell.textContent?.trim() ?? '';
          if (text.includes(labelText)) {
            matchingCells.push(cell);
          }
        }

        if (matchingCells.length === 0) return false;
        const labelCell = matchingCells[matchIndex ?? 0];
        if (!labelCell) return false;

        let targetCell: Element | null = null;

        if (direction === 'next') {
          targetCell = labelCell.nextElementSibling;
        } else {
          const row = labelCell.parentElement;
          if (!row) return false;
          const colIndex = Array.from(row.children).indexOf(labelCell);
          const nextRow = row.nextElementSibling;
          if (!nextRow) return false;
          targetCell = (nextRow.children[colIndex] as Element) ?? null;
        }

        if (!targetCell) return false;

        let target: Element | null = null;

        if (targetRole) {
          for (const el of targetCell.querySelectorAll('*')) {
            if (el.getAttribute('role') === targetRole) {
              target = el;
              break;
            }
            const tag = el.tagName.toLowerCase();
            const type = (el as HTMLInputElement).type?.toLowerCase() ?? '';
            const implicitMatch =
              (targetRole === 'textbox' &&
                ((tag === 'input' &&
                  ['text', 'search', 'email', 'password', 'tel', 'url', ''].includes(type)) ||
                  tag === 'textarea')) ||
              (targetRole === 'combobox' && tag === 'select') ||
              (targetRole === 'button' &&
                (tag === 'button' ||
                  (tag === 'input' &&
                    ['submit', 'button', 'reset', 'image'].includes(type)))) ||
              (targetRole === 'link' && tag === 'a') ||
              (targetRole === 'checkbox' && tag === 'input' && type === 'checkbox') ||
              (targetRole === 'radio' && tag === 'input' && type === 'radio') ||
              (targetRole === 'searchbox' && tag === 'input' && type === 'search') ||
              (targetRole === 'spinbutton' && tag === 'input' && type === 'number');
            if (implicitMatch) {
              target = el;
              break;
            }
          }
        } else {
          target = targetCell.querySelector('input, select, textarea, button, a');
        }

        if (!target) return false;
        target.setAttribute('data-understudy-act-target', tempMarker);
        return true;
      },
      {
        labelText: rung.labelText,
        direction: rung.direction,
        targetRole: rung.targetRole,
        matchIndex: rung.matchIndex,
        tempMarker,
      },
    );

    if (!found) return null;
    return this.page.locator(`[data-understudy-act-target="${tempMarker}"]`);
  }

  async pageUrl(): Promise<string> {
    return this.page.url();
  }

  async hasText(text: string): Promise<boolean> {
    const count = await this.page.getByText(text).count();
    return count > 0;
  }

  private async applyWaitCondition(condition: WaitCondition): Promise<void> {
    switch (condition.waitUntil) {
      case 'pageLoad':
        await this.page.waitForLoadState('load');
        break;
      case 'selectorPresent':
        await this.page.locator(condition.selector).first().waitFor();
        break;
      case 'textPresent':
        await this.page.getByText(condition.text).first().waitFor();
        break;
      case 'fixedDelay':
        await this.page.waitForTimeout(condition.milliseconds);
        break;
    }
  }
}
