import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));

export class JsonStore<T> {
  private directory: string;

  constructor(collection: string) {
    this.directory = join(DATA_DIR, collection);
    mkdirSync(this.directory, { recursive: true });
  }

  set(id: string, data: T): void {
    writeFileSync(join(this.directory, `${id}.json`), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  get(id: string): T | undefined {
    try {
      const raw = readFileSync(join(this.directory, `${id}.json`), 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  all(): T[] {
    try {
      const entries = readdirSync(this.directory);
      return entries
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const raw = readFileSync(join(this.directory, name), 'utf-8');
          return JSON.parse(raw) as T;
        });
    } catch {
      return [];
    }
  }
}
