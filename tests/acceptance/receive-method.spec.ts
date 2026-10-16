import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, type Account } from '../support/accounts.js'

// Method value 2: the Receive form's Method row, stored.
//
// Judged through the declared public port only: the built bundle's DOM as a phone
// browser sees it - the Receive form's role=radiogroup named Method, its three
// role=radio options with their accessible names, data-method values and
// aria-checked, where that group sits between the amount block and the date chip,
// and the two drawn facts the board fixes for it (the 52 px track, the chosen
// option's #0b5750 text) - and, outside the browser, the method each save really
// stored.
//
// A repayment from Abbaas names nobody, so nothing is chosen on this form but the
// amount, the currency and the method: no person is seeded here.
//
// The stored method is read here rather than through tests/support/accounts.ts,
// because that support reads entries without the method column; this spec opens
// its own service-role client on the entries table, filtered by the account's
// user_id, as the method contract directs.

const PASSWORD_FIELD = 'input[type="password"]'
// The refined board is read at this phone size, which the stimulus fixes.
const VIEWPORT = { width: 390, height: 844 } as const

test.use({ viewport: VIEWPORT })
test.describe.configure({ mode: 'serial' })

const ACCOUNT = {
  email: 'owner-receive-method@abbaas.test',
  password: 'receive-method-password-2',
} as const

const RATE_LABEL = 'Rate · MVR per $1'

/** The three options, in the order the method contract fixes them. */
const OPTIONS = [
  { method: 'cash', name: 'Cash' },
  { method: 'cheque', name: 'Cheque' },
  { method: 'transfer', name: 'Transfer' },
] as const

/** Abbaas teal deep, the token the chosen option's text is drawn in. */
const CHOSEN_INK = 'rgb(11, 87, 80)'
/** The height of the board's Method track, shared with the Send form. */
const TRACK_HEIGHT = 52

let stack: Stack
let served: ServedOrigin
let account: Account

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, ACCOUNT)
})

test.afterAll(async () => {
  await served?.close()
})

/**
 * What the account actually stored, oldest first, read outside the browser with
 * the service role so a method merely painted on the form is caught.
 */
type StoredMethodRow = {
  readonly kind: string
  readonly currency: string
  readonly amount_minor: number
  readonly usd_cents: number
  readonly person_name: string | null
  readonly method: string | null
}

const readStoredEntries = async (): Promise<readonly StoredMethodRow[]> => {
  const admin = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin
    .from('entries')
    .select('kind, currency, amount_minor, usd_cents, person_name, method')
    .eq('user_id', account.userId)
    .order('saved_at', { ascending: true })
  if (error || !data) {
    throw new Error(`Could not read entries: ${error?.message ?? 'no rows returned'}`)
  }
  return data as readonly StoredMethodRow[]
}

/**
 * Home's entrance, the form's rows and the travelling card all mark what is
 * still moving with data-motion. Every reading below is taken once nothing does.
 */
const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

const signIn = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  await settled(page)
}

const openReceiveForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="receive"]').click()
  const form = page.locator('[data-form="receive"]')
  await expect(form).toBeVisible()
  await settled(page)
  return form
}

const methodGroup = (page: Page): Locator => page.getByRole('radiogroup', { name: 'Method' })

/**
 * Exactly one option is chosen, and it is the named one. Both halves matter: the
 * contract says aria-checked='true' on exactly one of the three, so a form that
 * checks the tapped option without unchecking the last one fails here.
 */
const expectOnlyChosen = async (page: Page, chosen: string): Promise<void> => {
  const group = methodGroup(page)
  await expect(group.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1)
  for (const option of OPTIONS) {
    await expect(group.locator(`[data-method="${option.method}"]`)).toHaveAttribute(
      'aria-checked',
      option.name === chosen ? 'true' : 'false',
    )
  }
}

/** The colour one option's text is drawn in, as the browser resolves it. */
const inkOf = async (page: Page, method: string): Promise<string> => {
  const handle = await methodGroup(page).locator(`[data-method="${method}"]`).elementHandle()
  if (!handle) throw new Error(`The ${method} option must be present`)
  return page.evaluate(
    (option) => getComputedStyle(option as Element).color,
    handle,
  )
}

