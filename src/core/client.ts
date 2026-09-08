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

/**
 * One line on the shopping list. Plan to Eat merges duplicates (the same
 * ingredient pulled in by three recipes) into a single line, so `item_ids`
 * holds every underlying row id — that array is the handle for updates and
 * deletes, not a scalar `id`.
 */
export interface ShoppingListItem {
  title: string;
  amount: string;
  amount_float: number;
  unit: string;
  quantity: string;
  /** Per-ingredient note carried over from a recipe (e.g. "finely chopped"). */
  note: string | null;
  /** Free-text note you attach to the shopping list line itself. */
  extra_notes: string;
  /** Null when Plan to Eat couldn't guess an aisle for the item. */
  grocery_category_id: number | null;
  /** Filled in by `getShoppingListItems()` from `/api/v1/grocery_categories`. */
  grocery_category_title?: string | null;
  /** `null` means the account's default store — `store_title` still names it. */
  store_id: number | null;
  store_title: string;
  item_ids: number[];
  event_ids: number[];
  recipe_ids: number[];
  orphaned_recipe_ids: number[];
  titles: string[];
  purchased: string | null;
  /** Always false in practice — the API drops removed lines rather than flagging them. */
  removed: boolean;
  [key: string]: unknown;
}

export interface Store { id: number; title: string }
export interface GroceryCategory { id: number; title: string; position: number | null }

/** A new shopping list line. Only `title` is required. */
export interface ShoppingListItemInput {
  title: string;
  amount?: string;
  unit?: string;
  note?: string;
  /** From `listGroceryCategories()`. Omit to let Plan to Eat guess the aisle. */
  category_id?: number;
  /** From `listStores()`. Omit to reuse the store last chosen for this item. */
  store_id?: number;
}

export interface Counts { friends: number; queued: number; frozen: number }

export type PlannerSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface PlannerWeek {
  start_date: string;
  end_date: string;
  events: PlannerEvent[];
}

export interface FrozenRecipe {
  id: number;
  recipe_id: number;
  count: number;
  /** Server returns servings as a string (e.g. "6.0"). */
  servings: string;
  frozen_on: string;
}

export interface Session { cookies: Record<string, string> }

type FormValue = string | number | boolean | undefined | null;
/** Object form for ordinary bodies; pair array when a key must repeat. */
type FormBody = Record<string, FormValue> | [string, FormValue][];

export class HttpError extends Error {
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
  private shoppingListId: number | null = null;

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

