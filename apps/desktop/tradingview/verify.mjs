// Executes the marked scalar expressions FROM the delivered Pine source.
// This narrow expression adapter is not a Pine compiler or a feed simulator.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./personal-macro-heatmap.pine', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');
const scalarBlock = source.split('// PURE_SCALAR_BEGIN:')[1]?.split('// PURE_SCALAR_END')[0];
assert.ok(scalarBlock, 'Marked scalar source must exist');
const scope = { math: Math, isNa: value => value == null || Number.isNaN(value) };
const definitions = [...scalarBlock.matchAll(/^(f_\w+)\(([^\n]*)\) =>\n    ([^\n]+)$/gm)];
assert.equal(definitions.length, 14, 'Every marked expression must be parsed; fail closed on syntax changes');
for (const [, name, parameters, expression] of definitions) {
  const names = parameters.split(',').map(parameter => parameter.trim().split(/\s+/).at(-1));
  const js = expression
    .replace(/\bna\(/g, 'scope.isNa(')
    .replace(/\bna\b/g, 'NaN')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\s+/g, '!')
    .replace(/\bmath\./g, 'scope.math.')
    .replace(/\b(f_\w+)\(/g, 'scope.$1(');
  const execute = new Function('scope', ...names, `"use strict"; return (${js});`);
  scope[name] = (...args) => execute(scope, ...args);
}
const f = scope;
const missing = NaN;
const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);
const unavailable = actual => assert.ok(Number.isNaN(actual), `Expected missing, got ${actual}`);

test('surprises: higher/lower, inverted unemployment, exact zero and negative values', () => {
  assert.equal(f.f_impulse(3.2, 3, 1), 1);
  assert.equal(f.f_impulse(3, 3.2, 1), -1);
  assert.equal(f.f_impulse(4.1, 4.2, -1), 1);
  assert.equal(f.f_impulse(-2, -3, 1), 1);
  assert.equal(f.f_impulse(0, 0, 1), 0);
  assert.equal(f.f_impulse(0, 1, 1), -1);
  unavailable(f.f_impulse(1, missing, 1));
  unavailable(f.f_impulse(missing, 1, 1));
  assert.equal(f.f_direction('unemployment_rate'), -1);
  assert.equal(f.f_direction('unemployment_claims'), -1);
  assert.equal(f.f_direction('interest_rates'), 1);
});

test('all scalar pair combinations preserve missingness, bounds and antisymmetry', () => {
  for (const a of [-1, 0, 1, missing]) {
    for (const b of [-1, 0, 1, missing]) {
      const ab = f.f_component(a, b);
      const ba = f.f_component(b, a);
      if (Number.isNaN(a) || Number.isNaN(b)) unavailable(ab);
      else {
        assert.equal(ab, a - b);
        assert.ok(ab >= -2 && ab <= 2);
        close(ab, -ba);
      }
    }
  }
  assert.equal(f.f_component(1, -1), 2);
  assert.equal(f.f_component(1, 1), 0);
  assert.equal(f.f_component(-1, -1), 0);
});

test('weighted normalization: correct pair divisor, minimum count and exact coverage boundary', () => {
  assert.equal(f.f_normalized(2, 2, 2, 2, 2, 75, 2), 50);
  assert.equal(f.f_normalized(2, 2, 2, 2, 2, 75, 1), 100);
  assert.equal(f.f_normalized(0, 3, 4, 3, 2, 75, 2), 0);
  unavailable(f.f_normalized(2, 2, 4, 2, 2, 75, 2));
  unavailable(f.f_normalized(2, 2, 2, 1, 2, 75, 2));
  unavailable(f.f_normalized(0, 0, 4, 0, 1, 1, 2));
  unavailable(f.f_normalized(0, 0, 0, 0, 1, 1, 2));
  unavailable(f.f_coverage(0, 0));
  close(f.f_coverage(1, 3), 100 / 3);
});

test('10,000 generated common-evidence portfolios are antisymmetric', () => {
  let seed = 123456789;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let sample = 0; sample < 10000; sample++) {
    let weighted = 0, available = 0, planned = 0, count = 0;
    for (let metric = 0; metric < 17; metric++) {
      const weight = Math.floor(random() * 4) / 3;
      const a = [-1, 0, 1, missing][Math.floor(random() * 4)];
      const b = [-1, 0, 1, missing][Math.floor(random() * 4)];
      planned += weight;
      const contribution = f.f_component(a, b);
      if (weight > 0 && !Number.isNaN(contribution)) {
        weighted += weight * contribution;
        available += weight;
        count++;
      }
    }
    const ab = f.f_normalized(weighted, available, planned, count, 2, 75, 2);
    const ba = f.f_normalized(-weighted, available, planned, count, 2, 75, 2);
    if (Number.isNaN(ab)) unavailable(ba);
    else { close(ab, -ba); assert.ok(Math.abs(ab) <= 100); }
  }
});

test('millionth scaling preserves tiny surprises and large allowed integers', () => {
  assert.equal(f.f_scaled_decimal(0, 1, 1, 1), 100000);
  assert.equal(f.f_scaled_decimal(0, 100000, 6, 1), 100000);
  assert.equal(f.f_scaled_decimal(3, 1, 6, -1), -3000001);
  const max = f.f_scaled_decimal(999999999, 999999, 6, 1);
  assert.equal(max, 999999999999999);
  assert.ok(Number.isSafeInteger(max));
  assert.equal(f.f_impulse(max, max - 1, 1), 1);
  assert.equal(f.f_impulse(100000, 100000, 1), 0);
});

