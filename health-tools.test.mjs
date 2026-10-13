import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTDEEAndDeficit, fastingElapsedMinutes, normalizeNutritionEntry, summarizeNutritionDay } from './health-tools.mjs';

test('TDEE estimate uses the selected Mifflin equation and clamps deficit below zero intake', () => {
  const estimate = calculateTDEEAndDeficit({
    method: 'mifflin', sex: 'male', age: 30, weightKg: 80, heightCm: 180,
    activityFactor: 1.55, deficitKcal: 5000,
  });
  assert.equal(estimate.error, undefined);
  assert.equal(estimate.bmr, 1780);
  assert.equal(estimate.tdee, 2759);
  assert.equal(estimate.deficit, 1000);
  assert.equal(estimate.targetCalories, 1759);
  assert.equal(estimate.method, 'mifflin');
});

test('Katch-McArdle requires a valid body-fat value instead of silently changing formulas', () => {
  assert.match(calculateTDEEAndDeficit({
    method: 'katch', sex: 'female', age: 30, weightKg: 80, heightCm: 180,
  }).error, /requires a body-fat percentage/);
  const estimate = calculateTDEEAndDeficit({
    method: 'katch', age: 30, weightKg: 80, heightCm: 180,
    bodyFatPercent: 20, activityFactor: 1.2,
  });
  assert.equal(estimate.method, 'katch');
  assert.equal(estimate.leanMassKg, 64);
  assert.equal(estimate.bmr, 1752);
});

test('manual nutrition entries reject invalid dates and values, then summarize only the selected day', () => {
  const breakfast = normalizeNutritionEntry({
    name: ' Oatmeal ', date: '2026-10-13', calories: '350',
    proteinG: '12.5', carbsG: '58', fatG: '7',
  });
  assert.deepEqual(breakfast, {
    name: 'Oatmeal', date: '2026-10-13', calories: 350,
    proteinG: 12.5, carbsG: 58, fatG: 7,
  });
  assert.throws(() => normalizeNutritionEntry({ name: 'Snack', date: '2026-02-30', calories: 50 }), /valid meal date/);
  assert.throws(() => normalizeNutritionEntry({ name: 'Snack', date: '2026-10-13', calories: -1 }), /Calories must/);
  assert.throws(() => normalizeNutritionEntry({ name: '<>', date: '2026-10-13', calories: 10 }), /food or meal name/);
  const totals = summarizeNutritionDay([
    { ...breakfast, id: 'a' },
    { date: '2026-10-13', calories: 140, proteinG: 6, carbsG: 20, fatG: 3 },
    { date: '2026-10-12', calories: 900, proteinG: 30, carbsG: 100, fatG: 20 },
  ], '2026-10-13');
  assert.deepEqual(totals, { entries: 2, calories: 490, proteinG: 18.5, carbsG: 78, fatG: 10 });
});

test('fasting timer reports elapsed whole minutes and rejects malformed intervals', () => {
  const start = Date.parse('2026-10-13T00:00:00.000Z');
  assert.equal(fastingElapsedMinutes({ startedAt: new Date(start).toISOString() }, start + 90 * 60_000), 90);
  assert.equal(fastingElapsedMinutes({ startedAt: 'invalid' }, start), null);
  assert.equal(fastingElapsedMinutes({ startedAt: new Date(start).toISOString(), endedAt: new Date(start - 1).toISOString() }), null);
});
