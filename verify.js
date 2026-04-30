// End-to-end smoke test for client.js
require('dotenv').config({ override: true });
const fs = require('fs');
const { PlanToEat } = require('./client');

(async () => {
  const pte = new PlanToEat();

  // Reuse session if we have one, else log in.
  if (fs.existsSync('session.json')) {
    pte.importSession(JSON.parse(fs.readFileSync('session.json', 'utf8')));
    console.log('Loaded saved session.');
  } else {
    console.log('Logging in...');
    await pte.login(process.env.USERNAME, process.env.PASSWORD);
    fs.writeFileSync('session.json', JSON.stringify(pte.exportSession(), null, 2));
    console.log('Saved session.json');
  }

  console.log('\n--- counts ---');
  console.log(await pte.getCounts());

  const recipes = await pte.listRecipes();
  console.log(`\nlistRecipes() returned ${recipes.length} entries`);
  console.log('first:', recipes[0].title, '(id', recipes[0].id + ')');

  const owned = recipes.find(r => r.owned);
  console.log('first owned:', owned?.title, '(id', owned?.id + ')');

  const detail = await pte.getRecipe(owned.id);
  console.log('detail title/description/ingredient count/has-directions:',
    detail.title,
    '|', (detail.description||'').slice(0,40),
    '|', detail.ingredients?.length,
    '|', !!detail.directions);

  console.log('\n--- taxonomies ---');
  const courses = await pte.listCourses();
  const tags = await pte.listTags();
  console.log('courses:', courses.length, 'tags:', tags.length);

  console.log('\n--- create / update / delete ---');
  const created = await pte.createRecipe({
    title: 'API smoke test - delete me',
    description: 'created by client.js verify script',
    servings: 2,
    course_id: courses[0].id,
    directions: 'Step 1. Test.\nStep 2. Delete.',
    ingredients: [
      { title: 'water', amount: '1', unit: 'cup', position: 1 },
      { title: 'salt', amount: '1', unit: 'tsp',  position: 2 },
    ],
    tag_titles: 'API,test',
  });
  console.log('created id:', created.id);

  const updated = await pte.updateRecipe(created.id, { title: 'API smoke test - updated', servings: 4 });
  console.log('updated title/servings:', updated.title, updated.servings);

  const after = await pte.getRecipe(created.id);
  console.log('after fetch ingredients:', after.ingredients?.map(i => `${i.amount} ${i.unit} ${i.title}`));
  console.log('after fetch directions:', after.directions);

  const deleted = await pte.deleteRecipe(created.id);
  console.log('deleted id:', deleted.id);
})().catch(e => {
  console.error('FAIL:', e.message, e.body || '');
  process.exit(1);
});
