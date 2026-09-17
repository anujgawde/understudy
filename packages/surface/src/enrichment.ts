export interface RawObservedElement {
  elementRef: string;
  role: string;
  accessibleName: string | undefined;
  currentValue: string | undefined;
  isEnabled: boolean;
  isVisible: boolean;
  tagName: string | undefined;
  domId: string | undefined;
  testId: string | undefined;
  nearbyText: string[] | undefined;
}

/**
 * Runs inside the browser via page.evaluate(). Must be entirely
 * self-contained — no imports, no module-scoped references.
 */
export function collectPageElements(): RawObservedElement[] {
  document.querySelectorAll('[data-understudy-ref]').forEach((el) => {
    el.removeAttribute('data-understudy-ref');
  });

  let refCounter = 0;

  const INCLUDED_ROLES = new Set([
    'button',
    'link',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'searchbox',
    'spinbutton',
    'switch',
    'tab',
    'menuitem',
    'option',
    'slider',
    'menu',
    'heading',
    'img',
    'cell',
    'columnheader',
    'rowheader',
    'table',
    'navigation',
    'main',
    'form',
    'region',
    'alert',
    'status',
    'dialog',
    'alertdialog',
  ]);

  function getImplicitRole(el: Element): string | null {
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case 'a':
        return el.hasAttribute('href') ? 'link' : null;
      case 'button':
        return 'button';
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return 'heading';
      case 'img':
        return 'img';
      case 'input': {
        const type = (el as HTMLInputElement).type.toLowerCase();
        if (type === 'hidden') return null;
        const inputRoles: Record<string, string> = {
          text: 'textbox',
          search: 'searchbox',
          email: 'textbox',
          password: 'textbox',
          tel: 'textbox',
          url: 'textbox',
          number: 'spinbutton',
          checkbox: 'checkbox',
          radio: 'radio',
          button: 'button',
          submit: 'button',
          reset: 'button',
          image: 'button',
        };
        return inputRoles[type] ?? 'textbox';
      }
      case 'select':
        return 'combobox';
      case 'textarea':
        return 'textbox';
      case 'table':
        return 'table';
      case 'td':
        return 'cell';
      case 'th':
        return 'columnheader';
      case 'nav':
        return 'navigation';
      case 'form':
        return 'form';
      case 'main':
        return 'main';
      case 'option':
        return 'option';
      case 'section':
        return el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
          ? 'region'
          : null;
      default:
        return null;
    }
  }

  function getRole(el: Element): string | null {
    return el.getAttribute('role') || getImplicitRole(el);
  }

  function getAccessibleName(el: Element, role: string): string {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((refId) => document.getElementById(refId)?.textContent?.trim() ?? '')
        .filter(Boolean);
      if (parts.length > 0) return parts.join(' ');
    }

    if (el.id) {
      const label = document.querySelector(`label[for="${el.id.replace(/([^\w-])/g, '\\$1')}"]`);
      if (label) return label.textContent?.trim() ?? '';
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel !== el) {
      const clone = parentLabel.cloneNode(true) as Element;
      const selfInClone = clone.querySelector(el.tagName.toLowerCase());
      if (selfInClone) selfInClone.remove();
      const labelText = clone.textContent?.trim();
      if (labelText) return labelText;
    }

    if (el.tagName === 'IMG') {
      return (el as HTMLImageElement).alt || '';
    }

    if (el.tagName === 'INPUT') {
      const input = el as HTMLInputElement;
      const inputType = input.type.toLowerCase();
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
        return input.value || '';
      }
      if (inputType === 'image') {
        return input.alt || '';
      }
    }

    const contentNamedRoles = [
      'button',
      'link',
      'heading',
      'cell',
      'columnheader',
      'rowheader',
      'tab',
      'menuitem',
      'option',
      'alert',
      'status',
    ];
    if (contentNamedRoles.includes(role)) {
      const text = el.textContent?.trim() ?? '';
      return text.length <= 200 ? text : text.slice(0, 200);
    }

    const title = el.getAttribute('title');
    if (title) return title.trim();

    return '';
  }

  function getCurrentValue(el: Element): string | undefined {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const input = el as HTMLInputElement;
      if (input.type === 'checkbox' || input.type === 'radio') {
        return input.checked ? 'true' : 'false';
      }
      return input.value || undefined;
    }
    if (tag === 'textarea') {
      return (el as HTMLTextAreaElement).value || undefined;
    }
    if (tag === 'select') {
      const select = el as HTMLSelectElement;
      const selected = select.options[select.selectedIndex];
      return selected?.text || undefined;
    }
    return undefined;
  }

  function isVisible(el: Element): boolean {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    } catch {
      return false;
    }
  }

  function isEnabled(el: Element): boolean {
    if ('disabled' in el && (el as HTMLInputElement).disabled) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    return true;
  }

  function getNearbyText(el: Element): string[] {
    const texts: string[] = [];

    const containingCell = el.closest('td');
    if (containingCell) {
      const row = containingCell.parentElement;
      if (row) {
        const cellIndex = Array.from(row.children).indexOf(containingCell);
        const table = containingCell.closest('table');
        if (table) {
          const thead = table.querySelector('thead');
          const headerRow = thead
            ? thead.querySelector('tr')
            : table.querySelector('tr');
          if (headerRow && headerRow !== row) {
            const headerCell = headerRow.children[cellIndex];
            if (headerCell) {
              const headerText = headerCell.textContent?.trim();
              if (headerText && headerText.length > 0 && headerText.length < 200) {
                texts.push(headerText);
              }
            }
          }
        }
        for (const sibling of row.children) {
          if (sibling === containingCell) continue;
          const text = sibling.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            texts.push(text);
          }
        }
      }
      return texts.slice(0, 5);
    }

    const parent = el.parentElement;
    if (!parent) return texts;

    for (const sibling of parent.childNodes) {
      if (sibling === el) continue;
      const text =
        sibling.nodeType === Node.TEXT_NODE
          ? sibling.textContent?.trim()
          : (sibling as Element).textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        texts.push(text);
      }
    }

    return texts.slice(0, 5);
  }

  const results: RawObservedElement[] = [];

  for (const el of document.querySelectorAll('*')) {
    const role = getRole(el);
    if (!role || !INCLUDED_ROLES.has(role)) continue;

    const ref = `element-${refCounter++}`;
    el.setAttribute('data-understudy-ref', ref);

    const accessibleName = getAccessibleName(el, role) || undefined;
    const currentValue = getCurrentValue(el);
    const nearbyText = getNearbyText(el);

    results.push({
      elementRef: ref,
      role,
      accessibleName,
      currentValue,
      isEnabled: isEnabled(el),
      isVisible: isVisible(el),
      tagName: el.tagName.toLowerCase() || undefined,
      domId: el.id || undefined,
      testId: el.getAttribute('data-testid') || undefined,
      nearbyText: nearbyText.length > 0 ? nearbyText : undefined,
    });
  }

  return results;
}
