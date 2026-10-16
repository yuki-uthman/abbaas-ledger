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
## Value 2: empty Home with the two balance boxes and the Send and Receive buttons

### Purpose
Give Home its confirmed shape before any money is recorded: the two-box balance card (You left, Abbaas right) with both boxes empty, an All square chip, a hint that names Send and Receive, and the two bottom buttons.

### Constraints
- Value 1 already renders Home from src/ui/home.ts and composes it in src/main.ts; this value extends those files rather than adding a second Home.
- The data-entry and data-person attribute contract from value 1 stays in force for the entry list.
- Tapping Send and Receive opens their forms only in values 3 and 5; here the buttons exist, are labelled and sit in place.
- The visual reference is the final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi, light theme: background #f4f7f6, owner blue #24508a with box tint #e7eef7, Abbaas teal #0f6f68 with box tint #e0f0ed, Manrope for titles and numbers, Source Sans 3 for body.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/domain/balance.ts` | CREATE_NEW | Pure function from the account's entries to the balance: the sum of send usd_cents minus the sum of receive usd_cents, projected as who holds the money (abbaas when positive, you when negative, none at zero) and the unsigned amount in cents; also the two totals sent and paid back. |
| `src/ui/home.ts` | EXTEND | Adds the balance card with the two boxes, the All square chip, the empty-ledger hint and the bottom Send and Receive buttons above the existing entry list. |
| `src/ui/theme.css` | CREATE_NEW | The light palette, type and shape tokens of the final canvas and the styles of the balance card, chip, hint and bottom buttons. |
| `index.html` | EXTEND | Loads Manrope (700, 800) and Source Sans 3 (400, 600, 700) from Google Fonts. |
| `src/main.ts` | EXTEND | Imports theme.css so Vite bundles it, and passes the computed balance to Home. |

### Paradigm
functional

