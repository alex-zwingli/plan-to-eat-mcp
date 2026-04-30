// Plan to Eat API client.
//
// Auth strategy:
//   1. Call login() once with email + password. We POST to https://app.plantoeat.com/login
//      and harvest the response cookies (especially the long-lived `ptermid2` /
//      `ptermxt2` "remember me" pair).
//   2. Subsequent requests just send those cookies. No token in a header.
//   3. Write requests (POST/PUT/DELETE) need an X-CSRF-Token header. We fetch
//      one from the /recipes HTML page on demand.
//
// All endpoints are JSON. Wrap recipe payloads as { recipe: {...} }.

const BASE = 'https://app.plantoeat.com';

export interface Ingredient {
  id?: number;
  title: string;
  amount?: string | null;
  unit?: string | null;
  note?: string | null;
  position?: number;
  amount_float?: number;
  metric_amount?: number;
  metric_unit?: string;
  similar_titles?: string[];
  /** Set with `id` to remove an ingredient on update. */
  _destroy?: boolean;
}

export interface RecipeSummary {
  id: number;
  user_id: number;
  title: string;
  course_id: number | null;
  cuisine_id: number | null;
  main_ingredient_id: number | null;
  active: boolean;
  remove: boolean;
  total_time: number;
  tag_titles: string;
  photo_url: string | null;
  rating: string | null;
  owned: boolean;
  queued: boolean;
  saved: boolean;
  hidden: boolean;
  planned_only: boolean;
  updated_at: string;
  created_at: string;
  user_login: string;
  description: string;
  source: string | null;
  servings: number;
  yield: string;
  scaling: number;
  course_title: string | null;
  cuisine_title: string | null;
  main_ingredient_title: string | null;
  prep_time: number;
  cook_time: number;
  ingredient_titles: string[];
  [key: string]: unknown;
}

export interface Recipe extends RecipeSummary {
  ingredients: Ingredient[];
  directions: string | null;
  prep_notes?: unknown[];
  comments?: unknown[];
  tags?: { id: number; title: string }[];
}

export interface RecipeWritable {
  title?: string;
  description?: string;
  source?: string;
  url?: string;
  servings?: number;
  yield?: string;
  scaling?: number;
  /** Minutes. */
  prep_time?: number;
  /** Minutes. */
  cook_time?: number;
  /** Minutes. */
  total_time?: number;
  course_id?: number | null;
  cuisine_id?: number | null;
  main_ingredient_id?: number | null;
  directions?: string;
  /** Comma-separated list of tag names. */
  tag_titles?: string;
  rating?: string | number | null;
  private?: boolean;
  draft?: boolean;
  calories?: string;
  sodium?: string;
  fat?: string;
  carbohydrate?: string;
  protein?: string;
  sugar?: string;
  fiber?: string;
  cholesterol?: string;
  saturated_fat?: string;
  /** Friendly alias — translates to `recipe_ingredients_attributes` on the wire. */
  ingredients?: Ingredient[];
  /** Wire name for nested ingredient writes. Pre-populated for you if you pass `ingredients`. */
  recipe_ingredients_attributes?: Ingredient[];
}

export interface Course { id: number; title: string; owned: boolean }
export interface Cuisine extends Course {}
export interface MainIngredient extends Course {}
export interface Tag extends Course {}

export interface PlannerEvent {
  id: number;
  event: string;
  date: string;
  recipe_id: number | null;
  description: string | null;
  user_id: number;
  menu_id: number | null;
  ingredient_id: number | null;
  position: number;
  sequence: number;
  title: string | null;
  kind: string;
  section: string;
  servings: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Menu {
  id: number;
  user_id: number;
  title: string;
  date_from: string | null;
  date_to: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  private: boolean | null;
  event_count: number;
  day_count: number;
  tags: unknown[];
}

export interface Friend {
  id: number;
  login: string;
  full_name: string;
  challenge: boolean;
  menus_count: number;
}

export interface ShoppingList {
  updated_items: unknown[];
  last_sync_time: string | null;
}

export interface Counts { friends: number; queued: number; frozen: number }

export type PlannerSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface PlannerWeek {
  start_date: string;
  end_date: string;
  events: PlannerEvent[];
}

export interface Session { cookies: Record<string, string> }

class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class PlanToEat {
  private cookies: Record<string, string> = {};
  private csrf: string | null = null;
  private creds: { email: string; password: string } | null = null;

  // ---- internals ----

