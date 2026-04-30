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

class PlanToEat {
  constructor() {
    this.cookies = {};
    this._csrf = null;
  }

  // ---- internals ----

  _cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _absorbCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const h of headers) {
      // Take "name=value" only, ignore attributes
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

  async _fetch(method, path, { body, headers = {}, asJson = true } = {}) {
    const url = path.startsWith('http') ? path : BASE + path;
    const res = await fetch(url, {
      method,
      headers: {
        'Accept': asJson ? 'application/json' : 'text/html',
        'User-Agent': 'Mozilla/5.0 (plantoeat-api-client)',
        'Cookie': this._cookieHeader(),
        ...headers,
      },
      body,
      redirect: 'manual', // we want to harvest cookies on 302
    });

    // node fetch exposes set-cookie via getSetCookie()
    if (typeof res.headers.getSetCookie === 'function') {
      this._absorbCookies(res.headers.getSetCookie());
    } else {
      this._absorbCookies(res.headers.get('set-cookie'));
    }
    return res;
  }

  async _csrfToken() {
    if (this._csrf) return this._csrf;
    const res = await this._fetch('GET', '/recipes', { asJson: false });
    const html = await res.text();
    const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!m) throw new Error('Could not find csrf-token on /recipes');
    this._csrf = m[1];
    return this._csrf;
  }

  async _json(method, path, body, _retried = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = await this._csrfToken();
    const res = await this._fetch(method, path, { body: body && JSON.stringify(body), headers });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!res.ok) {
      // Auto re-auth on 401/302 if we have credentials saved and haven't already retried.
      if (!_retried && (res.status === 401 || res.status === 302) && this._creds) {
        this._csrf = null;
        this.cookies = {};
        await this.login(this._creds.email, this._creds.password);
        return this._json(method, path, body, true);
      }
      const err = new Error(`${method} ${path} failed: ${res.status}`);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }

  // ---- auth ----

  // Stash credentials so the client can transparently re-login when the
  // session cookies expire. Pass { email, password } or null to clear.
  setCredentials(creds) {
    this._creds = creds || null;
  }

  async login(email, password) {
    // 1. Get CSRF + cookies from the login page
    const loginPage = await this._fetch('GET', '/login', { asJson: false });
    const html = await loginPage.text();
    const csrf = (html.match(/<meta name="csrf-token" content="([^"]+)"/) || [])[1];
    if (!csrf) throw new Error('Could not find csrf-token on /login');
    const honeypot = (html.match(/<input type="text" name="(\w{16,})" id="\1"/) || [])[1] || '';

    // 2. POST login form
    const form = new URLSearchParams();
    form.set('authenticity_token', csrf);
    if (honeypot) form.set(honeypot, '');
    form.set('login[email]', email);
    form.set('login[password]', password);
    form.set('login[remember_me]', '1');

    const res = await this._fetch('POST', '/login', {
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      asJson: false,
    });

    // 302 -> /recipes on success, 200 (back to /login) on failure
    if (res.status === 302) {
      this._csrf = null; // refresh later
      this._creds = { email, password };
      return true;
    }
    throw new Error(`Login failed: status ${res.status}`);
  }

  // Snapshot/restore session so you don't have to log in every run.
  exportSession() {
    return { cookies: { ...this.cookies } };
  }
  importSession(session) {
    this.cookies = { ...session.cookies };
    this._csrf = null;
  }

  // ---- recipes ----

  // List the user's recipe book. Returns up to ~500 entries (the cap on
  // /api/v1/recipes — no pagination params seem to work). Each entry is a
  // "summary" recipe with ingredients embedded but not directions.
  listRecipes() {
    return this._json('GET', '/api/v1/recipes');
  }

  // Full recipe with directions, prep_notes, comments, tags, etc.
  getRecipe(id) {
    return this._json('GET', `/api/v1/recipes/${id}`);
  }

  // Create. Minimum: { title }. Full payload supports every field returned by
  // getRecipe — title, description, source, servings, yield, prep_time, cook_time,
  // total_time, course_id, cuisine_id, main_ingredient_id, directions (string),
  // tag_titles (comma-list), calories/sodium/etc.
  //
  // Ingredients use the Rails nested-attributes name `recipe_ingredients_attributes`
  // (NOT `ingredients`). Each entry: { title, amount, unit, note, position }.
  // To delete an existing ingredient include `_destroy: true` with its `id`.
  createRecipe(recipe) {
    return this._json('POST', '/api/v1/recipes', { recipe: this._normalize(recipe) });
  }

  updateRecipe(id, patch) {
    return this._json('PUT', `/api/v1/recipes/${id}`, { recipe: this._normalize(patch) });
  }

  // Accept the friendly name `ingredients` and translate to the wire name.
  _normalize(recipe) {
    if (recipe && Array.isArray(recipe.ingredients) && !recipe.recipe_ingredients_attributes) {
      const { ingredients, ...rest } = recipe;
      return { ...rest, recipe_ingredients_attributes: ingredients };
    }
    return recipe;
  }

  deleteRecipe(id) {
    return this._json('DELETE', `/api/v1/recipes/${id}`);
  }

  // ---- taxonomies ----
  listCourses()           { return this._json('GET', '/api/v1/courses'); }
  listCuisines()          { return this._json('GET', '/api/v1/cuisines'); }
  listMainIngredients()   { return this._json('GET', '/api/v1/main_ingredients'); }
  listTags()              { return this._json('GET', '/api/v1/tags'); }

  // ---- planner / shopping list ----
  // Calendar entries — { date, recipe_id, section: "breakfast"|"lunch"|"dinner", servings, ... }
  listEvents()            { return this._json('GET', '/api/v1/events'); }
  getShoppingList()       { return this._json('GET', '/api/v1/shopping_list'); }
  listMenus()             { return this._json('GET', '/api/v1/menus'); }
  listFriends()           { return this._json('GET', '/api/v1/friends'); }

  // Counts: { friends, queued, frozen }
  getCounts()             { return this._json('GET', '/recipes/counts/'); }
}

module.exports = { PlanToEat };