test('freshness is inclusive, rejects future and absent timestamps', () => {
  const day = 86400000, stamp = Date.UTC(2026, 0, 1);
  assert.equal(f.f_fresh(stamp, stamp + 75 * day, 75), true);
  assert.equal(f.f_fresh(stamp, stamp + 75 * day + 1, 75), false);
  assert.equal(f.f_fresh(stamp + 1, stamp, 75), false);
  assert.equal(f.f_fresh(missing, stamp, 75), false);
  assert.equal(f.f_fresh(stamp, missing, 75), false);
});

test('COT demands matching weeks and nonnegative positions; z-score needs variance and history', () => {
  assert.equal(f.f_cot_valid(0, 0, 100, 100, 200), true);
  assert.equal(f.f_cot_valid(10, 5, 100, 99, 200), false);
  assert.equal(f.f_cot_valid(-1, 5, 100, 100, 200), false);
  assert.equal(f.f_cot_valid(10, 5, 300, 300, 200), false);
  assert.equal(f.f_cot_valid(missing, 5, 100, 100, 200), false);
  unavailable(f.f_z(10, 5, 4, 25));
  unavailable(f.f_z(10, 5, 0, 52));
  close(f.f_z(10, 5, 4, 26), 2.5);
  close(f.f_z(-10, -5, 4, 52), -2.5);
});

test('seasonality excludes current/future/out-of-window years and missing calendar months', () => {
  assert.equal(f.f_prior_year(2026, 2026, 15), false);
  assert.equal(f.f_prior_year(2027, 2026, 15), false);
  assert.equal(f.f_prior_year(2010, 2026, 15), false);
  assert.equal(f.f_prior_year(2011, 2026, 15), true);
  assert.equal(f.f_prior_year(2025, 2026, 15), true);
  for (let month = 1; month <= 12; month++) {
    assert.equal(f.f_month_valid(2025, month, 2025, month, 1), true);
    assert.equal(f.f_month_valid(2025, month, 2024, month, 1), false);
    assert.equal(f.f_month_valid(2025, month, 2025, month, missing), false);
    assert.equal(f.f_month_valid(2025, month, 2025, month, 0), false);
  }
  assert.equal(f.f_month_valid(2025, 11, 2025, 12, 1), false);
  close(f.f_return(110, 100), 10);
  close(f.f_return(90, 100), -10);
  unavailable(f.f_return(110, 0));
  unavailable(f.f_return(missing, 100));
  assert.equal(f.f_season_signal(2, 60, 5), 1);
  assert.equal(f.f_season_signal(-2, 40, 5), -1);
  assert.equal(f.f_season_signal(2, 59, 5), 0);
  assert.equal(f.f_season_signal(-2, 80, 5), 0);
  unavailable(f.f_season_signal(2, 80, 4));
});

test('all profile and module budgets use the exact script expression', () => {
  const expression = source.match(/^int budget = (.+)$/m)?.[1];
  assert.ok(expression);
  const budget = new Function('manualMode', 'currencyCount', 'extended', 'enableCot', 'enableTrend', 'enableSeason', `return ${expression};`);
  assert.equal(budget(false, 8, false, true, true, true), 39);
  assert.equal(budget(false, 9, false, true, true, true), 43);
  assert.equal(budget(false, 8, true, true, true, true), 55);
  assert.equal(budget(false, 9, true, true, true, true), 61);
  assert.equal(budget(true, 9, true, true, true, true), 7);
  for (const manual of [false, true]) for (const count of [8, 9]) for (const extended of [false, true]) {
    for (const cot of [false, true]) for (const trend of [false, true]) for (const season of [false, true]) {
      assert.ok(budget(manual, count, extended, cot, trend, season) <= 64);
      if (count === 8 && !extended) assert.ok(budget(manual, count, extended, cot, trend, season) <= 40);
    }
  }
});

test('structural guards preserve time, provenance and missing-data contracts', () => {
  assert.match(source, /request\.economic\(country, field, gaps=barmerge\.gaps_on, ignore_invalid_symbol=true\)/);
  assert.match(source, /if barstate\.isconfirmed and not na\(point\)/);
  assert.match(source, /array\.set\(priors, index, array\.get\(values, index\)\)/);
  assert.doesNotMatch(source, /ta\.change\(point\)/);
  assert.doesNotMatch(source, /\bnz\(/);
  assert.match(source, /f_component\(value, array\.get\(data, second \* numberOfKeys \+ ki\)\)/);
  assert.match(source, /currentStamp <= evaluationTime/);
  assert.match(source, /release\.stamp <= evaluationTime/);
  assert.match(source, /array\.includes\(identities, identity\)/);
  assert.match(source, /for i = length - samples - 1 to length - 2/);
  assert.match(source, /\/ \(samples - 1\)/);
  assert.match(source, /f_prior_year\(y, currentYear, maxYears\)/);
  assert.match(source, /for m = 0 to 11/);
  assert.match(source, /month\(time_close\[offset \+ m\] - 1\)/);
  assert.match(source, /f_return\(close\[at\], close\[at \+ 1\]\)/);
  assert.ok(!source.includes('request.seed('));
  assert.equal((source.match(/request\.economic\(/g) || []).length, 1);
  assert.equal((source.match(/request\.security\(/g) || []).length, 4);
});

console.log(JSON.stringify({ script: scriptPath, sha256: createHash('sha256').update(source).digest('hex'), scalarFunctions: definitions.length, note: 'Local arithmetic and structural checks; actual Pine compiler and live-feed checks are separate.' }));
