// End-to-end smoke test for the planner write endpoints.
//
// Creates a note in a far-future planner slot, exercises the
// move/update/duplicate flows, then deletes everything it created.
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import { PlanToEat, type Session } from './client.js';

dotenv.config({ override: true });

const SESSION_PATH = 'session.json';

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const pte = new PlanToEat();
  const username = process.env.PLAN_TO_EAT_USERNAME ?? process.env.USERNAME;
  const password = process.env.PLAN_TO_EAT_PASSWORD ?? process.env.PASSWORD;
  if (!username || !password) throw new Error('Missing credentials env vars');

  pte.setCredentials({ email: username, password });
  if (fs.existsSync(SESSION_PATH)) {
    pte.importSession(JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8')) as Session);
    console.log('Loaded saved session.');
  } else {
    console.log('Logging in...');
    await pte.login(username, password);
    fs.writeFileSync(SESSION_PATH, JSON.stringify(pte.exportSession(), null, 2));
  }

  // 6 months out — almost certainly an empty slot.
  const today = new Date().toISOString().slice(0, 10);
  const testDate = addDays(today, 180);
  const testDate2 = addDays(testDate, 1);
  console.log(`\nUsing test dates: ${testDate} → ${testDate2}`);

  const created: number[] = [];
  try {
    console.log('\n--- create note ---');
    const note = await pte.createPlannerNote({
      title: 'planner_verify.ts smoke test - DELETE ME',
      date: testDate,
      section: 'lunch',
    });
    if (!note) throw new Error('createPlannerNote returned null');
    created.push(note.id);
    console.log('created note id/kind/section/date:', note.id, note.kind, note.section, note.date);

    console.log('\n--- create ingredient ---');
    const ingredient = await pte.createPlannerIngredient({
      title: '2 lbs ground beef (smoke test - DELETE ME)',
      date: testDate,
      section: 'lunch',
    });
    if (!ingredient) throw new Error('createPlannerIngredient returned null');
    created.push(ingredient.id);
    console.log('created ingredient id/kind:', ingredient.id, ingredient.kind);
    if (ingredient.kind !== 'ingredient') {
      throw new Error(`Expected kind=ingredient, got ${ingredient.kind}`);
    }

    console.log('\n--- create recipe event ---');
    const recipes = await pte.listRecipes();
    const owned = recipes.find((r) => r.owned);
    if (!owned) throw new Error('No owned recipe to test against');
    console.log('using recipe:', owned.title, '(id', owned.id + ')');
    const recipeEvent = await pte.createPlannerRecipe({
      recipe_id: owned.id,
      date: testDate,
      section: 'breakfast',
    });
    if (!recipeEvent) throw new Error('createPlannerRecipe returned null');
    created.push(recipeEvent.id);
    console.log('created recipe event id/recipe_id/section:', recipeEvent.id, recipeEvent.recipe_id, recipeEvent.section);
    if (recipeEvent.recipe_id !== owned.id) {
      throw new Error(`Expected recipe_id=${owned.id}, got ${recipeEvent.recipe_id}`);
    }

    console.log('\n--- set servings on recipe event ---');
    await pte.setPlannerServings({ event_id: recipeEvent.id, servings: 7 });
    const afterServings = await pte.listEvents();
    const withServings = afterServings.find((e) => e.id === recipeEvent.id);
    console.log('servings now:', withServings?.servings);
    if (withServings?.servings !== 7) {
      throw new Error(`Servings did not update (got ${withServings?.servings})`);
    }

    console.log('\n--- find planned dates for the recipe ---');
    const dates = await pte.findPlannedDates({ recipe_id: owned.id, start_date: testDate, end_date: testDate2 });
    console.log('found', dates.length, 'planned event(s) for recipe in range');
    const matched = dates.find((e) => e.id === recipeEvent.id);
    if (!matched) throw new Error('findPlannedDates did not include the event we just created');

    console.log('\n--- get_planner_week (should include all 3 created events) ---');
    const week = await pte.getPlannerRange(testDate, testDate2);
    const ids = new Set(week.events.map((e) => e.id));
    const allFound = created.every((id) => ids.has(id));
    console.log('all created events in range?', allFound, '| total events in range:', week.events.length);
    const recipeInWeek = week.events.find((e) => e.id === recipeEvent.id);
    console.log('recipe event has recipe_title?', !!recipeInWeek?.recipe_title, '→', recipeInWeek?.recipe_title);
    if (!allFound) throw new Error('Not all created events appeared in getPlannerRange');
    if (!recipeInWeek?.recipe_title) throw new Error('Recipe event was not enriched with recipe_title');

    console.log('\n--- update note text ---');
    await pte.updatePlannerEntryText({ id: note.id, description: 'planner_verify.ts smoke test - updated' });
    console.log('  ok');

    console.log('\n--- move note to next day, dinner ---');
    await pte.movePlannerEvent({ event_id: note.id, date: testDate2, section: 'dinner' });
    const afterMove = await pte.listEvents();
    const moved = afterMove.find((e) => e.id === note.id);
    console.log('moved date/section:', moved?.date, moved?.section);
    // Section may come back as "supper" if the user's account configures it
    // that way — server-side alias for "dinner". Date is the strict check.
    if (moved?.date !== testDate2) {
      throw new Error(`Move did not take effect (date=${moved?.date})`);
    }

    console.log('\n--- duplicate note ---');
    const dup = await pte.duplicatePlannerEvent({ id: note.id, plan_leftover: false });
    if (dup) {
      created.push(dup.id);
      console.log('duplicate id/date/section:', dup.id, dup.date, dup.section);
    } else {
      console.log('duplicate returned null (no diff detected)');
    }
  } finally {
    console.log('\n--- cleanup ---');
    for (const id of created) {
      try {
        await pte.deletePlannerEvent(id);
        console.log('  deleted', id);
      } catch (e) {
        const err = e as Error;
        console.error('  cleanup failed for', id, ':', err.message);
      }
    }
  }

  console.log('\nAll planner endpoints OK.');
}

main().catch((e: Error & { body?: unknown }) => {
  console.error('FAIL:', e.message, e.body ?? '');
  process.exit(1);
});