  private cookieHeader(): string {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorbCookies(setCookieHeader: string | string[] | null | undefined): void {
    if (!setCookieHeader) return;
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const h of headers) {
      const m = h.split(';')[0].match(/^([^=]+)=(.*)$/);
      if (!m) continue;
      const [, name, value] = m;
      if (value === '' || value === 'deleted') {
        delete this.cookies[name];
      } else {
        this.cookies[name] = value;
      }
    }
  }

  private async request(
    method: string,
    path: string,
    init: { body?: string | URLSearchParams; headers?: Record<string, string>; asJson?: boolean } = {},
  ): Promise<Response> {
    const { body, headers = {}, asJson = true } = init;
    const url = path.startsWith('http') ? path : BASE + path;
    const res = await fetch(url, {
      method,
      headers: {
        'Accept': asJson ? 'application/json' : 'text/html',
        'User-Agent': 'plantoeat-api-client',
        'Cookie': this.cookieHeader(),
        ...headers,
      },
      body,
      redirect: 'manual',
    });
    const setCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? res.headers.get('set-cookie');
    this.absorbCookies(setCookie);
    return res;
  }

  private async csrfToken(): Promise<string> {
    if (this.csrf) return this.csrf;
    const res = await this.request('GET', '/recipes', { asJson: false });
    const html = await res.text();
    const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!m) throw new Error('Could not find csrf-token on /recipes');
    this.csrf = m[1];
    return this.csrf;
  }

  private async json<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = await this.csrfToken();
    const res = await this.request(method, path, {
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!res.ok) {
      // Auto re-auth on 401/302 if we have credentials and haven't retried.
      if (!retried && (res.status === 401 || res.status === 302) && this.creds) {
        this.csrf = null;
        this.cookies = {};
        await this.login(this.creds.email, this.creds.password);
        return this.json<T>(method, path, body, true);
      }
      throw new HttpError(`${method} ${path} failed: ${res.status}`, res.status, parsed);
    }
    return parsed as T;
  }

