// Offline tests for recipe listing. `fetch` is stubbed, so nothing here talks
// to Plan to Eat — unlike `npm test` / `npm run verify`, which use a real
// account. Run via `npm run test:unit`.

import { afterEach, beforeEach, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { z } from 'zod';
import { PlanToEat, type RecipeListing } from '../core/client.js';
import { toolsByName } from '../core/tools.js';
import { describeFields, parseToolArgs } from '../cli/args.js';

function listing(id: number, over: Partial<RecipeListing> = {}): RecipeListing {
  return {
    id,
    user_id: 1,
    title: `Recipe ${id}`,
    course_id: null,
    cuisine_id: null,
    main_ingredient_id: null,
    active: true,
    remove: false,
    total_time: 30,
    tag_titles: '',
    stats_total_events: 0,
    photo_url: null,
    rating: null,
    owned: true,
    queued: false,
    saved: false,
    hidden: false,
    planned_only: false,
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    course_title: null,
    cuisine_title: null,
    main_ingredient_title: null,
    ...over,
  };
}

// Shaped like the live account: well past the old 500-row cap of
// /api/v1/recipes, with the interesting rows at the new end of the id range.
const BOOK: RecipeListing[] = [
  ...Array.from({ length: 1290 }, (_, i) => listing(1000 + i)),
  // As the live row is: no cuisine, rating or tags, and total_time 0.
  listing(24322288, {
    title: 'Juicy Pork & Chive Pan-Fried Dumplings', course_id: 196, course_title: 'Main Course',
    owned: true, total_time: 0, photo_url: 'https://example.test/dumplings.jpg',
  }),
  listing(24322299, {
    title: 'Mapo Tofu', course_title: 'Main Course', cuisine_title: 'Chinese', main_ingredient_title: 'Tofu',
    tag_titles: 'spicy, weeknight', total_time: 40, rating: '5', owned: false, saved: true,
  }),
  listing(24322300, { title: 'Pork Belly Bao', course_title: 'Main Course', owned: false, saved: true }),
  listing(24322301, { title: 'Chive Scrambled Eggs', course_title: 'Breakfast', owned: true }),
  listing(24322302, { title: 'Friend\'s Breakfast Burrito', course_title: 'breakfast', owned: false }),
  listing(24322303, { title: 'Main Street Pancakes', course_title: 'Breakfast Sides', owned: true }),
  listing(24322304, { title: 'Padded Course Waffles', course_title: ' Breakfast ', owned: true }),
  listing(24322305, { title: '', course_title: 'Sauces', owned: true, total_time: 0 }),
  listing(30000001, { title: 'Inactive Pork Chive Soup', active: false }),
  listing(30000002, { title: 'Removed Pork Chive Stew', remove: true }),
  listing(30000003, { title: 'Hidden Pork Chive Bun', hidden: true }),
];
const ACTIVE_COUNT = BOOK.length - 3;
const NOT_OWNED = BOOK.filter((r) => !r.owned && r.active && !r.remove && !r.hidden).length;

let requests: string[] = [];
let routes: Record<string, unknown> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  routes = { '/api/v1/recipes/lite_plus': BOOK };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    requests.push(url.pathname + url.search);
    if (!(url.pathname in routes)) return new Response('not mocked', { status: 404 });
    return new Response(JSON.stringify(routes[url.pathname]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
});

afterEach(() => { globalThis.fetch = realFetch; });

function client(): PlanToEat {
  const pte = new PlanToEat();
  pte.importSession({ cookies: { session: 'test' } });
  return pte;
}

const listRecipes = toolsByName.get('list_recipes')!;
const run = (args: Record<string, unknown>) =>
  listRecipes.run(client(), z.object(listRecipes.input).parse(args)) as Promise<RecipeListing[]>;
const ids = (rows: RecipeListing[]) => rows.map((r) => r.id).sort((a, b) => a - b);

describe('list_recipes', () => {
  it('returns every active recipe with no args, from lite_plus only', async () => {
    const rows = await run({});
    assert.equal(rows.length, ACTIVE_COUNT);
    assert.ok(rows.length > 500);
    assert.ok(rows.some((r) => r.id === 24322288));
    // One request, to lite_plus — never the capped /api/v1/recipes.
    assert.deepEqual(requests, ['/api/v1/recipes/lite_plus']);
  });

  it('leaves out inactive, removed and hidden recipes', async () => {
    const rows = await run({});
    for (const id of [30000001, 30000002, 30000003]) {
      assert.ok(!rows.some((r) => r.id === id), `id ${id} should be filtered out`);
    }
    // Even when a filter would otherwise match them.
    assert.deepEqual(ids(await run({ search: 'pork chive' })), [24322288]);
  });

  it('search: every word must appear in the title, case-insensitively, in any order', async () => {
    assert.deepEqual(ids(await run({ search: 'pork chive' })), [24322288]);
    assert.deepEqual(ids(await run({ search: '  CHIVE   pork ' })), [24322288]);
    assert.deepEqual(ids(await run({ search: 'pork' })), [24322288, 24322300]);
    assert.deepEqual(ids(await run({ search: 'tofu' })), [24322299]);
    assert.deepEqual(ids(await run({ search: 'chive' })), [24322288, 24322301]);
    assert.deepEqual(await run({ search: 'pork tofu' }), []);
  });

  it('search: an empty or blank string filters nothing', async () => {
    assert.equal((await run({ search: '' })).length, ACTIVE_COUNT);
    assert.equal((await run({ search: '   ' })).length, ACTIVE_COUNT);
  });

  it('course: case-insensitive exact match on course_title', async () => {
    assert.deepEqual(ids(await run({ course: 'Breakfast' })), [24322301, 24322302, 24322304]);
    assert.deepEqual(ids(await run({ course: 'BREAKFAST' })), [24322301, 24322302, 24322304]);
    // Whitespace on either side is ignored.
    assert.deepEqual(ids(await run({ course: '  breakfast ' })), [24322301, 24322302, 24322304]);
    // Exact, not substring: "Breakfast Sides" and "Main Course" don't count.
    assert.deepEqual(ids(await run({ course: 'Main' })), []);
    assert.deepEqual(ids(await run({ course: 'breakfast sides' })), [24322303]);
  });

  it('owned_only: drops saved/queued/friend recipes', async () => {
    const rows = await run({ owned_only: true });
    assert.ok(rows.every((r) => r.owned));
    assert.ok(!rows.some((r) => r.id === 24322300 || r.id === 24322302));
    assert.equal(rows.length, ACTIVE_COUNT - NOT_OWNED);
    assert.equal((await run({ owned_only: false })).length, ACTIVE_COUNT);
  });

  it('combines filters', async () => {
    assert.deepEqual(ids(await run({ course: 'breakfast', owned_only: true })), [24322301, 24322304]);
    assert.deepEqual(ids(await run({ search: 'pork', owned_only: true })), [24322288]);
    assert.deepEqual(ids(await run({ search: 'pork', course: 'main course' })), [24322288, 24322300]);
  });
});

describe('list_recipes row shape', () => {
  const byId = (rows: Record<string, unknown>[], id: number) => rows.find((r) => r.id === id);

  it('returns brief rows by default, with empty fields dropped', async () => {
    const rows = await run({}) as unknown as Record<string, unknown>[];
    // Sparse row: only what's actually set survives. owned is kept even when true/false.
    assert.deepEqual(byId(rows, 24322288), {
      id: 24322288, title: 'Juicy Pork & Chive Pan-Fried Dumplings', course_title: 'Main Course', owned: true,
    });
    // Fully populated row: every brief field, nothing else.
    assert.deepEqual(byId(rows, 24322299), {
      id: 24322299, title: 'Mapo Tofu', course_title: 'Main Course', cuisine_title: 'Chinese',
      main_ingredient_title: 'Tofu', tag_titles: 'spicy, weeknight', total_time: 40, rating: '5', owned: false,
    });
    // id, title and owned are always present, even when empty.
    assert.deepEqual(byId(rows, 24322305), { id: 24322305, title: '', course_title: 'Sauces', owned: true });
    for (const r of rows) {
      for (const k of ['id', 'title', 'owned']) assert.ok(k in r, `brief row ${r.id} should carry ${k}`);
      for (const k of ['photo_url', 'created_at', 'updated_at', 'user_id', 'course_id', 'saved', 'active']) {
        assert.ok(!(k in r), `brief row ${r.id} should not carry ${k}`);
      }
    }
  });

  it('full: true returns every listing field, empties included', async () => {
    const rows = await run({ full: true, search: 'pork chive' });
    assert.deepEqual(rows, [BOOK.find((r) => r.id === 24322288)]);
  });

  it('brief rows are much smaller than full ones', async () => {
    const brief = JSON.stringify(await run({}), null, 2).length;
    const full = JSON.stringify(await run({ full: true }), null, 2).length;
    assert.ok(brief * 3 < full, `brief ${brief} vs full ${full}`);
  });
});

describe('list_recipes schema and description', () => {
  it('takes only optional search / course / owned_only / full', () => {
    assert.deepEqual(Object.keys(listRecipes.input).sort(), ['course', 'full', 'owned_only', 'search']);
    const schema = z.object(listRecipes.input);
    assert.ok(schema.safeParse({}).success);
    assert.ok(schema.safeParse({ search: 'x', course: 'y', owned_only: true }).success);
    assert.ok(!schema.safeParse({ owned_only: 'yes' }).success);
    assert.ok(!schema.safeParse({ search: 3 }).success);
  });

  it('describes the full catalog and the listing shape, with no cap', () => {
    const d = listRecipes.description;
    assert.doesNotMatch(d, /500|caps? at/i);
    assert.match(d, /whole recipe book/);
    assert.match(d, /get_recipe/);
    assert.match(d, /no ingredients/);
    assert.match(d, /Narrow with a filter/);
    for (const name of ['search', 'course', 'owned_only', 'full']) {
      assert.ok((listRecipes.input[name] as z.ZodType).description, `${name} should be described`);
    }
  });

  it('parses as CLI flags', () => {
    const kinds = Object.fromEntries(describeFields(listRecipes).map((f) => [f.name, [f.kind, f.required]]));
    assert.deepEqual(kinds, {
      search: ['string', false], course: ['string', false], owned_only: ['boolean', false],
      full: ['boolean', false],
    });
    assert.deepEqual(
      parseToolArgs(listRecipes, ['--search', 'pork chive', '--course', 'Breakfast', '--owned-only']),
      { search: 'pork chive', course: 'Breakfast', owned_only: true },
    );
    assert.deepEqual(parseToolArgs(listRecipes, []), {});
  });
});

describe('get_planner_week recipe titles', () => {
  it('resolves titles past the old 500 cap, and for since-removed recipes', async () => {
    routes['/api/v1/events'] = [
      { id: 1, date: '2026-10-19', section: 'dinner', kind: 'recipe', recipe_id: 24322288, position: 0 },
      { id: 2, date: '2026-10-20', section: 'dinner', kind: 'recipe', recipe_id: 30000002, position: 0 },
      { id: 3, date: '2026-10-21', section: 'lunch', kind: 'note', recipe_id: null, description: 'x', position: 0 },
    ];
    const week = await client().getPlannerRange('2026-10-19');
    const titles = Object.fromEntries(week.events.map((e) => [e.id, e.recipe_title]));
    assert.deepEqual(titles, {
      1: 'Juicy Pork & Chive Pan-Fried Dumplings',
      2: 'Removed Pork Chive Stew',
      3: undefined,
    });
    assert.ok(!requests.includes('/api/v1/recipes'));
  });
});
