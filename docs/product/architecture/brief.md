## Value 1: sign-in once per phone and an account-owned ledger

### Purpose
Stand up the walking skeleton of the Abbaas Ledger: a static bundle built with Vite that signs the owner in once per phone through Supabase Auth, keeps that session so later visits open straight to Home, and reads a ledger that Postgres row-level security restricts to the signed-in account.

### Constraints
- The toolchain scaffold is committed (8c83fa9): package.json with type module and the scripts build, test:unit and test:acceptance (playwright test --config tests/playwright.config.ts), its lockfile, tsconfig.json for src, tsconfig.node.json for tests and vite.config.ts, vite.config.ts with base from PAGES_BASE, index.html with an empty #app root loading /src/main.ts, an empty src/main.ts, and supabase/config.toml with project_id abbaas-ledger on ports 54420-54424 (api 54421, db 54422, inbucket 54424) with studio, storage, realtime, analytics, edge runtime and pooler off. Value 1 needs no change to those files except src/main.ts.
- Only the Supabase project URL and anon key reach the bundle, as build-time VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; the service-role key exists only in the acceptance support, outside the browser, and never in the repository.
- The meals project's local Supabase stack is running on this machine and holds ports 54321, 54322, 54324 and 54327; this project needs its own project_id and port block or supabase start collides with it.
- There is no sign-out control in version one (brief, out of scope), so a second account is observed on a second phone, which is a separate browser with its own storage.
- The acceptance run judges the BUILT bundle in dist/ served over a real HTTP origin, which is what GitHub Pages publishes.
- Later values reshape Home (balance boxes, centre-line list); this value's oracle must judge ownership on stable data attributes that survive that, never on wording or layout.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `supabase/migrations/0001_account_scoped_ledger.sql` | CREATE_NEW | Creates the whole ledger schema once, people and entries, each owned by auth.uid() under row-level security; later values add screens, not ownership. |
| `src/ports/identity.ts` | CREATE_NEW | Identity port in domain terms: the current account from the persisted session, sign-in with email and password, and their named Refusal and Retry outcomes. |
| `src/ports/ledger-store.ts` | CREATE_NEW | LedgerStore port in domain terms: read the signed-in account's entries with their person, newest first; read outcomes Retry when unreachable. |
| `src/adapters/supabase/client.ts` | CREATE_NEW | The only construction of the Supabase JS client: persistSession true, autoRefreshToken true, detectSessionInUrl false, anon key only, refusing to start without the two build variables. |
| `src/adapters/supabase/identity.ts` | CREATE_NEW | Implements Identity over Supabase Auth: getSession for the current account, signInWithPassword, mapping invalid credentials to Refusal and network failure to Retry. |
| `src/adapters/supabase/ledger-store.ts` | CREATE_NEW | Implements LedgerStore over PostgREST: selects entries joined to people with no user_id filter, so row-level security alone decides what is visible. |
| `src/ui/sign-in.ts` | CREATE_NEW | Sign-in screen as a function from state to DOM: labelled Email and Password fields, a Sign in button, named messages for wrong credentials and an unreachable server. |
| `src/ui/home.ts` | CREATE_NEW | Minimal Home as a function from the read ledger to DOM: one element per entry carrying data-entry, its person's name carrying data-person, its USD amount, and a named retry notice when the read failed. |
| `src/main.ts` | EXTEND | Replaces the scaffold's empty composition root: builds the adapters, resolves the persisted session before the first paint, then renders the sign-in screen or Home, and Home after a successful sign-in. |

### Paradigm
functional