/**
 * A save is answered by Home, not by the tap: between the tap and the store's
 * reply nothing is displaced yet, so a bare rest wait would pass at once while
 * the new card is still travelling. Both the answer and the rest are waited for.
 */
const atRestAfterSave = async (page: Page, expectedEntries: number): Promise<void> => {
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(expectedEntries)
  await settled(page)
}

const save = async (page: Page, buttonName: string): Promise<void> => {
  const button = page.getByRole('button', { name: buttonName })
  await expect(button).toBeEnabled()
  await button.click()
}

test('the Receive form offers Cash, Cheque and Transfer between the amount and the date with Cheque chosen, keeps a tapped choice across the currency switch, and stores the chosen method with the payment', async ({
  page,
}) => {
  await signIn(page)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // ===== 1. Opening the form: the row is there, Cheque is chosen. =====
  const form = await openReceiveForm(page)

  const group = methodGroup(page)
  await expect(group).toHaveCount(1)
  await expect(group).toBeVisible()
  // The group belongs to the Receive form, not somewhere else on the page.
  await expect(form.getByRole('radiogroup', { name: 'Method' })).toHaveCount(1)

  // Exactly three options, named and ordered as the contract fixes them.
  const radios = group.getByRole('radio')
  await expect(radios).toHaveCount(3)
  for (const [index, option] of OPTIONS.entries()) {
    const radio = radios.nth(index)
    await expect(radio).toHaveAccessibleName(option.name)
    await expect(radio).toHaveAttribute('data-method', option.method)
  }

  // Cheque is chosen on opening, and it is the only one chosen.
  await expectOnlyChosen(page, 'Cheque')

  // ----- The two drawn facts: the 52 px track, and the chosen option's ink. -----
  // The track is the group itself, which is what holds the three options.
  const trackHeight = await group.evaluate((track) => track.getBoundingClientRect().height)
  expect(trackHeight, 'the Method track is the board’s 52 px tall').toBeCloseTo(
    TRACK_HEIGHT,
    0,
  )
  // Teal deep marks the chosen option, and only the chosen one: were an
  // unchosen option drawn in it too, the mark would say nothing.
  expect(await inkOf(page, 'cheque')).toBe(CHOSEN_INK)
  expect(await inkOf(page, 'cash')).not.toBe(CHOSEN_INK)
  expect(await inkOf(page, 'transfer')).not.toBe(CHOSEN_INK)

  // ----- Where the row sits: under the amount and above the date. -----
  // The three rectangles are read in one pass with getBoundingClientRect, which
  // never scrolls, so the comparison holds even when the form's content area
  // scrolls and the date chip sits below the fold.
  const amountHandle = await page.getByLabel('Amount received').elementHandle()
  const groupHandle = await group.elementHandle()
  // The date input lies over the whole of the chip, so its top is the chip's top.
  const dateHandle = await page.getByLabel('Date').elementHandle()
  if (!amountHandle || !groupHandle || !dateHandle) {
    throw new Error('The amount field, the Method group and the date must all be present')
  }
  const placement = await page.evaluate(
    ([amount, methodRow, date]) => ({
      amountBottom: (amount as Element).getBoundingClientRect().bottom,
      groupTop: (methodRow as Element).getBoundingClientRect().top,
      groupBottom: (methodRow as Element).getBoundingClientRect().bottom,
      dateTop: (date as Element).getBoundingClientRect().top,
    }),
    [amountHandle, groupHandle, dateHandle],
  )
  expect(
    placement.groupTop,
    'the Method row is under the amount, not above it',
  ).toBeGreaterThanOrEqual(placement.amountBottom)
  expect(
    placement.groupBottom,
    'the Method row is above the date, not below it',
  ).toBeLessThanOrEqual(placement.dateTop)

  // ===== 2. A USD payment saved without touching Method stores cheque. =====
  await page.getByLabel('Amount received').fill('300.00')
  await expectOnlyChosen(page, 'Cheque')
  await save(page, 'Receive · $300.00')
  await atRestAfterSave(page, 1)

  // ===== 3. Tapping Cash chooses it, and the switch to MVR keeps it. =====
  await openReceiveForm(page)
  // Each opening starts from Cheque again: the last choice is not remembered.
  await expectOnlyChosen(page, 'Cheque')

  await methodGroup(page).locator('[data-method="cash"]').click()
  await expectOnlyChosen(page, 'Cash')
  // The teal mark moved with the tap.
  expect(await inkOf(page, 'cash')).toBe(CHOSEN_INK)
  expect(await inkOf(page, 'cheque')).not.toBe(CHOSEN_INK)

  await page.getByRole('button', { name: 'MVR', exact: true }).click()
  await settled(page)
  await expect(page.getByRole('button', { name: 'MVR', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // The currency changed; the method did not.
  await expectOnlyChosen(page, 'Cash')

  const rate = page.getByLabel(RATE_LABEL)
  await expect(rate).toBeVisible()
  await page.getByLabel('Amount received').fill('3,000')
  await rate.fill('20')
  await expect(page.locator('[data-usd]')).toHaveText('$150.00')
  // Still Cash once the rate row is open and the dollars are worked out, and
  // the row is still read between the amount block and the date.
  await expectOnlyChosen(page, 'Cash')

  const openRateHandle = await page.getByLabel(RATE_LABEL).elementHandle()
  const openGroupHandle = await methodGroup(page).elementHandle()
  const openDateHandle = await page.getByLabel('Date').elementHandle()
  if (!openRateHandle || !openGroupHandle || !openDateHandle) {
    throw new Error('The rate field, the Method group and the date must all be present')
  }
  const mvrPlacement = await page.evaluate(
    ([rateField, methodRow, date]) => ({
      rateBottom: (rateField as Element).getBoundingClientRect().bottom,
      groupTop: (methodRow as Element).getBoundingClientRect().top,
      groupBottom: (methodRow as Element).getBoundingClientRect().bottom,
      dateTop: (date as Element).getBoundingClientRect().top,
    }),
    [openRateHandle, openGroupHandle, openDateHandle],
  )
  expect(
    mvrPlacement.groupTop,
    'the Method row is under the opened rate row, not above it',
  ).toBeGreaterThanOrEqual(mvrPlacement.rateBottom)
  expect(
    mvrPlacement.groupBottom,
    'the Method row is still above the date in MVR',
  ).toBeLessThanOrEqual(mvrPlacement.dateTop)

  await save(page, 'Receive · $150.00')
  await atRestAfterSave(page, 2)

  // ===== 4. Tapping Transfer on a third, USD payment. =====
  await openReceiveForm(page)
  await expectOnlyChosen(page, 'Cheque')
  await methodGroup(page).locator('[data-method="transfer"]').click()
  await expectOnlyChosen(page, 'Transfer')

  await page.getByLabel('Amount received').fill('40')
  await save(page, 'Receive · $40.00')
  await atRestAfterSave(page, 3)

  // ===== 5. What was stored, read outside the browser, oldest first. =====
  const stored = await readStoredEntries()
  expect(stored).toHaveLength(3)

  const [first, second, third] = stored as readonly [
    StoredMethodRow,
    StoredMethodRow,
    StoredMethodRow,
  ]

  // The untouched form stored its default, not null and not something else.
  expect(first.method).toBe('cheque')
  expect(first.kind).toBe('receive')
  expect(first.currency).toBe('USD')
  expect(first.amount_minor).toBe(30000)
  expect(first.usd_cents).toBe(30000)
  // A repayment from Abbaas names nobody, and that stays as integrated.
  expect(first.person_name).toBeNull()

  // The method survived the currency switch all the way into storage.
  expect(second.method).toBe('cash')
  expect(second.kind).toBe('receive')
  expect(second.currency).toBe('MVR')
  expect(second.amount_minor).toBe(300000)
  expect(second.usd_cents).toBe(15000)
  expect(second.person_name).toBeNull()

  expect(third.method).toBe('transfer')
  expect(third.kind).toBe('receive')
  expect(third.currency).toBe('USD')
  expect(third.amount_minor).toBe(4000)
  expect(third.usd_cents).toBe(4000)
  expect(third.person_name).toBeNull()

  // Read as one sequence: each save stored the method chosen for it, so a form
  // that always wrote 'cheque', or always wrote the last tap, fails here.
  expect(stored.map((row) => row.method)).toEqual(['cheque', 'cash', 'transfer'])
})
