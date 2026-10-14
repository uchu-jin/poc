import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const PATTERNS = ['sk-ant-', 'ANTHROPIC_API_KEY', 'x-api-key', 'api.anthropic.com'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(DIST)) {
  console.error('check:bundle: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

let failed = false;
for (const file of walk(DIST)) {
  const content = readFileSync(file).toString('latin1');
  for (const pattern of PATTERNS) {
    if (content.includes(pattern)) {
      console.error(`check:bundle: "${pattern}" found in ${file}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('check:bundle: OK');
