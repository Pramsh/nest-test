import * as fs from 'fs';
import * as path from 'path';

export function loadPemFromPath(p?: string): string {
  if (!p) throw new Error(`${p} is not set`);
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) throw new Error(`key ${p} not found at: ${abs}`);
  return fs.readFileSync(abs, 'utf8');
}