  // Form-encoded POST. The /planner/* endpoints use this style: form body in,
  // empty `text/javascript` body out (server-side state mutation only — the UI
  // re-fetches separately).
  private async form(
    method: string,
    path: string,
    body: Record<string, string | number | boolean | undefined | null>,
    retried = false,
  ): Promise<void> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      params.set(k, String(v));
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'text/javascript',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': await this.csrfToken(),
    };
    const res = await this.request(method, path, { body: params.toString(), headers, asJson: false });
    if (!res.ok) {
      if (!retried && (res.status === 401 || res.status === 302) && this.creds) {
        this.csrf = null;
        this.cookies = {};
        await this.login(this.creds.email, this.creds.password);
        return this.form(method, path, body, true);
      }
      const text = await res.text().catch(() => '');
      throw new HttpError(`${method} ${path} failed: ${res.status}`, res.status, text);
    }
    await res.text().catch(() => '');
  }

  // Translate the friendly `ingredients` field to the Rails wire name.
  private normalize(recipe: RecipeWritable): RecipeWritable {
    if (recipe.ingredients && !recipe.recipe_ingredients_attributes) {
      const { ingredients, ...rest } = recipe;
      return { ...rest, recipe_ingredients_attributes: ingredients };
    }
    return recipe;
  }

  // ---- auth ----

  /**
   * Stash credentials so the client can transparently re-login when the
   * session cookies expire. Pass `null` to clear.
   */
  setCredentials(creds: { email: string; password: string } | null): void {
    this.creds = creds;
  }

  async login(email: string, password: string): Promise<void> {
    const loginPage = await this.request('GET', '/login', { asJson: false });
    const html = await loginPage.text();
    const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
    if (!csrf) throw new Error('Could not find csrf-token on /login');
    const honeypot = html.match(/<input type="text" name="(\w{16,})" id="\1"/)?.[1] ?? '';

    const form = new URLSearchParams();
    form.set('authenticity_token', csrf);
    if (honeypot) form.set(honeypot, '');
    form.set('login[email]', email);
    form.set('login[password]', password);
    form.set('login[remember_me]', '1');

    const res = await this.request('POST', '/login', {
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      asJson: false,
    });

    if (res.status === 302) {
      this.csrf = null;
      this.creds = { email, password };
      return;
    }
    throw new Error(`Login failed: status ${res.status}`);
  }

  /** Snapshot the current cookie session. */
  exportSession(): Session {
    return { cookies: { ...this.cookies } };
  }

  /** Restore a previously exported session. */
  importSession(session: Session): void {
    this.cookies = { ...session.cookies };
    this.csrf = null;
  }

  // ---- recipes ----

  /**
   * List the user's recipe book. Returns up to ~500 entries (the cap on
   * `/api/v1/recipes` — pagination params don't seem to work). Each entry is a
   * "summary" recipe with ingredients embedded but not directions.
   */
  listRecipes(): Promise<RecipeSummary[]> {
    return this.json<RecipeSummary[]>('GET', '/api/v1/recipes');
  }

  /** Full recipe with directions, prep_notes, comments, tags, etc. */
  getRecipe(id: number): Promise<Recipe> {
    return this.json<Recipe>('GET', `/api/v1/recipes/${id}`);
  }

  /**
   * Create a recipe. Minimum: `{ title }`. Pass ingredients as an array of
   * `{title, amount, unit, note, position}`; the client translates this to
   * the `recipe_ingredients_attributes` wire field.
   */
  createRecipe(recipe: RecipeWritable): Promise<Recipe> {
    return this.json<Recipe>('POST', '/api/v1/recipes', { recipe: this.normalize(recipe) });
  }

  updateRecipe(id: number, patch: RecipeWritable): Promise<Recipe> {
    return this.json<Recipe>('PUT', `/api/v1/recipes/${id}`, { recipe: this.normalize(patch) });
  }

  deleteRecipe(id: number): Promise<Recipe> {
    return this.json<Recipe>('DELETE', `/api/v1/recipes/${id}`);
  }

  // ---- taxonomies ----
  listCourses():         Promise<Course[]>          { return this.json('GET', '/api/v1/courses'); }
  listCuisines():        Promise<Cuisine[]>         { return this.json('GET', '/api/v1/cuisines'); }
  listMainIngredients(): Promise<MainIngredient[]>  { return this.json('GET', '/api/v1/main_ingredients'); }
  listTags():            Promise<Tag[]>             { return this.json('GET', '/api/v1/tags'); }

  // ---- planner / shopping list ----
  listEvents():     Promise<PlannerEvent[]> { return this.json('GET', '/api/v1/events'); }
  getShoppingList(): Promise<ShoppingList>  { return this.json('GET', '/api/v1/shopping_list'); }
  listMenus():      Promise<Menu[]>         { return this.json('GET', '/api/v1/menus'); }
  listFriends():    Promise<Friend[]>       { return this.json('GET', '/api/v1/friends'); }

  /** `{ friends, queued, frozen }` */
  getCounts(): Promise<Counts> { return this.json('GET', '/recipes/counts/'); }

  // ---- planner writes ----
  //
  // The /planner/* endpoints are Rails web controllers, not /api/v1/. They
  // accept form-encoded bodies and return empty `text/javascript`. The UI
  // re-fetches state separately, so we do the same: after a write that
  // produces a new id (create, duplicate), diff against listEvents() to
  // recover it.

  /** Diff helper: returns events whose id is in `after` but not `before`. */
  private newEventsSince(before: PlannerEvent[], after: PlannerEvent[]): PlannerEvent[] {
    const beforeIds = new Set(before.map((e) => e.id));
    return after.filter((e) => !beforeIds.has(e.id));
  }

  /**
   * Add a recipe to a meal slot. Returns the newly created event (recovered
   * by diffing against listEvents()).
   */
  async createPlannerRecipe(args: {
    recipe_id: number;
    date: string;
    section: PlannerSection;
    frozen_id?: number | null;
  }): Promise<PlannerEvent | null> {
    const before = await this.listEvents();
    // The HAR shows two variants: `/planner/create` for a normal recipe and
    // `/planner/create/` (trailing slash) when a frozen_id is being passed.
    const path = args.frozen_id !== undefined ? '/planner/create/' : '/planner/create';
    await this.form('POST', path, {
      rid: args.recipe_id,
      date: args.date,
      section: args.section,
      ...(args.frozen_id !== undefined ? { frozen_id: args.frozen_id ?? '' } : {}),
    });
    const after = await this.listEvents();
    const created = this.newEventsSince(before, after);
    return created.find((e) => e.recipe_id === args.recipe_id && e.date === args.date && e.section === args.section)
      ?? created[0]
      ?? null;
  }

  /** Add a freeform "ingredient" entry to a meal slot. */
  async createPlannerIngredient(args: {
    title: string;
    date: string;
    section: PlannerSection;
  }): Promise<PlannerEvent | null> {
    const before = await this.listEvents();
    await this.form('POST', '/planner/create', {
      date: args.date,
      section: args.section,
      eventType: 'ingredient',
      title: args.title,
    });
    const after = await this.listEvents();
    const created = this.newEventsSince(before, after);
    return created.find((e) => e.date === args.date && e.section === args.section)
      ?? created[0]
      ?? null;
  }

  /** Add a freeform "note" entry to a meal slot. */
  async createPlannerNote(args: {
    title: string;
    date: string;
    section: PlannerSection;
  }): Promise<PlannerEvent | null> {
    const before = await this.listEvents();
    await this.form('POST', '/planner/create', {
      date: args.date,
      section: args.section,
      eventType: 'note',
      title: args.title,
    });
    const after = await this.listEvents();
    const created = this.newEventsSince(before, after);
    return created.find((e) => e.date === args.date && e.section === args.section)
      ?? created[0]
      ?? null;
  }

  /** Move (or reschedule) an existing event to a new date/section. */
  async movePlannerEvent(args: {
    event_id: number;
    date: string;
    section: PlannerSection;
  }): Promise<void> {
    await this.form('POST', '/planner/update', {
      eventid: args.event_id,
      date: args.date,
      section: args.section,
      readonly: false,
    });
  }

  /** Update the text of a note or ingredient entry. */
  async updatePlannerEntryText(args: { id: number; description: string }): Promise<void> {
    await this.form('POST', `/planner/update/${args.id}`, { description: args.description });
  }

  /** Set servings on a recipe event. */
  async setPlannerServings(args: { event_id: number; servings: number }): Promise<void> {
    await this.form('POST', '/planner/update_serving', {
      event: args.event_id,
      serving: args.servings,
    });
  }

  /** Duplicate an event. `plan_leftover=true` marks the copy as a leftover. */
  async duplicatePlannerEvent(args: {
    id: number;
    plan_leftover?: boolean;
  }): Promise<PlannerEvent | null> {
    const before = await this.listEvents();
    await this.form('POST', '/planner/duplicate', {
      id: args.id,
      plan_leftover: args.plan_leftover ?? false,
      readonly: false,
    });
    const after = await this.listEvents();
    return this.newEventsSince(before, after)[0] ?? null;
  }

  /** Delete a planner event. */
  async deletePlannerEvent(id: number): Promise<void> {
    await this.form('POST', '/planner/destroy', { id, readonly: false });
  }

  /**
   * Find planner events for a given recipe, optionally constrained to a date
   * range. Useful for "is this already planned this week?" checks.
   *
   * Note: the planner UI calls `/planner/search_dates` for this, but that
   * endpoint returns rendered HTML (a UI snippet). We get the same info — and
   * structured — by filtering listEvents().
   */
  async findPlannedDates(args: {
    recipe_id: number;
    start_date?: string;
    end_date?: string;
  }): Promise<PlannerEvent[]> {
    const events = await this.listEvents();
    return events.filter((e) => {
      if (e.recipe_id !== args.recipe_id) return false;
      if (args.start_date && e.date < args.start_date) return false;
      if (args.end_date && e.date > args.end_date) return false;
      return true;
    });
  }

  // ---- planner reads (convenience) ----

  /**
   * Fetch all planner events in a date range and enrich recipe events with
   * their titles. `start_date` and `end_date` are inclusive YYYY-MM-DD strings.
   * If `end_date` is omitted, defaults to start_date + 6 days (one week).
   */
  async getPlannerRange(start_date: string, end_date?: string): Promise<PlannerWeek> {
    const end = end_date ?? addDays(start_date, 6);
    const all = await this.listEvents();
    const filtered = all.filter((e) => e.date >= start_date && e.date <= end);
    const recipeIds = new Set(
      filtered.map((e) => e.recipe_id).filter((x): x is number => x !== null && x !== undefined),
    );
    if (recipeIds.size > 0) {
      const recipes = await this.listRecipes();
      const titleById = new Map(recipes.map((r) => [r.id, r.title]));
      for (const e of filtered) {
        if (e.recipe_id !== null && titleById.has(e.recipe_id)) {
          e.recipe_title = titleById.get(e.recipe_id);
        }
      }
    }
    filtered.sort((a, b) => (a.date === b.date ? a.position - b.position : a.date.localeCompare(b.date)));
    return { start_date, end_date: end, events: filtered };
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