### Decisions
- Balance rule: balance_cents = sum(usd_cents of kind send) - sum(usd_cents of kind receive). Positive means Abbaas holds the owner's money, negative means the owner holds Abbaas's money, zero is All square. The amount shown is never signed.
- Stable attribute contract for the balance card, kept by every later value: the owner's box carries data-box="you" and Abbaas's box carries data-box="abbaas"; each box carries data-state="filled" or data-state="empty" and data-amount="<cents>" (0 when empty); only the holder's box is filled. The All square chip carries data-square and is present exactly when the balance is zero.
- An empty box shows the text $0 and a dashed outline in its person's colour (rgba(36,80,138,0.35) for You, rgba(15,111,104,0.38) for Abbaas); its caption is 'nothing of his' for You and 'nothing of yours' for Abbaas. A filled box (arriving with value 3) shows the amount as $1,234.56 on its person's tint.
- Each box shows a name pill: 'You' (ink #0d1f1c on light text) in the left box and 'Abbaas' (teal on #dcebe8) in the right box. The You box is the left one and the Abbaas box the right one at every width.
- With no entries, an empty-ledger hint carrying data-empty-hint says 'No entries yet' and 'Tap Send when you pay someone on Abbaas's behalf. Tap Receive when he pays you back.'
- The bottom buttons are fixed to the bottom of the screen: Send (background #24508a, white text, up-right arrow) on the left half and Receive (background #0f6f68, white text, down-left arrow) on the right half, each 60 px tall with 20 px radius, 16 px from the sides and 20 px from the bottom, carrying data-action="send" and data-action="receive" and accessible names Send and Receive.
- Totals line under the boxes: 'You sent $X' and 'He paid back $Y' from the same pure function, shown as $0.00 for an empty ledger.
- UI stays functions from state to DOM; balance.ts has no DOM and no Supabase import and is unit-testable with vitest.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Home and the composition root are created by value 1 in this same Request and are extended in place; no existing behaviour is moved. Value 1's data-entry and data-person contract is kept as a constraint.

### Agreement analysis
Not applicable: No schema or port changes; Home reads the same LedgerStore result value 1 defined.

### Boundaries
- Driving port: The built bundle's DOM after sign-in: Home.
- Driven port: LedgerStore: the account's entries over PostgREST under row-level security.
- Dependency direction: home.ts depends on balance.ts and the LedgerStore result type; balance.ts depends on nothing.
- Failure: Condition: Reading the ledger fails. | Outcome: Retry | Observation: Home shows the alert 'Could not load the ledger. Try again.' and neither box claims a balance: both boxes are absent or carry data-state="empty" with no All square chip, so a failed read is never shown as All square.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: With no entries, Home shows both boxes as empty dashed outlines with $0 (You on the left, Abbaas on the right), an All square chip, a hint to use Send or Receive, a Send button at the bottom left and a Receive button at the bottom right.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle, and creates a new account with no people and no entries. A Chromium context at 360 by 780 opens the start URL and signs in as that account.

Expected: Home shows an element with data-box="you" and one with data-box="abbaas", both with data-state="empty", data-amount="0" and the text $0; the you box's bounding box lies left of the abbaas box's on the same row; an element with data-square reads All square; an element with data-empty-hint contains both Send and Receive; the data-action="send" control is named Send and its centre is in the left half of the viewport and within the bottom 120 px; the data-action="receive" control is named Receive and its centre is in the right half and within the bottom 120 px; there are zero data-entry elements and no alert.

Falsifier: Swapping the boxes, filling a box, dropping the chip, or placing a button outside its bottom quarter fails the check; a ledger read failure would show an alert and no All square chip, which also fails.

### Oracle and verification
Oracle target locator: `tests/acceptance/empty-home.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
## Value 3: send in USD to a saved or new person

### Purpose
Let the owner record money sent on Abbaas's behalf in US dollars from a full-screen blue form, choosing who was paid from a saved list or adding a new person, and see the result on Home: the entry right of the centre line and Abbaas's box filled with the new balance.

### Constraints
- Values 1 and 2 provide the session, LedgerStore reads, Home with the two boxes (data-box, data-state, data-amount), the bottom Send button (data-action="send") and the entry list (data-entry, data-person); this value extends those files.
- The schema from value 1 already holds people (name, name_key unique per account) and entries (kind, currency, amount_minor, rate, usd_cents, entry_date, saved_at, note, person_id, person_name); no migration is needed.
- The bundle never sends user_id: inserts rely on the column default auth.uid() and row-level security.
- MVR entry is value 4; this value's currency switch shows USD selected and MVR may be present but is not exercised.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/domain/money.ts` | CREATE_NEW | Pure parsing of typed amounts ('250', '250.5', '1,000.00') into whole minor units, rejecting empty, zero, negative and more than two decimals, and formatting cents as $1,234.56. |
| `src/domain/send-draft.ts` | CREATE_NEW | Pure send draft: amount text, chosen person, date and note; whether it can be saved; the entry it becomes; and the balance after saving it, for the preview boxes. |
| `src/ports/ledger-store.ts` | EXTEND | Adds listPeople, addPerson and addEntry with their Refusal and Retry outcomes. |
| `src/adapters/supabase/ledger-store.ts` | EXTEND | Implements listPeople, addPerson (returning the existing person when the normalised name already exists) and addEntry over PostgREST. |
| `src/ui/send-form.ts` | CREATE_NEW | The blue full-screen send form as a function from the draft and the saved people to DOM. |
| `src/ui/home.ts` | EXTEND | Places each entry on the centre line (sends on the right half) and fills the holder's box with the unsigned balance and its caption. |
| `src/ui/theme.css` | EXTEND | Styles of the send form, chips, preview boxes, filled boxes and the centre line. |
| `src/main.ts` | EXTEND | Navigates between Home and the send form with location.hash (#send), so Android's back button closes the form, and reloads the ledger after a save. |

### Paradigm
functional

### Decisions
- Navigation: tapping data-action="send" sets location.hash to #send and shows the send form in place of Home; Close (aria-label Close) and the browser back button return to Home; a successful save returns to Home and re-reads the ledger.
- Send form contract: its root carries data-form="send" and a blue background #24508a with white text; the title reads 'Money sent for Abbaas'; the top line reads 'Abbaas has $X of yours' or 'You have $X of his' or 'All square' from the current balance.
- Currency switch: two buttons named USD and MVR with aria-pressed; USD is selected when the form opens.
- Amount field: an input labelled 'Amount sent' with inputmode=decimal; the USD prefix shown beside it is '$'.
- Paid to: one button per saved person carrying data-person-chip="<people.id>" and the person's name, ordered by name; the chosen one has aria-pressed="true". A button named 'New person' reveals an input labelled 'Name' and a button named 'Add'; Add creates the person (or picks the existing one whose normalised name matches) and selects it. A person is typed once and chosen thereafter.
- Date: an input type=date labelled 'Date' whose value starts as today in the device's time zone (YYYY-MM-DD) and can be changed.
- Note: an optional text input labelled 'Note'.
- After saving preview: two boxes carrying data-preview-box="you" and data-preview-box="abbaas" with data-state and data-amount computed from the current balance plus this draft, updating on every keystroke.
- Save: a button whose accessible name starts with 'Save entry' and shows the amount (e.g. 'Save entry · $250.00'); it is disabled until the amount parses to more than zero and a person is chosen.
- A saved USD send stores kind 'send', currency 'USD', amount_minor equal to usd_cents (cents), rate null, entry_date from the Date field, note or null, person_id and person_name as chosen.
- Centre line: Home draws a vertical line down the middle of the entry list; a send's element (data-entry) sits wholly in the right half, beside a round blue node with a right-pointing arrow, and shows the amount, 'to <name>' (with data-person) and its detail ('Paid in USD').
- Filled box: the holder's box carries data-state="filled" and data-amount="<cents>", shows the amount as $1,234.56 with no plus or minus sign, and the caption 'has your money' in Abbaas's box or 'have his money' in the owner's box; the other box stays empty.
- Failures: a save that cannot reach the server keeps the form and its values and shows 'Could not save. Try again.'; adding a person that cannot be saved shows 'Could not add this person. Try again.' and keeps the typed name.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Home, the ports and the composition root are created by values 1 and 2 in this same Request and are extended in place; no behaviour is moved.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by values 1 and 2 and are only consumed here.

### Boundaries
- Driving port: The built bundle's DOM: Home's Send button, the send form and Home after saving.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: send-form.ts and home.ts depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'
- Failure: Condition: Adding a new person fails. | Outcome: Retry | Observation: The name input keeps the typed name and shows 'Could not add this person. Try again.'
- Failure: Condition: The amount is empty, zero or not a number, or no person is chosen. | Outcome: Refusal | Observation: The Save entry button is disabled and nothing is stored.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping Send opens the blue form; the owner enters an amount in USD, picks a paid-to person from the saved list or adds a new one, keeps or changes the date, optionally adds a note, and sees the after-saving boxes; saving returns to Home where the entry sits right of the centre line and Abbaas's box is filled with the new balance, shown without a sign, with the caption has your money.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle, creates an account and, through the service role, one saved person 'Mariyam Nisha' and no entries. A Chromium context at 360 by 780 signs in, taps Send, keeps USD, types 250.00 in Amount sent, taps the Mariyam Nisha chip, keeps the Date, types 'School fees' in Note and taps Save entry. It then taps Send again, taps New person, types 'Ahmed Shifaz', taps Add, types 100 and taps Save entry. Finally it reloads the page and opens Send once more.

Expected: The form carries data-form="send" with USD pressed and the Date field equal to today's date; after typing 250.00 the abbaas preview box shows data-state="filled" and data-amount="25000"; Save entry is disabled before a person is chosen and enabled after. After the first save Home shows one data-entry element wholly in the right half of the viewport containing $250.00 and Mariyam Nisha, the abbaas box has data-state="filled", data-amount="25000", the text $250.00 with no '+' or '-' and the caption has your money, and the you box is empty. After the second save there are two data-entry elements, both in the right half, and the abbaas box reads data-amount="35000" and $350.00. After the reload both entries are still shown, and the reopened form offers chips named Ahmed Shifaz and Mariyam Nisha. Read through the service role, the account has two entries, both kind send, currency USD, rate null, amount_minor equal to usd_cents (25000 and 10000), entry_date today, and person_name Mariyam Nisha and Ahmed Shifaz, and the first has note 'School fees'.

Falsifier: Placing sends on the left, signing the balance, leaving the box empty, not storing the new person, storing a different amount or date, or enabling Save without a person fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-usd.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
## Value 4: send in MVR at a typed rate

### Purpose
Let the owner record a send in Maldivian rufiyaa with the rate they got that day, see the dollar value worked out as they type, and store the MVR amount, the rate and that USD value together.

### Constraints
- Value 3's send form (data-form="send", USD and MVR buttons with aria-pressed, 'Amount sent', person chips, Date, Note, preview boxes, Save entry) and Home's centre-line entries are extended here.
- entries.rate is numeric(12,4), rufiyaa per one US dollar, required exactly when currency is MVR; amount_minor holds laari for MVR.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/domain/money.ts` | EXTEND | Adds parsing of a typed rate (up to four decimals, greater than zero) and the conversion of laari at a rate to US cents, rounded half up, in integer arithmetic. |
| `src/domain/send-draft.ts` | EXTEND | The draft carries a currency and a rate; an MVR draft's USD value and after-saving balance use the conversion. |
| `src/ui/send-form.ts` | EXTEND | Shows the rate field and the live dollar value when MVR is selected, hides them for USD. |
| `src/ui/home.ts` | EXTEND | An MVR entry's detail line reads 'MVR 10,000 at 20.00' under its USD amount. |
| `src/ui/theme.css` | EXTEND | Styles of the rate field and the dollar value card. |

### Paradigm
functional

### Decisions
- Conversion: usd_cents = round half up of (amount_laari / rate). With the rate held as an integer r4 = rate x 10000, usd_cents = floor((2 x amount_laari x 10000 + r4) / (2 x r4)), computed with BigInt or exact integers so no floating-point drift can change a cent. Example: MVR 10,000 (1,000,000 laari) at 20 gives 50,000 cents ($500.00); MVR 1 at 8 gives 13 cents ($0.13); MVR 100 at 3 gives 3,333 cents ($33.33).
- Switching to MVR shows an input labelled 'Rate (MVR per $1)' with inputmode=decimal and an output element carrying data-usd that shows the dollar value as $1,234.56, updating on every keystroke of amount or rate; while the amount or rate does not parse, data-usd shows $0.00 and Save entry is disabled. The amount prefix reads 'MVR'.
- Switching back to USD hides the rate field and data-usd; the typed amount is kept and read as dollars.
- A saved MVR send stores currency 'MVR', amount_minor in laari, rate as typed (to four decimals), usd_cents from the conversion, and the chosen person, date and note as for USD.
- Entry detail on Home: 'MVR <amount> at <rate>', the amount grouped with commas and shown without decimals when whole (MVR 10,000) or with two otherwise (MVR 10,000.50), the rate with at least two and at most four decimals (20.00, 15.40, 15.4250). A USD send's detail reads 'Paid in USD'.
- The Save entry button's name shows the USD value (Save entry · $500.00) and the preview boxes use the USD value.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The files are created by earlier values of this same Request and extended in place; no behaviour is moved, and the attribute contracts of earlier values are kept as constraints.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by earlier values of this Request and are only consumed here.

### Boundaries
- Driving port: The built bundle's DOM: the send form with MVR selected, and Home after saving.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: send-form.ts depends on send-draft.ts and money.ts; neither domain module imports DOM or Supabase.
- Failure: Condition: The rate is empty, zero, negative or not a number. | Outcome: Refusal | Observation: data-usd shows $0.00 and Save entry is disabled; nothing is stored.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: In the send form, switching to MVR shows a rate field (MVR per $1) and the dollar value worked out as the owner types, for example MVR 10,000 at 20.00 shows $500.00; saving stores the MVR amount, the rate and that USD value, and the entry reads MVR 10,000 at 20.00 under its $500.00.

Stimulus: The acceptance support starts the stack, builds and serves the bundle, creates an account with one saved person 'Ahmed Shifaz' and no entries. A Chromium context at 360 by 780 signs in and taps Send, taps MVR, types 10,000 in Amount sent and 20 in Rate (MVR per $1), then tries other pairs: 1 at 8, 100 at 3 and 15,400 at 15.40, and finally 10,000 at 20 again; it taps the Ahmed Shifaz chip and Save entry.

Expected: After tapping MVR the MVR button is pressed and the rate field is visible; data-usd reads $500.00 for 10,000 at 20, $0.13 for 1 at 8, $33.33 for 100 at 3 and $1,000.00 for 15,400 at 15.40, and the abbaas preview box's data-amount follows the USD value. After saving, Home shows one data-entry element in the right half containing $500.00 and the text 'MVR 10,000 at 20.00', and the abbaas box reads data-amount="50000" and $500.00. Read through the service role, the entry has currency MVR, amount_minor 1000000, rate 20.0000 and usd_cents 50000. Switching back to USD in a new form hides the rate field.

Falsifier: Truncating instead of rounding gives $0.12 for 1 at 8; multiplying instead of dividing gives $200,000.00; storing the USD value as amount_minor or dropping the rate fails the stored-row check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-mvr.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
## Value 5: receive a repayment from Abbaas

### Purpose
Let the owner record money Abbaas paid back from a full-screen teal form, in dollars or in rufiyaa at a rate, with quick amounts, and show where the balance lands, including when he pays more than he holds or exactly clears it.

### Constraints
- Values 1 to 4 provide the session, Home with the two boxes, the centre line, the bottom Receive button (data-action="receive"), the send form patterns, the money conversion and LedgerStore.addEntry.
- A receive has no person: person_id and person_name stay null.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/domain/receive-draft.ts` | CREATE_NEW | Pure receive draft: currency, amount, rate, date, note; whether it can be saved; its USD value; the balance after it; and which note applies (more than held, clears it, or none). |
| `src/ui/receive-form.ts` | CREATE_NEW | The teal full-screen receive form as a function from the draft and the current balance to DOM. |
| `src/ui/home.ts` | EXTEND | Places receives in the left half of the centre line, fills the owner's box when the balance is negative, and shows the All square chip at zero after entries exist. |
| `src/ui/theme.css` | EXTEND | Styles of the receive form, quick amounts and its note. |
| `src/main.ts` | EXTEND | Navigates to the receive form with #receive and back to Home after saving. |

### Paradigm
functional

### Decisions
- Navigation: tapping data-action="receive" sets location.hash to #receive; Close and the back button return to Home; saving returns to Home and re-reads the ledger.
- Receive form contract: root data-form="receive" with background #0f6f68 and white text; title 'Payment from Abbaas'; the same USD and MVR buttons as the send form, USD selected first; an input labelled 'Amount received'; with MVR, the same 'Rate (MVR per $1)' field and data-usd output and the same conversion.
- Quick amounts: buttons carrying data-quick. 'All of it · $X' sets the amount to what Abbaas currently holds and is shown only while he holds money; '$500' and '$1,000' set those amounts; each switches the currency to USD.
- Note: an element carrying data-receive-note appears when the payment is more than Abbaas holds, reading 'This is $D more than he has of yours. The balance moves to your side: you will have $D of his.' (D = payment minus what he holds, or the whole payment when nothing is held), and when it equals what he holds, reading 'This clears it. You will be all square.'; otherwise it is absent.
- Preview boxes data-preview-box="you"/"abbaas" show the balance after this payment, as on the send form; Save entry (name starting 'Save entry') is disabled until the USD value is more than zero.
- A saved receive stores kind 'receive', currency, amount_minor, rate (MVR only), usd_cents, entry_date, note, and no person.
- Home: a receive's element (data-entry, no data-person) sits wholly in the left half of the centre line beside a round teal node with a left-pointing arrow and shows the amount, 'from Abbaas' and its detail. When the balance is negative the owner's box is filled with the unsigned amount and the caption 'have his money' and Abbaas's box is empty; at zero both are empty and the data-square chip reads All square.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The files are created by earlier values of this same Request and extended in place; no behaviour is moved, and the attribute contracts of earlier values are kept as constraints.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by earlier values of this Request and are only consumed here.

### Boundaries
- Driving port: The built bundle's DOM: Home's Receive button, the receive form and Home after saving.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: receive-form.ts depends on receive-draft.ts and money.ts; the domain modules import neither DOM nor Supabase.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'
- Failure: Condition: The amount does not parse or is zero. | Outcome: Refusal | Observation: Save entry is disabled and nothing is stored.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping Receive opens the teal form; the owner enters what Abbaas paid (USD, or MVR with a rate), or taps All of it, $500 or $1,000, and sees the after-saving boxes; saving puts the entry left of the centre line and lowers what Abbaas holds. A payment larger than he holds shows a note before saving and, once saved, empties his box and fills the owner's blue box with the difference and the caption have his money; a payment equal to what he holds leaves both boxes empty and shows All square.

Stimulus: The acceptance support starts the stack, builds and serves the bundle, creates an account and seeds through the service role one USD send of 74000 cents to a person 'Mariyam Nisha'. A Chromium context at 360 by 780 signs in. It taps Receive, types 300 and saves. It taps Receive again, taps the All of it quick amount and saves. It taps Receive again, taps $1,000 and saves.

Expected: The first form carries data-form="receive", shows 'All of it · $740.00', no data-receive-note for 300, and the abbaas preview at data-amount="44000"; after saving, the new receive element is wholly in the left half and contains $300.00 and from Abbaas, and the abbaas box reads $440.00. The second form's All of it reads $440.00 and the note reads 'This clears it. You will be all square.'; after saving both boxes are empty and the data-square chip reads All square. The third form shows no All of it button; after $1,000 the note reads 'This is $1,000.00 more than he has of yours. The balance moves to your side: you will have $1,000.00 of his.' and the you preview box is filled with data-amount="100000"; after saving, the you box has data-state="filled", data-amount="100000", $1,000.00 and the caption have his money, and the abbaas box is empty. The account then has three receives with person_name null and usd_cents 30000, 44000 and 100000.

Falsifier: Putting receives on the right, adding a receive instead of subtracting it, keeping the money in Abbaas's box when the balance turns negative, signing the amount, or attaching a person to a receive fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/receive.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
## Value 6: the full entry list with day groups, running balance and totals

### Purpose
Turn Home's list into the confirmed centre-line ledger: entries grouped by date, newest first, each showing who holds what after it, with totals that add up to the balance in the boxes.

### Constraints
- Values 3 to 5 already place sends right and receives left of the centre line with data-entry, data-person and the amount, party and detail; this value adds the grouping, the after-balance and the totals.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/domain/ledger-view.ts` | CREATE_NEW | Pure projection of the entries into day groups (entry_date descending, then saved_at descending within a day), each entry's balance after it (computed in chronological order: entry_date ascending, then saved_at ascending), and the totals sent and paid back. |
| `src/ui/home.ts` | EXTEND | Renders the day groups, each entry's after-balance on the opposite side of the line, and the totals from ledger-view.ts. |
| `src/ui/theme.css` | EXTEND | Styles of the day labels and the after-balance text. |

### Paradigm
functional

### Decisions
- Day groups: each date is an element carrying data-day="YYYY-MM-DD" whose label reads like 'Thu 8 Oct' (weekday, day, short month, in English) and 'Today · Sun 11 Oct' for the device's today; groups are newest date first and entries newest saved first within a date.
- After-balance: each entry element carries data-after="<cents>" (positive when Abbaas holds money, negative when the owner does, 0 when square) and shows on the other side of the line 'Abbaas has $X', 'You have $X' or 'All square', in teal, blue or grey respectively.
- Totals: elements carrying data-total="sent" and data-total="paid" read 'You sent $X' and 'He paid back $Y', the sums of send and receive usd_cents; their difference equals the balance in the boxes.
- ledger-view.ts is pure and unit-tested with vitest; Home renders only what it returns.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The files are created by earlier values of this same Request and extended in place; no behaviour is moved, and the attribute contracts of earlier values are kept as constraints.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by earlier values of this Request and are only consumed here.

### Boundaries
- Driving port: The built bundle's DOM: Home with recorded entries.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: home.ts depends on ledger-view.ts and balance.ts; ledger-view.ts depends on nothing.
- Failure: Condition: Reading the ledger fails. | Outcome: Retry | Observation: Home shows the alert 'Could not load the ledger. Try again.' and no groups, totals or entries.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: After several sends and repayments, Home lists them grouped by date, newest first, on the centre line; each entry shows its USD amount, to whom or from Abbaas, its currency detail, and on the other side who holds what after it (Abbaas has $740.00, You have $260.00 or All square); the totals You sent and He paid back equal the sums of the entries, and their difference is the balance in the boxes.

Stimulus: The acceptance support creates an account and seeds through the service role, with explicit saved_at times, two people and six entries: 2026-09-26 an MVR send of 770000 laari at 15.4000 (usd_cents 50000) to Mariyam Nisha; 2026-09-29 a USD receive of 50000; 2026-10-02 an MVR send of 600000 laari at 15.0000 (usd_cents 40000) to Mariyam Nisha; 2026-10-05 an MVR send of 1540000 laari at 15.4000 (usd_cents 100000) to Ahmed Shifaz; 2026-10-08 a USD send of 34000 to Mariyam Nisha saved at 09:00; and 2026-10-08 a USD receive of 100000 saved at 18:00. A Chromium context at 360 by 780 signs in.

Expected: Home shows five data-day groups in the order 2026-10-08, 2026-10-05, 2026-10-02, 2026-09-29, 2026-09-26, labelled Thu 8 Oct, Mon 5 Oct, Fri 2 Oct, Tue 29 Sep and Sat 26 Sep. Within 2026-10-08 the receive comes before the send. The entries' data-after values, newest first, are 74000, 174000, 140000, 40000, 0 and 50000, and their after texts read Abbaas has $740.00, Abbaas has $1,740.00, Abbaas has $1,400.00, Abbaas has $400.00, All square and Abbaas has $500.00. data-total="sent" reads You sent $2,240.00, data-total="paid" reads He paid back $1,500.00, and the abbaas box reads data-amount="74000".

Falsifier: Ordering by insertion, computing the after-balance newest first, or totals that ignore MVR entries' usd_cents fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-list.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
## Value 7: Saved message with Undo

### Purpose
Right after saving, tell the owner who now holds how much and let them take the entry back with one tap.

### Constraints
- Values 3 and 5 return to Home after a save; LedgerStore has addEntry; entries.id identifies the saved row.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ports/ledger-store.ts` | EXTEND | Adds removeEntry(id) with its Retry outcome. |
| `src/adapters/supabase/ledger-store.ts` | EXTEND | Implements removeEntry as a delete by id under row-level security. |
| `src/ui/home.ts` | EXTEND | Renders the Saved message with its Undo button when Home is shown right after a save. |
| `src/main.ts` | EXTEND | Remembers the id of the entry just saved, passes it to Home, removes it on Undo and re-reads the ledger. |
| `src/ui/theme.css` | EXTEND | Styles of the Saved message. |

### Paradigm
functional

### Decisions
- The Saved message is an element with role=status and data-saved-message, shown on Home after a save until the owner taps Undo, leaves Home or reloads. Its text reads 'Saved. Abbaas now has $X of yours.', 'Saved. You now have $X of his.' or 'Saved. You are all square.' from the balance after the save, and it holds a button named Undo.
- Undo deletes that one entry, re-reads the ledger, and removes the message; the boxes, list and totals then match the ledger without it.
- The message sits above the bottom buttons and never covers them.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The files are created by earlier values of this same Request and extended in place; no behaviour is moved, and the attribute contracts of earlier values are kept as constraints.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by earlier values of this Request and are only consumed here.

### Boundaries
- Driving port: The built bundle's DOM: Home right after a save.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: main.ts owns the just-saved id; home.ts renders it; the adapter implements the port.
- Failure: Condition: Undo cannot reach the server. | Outcome: Retry | Observation: The message stays with 'Could not undo. Try again.' and the entry is still listed.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Right after saving, a Saved message says who now holds how much and offers Undo; tapping Undo removes that entry from the list and from the stored ledger, and the boxes return to the balance before it.

Stimulus: The acceptance support creates an account with a person 'Mariyam Nisha' and seeds one USD send of 74000 cents. A Chromium context at 360 by 780 signs in, taps Send, types 500, taps Mariyam Nisha and saves; then taps Undo.

Expected: After saving, an element with role=status and data-saved-message reads 'Saved. Abbaas now has $1,240.00 of yours.' and holds a button named Undo, and two data-entry elements are shown. After Undo the message is gone, one data-entry element remains, the abbaas box reads data-amount="74000" and $740.00, and the account holds one entry when read through the service role. After a reload no data-saved-message is shown.

Falsifier: An Undo that only hides the entry leaves two rows in the database; a message with the balance before the save, or one that survives a reload, fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/undo.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
## Value 8: phone layout, wide-screen column and Android install

### Purpose
Make every screen fit Android phones from 360 px wide, keep the bottom buttons clear of the gesture bar, cap the app at a centred 560 px column on wider screens, and make it installable from Chrome as a full-screen app with its own name and icon.

### Constraints
- The app icons are committed by the orchestrator as binary files: public/icons/icon-192.png (192 by 192), public/icons/icon-512.png (512 by 512) and public/icons/icon-maskable-512.png (512 by 512, glyph inside the safe zone). Vite copies public/ into dist/ at the base path.
- Values 1 to 7 provide Home, the send form and the receive form with their data attributes.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `public/manifest.webmanifest` | CREATE_NEW | The web app manifest Chrome reads to offer Add to Home screen. |
| `public/sw.js` | CREATE_NEW | A minimal service worker with a network pass-through fetch handler, so Chrome treats the site as installable; it caches no ledger data. |
| `index.html` | EXTEND | Links the manifest, sets the theme-color meta and an apple-touch-icon, and registers sw.js with the base path. |
| `src/ui/theme.css` | EXTEND | Fluid layout from 360 px, a centred column with max-width 560 px, bottom buttons and the Saved message above env(safe-area-inset-bottom), dynamic viewport height units, and 44 px minimum touch targets. |
| `src/main.ts` | EXTEND | Registers the service worker after load, relative to import.meta.env.BASE_URL. |

### Paradigm
functional

### Decisions
- Manifest: name 'Abbaas Ledger', short_name 'Ledger', display 'standalone', start_url '.' and scope '.' (relative, so it works at the GitHub Pages path), background_color '#f4f7f6', theme_color '#f4f7f6', icons: icons/icon-192.png 192x192 image/png purpose any, icons/icon-512.png 512x512 image/png purpose any, icons/icon-maskable-512.png 512x512 image/png purpose maskable.
- index.html carries <link rel="manifest" href="manifest.webmanifest">, <meta name="theme-color" content="#f4f7f6"> and <link rel="apple-touch-icon" href="icons/icon-192.png">, with paths relative to the base.
- Layout: the app column has width 100% up to max-width 560 px and is centred with equal side margins on the #f4f7f6 page; no element may overflow it horizontally at any width from 360 px; the bottom buttons sit inside that column.
- Safe areas: the bottom buttons and the Saved message are offset by calc(20px + env(safe-area-inset-bottom)) from the bottom; screen heights use 100dvh.
- Touch targets: every button, link and chip is at least 44 px tall.
- Type and colour come from the final canvas: body background #f4f7f6 (rgb(244, 247, 246)), Manrope for the box amounts and titles, Source Sans 3 for body text.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The files are created by earlier values of this same Request and extended in place; no behaviour is moved, and the attribute contracts of earlier values are kept as constraints.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by earlier values of this Request and are only consumed here.

### Boundaries
- Driving port: The built bundle as Chrome loads it: the page, its manifest, icons and service worker, at several viewport widths.
- Driven port: None beyond the static origin; the service worker passes every request to the network.
- Dependency direction: index.html and main.ts reference public/ assets through the base path; nothing in src/ui depends on the manifest.
- Failure: Condition: The service worker cannot be registered (for example, an unsupported browser). | Outcome: Indeterminate | Observation: The app still works as a normal web page; registration errors are caught and not shown.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Every screen uses the light palette and fonts of the final canvas, fills the phone's width from 360 px upward with no horizontal scrolling, keeps the Send and Receive buttons clear of Android's gesture bar, and on wider screens stays a centred column no wider than 560 px; every button and chip is at least 44 px tall; the app can be added to the Android home screen from Chrome and then opens full-screen without the browser bar, with its own name and icon.

Stimulus: The acceptance support starts the stack, builds and serves the bundle, creates an account and seeds one USD send of 74000 cents to 'Mariyam Nisha' and one USD receive of 10000. Chromium opens and signs in at viewports 360 by 780, 412 by 915 and 1024 by 800, and at each width checks Home, the send form and the receive form. It also fetches the manifest and the icons from the served origin.

Expected: At every width and on every screen document.documentElement.scrollWidth is not greater than its clientWidth. At 360 and 412 the boxes and bottom buttons span the width minus the side margins; at 1024 the app column is at most 560 px wide and its left and right margins differ by at most 2 px, and the bottom buttons lie inside it. Every visible button, link and chip is at least 44 px tall. The served stylesheet contains env(safe-area-inset-bottom). The page has a manifest link and a theme-color meta of #f4f7f6; the manifest parses with name Abbaas Ledger, short_name Ledger, display standalone and icons of 192x192 and 512x512 including one with purpose maskable; each icon URL answers 200 as image/png with those pixel sizes; navigator.serviceWorker has a registration after load. The body's computed background is rgb(244, 247, 246) and the box amount's font-family begins with Manrope.

Falsifier: A fixed 390 px layout, a stretched 1,000 px column, a missing manifest or icon, a non-standalone display, or buttons under 44 px fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/layout-and-install.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
## Value 9: motion on open, save and balance change

### Purpose
Add the confirmed motion: forms grow as a circle from the tapped button, a saved entry arrives from its own side, the balance counts to its new value, a box drains while the other fills, and none of it happens when the device asks for reduced motion.

### Constraints
- Values 2 to 8 provide the forms, Home, the boxes and the entry list with their data attributes.
- Timings and curve are fixed by the brief: cubic-bezier(0.2, 0.8, 0.2, 1); about 160 ms number pops, 220 to 300 ms colour and chips, 360 to 520 ms entrances and the reveal, 700 to 900 ms balance count.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/motion.ts` | CREATE_NEW | Motion helpers: whether reduced motion is requested, the circle reveal from a point, the entry arrival from a side, and a count-up of a cents value over a duration with requestAnimationFrame; each marks its element with data-motion while running. |
| `src/ui/send-form.ts` | EXTEND | Opens with the circle reveal from the Send button's centre. |
| `src/ui/receive-form.ts` | EXTEND | Opens with the circle reveal from the Receive button's centre. |
| `src/ui/home.ts` | EXTEND | After a save, animates the new entry from its side, counts the boxes to the new balance and drains one box while filling the other when the holder changes. |
| `src/main.ts` | EXTEND | Passes the tapped button's centre and the balance before the save to the next screen so the motion starts from the right place and value. |
| `src/ui/theme.css` | EXTEND | Transition and clip-path styles for the motion. |

### Paradigm
functional

### Decisions
- Observable motion contract: while a motion runs its element carries data-motion with one of the values reveal (form root), enter (the new entry), count (a box whose amount is counting) or swap (both boxes while the holder changes); the attribute is removed when the motion ends. With prefers-reduced-motion: reduce, data-motion is never set and every screen shows its end state at once.
- Reveal: the form root starts with clip-path circle(30px at X Y), where X and Y are the tapped button's centre in viewport pixels, and grows to circle(150% at X Y) over 520 ms; then data-motion is removed and clip-path is none.
- Enter: on returning to Home after a save the new entry starts translated 44 px toward its own side (left for a send, right for a receive) at opacity 0 and settles to no transform and opacity 1 over 520 ms, starting about 380 ms after Home appears.
- Count: the holder's box amount counts from the balance before the save to the balance after it over 700 ms (900 ms for a swap); during the count the displayed amount is between the two values and data-amount already holds the final value.
- Swap: when a payment moves the balance to the other side, Abbaas's box counts down to $0 and turns empty while the owner's box fills and counts up, both over 900 ms.
- All motion uses transform, opacity and clip-path only, and finishes within 1.5 seconds of its start.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: The files are created by earlier values of this same Request and extended in place; no behaviour is moved, and the attribute contracts of earlier values are kept as constraints.

### Agreement analysis
Not applicable: The schema and the attribute contracts were fixed by earlier values of this Request and are only consumed here.

### Boundaries
- Driving port: The built bundle's DOM over time, with and without prefers-reduced-motion.
- Driven port: None; motion is local to the page.
- Dependency direction: home.ts and the forms depend on motion.ts; motion.ts depends only on the DOM.
- Failure: Condition: requestAnimationFrame does not run (for example, a hidden tab). | Outcome: Indeterminate | Observation: The motion completes on the next visible frame and the end state is the same as with reduced motion.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Opening Send or Receive grows the form as a circle from the tapped button's corner; returning after a save brings the new entry in from its own side and counts the balance to its new value, and a repayment larger than Abbaas held drains his box while the owner's fills; with the device set to reduce motion, each screen shows its end state at once.

Stimulus: The acceptance support creates an account with a person 'Mariyam Nisha' and one seeded USD send of 74000 cents. In a Chromium context at 360 by 780 without reduced motion it signs in, taps Send and samples the form root at once and after 1.5 s; types 500, picks Mariyam Nisha, saves, and samples Home at once and after 1.5 s; then taps Receive, samples, types 2000 and saves, and samples again. A second context with reducedMotion 'reduce' repeats the same steps.

Expected: Without reduced motion: right after tapping Send the form root carries data-motion="reveal" and a clip-path circle whose centre lies in the left half of the viewport, and after 1.5 s it has no data-motion; right after tapping Receive the centre lies in the right half. Right after the send is saved the new entry carries data-motion="enter" and the abbaas box carries data-motion="count" with data-amount="124000" while its text is not yet $1,240.00, and after 1.5 s neither attribute is present and the text reads $1,240.00. Right after the $2,000 receive is saved the boxes carry data-motion="swap", and after 1.5 s the you box is filled with $760.00 and the abbaas box is empty. With reduced motion no element ever carries data-motion, the form shows no clip-path right after opening, and right after each save the boxes already show $1,240.00 and then $760.00.

Falsifier: Motion that ignores prefers-reduced-motion, a reveal centred on the wrong side, a count that jumps straight to the final text, or motion that has not finished after 1.5 s fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/motion.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
## Refined board value 1: Home as on the refined board

### Purpose
Give Home the refined board's look: no title, the two boxes at the top, an Entries heading with the count, tinted entry cards with sends left of the centre line and payments right of it, and a fade above the bottom buttons.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites the oracle of version one's entry list (tests/acceptance/entry-list.spec.ts), whose sends sat right of the line; the new oracle replaces it at the same path.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | Drops the title, reshapes the boxes, adds the Entries heading and count, the tinted cards on the reversed sides and the fade. |
| `src/domain/ledger-view.ts` | EXTEND | Adds the count label ('No entries', '1 entry', 'N entries') and each entry's side (send left, receive right) as pure data. |
| `src/ui/theme.css` | EXTEND | Box, pill, heading, card, day-label and fade styles of the board's Main artboard. |

### Paradigm
functional

### Decisions
- Home has no title or heading above the boxes; the box row starts 24 px below the top of the screen (plus the safe-area inset) with 16 px side margins and a 10 px gap between the boxes.
- Each box is at least 136 px tall with 20 px radius and 14 px padding; its name pill ('You' / 'Abbaas', 28 px tall) sits in the box's outer top corner (top-left in the You box, top-right in the Abbaas box), and the amount and caption sit at the bottom aligned to that same outer edge. A filled amount is Manrope 800 34 px with its cents ('.00') in a span carrying data-cents at half that size; an empty box reads $0 at 24 px. The box element's text still reads e.g. '$490.00' end to end.
- Filled You box: background #e7eef7, ink #1b3f6e, pill #0d1f1c on #f4f7f6, caption 'have his money'. Filled Abbaas box: background #e0f0ed, ink #0b5750, pill #c9e4df on #0b5750, caption 'has your money'. Empty boxes: transparent with a 1.5 px dashed outline (rgba(36,80,138,0.35) / rgba(15,111,104,0.38)), ink #7c8c88, captions 'nothing of his' / 'nothing of yours'.
- The All square chip (data-square) reads 'All square · nobody owes anything', centred under the boxes.
- Totals line: 'You sent $X' at the left and 'He paid back $Y' at the right of one row, 13 px, #4c5f5b with the amounts in #0d1f1c; data-total keeps its values.
- Under the totals an h2 'Entries' (Manrope 800 17 px) sits at the left and the count label at the right of one row; the count element carries data-count and reads 'No entries', '1 entry' or 'N entries'.
- Day labels (data-day) are small pills centred on the line: Manrope 700 11 px, letter-spacing 0.08em, uppercase, #4c5f5b on #f4f7f6 with a 1 px #cfd9d6 border; today's reads 'Today · Mon 12 Oct'.
- Each entry row is a three-part row across the full width: the card, a 36 px column holding the 26 px round node on the centre line, and the after-balance text (data-after). A send's card is on the left of the line and its data-after on the right; a payment's card is on the right of the line and its data-after on the left. data-entry is on the card and each card lies wholly on its own half of the list.
- A card is a 14 px-radius box with 9 px by 12 px padding: send cards rgba(36,80,138,0.10), payment cards rgba(15,111,104,0.11); first line the USD amount in Manrope 800 17 px in the entry's colour (#24508a send, #0f6f68 payment); second line 'to <name>' (data-person) or 'from Abbaas' in 13 px 700; third line its detail ('Paid in USD' or 'MVR 10,000 at 20.00') in 12 px #4c5f5b. Send text aligns left, payment text aligns right. The node is the entry's colour with a white arrow, pointing right for a send and left for a payment.
- data-after reads 'Abbaas has $X', 'You have $X' or 'All square' in 12 px 600, #0b5750 / #1b3f6e / #4c5f5b.
- A fixed fade (data-fade, aria-hidden, pointer-events none) 150 px tall at the bottom of the screen runs from transparent to #f4f7f6 at 55 %, under the Send and Receive buttons, so entries scrolled behind the buttons are covered; the list ends with bottom padding so its last entry can scroll clear of the buttons.
- Width: these sizes hold from 360 px to the 560 px column; no horizontal scroll.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM after sign-in: Home.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails. | Outcome: Retry | Observation: Home shows the alert 'Could not load the ledger. Try again.' and neither box claims a balance.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: After several sends and repayments Home has no title, shows the boxes at the top with the pill in the outer corner, an Entries heading with the count, tinted entry cards with sends left of the centre line and payments right of it, the after-balance on the other side, and a fade above the bottom buttons.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account is seeded through the service role with people Mariyam Nisha and Ahmed Shifaz and entries over three days: a USD send of $250.00 to Mariyam Nisha, an MVR send of MVR 10,000 at 20 ($500.00) to Ahmed Shifaz, a $300.00 USD payment, and today a $340.00 USD send to Ahmed Shifaz.

Expected: There is no heading element above the boxes and no visible text 'Abbaas Ledger' on Home; the top of the you box is within 24 to 64 px of the top of the viewport. The abbaas box is filled with data-amount 79000 and text '$790.00', its pill 'Abbaas' lies in its top-right quarter, and its amount's right edge is within 20 px of the box's right edge; the you box is empty with its pill in its top-left quarter. An h2 'Entries' is visible and data-count reads '4 entries'. There are four data-entry cards; the two send cards with data-person Mariyam Nisha and Ahmed Shifaz on the earlier days and today's send each lie wholly in the left half of the list and the $300.00 payment card wholly in the right half; each card's background is the tinted colour of its kind; each row's data-after lies on the opposite half from its card and today's reads 'Abbaas has $790.00'. Day labels read in uppercase and today's contains 'TODAY'. Totals read You sent $1,090.00 and He paid back $300.00. An element with data-fade is present, at least 120 px tall, anchored to the bottom of the viewport, with pointer-events none.

Falsifier: Sends on the right, a title above the boxes, a missing Entries heading or count, centred amounts, or no fade fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-list.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
## Refined board value 2: Send form as on the refined board, in USD

### Purpose
Rebuild the blue send form to the refined board and drop the note field and the after-saving preview; a USD send lands on Home left of the centre line.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's send oracle (tests/acceptance/send-usd.spec.ts), whose save button was 'Save entry' and whose form had a note and a preview; the new oracle replaces it at the same path.
- Stored entries keep note null; the column stays in the schema.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/send-form.ts` | EXTEND | The board's SendMvr/SendUsd layout: top row, eyebrow and title, sliding currency switch, large amount, USD note, tick chips, dashed New person chip, date chip and white Send · $X button; no note and no preview. |
| `src/domain/send-draft.ts` | EXTEND | Drops the note and the preview balance; the draft becomes amount, currency, rate, person and date. |
| `src/ui/theme.css` | EXTEND | Styles of the reworked send form. |

### Paradigm
functional

### Decisions
- Form root data-form='send', background #24508a, white text, padding 16 px 20 px 20 px, a full-height column whose save button sits at the bottom (margin-top auto) above the safe-area inset.
- Top row: a 44 by 44 px Close button (aria-label 'Close', 14 px radius, rgba(255,255,255,0.14), white × icon) at the left and, at the right, the line 'Abbaas has $X of yours' / 'You have $X of his' / 'All square' in 13.5 px with the amount in bold white.
- Under it the eyebrow 'New entry · Send' (Manrope 800 12 px, uppercase, letter-spacing 0.1em, rgba(255,255,255,0.85)) above the h1 'Money sent for Abbaas' (Manrope 800 27 px).
- Currency switch: a group labelled 'Currency' (rgba(255,255,255,0.12), 16 px radius, 4 px padding) holding two 44 px buttons USD and MVR with aria-pressed, and a white pill element (data-pill, aria-hidden) under the pressed one that slides between halves in 300 ms; the pressed label is #1b3f6e, the other white. USD is pressed on open.
- Amount: label 'Amount sent' (13.5 px 600) over a row with the prefix (data-prefix: '$' at 32 px in USD, 'MVR' at 20 px in MVR, Manrope 800, rgba(255,255,255,0.85)) and the input (inputmode decimal, Manrope 800 44 px, letter-spacing -0.03em, white, no box) on a 2 px rgba(255,255,255,0.55) underline.
- In USD, under the amount, the line 'Dollars go straight onto the balance. No rate needed.' with an info icon, 13.5 px.
- Paid to: label 'Paid to' then wrapping chips 44 px tall, 999 px radius: one per saved person (data-person-chip, aria-pressed, ordered by name); the chosen one is white with #1b3f6e text and a tick icon that slides in before the name; the others rgba(255,255,255,0.14) with white text. A 'New person' chip with a 1.5 px dashed rgba(255,255,255,0.6) outline and a plus icon reveals the Name input and Add button of version one.
- Date: a chip 48 px tall, 14 px radius, rgba(255,255,255,0.12), white calendar icon and text 'Today, 12 Oct' (or 'Sat, 10 Oct' for another date, en-GB short weekday, day, short month). An input type=date labelled 'Date' lies over the whole chip, transparent, so tapping the chip opens the device's date picker; its value starts as today and the chip text follows it.
- Save: a white button 60 px tall, 20 px radius, #1b3f6e text, Manrope 800 17 px, an up-right arrow and the accessible name 'Send · $250.00' (the USD value as typed or worked out; 'Send · $0.00' while empty); disabled until the amount is above zero and a person is chosen.
- There is no input labelled 'Note', no data-preview-box and no 'After saving' text anywhere on the form.
- A saved USD send stores kind send, currency USD, amount_minor = usd_cents, rate null, note null, entry_date from the Date input, person_id and person_name as chosen; Home then shows it left of the centre line.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM: Home's Send button, the send form and Home after saving.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'
- Failure: Condition: The amount is empty, zero or not a number, the rate is missing in MVR, or no person is chosen on a send. | Outcome: Refusal | Observation: The white save button is disabled and nothing is stored.
- Failure: Condition: Adding a new person fails. | Outcome: Retry | Observation: The name input keeps the typed name and shows 'Could not add this person. Try again.'

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping Send opens the blue form as on the refined board, with no note field and no after-saving preview; a USD send saved with 'Send · $250.00' appears on Home left of the centre line.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has one saved person 'Mariyam Nisha' and no entries. It taps Send, keeps USD, types 250.00, taps the Mariyam Nisha chip and taps 'Send · $250.00'. Then it taps Send again, taps New person, types 'Ahmed Shifaz', taps Add, types 100, sets the Date input to yesterday and taps 'Send · $100.00'.

Expected: The form (data-form send) has a Close button, the text 'New entry · Send' and the heading 'Money sent for Abbaas'; USD is pressed and the data-pill element lies over the USD button; data-prefix reads '$'; the line 'Dollars go straight onto the balance. No rate needed.' is visible; there is no element labelled Note, no data-preview-box and no text 'After saving'. The Date input's value is today and the visible chip text starts with 'Today, '. The input labelled 'Amount sent' has a computed font-size of 44px. Before a person is chosen the button named 'Send · $250.00' is disabled; after tapping Mariyam Nisha that chip has aria-pressed true and a visible tick icon and the button is enabled. After saving, Home shows one data-entry card wholly in the left half with $250.00 and Mariyam Nisha, and the abbaas box reads data-amount 25000. After the second save the date chip had read yesterday's weekday before saving; Home shows two cards, both in the left half, and the abbaas box reads 35000. Read through the service role, both entries are kind send, currency USD, rate null, note null, amount_minor equal to usd_cents (25000 and 10000), the first dated today and the second yesterday, with person_name Mariyam Nisha and Ahmed Shifaz.

Falsifier: A note field, a preview, a 'Save entry' button, a send placed right of the line, or a date chip that does not follow the date input fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-usd.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
## Refined board value 3: Send in MVR on the refined board

### Purpose
In the reworked send form, MVR slides the pill and opens the rate card beside the white In dollars card; the save button and the stored entry carry the worked-out dollars.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's MVR oracle (tests/acceptance/send-mvr.spec.ts) at the same path.
- Value 2 of this Request supplies the reworked form; this value adds the MVR state.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/send-form.ts` | EXTEND | The MVR state: pill on MVR, prefix MVR, the rate card and the In dollars card, the USD note hidden. |
| `src/ui/theme.css` | EXTEND | Rate and In dollars card styles and the open/close of the rate row. |

### Paradigm
functional

### Decisions
- Tapping MVR sets its aria-pressed, slides data-pill under it, changes data-prefix to 'MVR' at 20 px and hides the USD note.
- Under the amount a row of two equal cards opens (max-height and opacity, 380 ms): left a card with a 1.5 px rgba(255,255,255,0.4) border on rgba(255,255,255,0.12), 16 px radius, holding the label 'Rate · MVR per $1' (13 px 600) and its input (inputmode decimal, Manrope 800 24 px, white); right a white card holding 'In dollars' (13 px 600, #3d5f8a) and an output carrying data-usd (Manrope 800 24 px, #1b3f6e) that shows the amount divided by the rate, rounded half up to the cent, as $1,234.56.
- The USD value pops (scale 1.06, 160 ms) when it changes; with reduced motion it does not.
- The save button's name follows the worked-out value: 'Send · $500.00' for MVR 10,000 at 20.
- Switching back to USD closes the rate row, shows the USD note and the button follows the typed dollars.
- A saved MVR send stores currency MVR, amount_minor in laari, the rate as typed, usd_cents as worked out, note null; its card on Home reads $500.00 with the detail 'MVR 10,000 at 20.00'.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM: the send form in MVR and Home after saving.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'
- Failure: Condition: The amount is empty, zero or not a number, the rate is missing in MVR, or no person is chosen on a send. | Outcome: Refusal | Observation: The white save button is disabled and nothing is stored.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Switching to MVR slides the pill and opens the rate card beside the white In dollars card; MVR 10,000 at 20.00 shows $500.00 and Send · $500.00; saving stores the MVR amount, rate and USD value and the card reads MVR 10,000 at 20.00 under $500.00.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has one saved person 'Ahmed Shifaz' and no entries. It taps Send, taps MVR, types 10,000 in Amount sent and 20 in the input labelled 'Rate · MVR per $1', taps Ahmed Shifaz and taps 'Send · $500.00'.

Expected: After tapping MVR, MVR has aria-pressed true, data-pill lies over the MVR button, data-prefix reads 'MVR', the USD note is not visible, and an input labelled 'Rate · MVR per $1' and the text 'In dollars' are visible side by side (same row, the In dollars card to the right with a white background). After typing, data-usd reads $500.00 and a button named 'Send · $500.00' is enabled. After saving, Home shows one data-entry card in the left half containing $500.00 and 'MVR 10,000 at 20.00', and the abbaas box reads data-amount 50000. Read through the service role the entry is currency MVR, amount_minor 1000000, rate 20, usd_cents 50000, note null, person_name Ahmed Shifaz.

Falsifier: A rate field under a different label, a missing In dollars card, a wrong dollar value or button name, or a send placed right of the line fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-mvr.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
## Refined board value 4: Receive form as on the refined board

### Purpose
Rebuild the teal receive form to the refined board, without quick amounts, note field, after-saving preview or over-payment note; a payment lands right of the centre line and an over-payment moves the balance to the owner's box.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's receive oracle (tests/acceptance/receive.spec.ts) at the same path.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/receive-form.ts` | EXTEND | The board's Receive layout: top row, eyebrow and title, sliding currency switch, large amount, rate cards in MVR, date chip and white Receive · $X button; no quick amounts, note, preview or over-payment note. |
| `src/domain/receive-draft.ts` | EXTEND | Drops the quick amounts, the note and the preview; the draft becomes amount, currency, rate and date. |
| `src/ui/theme.css` | EXTEND | Styles of the reworked receive form. |

### Paradigm
functional

### Decisions
- Form root data-form='receive', background #0f6f68, white text, the same frame as the send form: Close button and the 'Abbaas has $X of yours' line on top, eyebrow 'New entry · Receive', h1 'Payment from Abbaas', the Currency group with data-pill (pressed label #0b5750), label 'Amount received' with data-prefix and the 44 px input.
- In MVR the same rate row as the send form: 'Rate · MVR per $1' card and the white 'In dollars' card (label #235f59, output data-usd #0b5750).
- Date chip and transparent input type=date labelled 'Date' exactly as on the send form.
- Save: white 60 px button, #0b5750 text, a down-left arrow, accessible name 'Receive · $300.00' following the USD value; disabled until the amount is above zero (and a rate is given in MVR).
- There is no data-quick element, no 'All of it' text, no input labelled 'Note', no data-preview-box, no 'After saving' text and no data-receive-note.
- A saved payment stores kind receive, the currency, amount, rate and usd_cents, note null, person null; its card on Home lies right of the centre line. A payment larger than Abbaas holds empties his box and fills the You box with the difference and 'have his money'; a payment equal to what he holds leaves both boxes empty with the All square chip.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM: Home's Receive button, the receive form and Home after saving.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'
- Failure: Condition: The amount is empty, zero or not a number, or the rate is missing in MVR. | Outcome: Refusal | Observation: The white Receive button is disabled and nothing is stored.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping Receive opens the teal form as on the refined board without quick amounts, note, preview or over-payment note; a payment lands right of the centre line, an over-payment fills the owner's box with the difference, and an exact payment shows All square.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account is seeded with person Mariyam Nisha and one USD send of $740.00 to her. It taps Receive, types 300 and taps 'Receive · $300.00'; taps Receive, types 440 and taps 'Receive · $440.00'; then taps Receive, types 200 and taps 'Receive · $200.00'.

Expected: The form (data-form receive) shows 'New entry · Receive', the heading 'Payment from Abbaas', the line 'Abbaas has $740.00 of yours', USD pressed with data-pill over it, the input labelled 'Amount received' with a computed font-size of 44px, and the Date input set to today with a visible chip starting 'Today, '; there is no data-quick element, no text 'All of it', no element labelled Note, no data-preview-box, no 'After saving' text and no data-receive-note, both before typing and with an amount larger than he holds typed. After the first save the payment card lies wholly in the right half of the list and the abbaas box reads data-amount 44000. After the second save both boxes are empty and the All square chip is shown. After the third save the you box is filled with data-amount 20000, the text '$200.00' and 'have his money', and the abbaas box is empty. Read through the service role there are three receive entries, all currency USD, rate null, note null, person_name null, with usd_cents 30000, 44000 and 20000.

Falsifier: Quick amounts, a note, a preview or an over-payment note on the form, a payment placed left of the line, or a wrong balance after an over-payment fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/receive.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
## Refined board value 5: Saved message and Undo on the refined board

### Purpose
Show the board's dark Saved message above the bottom buttons after a save, with Undo restoring the ledger.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's Undo oracle (tests/acceptance/undo.spec.ts) at the same path; it saves through the reworked forms of values 2 to 4.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | The Saved message as on the board. |
| `src/ui/theme.css` | EXTEND | Saved message styles. |

### Paradigm
functional

### Decisions
- The Saved message (data-saved-message, role status) is a dark bar: background #0d1f1c, white text, 16 px radius, 4 px 6 px 4 px 12 px padding, shadow, 16 px from each side, its bottom edge above the top of the Send and Receive buttons (bottom 96 px plus the safe-area inset).
- It starts with a 26 px round #29b3a6 tick badge, then the text 'Saved. Abbaas now has $X of yours.', 'Saved. You now have $X of his.' or 'Saved. All square.' in 14 px 600, then an Undo button (44 px tall, no background, #7fe0d4, 14 px 700).
- Undo removes the saved entry from the store, the list and the boxes, which return to the balance before it, and the message goes; a failed removal keeps everything and shows 'Could not undo. Try again.' (data-undo-error).
- The message is shown only on the Home reached by that save; a reload or opening a form ends it.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM: the send form, Home after saving and its Saved message.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Removing the entry fails. | Outcome: Retry | Observation: The entry, the boxes and the message stay, and 'Could not undo. Try again.' is shown.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Right after a save a dark Saved message with a tick says who now holds how much and offers Undo above the bottom buttons; Undo removes the entry and the boxes return to the balance before it.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has one saved person Mariyam Nisha and one USD send of $400.00 to her. It taps Send, types 100, taps Mariyam Nisha and taps 'Send · $100.00'; it then taps Undo.

Expected: After the save a data-saved-message element with role status is visible, its computed background is rgb(13, 31, 28), it contains a tick badge and the text 'Saved. Abbaas now has $500.00 of yours.', and its bottom edge is above the top edge of the data-action send and receive buttons; the abbaas box reads data-amount 50000 and there are two data-entry cards. After tapping Undo (a button at least 44 px tall) the message is gone, there is one data-entry card, the abbaas box reads data-amount 40000, and the service role reads one entry.

Falsifier: A message that overlaps the buttons, wrong words, or an Undo that leaves the entry stored fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/undo.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
## Refined board value 6: Save motion: Home grows from the form's button

### Purpose
Make saving play the board's SaveSend/SaveReceive motion: the white button is pressed, Home grows as a circle from its centre over the dimmed form, then only the new entry arrives from its own side, the balance counts and the Saved message rises.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's motion oracle (tests/acceptance/motion.spec.ts) at the same path, which had entries arriving from the other side and Home replacing the form at once.
- Motion curve cubic-bezier(0.2, 0.8, 0.2, 1); with prefers-reduced-motion nothing animates and data-motion is never set.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/motion.ts` | EXTEND | Adds the grow of Home from a point over a dimmed layer, and turns the new entry's arrival to come from its own side. |
| `src/main.ts` | EXTEND | After a successful save keeps the form mounted under a dim layer, mounts Home above it growing from the save button's centre, and removes the form when Home fills the screen. |
| `src/ui/home.ts` | EXTEND | Marks the new entry with a ring in its colour and delays the Saved message until the entry and the count have landed. |
| `src/ui/send-form.ts` | EXTEND | Passes the save button's centre with a successful save and shows its pressed state. |
| `src/ui/receive-form.ts` | EXTEND | The same for the receive form. |
| `src/ui/theme.css` | EXTEND | Pressed state, dim layer and ring styles. |

### Paradigm
functional

### Decisions
- On a successful save the save button shows a pressed state (a 16 % dark overlay, 120 ms) and the form stays mounted under a dim layer (rgba(13,31,28,0.3), fading in over 320 ms).
- Home is mounted above them with data-motion='grow' and clip-path circle(R at X Y) where X Y is the centre of the save button in Home's box; R steps from 0 to past the screen's far corner over 520 ms; at the end the clip-path is removed, data-motion is dropped and the form and dim layer leave the DOM. The back button state is as in version one (the form's hash is gone).
- Once Home fills the screen, only the new entry animates: it carries data-motion='enter' and starts translated 44 px toward its own side and scaled 0.94 (a send from the left, translateX(-44px); a payment from the right, translateX(44px)), arriving over 520 ms; its card has a 2 px ring in its colour (#24508a send, #0f6f68 payment) that stays until the next screen. A new day group opens its space (max-height) so older entries move down rather than jump.
- The holder's box counts from the balance before the save to the one after (data-motion='count', 700 ms); when the holder changes both boxes carry data-motion='swap' for 900 ms while his box drains and the owner's fills.
- The Saved message appears only after the entry has landed and the count has finished (its opacity rises from 0 with a 18 px rise over 280 to 420 ms).
- With prefers-reduced-motion: reduce, saving shows Home in its end state at once, with no data-motion at any time, no clip-path and the Saved message visible immediately.
- Opening a form keeps version one's circle reveal from the tapped button.
- A counting box keeps value 1's structure on every frame: the whole-dollar part and the data-cents span are written separately, so the cents stay at half size while counting and after it ends.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM during and after a save.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping the white button on a form presses it, then Home grows as a circle from that button's centre over the dimmed form; only the new entry moves, arriving from its own side with a ring, the balance counts, an over-payment drains his box while the owner's fills, and the Saved message rises last; with reduce motion Home shows its end state at once.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has person Mariyam Nisha and one USD send of $400.00. Test A (normal motion): it opens Send, types 100, taps Mariyam Nisha and taps 'Send · $100.00', sampling the DOM every animation frame. Test B, on a fresh account seeded the same way: it opens Receive, types 600 and taps 'Receive · $600.00', sampling likewise. Test C uses a context with reducedMotion 'reduce' on a fresh account and repeats test A.

Expected: Test A: right after the tap Home's root carries data-motion 'grow' while the send form is still in the DOM, and its computed clip-path is a circle whose centre is within 4 px of the centre the save button had; within 900 ms of the tap the form is gone and Home's root has no clip-path and no data-motion. The new entry (the $100.00 card) carries data-motion 'enter' with a transform whose x translation is negative at its first sample, and the abbaas box carries data-motion 'count'; the card has a 2 px border in rgb(36, 80, 138). The data-saved-message element is not visible (or has opacity 0) while either data-motion is present, and is visible within 2.5 s of the tap. Test B: the new payment card's first sampled x translation is positive, both boxes carry data-motion 'swap', and at the end the you box reads data-amount 20000. Test C: no element ever carries data-motion, Home's root never has a clip-path, and the Saved message and the abbaas box data-amount 50000 are visible on the first frame Home is shown.

Falsifier: Home replacing the form without a grow from the button, an entry arriving from the wrong side, a Saved message shown before the entry lands, or any motion under reduce fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/motion.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
## Refined board value 7: Entrances: Home on open and the form's rows

### Purpose
Play the board's entrances: on opening the app the boxes rise, the balance counts up from $0, the centre line draws down and the entries slide in from their own sides; on opening a form a ripple shows on the tapped button and the form's rows rise in after the colour fills the screen.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- The oracle is a new file tests/acceptance/entrances.spec.ts.
- Only transform, opacity, clip-path and scaleY are animated; reduced motion shows end states at once.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/motion.ts` | EXTEND | Adds Home's first-open entrance, the button ripple and the staggered rise of a form's rows. |
| `src/ui/home.ts` | EXTEND | Marks the boxes, the centre line and the entries for the entrance on a fresh open (not on the Home reached by a save). |
| `src/ui/send-form.ts` | EXTEND | Marks its rows for the staggered rise. |
| `src/ui/receive-form.ts` | EXTEND | Marks its rows for the staggered rise. |
| `src/main.ts` | EXTEND | Plays Home's entrance only on the first Home after load or sign-in and after closing a form without saving; plays the ripple on the tapped button. |
| `src/ui/theme.css` | EXTEND | Ripple and entrance styles. |

### Paradigm
functional

### Decisions
- Home's first-open entrance (data-motion='home-enter' on Home's root while it runs, at most 1.6 s): the boxes rise from translateY(12px) scale(0.97) and fade in (320/460 ms, the Abbaas box 70 ms after the You box); the holder's amount counts up from $0 to the balance over 700 ms starting at 250 ms; the centre line (data-spine) scales from 0 to 1 in Y from its top over 640 ms after 200 ms; each entry slides in from its own side (a send from translateX(-28px), a payment from translateX(28px)) and fades in, 70 ms apart starting at 260 ms; the totals and Entries heading fade in; the bottom buttons rise 24 px and fade in after 180 ms.
- Opening a form: a white ripple (120 px circle, rgba(255,255,255,0.55)) scales from 0.2 to 1.4 and fades over 360 ms at the tapped button's centre (data-ripple, aria-hidden), the circle reveal of version one runs, and the form's rows (each carrying data-row) rise from translateY(16px) and fade in, 45 ms apart starting 240 ms after the reveal starts.
- The Home reached by a save plays only value 6's motion, not this entrance.
- With prefers-reduced-motion: reduce none of this runs: no data-motion, no data-ripple, every element in its end state from the first frame.
- Nothing in an entrance ever extends past the screen's edges: the entries area clips horizontally (overflow-x: clip, with no clip vertically), so a card sliding 28 px in from its side is cut at the list's edge rather than widening the page; this keeps version one's no-horizontal-overflow check true on every frame from 360 px.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM on opening the app and a form.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails. | Outcome: Retry | Observation: Home shows the alert 'Could not load the ledger. Try again.' and neither box claims a balance.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Opening the app plays Home's entrance: boxes rise, the balance counts up from $0, the centre line draws down and entries slide in from their own sides; opening a form shows a ripple on the button and its rows rise in one after another; with reduce motion everything shows at once.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account is seeded with person Mariyam Nisha, a $500.00 USD send to her yesterday and a $200.00 USD payment today. Test A loads the app after sign-in by reloading Home and samples every animation frame; then it taps Send and samples. Test B repeats both with reducedMotion 'reduce'.

Expected: Test A: on the reload Home's root carries data-motion 'home-enter'; the abbaas box's displayed amount is below $300.00 at an early sample and reads $300.00 at the end; the data-spine element's transform starts with a Y scale below 1 and ends at none or scale 1; the send card's first sampled x translation is negative and the payment card's positive; within 1.6 s no data-motion remains. After tapping Send a data-ripple element appears near the Send button's centre, at least four data-row elements in the form have opacity below 1 at an early sample and reach opacity 1 in top-to-bottom order of their start, and within 1.2 s none remains below 1. Test B: no element ever carries data-motion or data-ripple; the abbaas box reads $300.00 and every data-row has opacity 1 on the first sampled frame.

Falsifier: No entrance on open, entries arriving from the wrong side, rows appearing all at once, or any motion under reduce fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entrances.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
## Refined board value 8: layout and install hold after the entrances

### Purpose
Keep version one's layout and install guarantees true on the refined board, measured once each screen's entrance has finished.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's layout oracle (tests/acceptance/layout-and-install.spec.ts) at the same path: it measured Home and the forms the moment they appeared, which value 7's entrances now animate.
- Value 7's entrances move cards 28 px and rows 16 px while data-motion is present; every measurement waits until no element carries data-motion.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/theme.css` | EXTEND | Holds the column, safe-area and touch-target rules; changed only if a measurement at rest fails. |

### Paradigm
functional

### Decisions
- Every check of version one's layout value stands unchanged (360 px to 560 px column, no horizontal scroll, no element past the viewport's edges, Send and Receive above env(safe-area-inset-bottom), every button, chip and link at least 44 px tall, manifest name 'Abbaas Ledger', short name 'Ledger', display standalone, 192/512/maskable icons), applied to the refined board's screens: Home, the send form in USD and in MVR, and the receive form.
- A screen is measured only at rest: after it appears, wait until no element carries data-motion, and for a form until its currency pill has reached the pressed half.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM: the send form, Home after saving and its Saved message.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails. | Outcome: Retry | Observation: Home shows the alert 'Could not load the ledger. Try again.'

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Once each screen's entrance has played, every screen of the refined board fills the phone's width from 360 px upward with no horizontal scrolling and no element past the screen's edge, keeps the Send and Receive buttons clear of Android's gesture bar, stays a centred column no wider than 560 px on wider screens, keeps every button and chip at least 44 px tall, and the app still installs on Android with its own name and icon.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with a person and a few sends and payments through the service role. A Chromium context signs in at 360 by 780 and walks Home, the send form (USD, then MVR) and the receive form at widths 360, 390, 412 and 800 px, waiting before each measurement until no element carries data-motion; it also fetches the web app manifest and its icons.

Expected: At every width and on every screen, measured at rest: document scrollWidth is no larger than clientWidth and no visible element's box extends past the viewport's left or right edge; at 800 px the boxes and bottom buttons lie within a centred column at most 560 px wide; the Send and Receive buttons' bottoms are at least 16 px above the viewport bottom; every visible button, chip and link is at least 44 px tall; the manifest has name 'Abbaas Ledger', short_name 'Ledger', display 'standalone' and icons of 192 and 512 px including a maskable one, and each icon URL loads as a PNG.

Falsifier: Horizontal scrolling, an element past the edge at rest, a column wider than 560 px, a touch target under 44 px, or a missing manifest field fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/layout-and-install.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
## Refined board value 5: no Saved message and no Undo after a save

### Purpose
Remove the Saved message and its Undo from Home: after a save the new entry's ringed card arriving on its own side is the only feedback.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites the oracle at tests/acceptance/undo.spec.ts, which asserted the Saved message and Undo; the new oracle asserts their absence at the same path.
- LedgerStore.removeEntry and its Supabase adapter stay, unused by the UI, for a later delete feature.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | Drops the Saved message, its tick, its sentence, the Undo button and the undo error. |
| `src/main.ts` | EXTEND | Drops the onUndo wiring; keeps the just-saved entry id and balance-before that value 6's arrival and count use. |
| `src/ui/motion.ts` | EXTEND | Drops the Saved message's held/shown rise. |
| `src/ui/theme.css` | EXTEND | Drops the Saved message, tick, Undo and undo-error styles. |

### Paradigm
functional

### Decisions
- Home never renders a data-saved-message element, a role=status save message, the words 'Saved.' or an Undo control, after a save or at any other time.
- After a save the new entry's card carries the 2 px ring in its colour (value 6) and arrives from its own side; that is the whole feedback.
- The saved entry stays stored; reloading shows it with no message and no ring.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM: the send form, Home after saving and its Saved message.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: After a save there is no Saved message and no Undo anywhere on Home: the new entry's card, arriving on its own side of the centre line with a ring in its colour, is the only feedback, and the stored entry stays stored.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha and one USD send of $400.00 through the service role; a Chromium context at 390 by 844 signs in. It taps Send, types 100, taps Mariyam Nisha and taps 'Send · $100.00'; it waits until no element carries data-motion; it then opens Receive, types 50 and taps 'Receive · $50.00', waits again, and reloads.

Expected: After each save Home shows no element with data-saved-message, no role=status element containing 'Saved', no visible text 'Saved.', and no button or link named Undo; the new entry's card (the $100.00 card, then the $50.00 card) has a 2 px border in its kind's colour (rgb(36, 80, 138) for the send, rgb(15, 111, 104) for the payment) and lies on its own half; the abbaas box reads data-amount 50000 after the send and 45000 after the payment. After the reload there is still no Saved message or Undo, no card carries the ring, there are three data-entry cards, and the service role reads three entries.

Falsifier: Any Saved message, any Undo control, a missing ring on the new card, or a save that is not stored fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/undo.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
## Refined board value 6: save motion with an uncut ring and no Saved message

### Purpose
Make saving play the board's SaveSend/SaveReceive motion: the white button is pressed, Home grows as a circle from its centre over the dimmed form, then only the new entry arrives from its own side with an uncut ring and the balance counts.

### Constraints
- The visual reference is the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi as read on 2026-10-12; the app matches it exactly, light theme only.
- The attribute contract fixed by version one stays in force unless a decision below changes it: data-box (you/abbaas) with data-state and data-amount, data-square, data-empty-hint, data-total, data-day, data-entry, data-person, data-after, data-action (send/receive), data-saved-message, data-form (send/receive), data-person-chip, data-prefix, data-usd and data-motion.
- This rewrites version one's motion oracle (tests/acceptance/motion.spec.ts) at the same path, which had entries arriving from the other side and Home replacing the form at once.
- Motion curve cubic-bezier(0.2, 0.8, 0.2, 1); with prefers-reduced-motion nothing animates and data-motion is never set.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/motion.ts` | EXTEND | Adds the grow of Home from a point over a dimmed layer, and turns the new entry's arrival to come from its own side. |
| `src/main.ts` | EXTEND | After a successful save keeps the form mounted under a dim layer, mounts Home above it growing from the save button's centre, and removes the form when Home fills the screen. |
| `src/ui/home.ts` | EXTEND | Marks the new entry with a ring in its colour and delays the Saved message until the entry and the count have landed. |
| `src/ui/send-form.ts` | EXTEND | Passes the save button's centre with a successful save and shows its pressed state. |
| `src/ui/receive-form.ts` | EXTEND | The same for the receive form. |
| `src/ui/theme.css` | EXTEND | Pressed state, dim layer and ring styles. |

### Paradigm
functional

### Decisions
- On a successful save the save button shows a pressed state (a 16 % dark overlay, 120 ms) and the form stays mounted under a dim layer (rgba(13,31,28,0.3), fading in over 320 ms).
- Home is mounted above them with data-motion='grow' and clip-path circle(R at X Y) where X Y is the centre of the save button in Home's box; R steps from 0 to past the screen's far corner over 520 ms; at the end the clip-path is removed, data-motion is dropped and the form and dim layer leave the DOM. The back button state is as in version one (the form's hash is gone).
- Once Home fills the screen, only the new entry animates: it carries data-motion='enter' and starts translated 44 px toward its own side and scaled 0.94 (a send from the left, translateX(-44px); a payment from the right, translateX(44px)), arriving over 520 ms; its card has a 2 px ring in its colour (#24508a send, #0f6f68 payment) that stays until the next screen. A new day group opens its space (max-height) so older entries move down rather than jump.
- The holder's box counts from the balance before the save to the one after (data-motion='count', 700 ms); when the holder changes both boxes carry data-motion='swap' for 900 ms while his box drains and the owner's fills.
- With prefers-reduced-motion: reduce, saving shows Home in its end state at once, with no data-motion at any time, and no clip-path.
- Opening a form keeps version one's circle reveal from the tapped button.
- A counting box keeps value 1's structure on every frame: the whole-dollar part and the data-cents span are written separately, so the cents stay at half size while counting and after it ends.
- The new entry's ring is drawn inside its card (an inset 2 px box-shadow in its colour, or a border inside the card's box), so value 7's horizontal clip of the entries area never cuts it at the screen edge.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|

### Prefactoring
Not applicable: Version one's modules are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape of version one is kept.

### Boundaries
- Driving port: The built bundle's DOM during and after a save.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on the domain modules and port types; the Supabase adapter depends on the port; main.ts composes them.
- Failure: Condition: Saving the entry fails because the server cannot be reached. | Outcome: Retry | Observation: The form stays open with every typed value and shows 'Could not save. Try again.'

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping the white Send or Receive button on a form presses it, then Home grows as a circle from that button's centre over the dimmed form; once Home fills the screen only the new entry moves, arriving from its own side (a send from the left, a payment from the right) with a ring in its colour that is never cut off, the balance counts to its new value, and a payment larger than Abbaas held drains his box while the owner's fills; with the device set to reduce motion, Home shows its end state at once.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has person Mariyam Nisha and one USD send of $400.00. Test A (normal motion): it opens Send, types 100, taps Mariyam Nisha and taps 'Send · $100.00', sampling the DOM every animation frame. Test B, on a fresh account seeded the same way: it opens Receive, types 600 and taps 'Receive · $600.00', sampling likewise. Test C uses a context with reducedMotion 'reduce' on a fresh account and repeats test A.

Expected: Test A: right after the tap Home's root carries data-motion 'grow' while the send form is still in the DOM, and its computed clip-path is a circle whose centre is within 4 px of the centre the save button had; within 900 ms of the tap the form is gone and Home's root has no clip-path and no data-motion. The new entry (the $100.00 card) carries data-motion 'enter' with a transform whose x translation is negative at its first sample, and the abbaas box carries data-motion 'count'; the card shows a 2 px ring in rgb(36, 80, 138) (border or inset box-shadow) whose whole box lies inside the viewport and inside the entries area at rest. Test B: the new payment card's first sampled x translation is positive, both boxes carry data-motion 'swap', and at the end the you box reads data-amount 20000. Test C: no element ever carries data-motion, Home's root never has a clip-path, and the abbaas box data-amount 50000 is visible on the first frame Home is shown.

Falsifier: Home replacing the form without a grow from the button, an entry arriving from the wrong side, a ring cut off at the edge, or any motion under reduce fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/motion.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
## Delete value 1: tapping an entry card opens its sheet

### Purpose
Let the owner open any entry from Home and read it as recorded in a sheet that carries Delete and Close, without changing anything yet.

### Constraints
- The refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi draws no delete; the sheet uses the app's own tokens in src/ui/theme.css (page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a, Abbaas teal #0f6f68, hairline #cfd9d6, Manrope for titles and figures, Source Sans 3 for text, the one curve --curve). Light theme only.
- The attribute contract integrated at db986eb stays in force: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-action (send/receive), data-form, data-person-chip, data-prefix, data-usd and data-motion. Every existing acceptance spec keeps passing.
- Entry cards keep their role and accessible name: a card is NOT given role=button, so no existing getByRole('button') lookup changes meaning. It is made tappable with a click listener, tabindex=0, aria-haspopup=dialog and cursor pointer; Enter and Space on a focused card open the sheet too.
- No schema, policy, migration or Supabase change: the existing LedgerStore.removeEntry and its PostgREST adapter, under the entries_delete_own policy, are the only delete path.
- Value 1 adds the sheet and its Close paths only; tapping Delete in value 1 may already open the confirmation, but value 1's oracle asserts nothing about deleting.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/entry-sheet.ts` | CREATE_NEW | The entry sheet as a function from an entry and handlers to DOM: details, Delete, Close, the dimmed scrim; it imports only port types and the money formatters. |
| `src/ui/home.ts` | EXTEND | Makes each data-entry card tappable and reports which entry was tapped through a handler; Home renders nothing else new. |
| `src/main.ts` | EXTEND | Routes #entry/<id> to Home with that entry's sheet open, pushes that hash on a card tap so Android's back button closes the sheet, and closes it on Close or a scrim tap. |
| `src/ui/motion.ts` | EXTEND | The sheet's rise and fall and the scrim's fade on --curve, marked with data-motion while they run, skipped under reduced motion. |
| `src/ui/theme.css` | EXTEND | The sheet, scrim, detail rows and the Delete and Close buttons in the app's tokens. |

### Paradigm
functional

### Decisions
- The sheet is one element with role=dialog, aria-modal=true, aria-labelledby its title and data-entry-sheet set to the entry's id; it is appended to Home's screen above a full-screen scrim element carrying data-sheet-scrim, coloured rgba(13, 31, 28, 0.42).
- The sheet is white, anchored to the bottom of the column (the same 560 px centred column as the app, full width on a phone), with 24 px top corners, 20 px side padding and room for Android's gesture bar below its buttons.
- Its title (Manrope 800) reads 'Sent for Abbaas' for a send and 'Paid back by Abbaas' for a payment, with a small dot in the entry's colour (blue for a send, teal for a payment) beside it.
- Under the title the dollar amount is shown large (Manrope 800, 34 px) in the entry's colour, formatted as on Home, e.g. '$500.00', in an element with data-sheet-usd.
- Detail rows follow, each a muted label and an ink value, separated by hairlines: for an MVR entry 'Amount' 'MVR 10,000' (data-sheet-mvr) and 'Rate' '20.00 MVR per $1' (data-sheet-rate); for a send 'Paid to' and the person's name as recorded (data-sheet-person); always 'Date' and the day as Home labels it, e.g. 'Today · Tue 13 Oct' (data-sheet-date). A USD entry has no Amount or Rate row; a payment has no Paid to row.
- At the foot sit two full-width buttons, each at least 52 px tall with 20 px radius: 'Delete' in red (#b3261e background, white Manrope 700 text) and under it 'Close' as a plain button with ink text on the page colour.
- A tap on an entry card opens its sheet; sets location.hash to '#entry/<id>' through the ordinary history (a pushed entry), so Android's back button closes the sheet and leaves Home in place; loading '#entry/<id>' directly shows Home with that sheet open, and an unknown id shows Home with no sheet.
- Close, a tap on the scrim and the back button all close the sheet and return the hash to Home's; nothing is written and Home's count, boxes and totals are unchanged. Escape closes it too.
- Opening the sheet plays no Home entrance and no save motion: Home under it stays exactly as it was. The sheet rises 24 px and fades in while the scrim fades in over 280 ms on --curve; closing reverses it over 200 ms; each moving element carries data-motion while it moves and none remains once the sheet rests or is gone. Under reduced motion it appears and disappears at once.
- Focus moves into the sheet when it opens (to Close) and back to the tapped card when it closes.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| formatUsdCents | `src/domain/money.ts:40` | REUSE | formatUsdCents and the MVR formatting the cards already use. |
| dayLabel | `src/domain/ledger-view.ts:91` | REUSE | The day label Home already prints, so the sheet's Date reads the same. |
| prefersReducedMotion | `src/ui/motion.ts:131` | EXTEND | The data-motion convention and reduced-motion check every other motion uses. |

### Prefactoring
Not applicable: The sheet is a new module beside the forms; Home only gains a tap handler.

### Agreement analysis
Not applicable: No schema or port change in value 1.

### Boundaries
- Driving port: The built bundle's DOM: Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read over PostgREST under row-level security.
- Dependency direction: src/ui/entry-sheet.ts depends on port types and domain formatters only; main.ts composes it with Home and the store.
- Failure: Condition: The hash names an entry id that is not in the read ledger. | Outcome: Refusal | Observation: Home is shown with no sheet and no error.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping an entry card on Home opens a sheet that rises over the dimmed Home and shows that entry as recorded: Sent for Abbaas or Paid back by Abbaas, its dollar amount, in MVR the rufiyaa amount and the rate, for a send who it was paid to, and its date, with a red Delete button and a Close button; Close, a tap on the dimmed Home or the phone's back button closes the sheet and the entry, the count and the balance stay as they were.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha and, all dated the device's today, a USD send of $400.00 to Mariyam Nisha, an MVR send of MVR 10,000 at 20.00 ($500.00) to Mariyam Nisha and a USD payment of $300.00 from Abbaas, through the service role; a Chromium context at 390 by 844 signs in and waits until no element carries data-motion. Abbaas then holds $600.00. It taps the $500.00 card, waits until no element carries data-motion and reads the sheet; taps Close; taps the $300.00 card and taps the scrim; taps the $400.00 card and goes back with the browser's back button; finally opens /#entry/<id of the $400.00 entry> directly.

Expected: After the $500.00 tap one visible role=dialog element carries data-entry-sheet equal to that entry's id and contains 'Sent for Abbaas', data-sheet-usd '$500.00', data-sheet-mvr 'MVR 10,000', data-sheet-rate containing '20.00', data-sheet-person 'Mariyam Nisha', data-sheet-date starting 'Today', a button named 'Delete' and a button named 'Close'; a data-sheet-scrim element is visible. The $300.00 sheet reads 'Paid back by Abbaas' and '$300.00' and has no data-sheet-person, data-sheet-mvr or data-sheet-rate. After Close, the scrim tap and the back button, once no element carries data-motion, there is no data-entry-sheet and no data-sheet-scrim, data-screen is home, there are three data-entry cards, data-count is 3, the abbaas box reads data-amount 60000, and the service role reads three entries. The direct visit shows Home with the $400.00 sheet open.

Falsifier: A card tap that opens nothing, a sheet missing a detail or a button, a close path that leaves the sheet or the scrim, a back button that leaves Home, or any change to the stored entries fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-sheet.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
## Delete value 2: confirm, delete and recount

### Purpose
Let the owner remove a wrong entry for good after confirming it, with Home recounted from what is stored, and a Retry when the server cannot be reached.

### Constraints
- The refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi draws no delete; the sheet uses the app's own tokens in src/ui/theme.css (page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a, Abbaas teal #0f6f68, hairline #cfd9d6, Manrope for titles and figures, Source Sans 3 for text, the one curve --curve). Light theme only.
- The attribute contract integrated at db986eb stays in force: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-action (send/receive), data-form, data-person-chip, data-prefix, data-usd and data-motion. Every existing acceptance spec keeps passing.
- Entry cards keep their role and accessible name: a card is NOT given role=button, so no existing getByRole('button') lookup changes meaning. It is made tappable with a click listener, tabindex=0, aria-haspopup=dialog and cursor pointer; Enter and Space on a focused card open the sheet too.
- No schema, policy, migration or Supabase change: the existing LedgerStore.removeEntry and its PostgREST adapter, under the entries_delete_own policy, are the only delete path.
- The owner asked for this delete feature on 2026-10-13, after the refined board was integrated; the board drawing no delete is why the sheet follows the app's tokens, not a contradiction.
- Value 2 builds on value 1's entry sheet, whose contract (bound in value 1's design and asserted by tests/acceptance/entry-sheet.spec.ts) is: a tap on a Home card carrying data-entry=<id> (the card has a click listener, tabindex=0, aria-haspopup=dialog, no role) pushes location.hash '#entry/<id>' and shows Home with the sheet open; loading '#entry/<id>' directly does the same. The sheet is one element with role=dialog, aria-modal=true and data-entry-sheet=<id>, above a full-screen element carrying data-sheet-scrim. Inside it: the title 'Sent for Abbaas' or 'Paid back by Abbaas'; data-sheet-usd (e.g. '$400.00'); data-sheet-mvr and data-sheet-rate only for an MVR entry; data-sheet-person only for a send; data-sheet-date always (e.g. 'Today · Tue 13 Oct'). Its foot holds exactly two buttons, named 'Delete' and 'Close'. Close, a scrim tap, Escape and the back button close it; while the sheet or scrim moves it carries data-motion (any value) and none remains once it rests or is gone.
- In value 2 the foot's button set is: at rest 'Delete' and 'Close'; while confirming 'Cancel' and 'Delete' with the text 'Delete this entry?' and 'This cannot be undone.'; while the delete is running the same two buttons, disabled; after a Retry 'Delete' and 'Close' again with the role=alert note above them. The details (data-sheet-usd and the other detail attributes) stay in the sheet in every state.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/entry-sheet.ts` | EXTEND | The confirmation state, the busy state and the Retry message. |
| `src/main.ts` | EXTEND | Calls store.removeEntry on a confirmed delete, then closes the sheet and shows Home from a fresh read; keeps the sheet open with the message on a Retry. |
| `src/ports/ledger-store.ts` | EXTEND | The removal message becomes 'Could not delete. Try again.' now that removal is a delete rather than an Undo. |
| `src/ui/theme.css` | EXTEND | The confirmation row and the Retry note. |

### Paradigm
functional

### Decisions
- Tapping Delete turns the sheet's foot into the confirmation, in place, without a browser dialog: the line 'Delete this entry?' (Manrope 700, ink) with the hint 'This cannot be undone.' (muted), then two buttons side by side, 'Cancel' (plain) on the left and 'Delete' (red #b3261e) on the right. The entry's details stay visible above it, and Close is not offered while confirming.
- Cancel returns the foot to Delete and Close; nothing is written.
- Confirming disables both buttons and calls LedgerStore.removeEntry with the entry's id once; a second tap while it is running does nothing.
- On 'removed' the sheet closes as it does for Close (the same motion and data-motion rule), the '#entry/<id>' history entry is left by going back so a later back press does not reopen it, and Home is painted from a fresh store.readEntries(): the deleted card is gone, data-count drops by one, and the boxes and data-total figures are the sums of the entries that remain. No entrance and no save motion plays.
- On 'retry' the sheet stays open on its details with a role=alert note reading 'Could not delete. Try again.' in soft red (#fbeceb background, #9a2a22 text, 14 px radius) above Delete and Close again; the entry stays in the list and in storage.
- ENTRY_UNREMOVABLE_MESSAGE in src/ports/ledger-store.ts reads 'Could not delete. Try again.'.
- There is no Undo after a delete, no toast and no message on Home: the card's absence and the recounted boxes are the feedback.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| removeEntry | `src/adapters/supabase/ledger-store.ts:161` | REUSE | removeEntry already deletes under row-level security and reports a delete that matched nothing as a Retry. |
| ENTRY_UNREMOVABLE_MESSAGE | `src/ports/ledger-store.ts:54` | EXTEND | Its text becomes 'Could not delete. Try again.'. |

### Prefactoring
Not applicable: The delete path exists in the store; only the UI calls it.

### Agreement analysis
Not applicable: The RemoveEntryOutcome shape is unchanged; only its message text changes.

### Boundaries
- Driving port: The built bundle's DOM: the entry sheet's Delete, the confirmation and Home after a delete.
- Driven port: LedgerStore: entries read and deleted over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The delete request cannot reach the server or deletes no row. | Outcome: Retry | Observation: The sheet stays open with 'Could not delete. Try again.' and the entry stays listed and stored.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping Delete in the sheet asks Delete this entry? with Cancel and Delete; Cancel keeps the entry; confirming removes it from storage, so Home at once and after a reload no longer lists it, the Entries count drops by one, and the totals and the balance are worked out without it; if the server cannot be reached the sheet stays open with Could not delete. Try again. and the entry stays.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha and, all dated the device's today, a USD send of $400.00 to Mariyam Nisha, an MVR send of MVR 10,000 at 20.00 ($500.00) to Mariyam Nisha and a USD payment of $300.00 from Abbaas, through the service role; a Chromium context at 390 by 844 signs in and waits until no element carries data-motion. Abbaas then holds $600.00. It taps the $400.00 card, taps Delete, then Cancel; taps Delete and the confirming Delete and waits until no element carries data-motion; reloads; then, with every DELETE request to the entries endpoint aborted, opens the $300.00 card, taps Delete and the confirming Delete; finally lets requests through again, closes the sheet and reloads.

Expected: After the first Delete the sheet shows the text 'Delete this entry?' with buttons named 'Cancel' and 'Delete' and no button named 'Close'; after Cancel the sheet again shows 'Delete' and 'Close' and three data-entry cards remain. After confirming, there is no data-entry-sheet, no data-sheet-scrim and no card for the $400.00 entry; two data-entry cards remain; data-count is 2; the abbaas box reads data-amount 20000; data-total sent reads '$500.00' and data-total paid '$300.00'; the service role reads two entries, neither with the deleted id. After the reload the same holds. With deletes aborted the sheet stays open with a role=alert containing 'Could not delete. Try again.' and the $300.00 card is still listed; after closing and reloading two entries remain, the service role reads two, and the browser's back button does not reopen a sheet.

Falsifier: A delete without the confirmation, a Cancel that deletes, an entry still stored or listed after confirming, a count, box or total not recounted, a failed delete that closes the sheet or drops the card, or any Undo control fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/delete-entry.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
## Travelling cards value 1: a send rests on Abbaas's side

### Purpose
Put every send's card on the right of the centre line, under Abbaas's box.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/send-usd.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | A send's row carries data-side='right'. |
| `src/ui/theme.css` | EXTEND | The row's columns follow data-side: the card in the right column with its text aligned right, the after line in the left column hugging the line. |

### Paradigm
functional

### Decisions
- A send's row has data-side='right'; its card occupies the right column of the row's 1fr 36px 1fr grid and its text (amount, 'to <name>', detail) aligns right.
- The send's after line sits in the left column, aligned right so it hugs the centre line.
- Nothing about the send form changes.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| renderEntry | `src/ui/home.ts:112` | EXTEND | Builds each row; its data-side and node change. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Saving a USD send from the blue form, to a saved person or to a new one, stores it and, once Home rests, shows its card wholly right of the centre line on Abbaas's side, the side of whoever received the money.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has one saved person 'Mariyam Nisha' and no entries. It taps Send, keeps USD, types 250.00, taps the Mariyam Nisha chip and taps 'Send · $250.00'. Then it taps Send again, taps New person, types 'Ahmed Shifaz', taps Add, types 100, sets the Date input to yesterday and taps 'Send · $100.00'. Each Home reading is taken only once no element carries data-motion.

Expected: The form (data-form send) has a Close button, the text 'New entry · Send' and the heading 'Money sent for Abbaas'; USD is pressed and the data-pill element lies over the USD button; data-prefix reads '$'; the line 'Dollars go straight onto the balance. No rate needed.' is visible; there is no element labelled Note, no data-preview-box and no text 'After saving'. The Date input's value is today and the visible chip text starts with 'Today, '. The input labelled 'Amount sent' has a computed font-size of 44px. Before a person is chosen the button named 'Send · $250.00' is disabled; after tapping Mariyam Nisha that chip has aria-pressed true and a visible tick icon and the button is enabled. After saving, Home shows one data-entry card lying wholly in the RIGHT half of the viewport with $250.00 and Mariyam Nisha, and the abbaas box reads data-amount 25000. After the second save the date chip had read yesterday's weekday before saving; Home shows two cards, both wholly in the right half, and the abbaas box reads 35000. Read through the service role, both entries are kind send, currency USD, rate null, note null, amount_minor equal to usd_cents (25000 and 10000), the first dated today and the second yesterday, with person_name Mariyam Nisha and Ahmed Shifaz.

Falsifier: A note field, a preview, a send card left of the line, or a date chip that does not follow the date input fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-usd.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
## Travelling cards value 2: a payment rests on the owner's side

### Purpose
Put every payment's card on the left of the centre line, under the owner's box.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/receive.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | A payment's row carries data-side='left'. |
| `src/ui/theme.css` | EXTEND | The payment card in the left column with its text aligned left, the after line in the right column hugging the line. |

### Paradigm
functional

### Decisions
- A payment's row has data-side='left'; its card occupies the left column and its text ('$300.00', 'from Abbaas', detail) aligns left.
- The payment's after line sits in the right column, aligned left so it hugs the centre line.
- Nothing about the receive form or the over-payment balance changes.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| renderEntry | `src/ui/home.ts:112` | EXTEND | Builds each row; its data-side and node change. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Saving a payment from Abbaas from the teal form stores it and, once Home rests, shows its card wholly left of the centre line on the owner's side; a payment larger than Abbaas holds still empties his box and fills the owner's with the difference.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account is seeded with person Mariyam Nisha and one USD send of $740.00 to her. It taps Receive, types 300 and taps 'Receive · $300.00'; taps Receive, types 440 and taps 'Receive · $440.00'; then taps Receive, types 200 and taps 'Receive · $200.00'. Each Home reading is taken only once no element carries data-motion.

Expected: The form (data-form receive) shows 'New entry · Receive', the heading 'Payment from Abbaas', the line 'Abbaas has $740.00 of yours', USD pressed with data-pill over it, the input labelled 'Amount received' with a computed font-size of 44px, and the Date input set to today with a visible chip starting 'Today, '; there is no data-quick element, no text 'All of it', no element labelled Note, no data-preview-box, no 'After saving' text and no data-receive-note, both before typing and with an amount larger than he holds typed. After the first save the payment card lies wholly in the LEFT half of the viewport and the abbaas box reads data-amount 44000; the $740.00 send card lies wholly in the right half. After the second save both boxes are empty and the All square chip is shown. After the third save the you box is filled with data-amount 20000, the text '$200.00' and 'have his money', and the abbaas box is empty; every payment card lies wholly in the left half and none carries data-person. Read through the service role there are three receive entries, all currency USD, rate null, note null, person_name null, with usd_cents 30000, 44000 and 20000.

Falsifier: Quick amounts, a note, a preview or an over-payment note on the form, a payment card right of the line, or a wrong balance after an over-payment fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/receive.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
## Travelling cards value 3: an MVR send rests on Abbaas's side

### Purpose
Keep the MVR send form as integrated and read its saved card on the right of the line.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/send-mvr.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule.
- Value 1 already puts every send on the right; this value's change is the oracle's side reading, and the crafter may find nothing left to change.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | The MVR send's card shows 'MVR 10,000 at 20.00' under its dollars on the right half. |

### Paradigm
functional

### Decisions
- An MVR send's card rests right of the centre line like every send, its detail line reading 'MVR 10,000 at 20.00' under '$500.00', aligned right.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| renderEntry | `src/ui/home.ts:112` | EXTEND | Builds each row; its data-side and node change. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Saving an MVR send stores the MVR amount, the rate and the USD value, and once Home rests its card, reading MVR 10,000 at 20.00 under its $500.00, lies wholly right of the centre line.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has one saved person 'Ahmed Shifaz' and no entries. It taps Send, taps MVR, types 10,000 in Amount sent and 20 in the input labelled 'Rate · MVR per $1', taps Ahmed Shifaz and taps 'Send · $500.00'; Home is read once no element carries data-motion.

Expected: After tapping MVR, MVR has aria-pressed true, data-pill lies over the MVR button, data-prefix reads 'MVR', the USD note is not visible, and an input labelled 'Rate · MVR per $1' and the text 'In dollars' are visible side by side (same row, the In dollars card to the right with a white background). After typing, data-usd reads $500.00 and a button named 'Send · $500.00' is enabled. After saving, Home shows one data-entry card lying wholly in the RIGHT half of the viewport containing $500.00, 'MVR 10,000 at 20.00' and Ahmed Shifaz, and the abbaas box reads data-amount 50000. Read through the service role the entry is currency MVR, amount_minor 1000000, rate 20, usd_cents 50000, note null, person_name Ahmed Shifaz.

Falsifier: A rate field under a different label, a missing In dollars card, a wrong dollar value or button name, or an MVR send card left of the line fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-mvr.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
## Travelling cards value 4: the ringed card on the receiver's side is the whole feedback

### Purpose
Keep Home free of any Saved message or Undo; the new ringed card rests on the receiver's side.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/undo.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule.
- Values 1 and 2 already put each card on its receiver's side; this value's change is the oracle's side reading, and the crafter may find nothing left to change.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/theme.css` | EXTEND | The new card's 2 px ring is drawn inside the card (inset box-shadow) on either half, never cut by the screen edge. |

### Paradigm
functional

### Decisions
- Home never renders a data-saved-message element, a role=status save message, the words 'Saved.' or an Undo control.
- After a save the new card wears a 2 px ring in its kind's colour drawn inside the card, and rests on the receiver's half: a send right of the line, a payment left of it.
- After a reload no card wears the ring.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| renderEntry | `src/ui/home.ts:112` | EXTEND | Builds each row; its data-side and node change. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: After a save there is still no Saved message and no Undo: the new card, at rest on the side of whoever received the money with the ring in its colour, is the whole feedback, and the stored entry stays stored.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has one saved person Mariyam Nisha and one USD send of $400.00, created through the service role. It taps Send, types 100, taps Mariyam Nisha and taps 'Send · $100.00'; waits until no element carries data-motion; then opens Receive, types 50 and taps 'Receive · $50.00', waits again, and reloads.

Expected: After each save Home shows no element with data-saved-message, no role=status element containing 'Saved', no visible text 'Saved.', and no button or link named Undo; the new card (the $100.00 card, then the $50.00 card) shows a 2 px ring in its kind's colour (rgb(36, 80, 138) for the send, rgb(15, 111, 104) for the payment) as a border or inset box-shadow, and lies wholly on its receiver's half: the $100.00 send card in the RIGHT half, the $50.00 payment card in the LEFT half. The abbaas box reads data-amount 50000 after the send and 45000 after the payment. After the reload there is still no Saved message or Undo, no card carries the ring, there are three data-entry cards, and the service role reads three entries.

Falsifier: Any Saved message, any Undo control, a missing ring, a ringed card on the sender's side, or a save that is not stored fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/undo.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
## Travelling cards value 5: Home at rest

### Purpose
Draw Home at rest as the travelling-cards board: a dot on the line for each row, the after line on the side the card came from, and the totals named by who received the money.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/entry-list.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | The row's node becomes a dot in the card's colour; the totals read 'You received' (paid, left) and 'Abbaas received' (sent, right). |
| `src/ui/theme.css` | EXTEND | The dot, the totals' order and their figures' colours; the rows at every width from 360 px. |

### Paradigm
functional

### Decisions
- Each row's node cell holds a 10 px round dot in the card's colour (blue #24508a for a send, teal #0f6f68 for a payment) with a 4 px #f4f7f6 halo, centred on the line; it holds no arrow glyph and no text.
- The totals row shows, left, the element with data-total='paid' reading 'You received $300.00' with its figure in #0f6f68, and right, data-total='sent' reading 'Abbaas received $1,090.00' with its figure in #24508a, right-aligned.
- Everything else on Home stays as on the refined board: no title, the boxes at the top with their pills in the outer corners, the Entries heading and count, the day labels, the tinted cards, and the fade above the buttons.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| renderEntry | `src/ui/home.ts:112` | EXTEND | Builds each row; its data-side and node change. |
| total | `src/ui/home.ts:310` | EXTEND | The totals' wording and order. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Home at rest reads as the travelling-cards board: sends right of the centre line and payments left of it at every width from 360 px, each row with a small round dot in its card's colour on the line and no arrow, who holds what after it on the side the card came from, and under the boxes the totals You received $… on the left and Abbaas received $… on the right.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account is seeded through the service role with people Mariyam Nisha and Ahmed Shifaz and entries over three days: a USD send of $250.00 to Mariyam Nisha, an MVR send of MVR 10,000 at 20 ($500.00) to Ahmed Shifaz, a $300.00 USD payment, and today a $340.00 USD send to Ahmed Shifaz. Home is read once no element carries data-motion, at 390 px and again at 360 px and 800 px wide.

Expected: There is no heading element above the boxes and no visible text 'Abbaas Ledger' on Home; the top of the you box is within 24 to 64 px of the top of the viewport. The abbaas box is filled with data-amount 79000 and text '$790.00', its pill 'Abbaas' lies in its top-right quarter, and its amount's right edge is within 20 px of the box's right edge; the you box is empty with its pill in its top-left quarter. An h2 'Entries' is visible and data-count reads '4 entries'. There are four data-entry cards; the three send cards (Mariyam Nisha, Ahmed Shifaz MVR, today's Ahmed Shifaz) each lie wholly in the RIGHT half and the $300.00 payment card wholly in the LEFT half, at every width; each card's background is the tinted colour of its kind; each row's data-after lies on the opposite half from its card and today's reads 'Abbaas has $790.00'; no row contains the characters → or ←. Day labels read in uppercase and today's contains 'TODAY'. data-total='paid' has text 'You received $300.00' and lies left of data-total='sent', which has text 'Abbaas received $1,090.00'. An element with data-fade is present, at least 120 px tall, anchored to the bottom of the viewport, with pointer-events none.

Falsifier: Sends left of the line, payments right of it, an arrow on the line, the old totals wording, a title above the boxes, a missing Entries heading or count, or no fade fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-list.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
## Travelling cards value 6: the new card crosses the line

### Purpose
After a save, carry the new card from the sender's side across the centre line to the receiver's side while the boxes count.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/motion.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule. Home's grow from the save button is kept exactly as asserted today.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/motion.ts` | EXTEND | The crossing: appear on the sender's half, hold, cross, land; data-motion='cross' throughout; the count runs during the crossing. |
| `src/ui/home.ts` | EXTEND | animateSave plays the crossing for the new card and counts the boxes from the crossing's start. |
| `src/ui/theme.css` | EXTEND | The lifted shadow while the card moves. |

### Paradigm
functional

### Decisions
- After Home has grown from the save button (unchanged: data-motion 'grow', a clip-path circle from the button's centre, gone within 900 ms of the tap), the new card's day group opens, then the card crosses.
- Appear: at +120 ms the card fades in over 240 ms, scaling 0.92 to 1, displaced by translateX of minus (its own width plus the 36 px dot column) for a send, plus that for a payment, so its box lies wholly on the SENDER's half: a send's on the left, a payment's on the right. It is lifted with a soft shadow and already wears its 2 px ring.
- Hold 500 ms there, then cross over 760 ms on cubic-bezier(0.2, 0.8, 0.2, 1) to translateX(0) on the receiver's half; the shadow settles on landing; the dot and the after line fade in after it lands.
- The card carries data-motion='cross' from before its first displaced frame until it rests. The boxes count to the new balance over 800 ms starting with the crossing; the counting box carries data-motion 'count', and when an over-payment moves the money to the owner both boxes carry data-motion 'swap' (his drains, the owner's fills).
- With reduced motion nothing carries data-motion, Home has no clip-path, and the card is at rest at once.
- The whole save, from the tap to rest, is over within 2.6 s.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| enterEntry | `src/ui/motion.ts:395` | REPLACE | Today the new card slides 28 to 44 px from its own side; it becomes the crossing. |
| countBoxAmount | `src/ui/motion.ts:443` | REUSE | The box count, started with the crossing. |
| animateSave | `src/ui/home.ts:462` | EXTEND | Plays the crossing for the new card. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: After a save, once Home has grown from the form's button, the new card appears on the sender's side (a send on the owner's left, a payment on Abbaas's right) lifted and wearing its ring, holds there a moment, then crosses the centre line and rests on the receiver's side while the boxes count to the new balance; a payment larger than Abbaas holds drains his box as the owner's fills; with reduced motion the card is shown at rest at once.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account has person Mariyam Nisha and one USD send of $400.00. Test A (normal motion): it opens Send, types 100, taps Mariyam Nisha and taps 'Send · $100.00', sampling the DOM every animation frame until no element carries data-motion. Test B, on a fresh account seeded the same way: it opens Receive, types 600 and taps 'Receive · $600.00', sampling likewise. Test C uses a context with reducedMotion 'reduce' on a fresh account and repeats test A.

Expected: Test A: right after the tap Home's root carries data-motion 'grow' while the send form is still in the DOM, and its computed clip-path is a circle whose centre is within 4 px of the centre the save button had; within 900 ms of the tap the form is gone and Home's root has no clip-path and no data-motion. The new entry (the $100.00 card) carries data-motion 'cross'; at some sample while it carries it, its bounding box lies wholly LEFT of the viewport's middle (the sender's half) while it is visible (opacity above 0.5); at rest it lies wholly RIGHT of the middle; between those, its x position only increases (it crosses once, left to right). The abbaas box carries data-motion 'count' at some sample and ends at data-amount 50000. At rest the card shows a 2 px ring in rgb(36, 80, 138) (border or inset box-shadow) whose whole box lies inside the viewport. Everything rests within 2.6 s of the tap. Test B: the new $600.00 payment card at some visible sample lies wholly RIGHT of the middle and at rest wholly LEFT of it, its x only decreasing between; both boxes carry data-motion 'swap' at some sample; at the end the you box reads data-amount 20000 and the abbaas box is empty. Test C: no element ever carries data-motion, Home's root never has a clip-path, and the $100.00 card lies wholly right of the middle and the abbaas box reads data-amount 50000 on the first frame Home is shown.

Falsifier: No grow from the button, a new card that never shows on the sender's half, a card that does not end on the receiver's half, a card that crosses back, a ring cut off, or any motion under reduce fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/motion.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
## Travelling cards value 7: every card crosses on opening

### Purpose
Home's opening entrance carries every card across from its sender's side.

### Constraints
- The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW (built 2026-10-14) on top of the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi; light theme only; every token stays as in src/ui/theme.css.
- Resting sides (the rule of this whole Request): a card rests on the side of whoever RECEIVED the money. A send's card lies wholly RIGHT of the centre line (Abbaas's side); a payment from Abbaas lies wholly LEFT of it (the owner's side). The row's data-side names that resting side: 'right' for a send, 'left' for a payment. The after line (data-after) lies on the other half, the side the card came from. The page is one centred column, so the centre line is the viewport's middle at every width.
- The attribute contract integrated at 52ffbc4 stays: data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-pill, data-row, data-ripple, data-spine, data-fade, data-motion and the entry sheet's attributes. Every existing acceptance spec not rewritten by this Request keeps passing.
- Motion contract: any element displaced by a motion carries data-motion from before its first displaced frame until it rests; a reader that waits until no element carries data-motion reads the resting layout. A new or entering card carries data-motion='cross'.
- This rewrites the oracle at tests/acceptance/entrances.spec.ts: every assertion it makes about the forms, storage and balances is kept; only what it asserts about which side a card lies on (and, where stated, how it moves) changes to this Request's rule. The form's ripple and rising rows are kept exactly as asserted today.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/motion.ts` | EXTEND | The opening crossing for each row, staggered 90 ms. |
| `src/ui/home.ts` | EXTEND | animateOpening crosses every card. |
| `src/ui/theme.css` | EXTEND | Start states for the opening crossing. |

### Paradigm
functional

### Decisions
- On the app's first Home, Home's root carries data-motion 'home-enter' as today; the boxes rise, the balance counts up from $0 and the data-spine line draws down as today.
- Each entry card starts displaced by one card width plus the 36 px dot column toward its sender's side (negative x for a send, positive for a payment), so it starts wholly on the sender's half, and crosses to rest over 680 ms on the one curve, 90 ms after the card above it; each carries data-motion while it moves.
- Everything rests within 2.2 s of the reload.
- With reduced motion nothing carries data-motion or data-ripple and every card is at rest at once.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| enterHome | `src/ui/motion.ts:591` | EXTEND | The opening entrance; its card slides become crossings. |

### Prefactoring
Not applicable: Home and its motions are reshaped in place; no behaviour moves between modules.

### Agreement analysis
Not applicable: No schema or port change; the stored entry shape is unchanged.

### Boundaries
- Driving port: The built bundle's DOM: Home, its entry cards, its boxes and totals, and the Send and Receive forms.
- Driven port: LedgerStore: people and entries over PostgREST under row-level security.
- Dependency direction: UI modules depend on domain modules and port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: Reading the ledger fails because the server cannot be reached. | Outcome: Retry | Observation: Home shows 'Could not load the ledger. Try again.' and no entry cards, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Opening the app plays Home's entrance with every entry card crossing from its sender's side over the centre line to its resting side, one after another, after the boxes rise and the line draws down; with reduced motion every screen shows its end state at once.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in. The account is seeded with person Mariyam Nisha, a $500.00 USD send to her yesterday and a $200.00 USD payment today. Test A loads the app after sign-in by reloading Home and samples every animation frame until no element carries data-motion; then it taps Send and samples. Test B repeats both with reducedMotion 'reduce'.

Expected: Test A: on the reload Home's root carries data-motion 'home-enter'; the abbaas box's displayed amount is below $300.00 at an early sample and reads $300.00 at the end; the data-spine element's transform starts with a Y scale below 1 and ends at none or scale 1; the send card's first sampled x translation is negative and at some visible sample (opacity above 0.5) its box lies wholly left of the viewport's middle, and at rest wholly right of it; the payment card's first sampled x translation is positive, at some visible sample its box lies wholly right of the middle, and at rest wholly left of it; within 2.2 s no data-motion remains. After tapping Send a data-ripple element appears near the Send button's centre, at least four data-row elements in the form have opacity below 1 at an early sample and reach opacity 1 in top-to-bottom order of their start, and within 1.2 s none remains below 1. Test B: no element ever carries data-motion or data-ripple; the abbaas box reads $300.00, the send card lies right of the middle and the payment card left of it, and every data-row has opacity 1 on the first sampled frame.

Falsifier: No entrance on open, a card that does not start on its sender's half, a card that does not rest on its receiver's half, rows appearing all at once, or any motion under reduce fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entrances.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
## Delete at once: one tap on Delete removes the entry

### Purpose
Let the owner remove a wrong entry with one tap on the sheet's Delete, with no confirmation, Home recounted from what is stored, and a Retry when the server cannot be reached.

### Constraints
- The sheet keeps the app's own tokens in src/ui/theme.css (page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a, Abbaas teal #0f6f68, hairline #cfd9d6, the red Delete #b3261e, Manrope for titles and figures, Source Sans 3 for text, the one curve --curve). Light theme only.
- The attribute contract integrated at 8f40bca stays in force: Home's data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; and the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-date, data-sheet-delete, data-sheet-close and data-sheet-actions. Every other acceptance spec keeps passing.
- The entry sheet integrated at 8f40bca (asserted by tests/acceptance/entry-sheet.spec.ts) stays: a tap on a Home card carrying data-entry=<id> pushes location.hash '#entry/<id>' and shows Home with the sheet open; the sheet is one element with role=dialog, aria-modal=true and data-entry-sheet=<id> above a full-screen data-sheet-scrim; it shows the title 'Sent for Abbaas' or 'Paid back by Abbaas', data-sheet-usd, data-sheet-mvr and data-sheet-rate only for MVR, data-sheet-person only for a send, data-sheet-date always; its foot holds exactly two buttons named 'Close' (left) and 'Delete' (right, red), side by side; Close, a scrim tap, Escape and the back button close it; while it moves it carries data-motion and none remains once it rests or is gone.
- No schema, policy, migration or Supabase change: the existing LedgerStore.removeEntry and its PostgREST adapter, under the entries_delete_own policy, are the only delete path.
- The owner asked on 2026-10-14 to remove the confirmation that the delete feature integrated at 52ffbc4 added; this value replaces that confirmation and rewrites tests/acceptance/delete-entry.spec.ts, which asserted it.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/entry-sheet.ts` | EXTEND | Delete starts the removal at once; the confirm state, its question, its hint and Cancel are removed; the running state disables Close and Delete. |
| `src/ui/theme.css` | EXTEND | The rules for the confirmation row and Cancel are removed; the disabled look of Close joins Delete's. |

### Paradigm
functional

### Decisions
- Tapping the red Delete in the sheet's foot calls LedgerStore.removeEntry with the entry's id once, at once. No text 'Delete this entry?' or 'This cannot be undone.' and no button named 'Cancel' is ever painted.
- The foot has three states: at rest 'Close' and 'Delete' side by side (Close left, red Delete right); while the removal is out the same two buttons, both disabled, and a tap on the scrim or Escape is ignored; after a Retry the same two buttons enabled again with the role=alert note above them.
- On 'removed' the sheet closes as it does for Close (the same motion and data-motion rule), the '#entry/<id>' history entry is left by going back so a later back press does not reopen it, and Home is painted from a fresh store.readEntries(): the deleted card is gone, data-count drops by one, and the boxes and data-total figures are the sums of the entries that remain. No entrance and no save motion plays.
- On 'retry' the sheet stays open on its details with a role=alert note reading 'Could not delete. Try again.' in soft red (#fbeceb background, #9a2a22 text, 14 px radius) above Close and Delete; the entry stays in the list and in storage.
- There is no Undo after a delete, no toast and no message on Home: the card's absence and the recounted boxes are the feedback.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| removeEntry | `src/adapters/supabase/ledger-store.ts:161` | REUSE | removeEntry already deletes under row-level security and reports a delete that matched nothing as a Retry. |
| ENTRY_UNREMOVABLE_MESSAGE | `src/ports/ledger-store.ts:59` | REUSE | Its text 'Could not delete. Try again.' stays as it is. |
| FootState | `src/ui/entry-sheet.ts:146` | EXTEND | The foot's states lose 'confirm'; Delete goes straight to 'running'. |

### Prefactoring
Not applicable: The removal path exists; only the step before it is taken away.

### Agreement analysis
Not applicable: The RemoveEntryOutcome shape and its message are unchanged.

### Boundaries
- Driving port: The built bundle's DOM: the entry sheet's Delete and Home after a delete.
- Driven port: LedgerStore: entries read and deleted over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The delete request cannot reach the server or deletes no row. | Outcome: Retry | Observation: The sheet stays open with 'Could not delete. Try again.' and the entry stays listed and stored.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Tapping the red Delete in an entry's sheet removes that entry at once, without asking Delete this entry? and without offering Cancel: the sheet closes, Home at once and after a reload no longer lists it, the Entries count drops by one, and the totals and the balance are worked out without it, while the other entries stay stored; if the server cannot be reached the sheet stays open with Could not delete. Try again. above Close and Delete, and the entry stays listed and stored.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha and, all dated the device's today, a USD send of $400.00 to Mariyam Nisha, an MVR send of MVR 10,000 at 20.00 ($500.00) to Mariyam Nisha and a USD payment of $300.00 from Abbaas, through the service role; a Chromium context at 390 by 844 signs in and waits until no element carries data-motion. Abbaas then holds $600.00. It taps the $400.00 card and waits for rest, taps the sheet's Delete once and waits until no element carries data-motion; reloads; then, with every DELETE request to the entries endpoint aborted, opens the $300.00 card and taps Delete once; finally lets requests through again, closes the sheet and reloads.

Expected: Before Delete the sheet's foot has exactly the buttons 'Close' and 'Delete'. After the one tap on Delete, at no point does the sheet show 'Delete this entry?', 'This cannot be undone.' or a button named 'Cancel'; there is then no data-entry-sheet, no data-sheet-scrim and no card for the $400.00 entry; two data-entry cards remain; data-count is 2; the abbaas box reads data-amount 20000; data-total sent reads '$500.00' and data-total paid '$300.00'; the service role reads two entries, neither with the deleted id. After the reload the same holds, and loading '#entry/<deleted id>' shows Home with no sheet. With deletes aborted, one tap on Delete leaves the sheet open with a role=alert containing 'Could not delete. Try again.', buttons 'Close' and 'Delete' enabled, no 'Cancel', and the $300.00 card still listed; after closing and reloading two entries remain and the service role reads two.

Falsifier: A confirmation question or a Cancel after Delete, an entry still stored or listed after the one tap, a count, box or total not recounted, a failed delete that closes the sheet or drops the card, or any Undo control fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/delete-entry.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
## Method value 1: the Send form's Method row, stored

### Purpose
Let the owner say how a send moved, Transfer unless they pick Cash or Cheque, and store it with the entry.

### Constraints
- The visual reference is the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa (artboards Send, Receive, Home and Entry sheet) as approved by the owner on 2026-10-16. The app's tokens in src/ui/theme.css stay: page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a with deep #1b3f6e, Abbaas teal #0f6f68 with deep #0b5750, hairline #cfd9d6, Manrope for titles and figures, Source Sans 3 for text, the one curve --curve. Light theme only.
- The attribute contract integrated at 112e554 stays in force and every existing acceptance spec keeps passing: Home's data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action (send/receive), data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-date, data-sheet-delete, data-sheet-close, data-sheet-actions.
- The method contract this Request adds, shared by all three values: the database column public.entries.method is text, nullable, with a check that it is one of 'cash', 'cheque', 'transfer', added by supabase/migrations/0002_entry_method.sql; LedgerEntry and NewEntry in src/ports/ledger-store.ts carry method: 'cash' | 'cheque' | 'transfer' | null (NewEntry's is never null from the forms). In each form the Method control is one element with role=radiogroup whose accessible name is 'Method', holding exactly three buttons with role=radio, accessible names 'Cash', 'Cheque' and 'Transfer' in that order, data-method='cash'|'cheque'|'transfer', and aria-checked='true' on exactly one. On Home a card whose entry has a method holds one element data-entry-method='<stored word>' whose text is 'Cash', 'Cheque' or 'Transfer'; a card whose method is null holds none. In the sheet the Method line carries data-sheet-method and reads 'Method' and the word; it is absent when the method is null.
- The acceptance support (tests/support/accounts.ts) reads and seeds entries without the method column; a spec that must read or seed method does so itself through @supabase/supabase-js createClient(stack.apiUrl, stack.serviceRoleKey) on the entries table, filtered by the account's user_id, or through the bundle's own forms.
- No policy change: the existing entries policies and grants cover the new column. The migration is applied to the local stack by the acceptance support's db reset; pushing it to the cloud project is the owner's step after integration.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `supabase/migrations/0002_entry_method.sql` | CREATE_NEW | Adds the nullable entries.method column limited to cash, cheque and transfer. |
| `src/ports/ledger-store.ts` | EXTEND | PaymentMethod type; method on LedgerEntry and NewEntry. |
| `src/adapters/supabase/ledger-store.ts` | EXTEND | Reads and writes the method column. |
| `src/domain/send-draft.ts` | EXTEND | SendDraft carries the chosen method, emptySendDraft starts on transfer, and draftToNewEntry puts it into the NewEntry. |
| `src/domain/receive-draft.ts` | EXTEND | receiveToNewEntry sets method: null so NewEntry stays complete; value 2 gives the Receive draft its own method. |
| `src/ui/send-form.ts` | EXTEND | The Method radio group under the amount block and above Paid to, Transfer chosen; its choice goes into the NewEntry. |
| `src/ui/theme.css` | EXTEND | The Method row's track, pill and icons. |

### Paradigm
functional

### Decisions
- supabase/migrations/0002_entry_method.sql: alter table public.entries add column method text null, with constraint entries_method_known check (method is null or method in ('cash', 'cheque', 'transfer')). No default, so rows saved before it keep null.
- src/ports/ledger-store.ts exports type PaymentMethod = 'cash' | 'cheque' | 'transfer'; LedgerEntry.method and NewEntry.method are PaymentMethod | null.
- src/domain/send-draft.ts: SendDraft gains method: PaymentMethod; emptySendDraft() returns method 'transfer'; draftToNewEntry copies draft.method into the NewEntry. src/domain/receive-draft.ts: receiveToNewEntry returns method: null in this value, so a payment is stored with a null method until value 2.
- The Supabase adapter adds method to COLUMNS, to toEntry and to toEntryRow.
- The Send form shows, after the USD note slot and the MVR rate row and before Paid to, a label 'Method' (13 px, weight 600, white) and under it a 52 px track (padding 4 px, radius 16 px, white at 12 % opacity) with three equal buttons: a stroke icon (banknote, cheque, two opposed arrows) and the word Cash, Cheque or Transfer, Manrope 800 14 px. The chosen button is a white pill (radius 12 px) with #1b3f6e text; the others are white text on the track. The group is role=radiogroup aria-labelledby the label; each button is role=radio with aria-checked and data-method.
- The Send form opens with Transfer chosen every time; tapping an option chooses it and unchooses the others; exactly one is always chosen. Switching USD/MVR keeps the chosen method.
- Saving a send puts the chosen method into NewEntry.method; everything else about saving, the Retry and the travelling-card motion stays as integrated.
- The form still fits a 360 by 780 phone as integrated: if the added row would push Save below the fold, the form's content area scrolls and Save stays where it is integrated.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| COLUMNS | `src/adapters/supabase/ledger-store.ts:25` | EXTEND | The selected columns gain method. |
| toEntryRow | `src/adapters/supabase/ledger-store.ts:73` | EXTEND | The inserted row gains method. |
| currencyButton | `src/ui/send-form.ts:173` | EXTEND | The Method options are built the way the currency buttons are. |
| onSave | `src/ui/send-form.ts:555` | REUSE | The save path already hands a NewEntry to onSave; it only gains the method. |
| draftToNewEntry | `src/domain/send-draft.ts:92` | EXTEND | The one constructor of a send's NewEntry gains the method. |
| receiveToNewEntry | `src/domain/receive-draft.ts:114` | EXTEND | The one constructor of a payment's NewEntry must name method to type-check. |

### Prefactoring
Not applicable: The forms, the store and the cards are extended in place; nothing must move first.

### Agreement analysis
Not applicable: The store's outcome shapes are unchanged; LedgerEntry and NewEntry gain one field whose values are named in the method contract.

### Boundaries
- Driving port: The built bundle's DOM: the Send and Receive forms, Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read and deleted over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The insert cannot reach the server. | Outcome: Retry | Observation: The form stays open with Could not save. Try again. and nothing is stored, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Opening the blue Send form shows a Method row of Cash, Cheque and Transfer under the amount and above Paid to with Transfer chosen; saving a send stores transfer, or the method tapped instead, with the entry, in USD and in MVR.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha through the service role; a Chromium context at 390 by 844 signs in and waits until no element carries data-motion. It opens Send, reads the Method group, saves a USD send of $120.00 to Mariyam Nisha without touching Method; opens Send again, taps Cash, switches to MVR, enters MVR 3,000 at 20.00 to Mariyam Nisha and saves; opens Send again, taps Cheque and saves a USD send of $40.00 to Mariyam Nisha. After each save it waits until the form has left, the new card exists and no element carries data-motion.

Expected: On opening, the Send form has one role=radiogroup named Method placed after the amount field and before the Paid to group, with radios Cash, Cheque, Transfer in that order and only Transfer aria-checked=true; after tapping Cash only Cash is checked, and it stays checked across the USD/MVR switch. The service role then reads three entries, oldest first, with method 'transfer', 'cash' and 'cheque' respectively, each with its amount, currency and person as saved.

Falsifier: Transfer not chosen on opening, more or less than one radio checked, a method lost on the currency switch, or a stored method other than the one chosen fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-method.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-method.spec.ts`
## Method value 2: the Receive form's Method row, stored

### Purpose
Let the owner say how a payment from Abbaas came in, Cheque unless they pick Cash or Transfer, and store it with the entry.

### Constraints
- The visual reference is the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa (artboards Send, Receive, Home and Entry sheet) as approved by the owner on 2026-10-16. The app's tokens in src/ui/theme.css stay: page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a with deep #1b3f6e, Abbaas teal #0f6f68 with deep #0b5750, hairline #cfd9d6, Manrope for titles and figures, Source Sans 3 for text, the one curve --curve. Light theme only.
- The attribute contract integrated at 112e554 stays in force and every existing acceptance spec keeps passing: Home's data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action (send/receive), data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-date, data-sheet-delete, data-sheet-close, data-sheet-actions.
- The method contract this Request adds, shared by all three values: the database column public.entries.method is text, nullable, with a check that it is one of 'cash', 'cheque', 'transfer', added by supabase/migrations/0002_entry_method.sql; LedgerEntry and NewEntry in src/ports/ledger-store.ts carry method: 'cash' | 'cheque' | 'transfer' | null (NewEntry's is never null from the forms). In each form the Method control is one element with role=radiogroup whose accessible name is 'Method', holding exactly three buttons with role=radio, accessible names 'Cash', 'Cheque' and 'Transfer' in that order, data-method='cash'|'cheque'|'transfer', and aria-checked='true' on exactly one. On Home a card whose entry has a method holds one element data-entry-method='<stored word>' whose text is 'Cash', 'Cheque' or 'Transfer'; a card whose method is null holds none. In the sheet the Method line carries data-sheet-method and reads 'Method' and the word; it is absent when the method is null.
- The acceptance support (tests/support/accounts.ts) reads and seeds entries without the method column; a spec that must read or seed method does so itself through @supabase/supabase-js createClient(stack.apiUrl, stack.serviceRoleKey) on the entries table, filtered by the account's user_id, or through the bundle's own forms.
- No policy change: the existing entries policies and grants cover the new column. The migration is applied to the local stack by the acceptance support's db reset; pushing it to the cloud project is the owner's step after integration.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/domain/receive-draft.ts` | EXTEND | ReceiveDraft carries the chosen method, emptyReceiveDraft starts on cheque, and receiveToNewEntry puts it into the NewEntry. |
| `src/ui/receive-form.ts` | EXTEND | The Method radio group under the amount and above the date, Cheque chosen; its choice goes into the NewEntry. |
| `src/ui/theme.css` | EXTEND | The Receive form's Method row, with #0b5750 on the chosen pill. |

### Paradigm
functional

### Decisions
- Value 1 has already added entries.method, PaymentMethod and the adapter's read and write of it, and the Send form's Method row; this value reuses them.
- src/domain/receive-draft.ts: ReceiveDraft gains method: PaymentMethod; emptyReceiveDraft() returns method 'cheque'; receiveToNewEntry copies draft.method into the NewEntry instead of the null value 1 left there.
- The Receive form shows, after the amount block (and its MVR rate row) and before the date chip, the same Method label and 52 px track as the Send form, with the chosen pill's text #0b5750; the same role=radiogroup named Method, role=radio buttons Cash, Cheque, Transfer with aria-checked and data-method.
- The Receive form opens with Cheque chosen every time; tapping an option chooses it; exactly one is always chosen; switching USD/MVR keeps it.
- Saving a payment puts the chosen method into NewEntry.method; everything else about saving stays as integrated.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| onSave | `src/ui/receive-form.ts:409` | REUSE | The save path already hands a NewEntry to onSave; it only gains the method. |
| renderReceiveForm | `src/ui/receive-form.ts:170` | EXTEND | The form gains the Method row. |
| receiveToNewEntry | `src/domain/receive-draft.ts:114` | EXTEND | The one constructor of a payment's NewEntry takes the draft's method. |

### Prefactoring
Not applicable: The forms, the store and the cards are extended in place; nothing must move first.

### Agreement analysis
Not applicable: The store's outcome shapes are unchanged; LedgerEntry and NewEntry gain one field whose values are named in the method contract.

### Boundaries
- Driving port: The built bundle's DOM: the Send and Receive forms, Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read and deleted over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The insert cannot reach the server. | Outcome: Retry | Observation: The form stays open with Could not save. Try again. and nothing is stored, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Opening the teal Receive form shows the same Method row under the amount and above the date with Cheque chosen; saving a payment from Abbaas stores cheque, or the method tapped instead, with the entry.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account through the service role; a Chromium context at 390 by 844 signs in and waits until no element carries data-motion. It opens Receive, reads the Method group, saves a USD payment of $60.00 without touching Method; opens Receive again, taps Transfer and saves a USD payment of $25.00; opens Receive again, taps Cash, switches to MVR, enters MVR 1,000 at 20.00 and saves. After each save it waits until the form has left, the new card exists and no element carries data-motion.

Expected: On opening, the Receive form has one role=radiogroup named Method placed after the amount field and before the date chip, with radios Cash, Cheque, Transfer in that order and only Cheque aria-checked=true. The service role then reads three entries, oldest first, kind 'receive', with method 'cheque', 'transfer' and 'cash' respectively.

Falsifier: Cheque not chosen on opening, more or less than one radio checked, or a stored method other than the one chosen fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/receive-method.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive-method.spec.ts`
## Method value 3: the method on Home's cards and in the entry sheet

### Purpose
Let the owner read each entry's method at a glance on Home and in full in its sheet.

### Constraints
- The visual reference is the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa (artboards Send, Receive, Home and Entry sheet) as approved by the owner on 2026-10-16. The app's tokens in src/ui/theme.css stay: page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a with deep #1b3f6e, Abbaas teal #0f6f68 with deep #0b5750, hairline #cfd9d6, Manrope for titles and figures, Source Sans 3 for text, the one curve --curve. Light theme only.
- The attribute contract integrated at 112e554 stays in force and every existing acceptance spec keeps passing: Home's data-box with data-state and data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action (send/receive), data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-date, data-sheet-delete, data-sheet-close, data-sheet-actions.
- The method contract this Request adds, shared by all three values: the database column public.entries.method is text, nullable, with a check that it is one of 'cash', 'cheque', 'transfer', added by supabase/migrations/0002_entry_method.sql; LedgerEntry and NewEntry in src/ports/ledger-store.ts carry method: 'cash' | 'cheque' | 'transfer' | null (NewEntry's is never null from the forms). In each form the Method control is one element with role=radiogroup whose accessible name is 'Method', holding exactly three buttons with role=radio, accessible names 'Cash', 'Cheque' and 'Transfer' in that order, data-method='cash'|'cheque'|'transfer', and aria-checked='true' on exactly one. On Home a card whose entry has a method holds one element data-entry-method='<stored word>' whose text is 'Cash', 'Cheque' or 'Transfer'; a card whose method is null holds none. In the sheet the Method line carries data-sheet-method and reads 'Method' and the word; it is absent when the method is null.
- The acceptance support (tests/support/accounts.ts) reads and seeds entries without the method column; a spec that must read or seed method does so itself through @supabase/supabase-js createClient(stack.apiUrl, stack.serviceRoleKey) on the entries table, filtered by the account's user_id, or through the bundle's own forms.
- No policy change: the existing entries policies and grants cover the new column. The migration is applied to the local stack by the acceptance support's db reset; pushing it to the cloud project is the owner's step after integration.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | The method tag on the card's amount line, nearest the centre line. |
| `src/ui/entry-sheet.ts` | EXTEND | The Method line above Date. |
| `src/ui/theme.css` | EXTEND | The tag and the sheet line. |

### Paradigm
functional

### Decisions
- Value 1 has already added entries.method and LedgerEntry.method ('cash' | 'cheque' | 'transfer' | null), read by the Supabase adapter.
- A Home card whose entry has a method shows, on its amount line, a pill: height 20 px, padding 0 7 px, radius 999 px, white at about 78 % opacity, the card's colour (#24508a for a send, #0f6f68 for a payment), 11 px weight 700, an 11 px stroke icon then Cash, Cheque or Transfer. The amount stays on the card's outer edge and the pill sits at the inner edge, nearest the centre line. It carries data-entry-method with the stored word. A card whose method is null has no pill and reads as integrated.
- The tag is part of the card's resting look: the travelling-card motion moves it with the card and adds no motion of its own.
- The entry sheet shows, directly above the Date line, a row labelled Method whose value is the same icon and word, carrying data-sheet-method; a null method has no such row.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| entry-amount | `src/ui/home.ts:163` | EXTEND | The amount line gains the tag. |
| renderRow | `src/ui/entry-sheet.ts:51` | REUSE | The sheet's rows are built by one helper; the Method row is one more of them. |

### Prefactoring
Not applicable: The forms, the store and the cards are extended in place; nothing must move first.

### Agreement analysis
Not applicable: The store's outcome shapes are unchanged; LedgerEntry and NewEntry gain one field whose values are named in the method contract.

### Boundaries
- Driving port: The built bundle's DOM: the Send and Receive forms, Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read and deleted over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The insert cannot reach the server. | Outcome: Retry | Observation: The form stays open with Could not save. Try again. and nothing is stored, as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: On Home every entry card whose entry has a stored method shows a small tag with its icon and Cash, Cheque or Transfer on the amount line nearest the centre line, and tapping the card opens a sheet with a Method line above Date naming it; an entry stored without a method shows no tag and no Method line.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha; through the service role, all dated the device's today, it stores a USD send of $250.00 to Mariyam Nisha with method 'cheque', a USD payment of $300.00 from Abbaas with method 'cash', an MVR send of MVR 10,000 at 20.00 ($500.00) to Mariyam Nisha with method 'transfer', and a USD send of $90.00 to Mariyam Nisha with method null. A Chromium context at 390 by 844 signs in and waits until no element carries data-motion, then taps each card in turn, waits for rest, reads the sheet and closes it.

Expected: Home shows four data-entry cards. The $250.00 card holds one data-entry-method='cheque' reading 'Cheque', the $300.00 card one 'cash' reading 'Cash', the $500.00 card one 'transfer' reading 'Transfer', and the $90.00 card none. On a send card the tag's box lies left of the amount's box (toward the centre line) and on the payment card right of it. Each sheet has a data-sheet-method line reading Method and the same word, placed before the data-sheet-date line, except the $90.00 entry's sheet, which has no data-sheet-method.

Falsifier: A missing, wrong or extra tag, a tag on the outer edge, a Method line on an entry without a method, or a missing or wrong Method line fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-method.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-method.spec.ts`
## Third line value 1: the method takes the detail line's place

### Purpose
Draw each entry's method as its card's third line so the tag can never overflow, and take the currency detail off Home.

### Constraints
- The visual reference is the Home artboard of the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa as revised on 2026-10-16: each card reads its amount, then its person (to <name>) or from Abbaas, then its method's icon and word; no currency detail. The app's tokens in src/ui/theme.css stay (page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a, Abbaas teal #0f6f68, Manrope for figures, Source Sans 3 for text). Light theme only.
- The attribute contract integrated at edf9bd1 stays in force and every acceptance spec not rewritten by this Request keeps passing: data-box, data-state, data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-side (left for a payment, right for a send), data-kind, data-action, data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-method, data-sheet-date, data-sheet-delete, data-sheet-close, data-sheet-actions; the forms' Method radio group (role=radiogroup named Method, role=radio Cash/Cheque/Transfer with data-method and aria-checked; Send opens on Transfer, Receive on Cheque).
- The card contract after this Request, shared by all three values: a Home card (the element carrying data-entry) holds, in this order, the amount (e.g. '$500.00', the only content of its first line), the party line ('to <person>' for a send, 'from Abbaas' for a payment), and, only when the stored method is not null, one element carrying data-entry-method='cash'|'cheque'|'transfer' whose text is exactly 'Cash', 'Cheque' or 'Transfer' with an icon before it. The card's text contains neither 'Paid in USD' nor 'MVR' nor ' at <rate>'. The card's box contains every one of its children's boxes (nothing overflows) at viewport widths 360 and 390.
- Seeding: tests/support/accounts.ts seedHistory stores entries with a null method; a spec that needs a stored method seeds it itself through @supabase/supabase-js createClient(stack.apiUrl, stack.serviceRoleKey) on public.entries, or saves through the forms (Send defaults to transfer, Receive to cheque).
- No schema, policy or store change.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | The amount line holds only the amount; the method replaces the detail line; no third line for a null method. |
| `src/ui/theme.css` | EXTEND | The method line's look: icon in the card's colour, word in muted 12 px weight 600, aligned to the outer edge. |

### Paradigm
functional

### Decisions
- The card's first line is the amount alone; the method pill on the amount line is removed.
- The card's third line is the method: an inline line (not a pill) with a 12 px stroke icon in the card's colour (#24508a send, #0f6f68 payment) then the word in 12 px weight 600 #4c5f5b, aligned to the card's outer edge like the lines above; it carries data-entry-method with the stored word and its text is exactly the word.
- The currency detail line (Paid in USD, or MVR <amount> at <rate>) is no longer rendered on Home.
- A card whose method is null renders only the amount and party lines.
- The sheet's lines are unchanged: data-sheet-mvr and data-sheet-rate for MVR, data-sheet-method above data-sheet-date.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| renderMethodTag | `src/ui/home.ts:181` | EXTEND | The tag builder becomes the third-line builder. |
| amountLine | `src/ui/home.ts:244` | EXTEND | The amount line drops the tag. |

### Prefactoring
Not applicable: The card is changed in place.

### Agreement analysis
Not applicable: No port or outcome shape changes.

### Boundaries
- Driving port: The built bundle's DOM: Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The ledger cannot be read. | Outcome: Retry | Observation: Home shows Could not load the ledger. Try again., as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: On Home a card whose entry has a stored method shows, as its third line under the person, the method's icon and Cash, Cheque or Transfer in place of the currency detail, and its first line holds the amount alone; a card whose entry has no method has no third line; the entry's sheet still names the method above Date.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person Mariyam Nisha; through the service role, all dated the device's today, it stores a USD send of $250.00 to Mariyam Nisha with method 'cheque', a USD payment of $300.00 from Abbaas with method 'cash', an MVR send of MVR 10,000 at 20.00 ($500.00) to Mariyam Nisha with method 'transfer', a USD send of $1,290.00 to Mariyam Nisha with method 'transfer', and a USD send of $90.00 to Mariyam Nisha with method null. A Chromium context at 390 by 844, and again at 360 by 780, signs in and waits until no element carries data-motion, then taps each card in turn, waits for rest, reads the sheet and closes it.

Expected: Home shows five data-entry cards. Each card with a method holds exactly one data-entry-method element with the stored word and the text Cash, Cheque or Transfer, placed below the party line (its top at or below the party line's bottom); the amount is the only text on the first line; no card's text contains 'Paid in USD', 'MVR' or ' at 20.00'; the $90.00 card holds no data-entry-method and has only two lines. At both widths every card's box contains the boxes of its amount, party and method elements. Each sheet with a method has a data-sheet-method line reading Method and the word before data-sheet-date; the $500.00 sheet reads MVR 10,000 and the rate 20.00; the $90.00 sheet has no data-sheet-method.

Falsifier: A method on the amount line, a currency detail on a card, a method element overflowing its card at 360 or 390 px, a missing or wrong method line, or a third line on a card without a method fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-method.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-method.spec.ts`
## Third line value 2: Home at rest without the currency detail

### Purpose
Keep the travelling-cards resting layout exactly while the cards drop their currency detail.

### Constraints
- The visual reference is the Home artboard of the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa as revised on 2026-10-16: each card reads its amount, then its person (to <name>) or from Abbaas, then its method's icon and word; no currency detail. The app's tokens in src/ui/theme.css stay (page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a, Abbaas teal #0f6f68, Manrope for figures, Source Sans 3 for text). Light theme only.
- The attribute contract integrated at edf9bd1 stays in force and every acceptance spec not rewritten by this Request keeps passing: data-box, data-state, data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-side (left for a payment, right for a send), data-kind, data-action, data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-method, data-sheet-date, data-sheet-delete, data-sheet-close, data-sheet-actions; the forms' Method radio group (role=radiogroup named Method, role=radio Cash/Cheque/Transfer with data-method and aria-checked; Send opens on Transfer, Receive on Cheque).
- The card contract after this Request, shared by all three values: a Home card (the element carrying data-entry) holds, in this order, the amount (e.g. '$500.00', the only content of its first line), the party line ('to <person>' for a send, 'from Abbaas' for a payment), and, only when the stored method is not null, one element carrying data-entry-method='cash'|'cheque'|'transfer' whose text is exactly 'Cash', 'Cheque' or 'Transfer' with an icon before it. The card's text contains neither 'Paid in USD' nor 'MVR' nor ' at <rate>'. The card's box contains every one of its children's boxes (nothing overflows) at viewport widths 360 and 390.
- Seeding: tests/support/accounts.ts seedHistory stores entries with a null method; a spec that needs a stored method seeds it itself through @supabase/supabase-js createClient(stack.apiUrl, stack.serviceRoleKey) on public.entries, or saves through the forms (Send defaults to transfer, Receive to cheque).
- No schema, policy or store change.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/theme.css` | EXTEND | The rules of the removed detail line and of the amount-line pill are removed. |

### Paradigm
functional

### Decisions
- The resting layout stays as integrated: sends right of the centre line and payments left at every width from 360 px, the round dot in the card's colour on the line, the after line on the other half, and the totals You received (left) and Abbaas received (right).
- Stylesheet rules that only styled the removed detail line (.entry-detail) or the amount-line pill are removed, so nothing styles markup that no longer exists.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| .entry-detail | `src/ui/theme.css:582` | EXTEND | The detail line's rule goes with the line. |

### Prefactoring
Not applicable: The card is changed in place.

### Agreement analysis
Not applicable: No port or outcome shape changes.

### Boundaries
- Driving port: The built bundle's DOM: Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The ledger cannot be read. | Outcome: Retry | Observation: Home shows Could not load the ledger. Try again., as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Home at rest still reads as the travelling-cards board, with sends right and payments left of the centre line, the dot, the after lines and the totals, and no card shows a currency detail such as Paid in USD or MVR 10,000 at 20.00 any more: a card reads its amount, then its person or from Abbaas, then its method when it has one.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with people Ahmed Shifaz and Mariyam Nisha and, through seedHistory (method null), the four-entry history the integrated entry-list spec seeds: today a $340.00 USD send to Ahmed Shifaz; the middle day a $300.00 USD payment and a $500.00 MVR send (MVR 10,000 at 20.00) to Ahmed Shifaz; the earliest day a $250.00 USD send to Mariyam Nisha. A Chromium context at 360, 390 and 560 px wide signs in and waits until no element carries data-motion.

Expected: Every assertion of the integrated entry-list spec about days, order, sides, dots, after lines, boxes, counts and totals holds as before, and for each card the old detail assertion is replaced: the card's text contains its amount and its party and contains neither 'Paid in USD' nor 'MVR' nor ' at 20.00', and, its method being null, it holds no data-entry-method element.

Falsifier: Any currency detail on a card, a card on the wrong side, a missing dot or after line, a wrong total, or a method element on a null-method entry fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/entry-list.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-method.spec.ts`
## Third line value 3: an MVR send without the MVR figure on its card

### Purpose
An MVR send keeps every stored figure; Home shows only its dollars, person and method, and the sheet keeps the rufiyaa and the rate.

### Constraints
- The visual reference is the Home artboard of the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa as revised on 2026-10-16: each card reads its amount, then its person (to <name>) or from Abbaas, then its method's icon and word; no currency detail. The app's tokens in src/ui/theme.css stay (page #f4f7f6, ink #0d1f1c, muted #4c5f5b, You blue #24508a, Abbaas teal #0f6f68, Manrope for figures, Source Sans 3 for text). Light theme only.
- The attribute contract integrated at edf9bd1 stays in force and every acceptance spec not rewritten by this Request keeps passing: data-box, data-state, data-amount, data-square, data-total (sent/paid), data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-side (left for a payment, right for a send), data-kind, data-action, data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine; the sheet's data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-method, data-sheet-date, data-sheet-delete, data-sheet-close, data-sheet-actions; the forms' Method radio group (role=radiogroup named Method, role=radio Cash/Cheque/Transfer with data-method and aria-checked; Send opens on Transfer, Receive on Cheque).
- The card contract after this Request, shared by all three values: a Home card (the element carrying data-entry) holds, in this order, the amount (e.g. '$500.00', the only content of its first line), the party line ('to <person>' for a send, 'from Abbaas' for a payment), and, only when the stored method is not null, one element carrying data-entry-method='cash'|'cheque'|'transfer' whose text is exactly 'Cash', 'Cheque' or 'Transfer' with an icon before it. The card's text contains neither 'Paid in USD' nor 'MVR' nor ' at <rate>'. The card's box contains every one of its children's boxes (nothing overflows) at viewport widths 360 and 390.
- Seeding: tests/support/accounts.ts seedHistory stores entries with a null method; a spec that needs a stored method seeds it itself through @supabase/supabase-js createClient(stack.apiUrl, stack.serviceRoleKey) on public.entries, or saves through the forms (Send defaults to transfer, Receive to cheque).
- No schema, policy or store change.

### Targets
| Path | Decision | Reason |
|---|---|---|
| `src/ui/home.ts` | EXTEND | detailOf, which only fed the removed detail line, is deleted with its imports. |

### Paradigm
functional

### Decisions
- Saving an MVR send is unchanged: amount_minor in laari, the rate, usd_cents, the person and the method (transfer unless tapped otherwise) are stored.
- Home's card for it reads the dollar amount, 'to <person>' and the method line, and no MVR figure or rate.
- The sheet keeps data-sheet-mvr (e.g. 'MVR 10,000') and data-sheet-rate (e.g. '20.00') as integrated.

### Reuse analysis
| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| detailOf | `src/ui/home.ts:121` | EXTEND | Nothing reads it once the detail line is gone. |

### Prefactoring
Not applicable: The card is changed in place.

### Agreement analysis
Not applicable: No port or outcome shape changes.

### Boundaries
- Driving port: The built bundle's DOM: Home's entry cards and the entry sheet.
- Driven port: LedgerStore: entries read over PostgREST under row-level security.
- Dependency direction: UI modules depend on port types; the Supabase adapter implements the port; main.ts composes them.
- Failure: Condition: The ledger cannot be read. | Outcome: Retry | Observation: Home shows Could not load the ledger. Try again., as integrated.

### Acceptance supports
- `tests/support/local-stack.ts`
- `tests/support/accounts.ts`
- `tests/playwright.config.ts`

### Public oracle
Observation: Saving an MVR send still stores the MVR amount, the rate and the USD value; once Home rests its card reads $500.00, the person and Transfer, with no MVR figure, wholly right of the centre line, and its sheet reads MVR 10,000 and the rate 20.00.

Stimulus: The acceptance support starts the local stack, builds and serves the bundle and creates an account with one saved person; a Chromium context at 390 by 844 signs in, opens Send, switches to MVR, enters MVR 10,000 and the rate 20.00, chooses the saved person, saves, and waits until the form has left, the new card exists and no element carries data-motion; then it taps the card and waits for rest.

Expected: Every assertion of the integrated send-mvr spec about the form, the worked dollars, storage (amount_minor 1000000, rate 20, usd_cents 50000, currency MVR) and the card resting wholly right of the centre line holds as before; the card's text contains '$500.00', the person and 'Transfer' and does not contain 'MVR' or '20.00'; the service role reads method 'transfer'; the sheet's data-sheet-mvr reads MVR 10,000 and data-sheet-rate 20.00.

Falsifier: An MVR figure or rate on the card, a lost MVR amount or rate in storage or in the sheet, or a card off Abbaas's side fails the check.

### Oracle and verification
Oracle target locator: `tests/acceptance/send-mvr.spec.ts`

Verification command: `npm ci`
Verification command: `npx playwright install chromium`
Verification command: `npm run build`
Verification command: `npm run test:acceptance -- tests/acceptance/empty-home.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/sign-in-and-own-ledger.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-list.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-usd.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-mvr.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/undo.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/motion.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entrances.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/layout-and-install.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-sheet.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/delete-entry.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/send-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/receive-method.spec.ts`
Verification command: `npm run test:acceptance -- tests/acceptance/entry-method.spec.ts`