  // Form-encoded POST. The /planner/* and /shopping_lists/* endpoints use this
  // style: form body in, and a body we don't need out — either empty
  // `text/javascript` (planner) or a re-render of the page (shopping list).
  // Either way the UI re-fetches state separately, so we do the same.
  //
  // Pass an array of pairs rather than an object when a key has to repeat:
  // Rails reads `ingredients[][title]` as an array of hashes, starting a new
  // hash each time a key it has already seen comes round again.
  private async form(
    method: string,
    path: string,
    body: FormBody,
    retried = false,
  ): Promise<string> {
    const params = new URLSearchParams();
    for (const [k, v] of (Array.isArray(body) ? body : Object.entries(body))) {
      if (v === undefined || v === null) continue;
      params.append(k, String(v));
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
    return res.text().catch(() => '');
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
      this.shoppingListId = null;
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
    this.shoppingListId = null;
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

  // ---- planner / misc reads ----
  listEvents():     Promise<PlannerEvent[]> { return this.json('GET', '/api/v1/events'); }
  listMenus():      Promise<Menu[]>         { return this.json('GET', '/api/v1/menus'); }
  listFriends():    Promise<Friend[]>       { return this.json('GET', '/api/v1/friends'); }

  /** `{ friends, queued, frozen }` */
  getCounts(): Promise<Counts> { return this.json('GET', '/recipes/counts/'); }

  // ---- shopping list ----
  //
  // Reads come from /api/v1; the writes have no /api/v1 equivalent, so they go
  // through the same form-encoded `/shopping_lists/update` controller the web
  // UI posts to. That one endpoint does four different jobs depending on which
  // keys you send:
  //
  //   ingredients[][...]                      add new lines
  //   update_items= + category_id/store_id    re-file existing lines
  //   update_items= + <field>_start/<field>   edit one line's text
  //   items=        + delete_items/undelete_items   remove / restore lines
  //
  // All four want `shopping_list_id`, which isn't exposed as JSON anywhere —
  // the UI reads it off a data attribute on the page, so we scrape it once.

  /** Sync metadata only (`{ updated_items, last_sync_time }`), not the list itself. */
  getShoppingList(): Promise<ShoppingList> { return this.json('GET', '/api/v1/shopping_list'); }

  /** The user's grocery stores, for `store_id` on shopping list items. */
  listStores(): Promise<Store[]> { return this.json('GET', '/api/v1/stores'); }

  /** The user's grocery aisles, for `category_id` on shopping list items. */
  listGroceryCategories(): Promise<GroceryCategory[]> {
    return this.json('GET', '/api/v1/grocery_categories');
  }

  /** Scraped once per session off the shopping list page, then cached. */
  private async getShoppingListId(): Promise<number> {
    if (this.shoppingListId !== null) return this.shoppingListId;
    const res = await this.request('GET', '/shopping_lists', { asJson: false });
    const html = await res.text();
    const m = html.match(/data-shopping-list-id="(\d+)"/);
    if (!m) throw new Error('Could not find data-shopping-list-id on /shopping_lists');
    this.shoppingListId = Number(m[1]);
    return this.shoppingListId;
  }

  private rawShoppingListItems(): Promise<ShoppingListItem[]> {
    return this.json<ShoppingListItem[]>('GET', '/api/v1/shopping_list/items');
  }

  /**
   * The shopping list itself. Each line carries the store it's assigned to
   * (`store_id` / `store_title`) and the aisle it's filed under
   * (`grocery_category_id`, plus the `grocery_category_title` we resolve
   * here).
   *
   * Removed lines never come back from this endpoint — not even with the
   * app's "Hide Removed" toggle off — so there's no way to browse them.
   */
  async getShoppingListItems(): Promise<ShoppingListItem[]> {
    const [items, categories] = await Promise.all([
      this.rawShoppingListItems(),
      this.listGroceryCategories(),
    ]);
    const categoryTitle = new Map(categories.map((c) => [c.id, c.title]));
    for (const item of items) {
      item.grocery_category_title = item.grocery_category_id === null
        ? null
        : categoryTitle.get(item.grocery_category_id) ?? null;
    }
    return items;
  }

  /**
   * Plan to Eat's guess at which aisle an item belongs in — "Flour" gives back
   * `{ category_title: 'Dry Goods', category_id: 349 }`. The add-items dialog
   * calls this per row as you type; we call it for you when you add an item
   * without naming a category.
   */
  async recommendCategory(
    title: string,
  ): Promise<{ title: string; category_title: string; category_id: number } | null> {
    const body = await this.form('POST', '/recommend_category', { title });
    try {
      const [t, categoryTitle, id] = JSON.parse(body) as [string, string, number];
      return typeof id === 'number' ? { title: t, category_title: categoryTitle, category_id: id } : null;
    } catch {
      return null;
    }
  }

  /**
   * The store this item was last assigned to, or null if it's new to the
   * account (or was only ever left at the default store). This is the lookup
   * behind the add dialog's "Auto-select" checkbox — the checkbox itself only
   * tells the *browser* whether to run it, so anything driving the endpoint
   * directly has to do the lookup itself.
   */
  async lastStoreDesignated(title: string, category_id?: number | null): Promise<number | null> {
    const body = await this.form('POST', '/shopping_lists/last_store_designated', {
      shopping_list_id: await this.getShoppingListId(),
      title,
      category_id: category_id ?? '',
    });
    try {
      const id = JSON.parse(body) as number | null;
      return typeof id === 'number' ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Add lines to the shopping list. Only `title` is required per item; omit
   * `category_id` and we ask `/recommend_category` for the aisle, omit
   * `store_id` and we ask `/shopping_lists/last_store_designated` for the
   * store you last bought that item at. Returns the lines that appeared,
   * recovered by diffing item ids.
   */
  async addShoppingListItems(items: ShoppingListItemInput[]): Promise<ShoppingListItem[]> {
    if (items.length === 0) return [];
    const shopping_list_id = await this.getShoppingListId();
    const before = new Set((await this.rawShoppingListItems()).flatMap((i) => i.item_ids));

    const pairs: [string, FormValue][] = [['shopping_list_id', shopping_list_id]];
    // The dialog's "Auto-select" checkbox. The server does nothing with it —
    // it only tells the browser to run the lookups below — but the UI sends
    // it, so we do too.
    if (items.some((i) => i.store_id === undefined)) pairs.push(['autoStore', 1]);
    for (const item of items) {
      // Same two lookups the dialog fires as you type a row, in the same
      // order: the aisle first, then the store, which takes the aisle.
      const category = item.category_id ?? (await this.recommendCategory(item.title))?.category_id ?? '';
      const store = item.store_id
        ?? (await this.lastStoreDesignated(item.title, category === '' ? null : category))
        ?? 0; // 0 = the account's default store, for an item with no history.
      // Key order matters here — see the note on form().
      pairs.push(['ingredients[][amount]', item.amount ?? '']);
      pairs.push(['ingredients[][unit]', item.unit ?? '']);
      pairs.push(['ingredients[][title]', item.title]);
      pairs.push(['ingredients[][note]', item.note ?? '']);
      pairs.push(['ingredients[][category]', category]);
      pairs.push(['ingredients[][store]', store]);
    }
    await this.form('POST', '/shopping_lists/update', pairs);

    const after = await this.getShoppingListItems();
    return after.filter((i) => i.item_ids.some((id) => !before.has(id)));
  }

  /**
   * Edit shopping list lines. Pass any of the `item_ids` from
   * `getShoppingListItems()`.
   *
   * Re-filing (`category_id` / `store_id` alone) applies to as many lines as
   * you name. Changing text (`title`, `amount`, `unit`, `note`) edits one
   * line: the endpoint diffs the new values against the current ones, so we
   * read the line back first and send both halves.
   *
   * Ids are always widened to the whole line before the write — naming one id
   * of a merged line edits the line, matching the app, where the edit dialog
   * posts the group's full id list and never a subset. Editing the text of a
   * merged line makes the server consolidate it into a single row (keeping the
   * combined quantity), so the ids you passed in may not all survive; the
   * returned lines carry the ids that did.
   */
  async updateShoppingListItems(args: {
    item_ids: number[];
    title?: string;
    amount?: string;
    unit?: string;
    note?: string;
    category_id?: number;
    store_id?: number;
  }): Promise<ShoppingListItem[]> {
    if (args.item_ids.length === 0) return [];
    const editsText = args.title !== undefined || args.amount !== undefined
      || args.unit !== undefined || args.note !== undefined;
    if (!editsText && args.category_id === undefined && args.store_id === undefined) {
      throw new Error('updateShoppingListItems: nothing to change');
    }

    const named = new Set(args.item_ids);
    const lines = (await this.rawShoppingListItems())
      .filter((i) => i.item_ids.some((id) => named.has(id)));
    if (lines.length === 0) {
      throw new Error(`No shopping list item found for item_ids ${args.item_ids.join(',')}`);
    }
    const shopping_list_id = await this.getShoppingListId();
    const update_items = lines.flatMap((i) => i.item_ids).join(',');

    if (!editsText) {
      await this.form('POST', '/shopping_lists/update', {
        update_items,
        shopping_list_id,
        category_id: args.category_id,
        store_id: args.store_id,
      });
    } else {
      if (lines.length > 1) {
        throw new Error(
          `updateShoppingListItems: ${args.title !== undefined ? 'title' : 'text'} edits apply to one `
          + `line, but item_ids spans ${lines.length}. Edit them one at a time.`,
        );
      }
      const [current] = lines;
      // A line with `store_id: null` sits at the default store, which the form
      // spells 0.
      const storeStart = current.store_id ?? 0;
      await this.form('POST', '/shopping_lists/update', [
        ['update_items', update_items],
        ['active', 1],
        ['orphaned_recipe_ids', ''],
        ['amount_start', current.amount],
        ['amount', args.amount ?? current.amount],
        ['unit_start', current.unit],
        ['unit', args.unit ?? current.unit],
        ['title_start', current.title],
        ['title', args.title ?? current.title],
        // An uncategorized line has no aisle; the form spells that as empty,
        // and form() would drop a null outright.
        ['category_id_start', current.grocery_category_id ?? ''],
        ['category_id', args.category_id ?? current.grocery_category_id ?? ''],
        ['store_id_start', storeStart],
        ['store_id', args.store_id ?? storeStart],
        ['extra_notes_start', current.extra_notes],
        ['extra_notes', args.note ?? current.extra_notes],
        ['shopping_list_id', shopping_list_id],
      ]);
    }

    // Match on the widened id set: a consolidated line keeps only one of them.
    const touched = new Set(update_items.split(',').map(Number));
    const after = await this.getShoppingListItems();
    return after.filter((i) => i.item_ids.some((id) => touched.has(id)));
  }

  /**
   * Remove lines from the shopping list. This is the soft delete the UI does —
   * `restoreShoppingListItems()` puts them back — but nothing lists removed
   * lines, so hang on to the ids if you might want to undo.
   */
  async deleteShoppingListItems(item_ids: number[]): Promise<void> {
    if (item_ids.length === 0) return;
    await this.form('POST', '/shopping_lists/update', {
      items: item_ids.join(','),
      shopping_list_id: await this.getShoppingListId(),
      delete_items: 1,
    });
  }

  /** Undo `deleteShoppingListItems()`. */
  async restoreShoppingListItems(item_ids: number[]): Promise<void> {
    if (item_ids.length === 0) return;
    await this.form('POST', '/shopping_lists/update', {
      items: item_ids.join(','),
      shopping_list_id: await this.getShoppingListId(),
      undelete_items: 1,
    });
  }

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

  /** Reorder events within a section. Pass the event ids in the desired order. */
  async reorderPlannerEvents(event_ids: number[]): Promise<void> {
    const ids = event_ids.map((id) => `e${id}`).join(',');
    await this.form('POST', '/planner/update_order', { ids });
  }

  /**
   * Convenience: schedule a leftover meal derived from a previously planned
   * recipe event. Internally duplicates the source event with
   * `plan_leftover=true` and (optionally) moves the duplicate to a new date /
   * section. Returns the new event.
   */
  async addLeftoverMeal(args: {
    source_event_id: number;
    date?: string;
    section?: PlannerSection;
  }): Promise<PlannerEvent | null> {
    const dup = await this.duplicatePlannerEvent({ id: args.source_event_id, plan_leftover: true });
    if (!dup) return null;
    const needsMove = (args.date && args.date !== dup.date) || (args.section && args.section !== dup.section);
    if (needsMove) {
      await this.movePlannerEvent({
        event_id: dup.id,
        date: args.date ?? dup.date,
        section: (args.section ?? dup.section) as PlannerSection,
      });
      const after = await this.listEvents();
      return after.find((e) => e.id === dup.id) ?? dup;
    }
    return dup;
  }

  /**
   * Update planner display / behaviour options. Pass arbitrary form keys —
   * the server expects nested Rails-style keys like `user[time_zone]` or
   * `calendar_settings[show_calories]`. The HAR shows the full UI panel
   * sending all settings on every save.
   */
  async updatePlannerOptions(options: Record<string, string | number | boolean>): Promise<void> {
    await this.form('POST', '/planner/update_planner_options', options);
  }

  // ---- frozen recipes ("freezer") ----

  /**
   * List the user's freezer. By default returns only entries with `count > 0`
   * (i.e. what's actually in the freezer right now). Pass `include_consumed:
   * true` to also see history — the API soft-deletes entries by setting
   * `count` to 0 rather than removing them.
   */
  async listFrozenRecipes(opts: { include_consumed?: boolean } = {}): Promise<FrozenRecipe[]> {
    const all = await this.json<FrozenRecipe[]>('GET', '/api/v1/frozen_recipes');
    return opts.include_consumed ? all : all.filter((f) => f.count > 0);
  }

  /**
   * Mark portions of a previously cooked recipe as frozen. `event_id` ties
   * the frozen entry back to the planner event the portions came from.
   */
  async freezeRecipePortions(args: {
    recipe_id: number;
    event_id: number;
    count: number;
    servings: number;
  }): Promise<void> {
    await this.form('POST', '/frozen_recipes', {
      id: args.recipe_id,
      eid: args.event_id,
      count: args.count,
      servings: args.servings,
    });
  }

  /**
   * Mark a frozen entry as consumed (soft-delete: API sets `count` to 0,
   * the entry persists as history). After this call, the entry will no
   * longer appear in `listFrozenRecipes()` unless `include_consumed: true`
   * is passed.
   */
  deleteFrozenRecipe(id: number): Promise<FrozenRecipe> {
    return this.json('DELETE', `/api/v1/frozen_recipes/${id}`);
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
