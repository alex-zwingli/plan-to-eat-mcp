// End-to-end smoke test for the client.
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import { PlanToEat, type Session } from '../core/client.js';

dotenv.config({ override: true });

const SESSION_PATH = 'session.json';

async function main(): Promise<void> {
  const pte = new PlanToEat();
  const username = process.env.PLAN_TO_EAT_USERNAME ?? process.env.USERNAME;
  const password = process.env.PLAN_TO_EAT_PASSWORD ?? process.env.PASSWORD;
  if (!username || !password) throw new Error('Missing credentials env vars');

  if (fs.existsSync(SESSION_PATH)) {
    pte.importSession(JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8')) as Session);
    pte.setCredentials({ email: username, password });
    console.log('Loaded saved session.');
  } else {
    console.log('Logging in...');
    await pte.login(username, password);
    fs.writeFileSync(SESSION_PATH, JSON.stringify(pte.exportSession(), null, 2));
    console.log('Saved session.json');
  }

  console.log('\n--- counts ---');
  console.log(await pte.getCounts());

  const recipes = await pte.listRecipes();
  console.log(`\nlistRecipes() returned ${recipes.length} entries`);
  console.log('first:', recipes[0].title, '(id', recipes[0].id + ')');

  const owned = recipes.find((r) => r.owned);
  if (!owned) throw new Error('No owned recipe to test against');
  console.log('first owned:', owned.title, '(id', owned.id + ')');

  const detail = await pte.getRecipe(owned.id);
  console.log(
    'detail title/desc/ingr-count/has-directions:',
    detail.title,
    '|', (detail.description ?? '').slice(0, 40),
    '|', detail.ingredients?.length,
    '|', !!detail.directions,
  );

  console.log('\n--- taxonomies ---');
  const courses = await pte.listCourses();
  const tags = await pte.listTags();
  console.log('courses:', courses.length, 'tags:', tags.length);

  console.log('\n--- create / update / delete ---');
  const created = await pte.createRecipe({
    title: 'API smoke test - delete me',
    description: 'created by verify.ts',
    servings: 2,
    course_id: courses[0].id,
    directions: 'Step 1. Test.\nStep 2. Delete.',
    ingredients: [
      { title: 'water', amount: '1', unit: 'cup', position: 1 },
      { title: 'salt',  amount: '1', unit: 'tsp', position: 2 },
    ],
    tag_titles: 'API,test',
  });
  console.log('created id:', created.id);

  const updated = await pte.updateRecipe(created.id, { title: 'API smoke test - updated', servings: 4 });
  console.log('updated title/servings:', updated.title, updated.servings);

  const after = await pte.getRecipe(created.id);
  console.log('after fetch ingredients:', after.ingredients?.map((i) => `${i.amount} ${i.unit} ${i.title}`));
  console.log('after fetch directions:', after.directions);

  const deleted = await pte.deleteRecipe(created.id);
  console.log('deleted id:', deleted.id);
}

main().catch((e: Error & { body?: unknown }) => {
  console.error('FAIL:', e.message, e.body ?? '');
  process.exit(1);
});
