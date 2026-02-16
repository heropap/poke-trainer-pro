import { resolveSetCode } from '../src/lib/deck-parser';

const EXPECTED: Record<string, string> = {
  MEG: 'me1',
  ASC: 'me2pt5',
  PFL: 'me2',
  MEE: 'sve',
};

let success = true;

Object.entries(EXPECTED).forEach(([code, expected]) => {
  const result = resolveSetCode(code);
  if (result !== expected) {
    console.error(`FAIL: ${code} -> ${result} (expected ${expected})`);
    success = false;
  } else {
    console.log(`OK: ${code} -> ${result}`);
  }
});

if (!success) {
  process.exit(1);
} else {
  console.log('\nAll set codes verified successfully.');
}
