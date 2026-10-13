const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const MAX_NUTRITION_FIELD = 10_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDateKey(value) {
  const date = String(value || '');
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Return Mifflin-St Jeor or Katch-McArdle TDEE and a transparent macro estimate. */
export function calculateTDEEAndDeficit(stats = {}) {
  const age = finite(stats.age); const weightKg = finite(stats.weightKg); const heightCm = finite(stats.heightCm);
  const activity = Math.min(1.9, Math.max(1.2, finite(stats.activityFactor, 1.2)));
  if (age < 13 || age > 100 || weightKg < 25 || weightKg > 350 || heightCm < 100 || heightCm > 250) return { error: 'Enter an age from 13–100, weight from 25–350 kg, and height from 100–250 cm.' };
  const sexTerm = stats.sex === 'male' ? 5 : stats.sex === 'female' ? -161 : null;
  const bodyFat = finite(stats.bodyFatPercent, NaN);
  const validBodyFat = Number.isFinite(bodyFat) && bodyFat > 0 && bodyFat < 75;
  if (stats.method === 'katch' && !validBodyFat) return { error: 'Katch–McArdle requires a body-fat percentage greater than 0% and less than 75%.' };
  const leanMassKg = validBodyFat ? weightKg * (1 - bodyFat / 100) : null;
  const method = stats.method === 'katch' ? 'katch' : 'mifflin';
  if (method === 'mifflin' && sexTerm == null) return { error: 'Choose the equation profile required by Mifflin–St Jeor, or select Katch–McArdle and enter body-fat percentage.' };
  const bmr = Math.round(method === 'katch' ? 370 + 21.6 * leanMassKg : (10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexTerm);
  const tdee = Math.round(bmr * activity);
  const requestedDeficit = Math.min(1000, Math.max(0, finite(stats.deficitKcal)));
  const deficit = Math.min(requestedDeficit, Math.max(0, tdee - 1));
  const targetCalories = tdee - deficit;
  const macros = { proteinG: Math.round(targetCalories * 0.3 / 4), carbsG: Math.round(targetCalories * 0.4 / 4), fatG: Math.round(targetCalories * 0.3 / 9) };
  const targetWeightKg = finite(stats.targetWeightKg);
  const daysToTarget = targetWeightKg > 0 && targetWeightKg < weightKg && deficit > 0 ? Math.ceil(((weightKg - targetWeightKg) * 7700) / deficit) : null;
  const targetDate = daysToTarget ? new Date(Date.now() + daysToTarget * 86400000).toISOString().slice(0, 10) : null;
  return { method, bmr, tdee, deficit, targetCalories, macros, leanMassKg, daysToTarget, targetDate, estimateNote: 'Planning estimate only. Real energy needs vary; discuss diet or weight changes with a qualified clinician.' };
}

export function normalizeNutritionEntry(input = {}) {
  const name = String(input.name || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const date = String(input.date || '');
  if (!name) throw new Error('Enter a food or meal name.');
  if (!validDateKey(date)) throw new Error('Choose a valid meal date.');
  const calories = Number(input.calories);
  if (!Number.isFinite(calories) || calories < 0 || calories > MAX_NUTRITION_FIELD) throw new Error('Calories must be between 0 and 10,000.');
  const macros = {};
  for (const key of ['proteinG', 'carbsG', 'fatG']) {
    const value = Number(input[key] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 1000) throw new Error(`${key} must be between 0 and 1,000 g.`);
    macros[key] = Math.round(value * 10) / 10;
  }
  return { name, date, calories: Math.round(calories), ...macros };
}

export function summarizeNutritionDay(entries, date) {
  if (!validDateKey(date)) throw new Error('Choose a valid day to summarize.');
  const totals = { entries: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.date !== date) continue;
    totals.entries += 1;
    for (const key of ['calories', 'proteinG', 'carbsG', 'fatG']) totals[key] += finite(entry[key]);
  }
  totals.calories = Math.round(totals.calories);
  for (const key of ['proteinG', 'carbsG', 'fatG']) totals[key] = Math.round(totals[key] * 10) / 10;
  return totals;
}

export function fastingElapsedMinutes(session, now = Date.now()) {
  const startedAt = Date.parse(session?.startedAt || '');
  const endedAt = session?.endedAt ? Date.parse(session.endedAt) : Number(now);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return null;
  return Math.floor((endedAt - startedAt) / 60_000);
}
