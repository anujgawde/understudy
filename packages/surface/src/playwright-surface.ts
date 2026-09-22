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
import type {
  CapturedDialog,
  PlaywrightSurfaceOptions,
  ResolveResult,
  Surface,
} from './types.js';
import { collectPageElements } from './enrichment.js';
import { markRedactedElements } from './masking.js';

const MASK_ATTRIBUTE = 'data-understudy-mask';

export class PlaywrightSurface implements Surface {
  private page: Page;
  private screenshotDirectory: string | undefined;
  private redactedFieldNames: string[];
  private observationCount = 0;
  private dialogs: CapturedDialog[] = [];
  private documentStatus: number | undefined;

  constructor(page: Page, options?: PlaywrightSurfaceOptions) {
    this.page = page;
    this.screenshotDirectory = options?.screenshotDirectory;
    this.redactedFieldNames = options?.redactedFieldNames ?? [];

    // Without a listener Playwright dismisses dialogs itself and tells nobody,
    // which is precisely the silent-proceed the brief asks replay not to do.
    // Dismissing is still the right answer — accepting one would confirm
    // something no artifact declared — but it is recorded either way.
    this.page.on('dialog', (dialog) => {
      this.dialogs.push({
        kind: dialog.type(),
        message: dialog.message(),
        capturedAt: new Date().toISOString(),
      });
      void dialog.dismiss().catch(() => undefined);
    });

    this.page.on('response', (response) => {
      if (response.request().isNavigationRequest() && response.frame() === this.page.mainFrame()) {
        this.documentStatus = response.status();
      }
    });
  }

  async drainDialogs(): Promise<CapturedDialog[]> {
    // A round trip to the page, purely for its ordering: the dialog event was
    // queued when the action fired, and this cannot come back before that has
    // been delivered. A dialog currently open does not deadlock it, because the
    // handler above dismisses on arrival.
    await this.page.evaluate(() => true).catch(() => undefined);

    const captured = this.dialogs;
    this.dialogs = [];
    return captured;
  }

  lastResponseStatus(): number | undefined {
    return this.documentStatus;
  }

  clearResponseStatus(): void {
    this.documentStatus = undefined;
  }

  async observe(): Promise<Observation> {
    const [url, pageTitle, rawElements] = await Promise.all([
      Promise.resolve(this.page.url()),
      this.page.title(),
      this.page.evaluate(collectPageElements),
    ]);

    let screenshotPath: string | undefined;
    // about:blank has nothing to capture, and a white rectangle in the evidence
    // folder is worse than no file at all.
    if (this.screenshotDirectory && url !== 'about:blank') {
      // Discovery re-observes straight after acting, with no wait condition. A
      // click that navigated has torn down the old document and not yet painted
      // the new one, so without settling first the capture comes out blank.
      await this.page
        .waitForLoadState('load', { timeout: 5_000 })
        .catch(() => undefined);

      await mkdir(this.screenshotDirectory, { recursive: true });
      // Counted rather than timestamped: epoch millis is 13 digits, which the
      // payment-card pattern in the policy matches, so every path in the run log
      // came out as observe-[redacted].png and resolved to nothing.
      const filename = `observe-${String(this.observationCount++).padStart(3, '0')}.png`;
      screenshotPath = join(this.screenshotDirectory, filename);

      const masked = await this.markMaskTargets();
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true,
        ...(masked && { mask: [this.page.locator(`[${MASK_ATTRIBUTE}]`)] }),
      });
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

  // Covers the values a policy calls sensitive before the frame is written.
  // Returns false when nothing matched, so the screenshot is taken without a
  // mask locator rather than with one that resolves to nothing.
  private async markMaskTargets(): Promise<boolean> {
    return this.page
      .evaluate(markRedactedElements, {
        fieldNames: this.redactedFieldNames,
        attribute: MASK_ATTRIBUTE,
      })
      .catch(() => false);
  }

  /**
   * A frame with the same values covered as an observation's. Replay photographs
   * the page itself rather than observing it, and taking that shot through the
   * surface is what stops the evidence path from being the one place redaction
   * does not reach.
   */
  async screenshot(): Promise<Buffer> {
    const masked = await this.markMaskTargets();
    return this.page.screenshot({
      fullPage: true,
      ...(masked && { mask: [this.page.locator(`[${MASK_ATTRIBUTE}]`)] }),
    });
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
