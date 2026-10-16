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
import { createAccount, seedPerson, type Account } from '../support/accounts.js'

// Method value 1: the Send form's Method row, stored.
//
// Judged through the declared public port only: the built bundle's DOM as a phone
// browser sees it - the Send form's role=radiogroup named Method, its three
// role=radio options with their accessible names, data-method values and
// aria-checked, and where that group sits between the amount field and the Paid
// to chips - and, outside the browser, the method each save actually stored.
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
  email: 'owner-send-method@abbaas.test',
  password: 'send-method-password-1',
} as const

const SAVED_PERSON = 'Mariyam Nisha'
const RATE_LABEL = 'Rate · MVR per $1'

/** The three options, in the order the method contract fixes them. */
const OPTIONS = [
  { method: 'cash', name: 'Cash' },
  { method: 'cheque', name: 'Cheque' },
  { method: 'transfer', name: 'Transfer' },
] as const

let stack: Stack
let served: ServedOrigin
let account: Account
let savedPersonId: string

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, ACCOUNT)
  savedPersonId = await seedPerson(stack, account, SAVED_PERSON)
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

const openSendForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  await settled(page)
  return form
}

/** The white save button, whatever dollar value it currently names. */
const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Send · \$/ })

/**
 * A save is answered by Home, not by the tap: between the tap and the store's
 * reply nothing is displaced yet, so a bare rest wait would pass at once while
 * the new card is still travelling. Both the answer and the rest are waited for.
 */
const atRestAfterSave = async (page: Page, expectedEntries: number): Promise<void> => {
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(expectedEntries)
  await settled(page)
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

/** Fills in the person and saves, which is the same tail for each of the three sends. */
const choosePersonAndSave = async (page: Page, buttonName: string): Promise<void> => {
  const chip = page.locator(`[data-person-chip="${savedPersonId}"]`)
  await expect(chip).toHaveText(SAVED_PERSON)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  const save = page.getByRole('button', { name: buttonName })
  await expect(save).toBeEnabled()
  await save.click()
}

test('the Send form offers Cash, Cheque and Transfer between the amount and Paid to with Transfer chosen, keeps a tapped choice across the currency switch, and stores the chosen method with the entry', async ({
  page,
}) => {
  await signIn(page)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // ===== 1. Opening the form: the row is there, Transfer is chosen. =====
  const form = await openSendForm(page)

  const group = methodGroup(page)
  await expect(group).toHaveCount(1)
  await expect(group).toBeVisible()
  // The group belongs to the Send form, not somewhere else on the page.
  await expect(form.getByRole('radiogroup', { name: 'Method' })).toHaveCount(1)

  // Exactly three options, named and ordered as the contract fixes them.
  const radios = group.getByRole('radio')
  await expect(radios).toHaveCount(3)
  for (const [index, option] of OPTIONS.entries()) {
    const radio = radios.nth(index)
    await expect(radio).toHaveAccessibleName(option.name)
    await expect(radio).toHaveAttribute('data-method', option.method)
  }

  // Transfer is chosen on opening, and it is the only one chosen.
  await expectOnlyChosen(page, 'Transfer')

  // ----- Where the row sits: under the amount and above Paid to. -----
  // The three rectangles are read in one pass with getBoundingClientRect, which
  // never scrolls, so the comparison holds even when the form's content area
  // scrolls and the chips sit below the fold.
  const amountHandle = await page.getByLabel('Amount sent').elementHandle()
  const groupHandle = await group.elementHandle()
  const chipHandle = await page.locator(`[data-person-chip="${savedPersonId}"]`).elementHandle()
  if (!amountHandle || !groupHandle || !chipHandle) {
    throw new Error('The amount field, the Method group and the person chip must all be present')
  }
  const placement = await page.evaluate(
    ([amount, methodRow, chip]) => ({
      amountBottom: (amount as Element).getBoundingClientRect().bottom,
      groupTop: (methodRow as Element).getBoundingClientRect().top,
      groupBottom: (methodRow as Element).getBoundingClientRect().bottom,
      chipTop: (chip as Element).getBoundingClientRect().top,
    }),
    [amountHandle, groupHandle, chipHandle],
  )
  expect(
    placement.groupTop,
    'the Method row is under the amount, not above it',
  ).toBeGreaterThanOrEqual(placement.amountBottom)
  expect(
    placement.groupBottom,
    'the Method row is above Paid to, not below it',
  ).toBeLessThanOrEqual(placement.chipTop)

  // ===== 2. A USD send saved without touching Method stores transfer. =====
  await page.getByLabel('Amount sent').fill('120.00')
  await expectOnlyChosen(page, 'Transfer')
  await choosePersonAndSave(page, 'Send · $120.00')
  await atRestAfterSave(page, 1)

  // ===== 3. Tapping Cash chooses it, and the switch to MVR keeps it. =====
  await openSendForm(page)
  // Each opening starts from Transfer again: the last choice is not remembered.
  await expectOnlyChosen(page, 'Transfer')

  await methodGroup(page).locator('[data-method="cash"]').click()
  await expectOnlyChosen(page, 'Cash')

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
  await page.getByLabel('Amount sent').fill('3,000')
  await rate.fill('20')
  await expect(page.locator('[data-usd]')).toHaveText('$150.00')
  // Still Cash once the rate row is open and the dollars are worked out.
  await expectOnlyChosen(page, 'Cash')

  await choosePersonAndSave(page, 'Send · $150.00')
  await atRestAfterSave(page, 2)

  // ===== 4. Tapping Cheque on a third, USD send. =====
  await openSendForm(page)
  await expectOnlyChosen(page, 'Transfer')
  await methodGroup(page).locator('[data-method="cheque"]').click()
  await expectOnlyChosen(page, 'Cheque')

  await page.getByLabel('Amount sent').fill('40')
  await choosePersonAndSave(page, 'Send · $40.00')
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
  expect(first.method).toBe('transfer')
  expect(first.kind).toBe('send')
  expect(first.currency).toBe('USD')
  expect(first.amount_minor).toBe(12000)
  expect(first.usd_cents).toBe(12000)
  expect(first.person_name).toBe(SAVED_PERSON)

  // The method survived the currency switch all the way into storage.
  expect(second.method).toBe('cash')
  expect(second.kind).toBe('send')
  expect(second.currency).toBe('MVR')
  expect(second.amount_minor).toBe(300000)
  expect(second.usd_cents).toBe(15000)
  expect(second.person_name).toBe(SAVED_PERSON)

  expect(third.method).toBe('cheque')
  expect(third.kind).toBe('send')
  expect(third.currency).toBe('USD')
  expect(third.amount_minor).toBe(4000)
  expect(third.usd_cents).toBe(4000)
  expect(third.person_name).toBe(SAVED_PERSON)

  // Read as one sequence: each save stored the method chosen for it, so a form
  // that always wrote 'transfer', or always wrote the last tap, fails here.
  expect(stored.map((row) => row.method)).toEqual(['transfer', 'cash', 'cheque'])
})
