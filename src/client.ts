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
}
