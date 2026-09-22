/**
 * Runs inside the browser via page.evaluate(). Must be entirely
 * self-contained — no imports, no module-scoped references.
 *
 * Redaction elsewhere in the system works on strings at the moment they are
 * written to a log or an artifact. A screenshot carries the same values as
 * pixels, where no string filter can reach them, so the covering has to happen
 * on the page before the frame is captured.
 *
 * Marks two things: form controls whose own labelling matches a redacted field
 * name, and table cells sitting under or beside a header that matches. The
 * second is what catches read-only PII in a legacy grid, which is the shape
 * most of this data actually takes on screen.
 *
 * Returns whether anything was marked, so the caller can skip passing a mask
 * locator that would resolve to nothing.
 */
export function markRedactedElements(options: {
  fieldNames: string[];
  attribute: string;
}): boolean {
  const { fieldNames, attribute } = options;

  document.querySelectorAll(`[${attribute}]`).forEach((element) => {
    element.removeAttribute(attribute);
  });

  const needles = fieldNames.map((name) => name.toLowerCase()).filter(Boolean);

  function matches(text: string | null | undefined): boolean {
    if (!text) return false;
    const haystack = text.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  }

  let marked = 0;

  function mark(element: Element): void {
    element.setAttribute(attribute, '');
    marked++;
  }

  // A password field is masked whatever the policy says. Its value is a
  // credential by construction, not because someone remembered to list it.
  document.querySelectorAll('input[type="password"]').forEach(mark);

  if (needles.length > 0) {
    document.querySelectorAll('input, textarea, select').forEach((element) => {
      const input = element as HTMLInputElement;
      if (input.type === 'password') return;

      const labelledBy = input.id
        ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent
        : null;

      if (
        matches(input.name) ||
        matches(input.id) ||
        matches(input.getAttribute('placeholder')) ||
        matches(input.getAttribute('aria-label')) ||
        matches(labelledBy) ||
        matches(input.closest('label')?.textContent)
      ) {
        mark(input);
      }
    });

    document.querySelectorAll('table').forEach((table) => {
      const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
      const sensitiveColumns = new Set<number>();

      headerCells.forEach((header, columnIndex) => {
        if (matches(header.textContent)) sensitiveColumns.add(columnIndex);
      });

      table.querySelectorAll('tr').forEach((row) => {
        const cells = Array.from(row.children);

        cells.forEach((cell, columnIndex) => {
          if (sensitiveColumns.has(columnIndex) && cell.tagName.toLowerCase() === 'td') {
            mark(cell);
          }
        });

        // A two-column detail table labels the value beside it rather than
        // above it, which is the other half of how these pages are built.
        cells.forEach((cell, columnIndex) => {
          if (!matches(cell.textContent)) return;
          const valueCell = cells[columnIndex + 1];
          if (valueCell && valueCell.tagName.toLowerCase() === 'td') mark(valueCell);
        });
      });
    });
  }

  return marked > 0;
}