### Decisions
- Paradigm is functional because the brief fixes the layout as domain rules in pure functions, ports, a Supabase adapter, and UI as functions from state to DOM, as in the meals project.
- Schema, created whole in 0001: table people (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, name text not null check (length(btrim(name)) > 0), name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored, created_at timestamptz not null default now(), unique (user_id, name_key)).
- Schema, created whole in 0001: table entries (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, kind text not null check (kind in ('send','receive')), currency text not null check (currency in ('USD','MVR')), amount_minor bigint not null check (amount_minor > 0) meaning US cents for USD and laari for MVR, rate numeric(12,4) null meaning rufiyaa per one US dollar, required exactly when currency = 'MVR' and > 0, usd_cents bigint not null check (usd_cents > 0), entry_date date not null, saved_at timestamptz not null default now(), note text null, person_id uuid null references people(id) on delete set null, person_name text null). A send carries person_id and person_name (check: kind = 'send' implies person_name is not null); a receive carries neither.
- Ownership lives in Postgres only: both tables enable row level security with per-verb policies using (auth.uid() = user_id) for select, insert, update and delete; revoke all from anon; grant select, insert, update, delete to authenticated; grant all to service_role. person_id must reference a person of the same user, enforced by a composite foreign key (person_id, user_id) referencing people (id, user_id) with a unique (id, user_id) on people.
- The bundle never sends or filters by user_id: inserts rely on the column default auth.uid() and reads rely on row-level security, so a dropped policy makes the oracle fail instead of a client filter hiding the leak.
- The persisted Supabase session is the only session: the client keeps it in the browser's localStorage and refreshes it automatically; main.ts awaits the current session before painting anything, so a returning visit never flashes the sign-in screen.
- Stable attribute contract for every later value: each rendered entry element carries data-entry="<entries.id>" and the element naming its person carries data-person="<people.id>"; a receive's entry carries data-entry and no data-person. Later values may restyle and move these elements but must keep the attributes.
- At this value Home is the minimal reading surface: a list of the account's entries, newest entry_date first then newest saved_at, each showing its person name for a send or 'from Abbaas' for a receive and its USD amount formatted as $1,234.56. The balance boxes and the centre line arrive with values 2 and 6.
- An empty ledger and a failed read never look alike: a LedgerStore Retry renders a notice with role=alert and the text 'Could not load the ledger. Try again.' and no entry elements.
- Failures are named on the ports: wrong email or password is a Refusal that keeps the sign-in screen with 'Email or password is wrong.' and clears the password; an unreachable auth endpoint is a Retry showing 'Cannot reach the server. Try again.'; a persisted session whose refresh is rejected is a Refusal that shows the sign-in screen with 'Please sign in again.', never an empty Home.
- Dependency direction is inward: src/ports/ knows nothing of Supabase; only src/adapters/supabase/ and src/main.ts import @supabase/supabase-js; src/ui/ imports ports and plain values only.
- Toolchain: Vite with TypeScript and no UI framework, Supabase CLI as a devDependency so node_modules/.bin provides supabase to the acceptance support, vitest for unit tests, Playwright with chromium for acceptance at a 360 by 780 viewport. npm run build runs tsc --noEmit then vite build. The Playwright configuration lives at tests/playwright.config.ts and npm run test:acceptance runs playwright test --config tests/playwright.config.ts, so every acceptance byte stays under tests/.
- Test seeding is the acceptance support's job, not the app's: tests/support/accounts.ts creates confirmed accounts and inserts fixed rows with the service-role key against the local stack, setting user_id explicitly; the app itself gains its write surface in value 3.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The repository has no code to move and no earlier DESIGN oracle to preserve.

### Agreement analysis
Not applicable: This value introduces the first producer and consumer of the schema and the ports together; there is no second party yet.

### Boundaries
- Driving port: The built static bundle's HTTP origin and its DOM: the sign-in screen and Home, as a phone browser sees them.
- Driven port: Identity: Supabase Auth over HTTPS (session restore, password sign-in, token refresh).
- Driven port: LedgerStore: the people and entries tables over PostgREST under row-level security.
- Dependency direction: UI and ports depend on nothing outside src/; the Supabase adapters depend on the ports; main.ts composes adapters into ports and is the only place both meet.
- Failure: Condition: Email or password is wrong. | Outcome: Refusal | Observation: The sign-in screen stays, shows 'Email or password is wrong.' and the password field is empty; Home is not shown.
- Failure: Condition: Supabase Auth cannot be reached when signing in. | Outcome: Retry | Observation: The sign-in screen stays intact and shows 'Cannot reach the server. Try again.'
- Failure: Condition: A persisted session's refresh is rejected. | Outcome: Refusal | Observation: The sign-in screen is shown with 'Please sign in again.' instead of an empty Home.
- Failure: Condition: Reading the ledger fails while signed in. | Outcome: Retry | Observation: Home shows the alert 'Could not load the ledger. Try again.' and no entry elements, so a failed read never looks like an empty ledger.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: On the first visit on a phone the owner signs in once with email and password; every later visit, including opening the app from the home-screen icon, goes straight to Home with no sign-in screen; the ledger belongs to that account, and a second account sees none of its entries or people.

Stimulus: The acceptance support starts this project's local Supabase stack, resets it to the repository migrations, builds the bundle against the stack's URL and anon key, and serves dist/ over a real loopback HTTP origin. Through the service role it creates account A and account B and seeds for A exactly two people (Ahmed Shifaz, Mariyam Nisha) and three entries: a USD send of 34000 cents to Mariyam Nisha dated 2026-10-08, an MVR send of 1540000 laari at rate 15.4000 (usd_cents 100000) to Ahmed Shifaz dated 2026-10-05, and a USD receive of 50000 cents dated 2026-09-29. Phone A is one Chromium browser context at 360 by 780: it opens the start URL, fills Email and Password, and taps Sign in. A later visit is a new page in that same context opening the start URL again, which is what a home-screen launch does. Phone B is a second browser context that signs in as account B.

Expected: On phone A's first visit a password field is shown, and after Sign in, Home shows exactly three elements with data-entry and exactly two distinct data-person values, with the texts Mariyam Nisha, Ahmed Shifaz, $340.00, $1,000.00 and $500.00 present. On the later visit no password field appears at any point and the same three data-entry elements are shown. Phone B, after signing in, shows Home with zero data-entry and zero data-person elements and none of the texts Mariyam Nisha, Ahmed Shifaz, $340.00, $1,000.00 or $500.00. A further later visit on phone A still shows the three entries, so B's empty Home is row-level security and not a lost seed.

Falsifier: Dropping the select policy on entries or people, or replacing it with a client-side filter, makes phone B show A's rows. Setting persistSession to false, or painting before the session resolves, makes the later visit show the sign-in screen. Deleting A's seed makes A's own later visit empty and fails the count of three.

### Oracle and verification
Oracle target locator: `tests/acceptance/sign-in-and-own-ledger.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
