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
import { createAccount, readEntries, seedPerson, type Account } from '../support/accounts.js'

// Third line value 3: an MVR send without the MVR figure on its card.
//
// Judged through the declared public port only: the built bundle's DOM (the
// currency switch with its sliding data-pill, data-prefix, the 'Rate · MVR per $1'
// card beside the white 'In dollars' card with its data-usd output, the Method
// radio group, the white 'Send · $X' button, Home's centre-line card with its
// three lines, the entry's sheet and the balance boxes) and, outside the browser,
// the row the app stored.
//
// The rufiyaa figure and the rate are kept where they belong: in storage and on
// the sheet. They are no longer drawn on the card, whose lines are the amount,
// the person and the method.
//
// The stored method is read here rather than through tests/support/accounts.ts,
// because that support reads entries without the method column; this spec opens
// its own service-role client on the entries table, filtered by the account's
// user_id, as the seeding contract directs.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 390, height: 844 } as const

test.use({ viewport: VIEWPORT })

const MVR_ACCOUNT = {
  email: 'owner-send-mvr@abbaas.test',
  password: 'send-mvr-password-4',
} as const

const SAVED_PERSON = 'Ahmed Shifaz'

const RATE_LABEL = 'Rate · MVR per $1'
const USD_NOTE = 'Dollars go straight onto the balance. No rate needed.'

let stack: Stack
let served: ServedOrigin
let account: Account
let savedPersonId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, MVR_ACCOUNT)
  savedPersonId = await seedPerson(stack, account, SAVED_PERSON)
})

test.afterAll(async () => {
  await served?.close()
})

/** The method the app stored, which no support helper reads back. */
const readStoredMethods = async (): Promise<readonly (string | null)[]> => {
  const admin = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin
    .from('entries')
    .select('method')
    .eq('user_id', account.userId)
    .order('saved_at', { ascending: true })
  if (error || !data) {
    throw new Error(`Could not read the stored methods: ${error?.message ?? 'no rows returned'}`)
  }
  return data.map((row) => (row.method as string | null) ?? null)
}

const signIn = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
}

const openSendForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  // The form's rows rise on opening; nothing is read while they travel.
  await expect(page.locator('[data-motion]')).toHaveCount(0)
  return form
}

/** The white save button, whatever dollar value it currently names. */
const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Send · \$/ })

/** The centre of a laid-out element, in viewport pixels. */
const centreOf = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('That element has no layout box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Value 7 of this Request gives Home, the forms, the Saved message and the
 * currency pill entrance motions, and every element still travelling carries
 * data-motion. Text, geometry and style are only meaningful once those have
 * finished, so every reading below is taken after this returns.
 */
const atRest = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

/**
 * A save is answered by Home, not by the tap. Between the tap and the store's
 * reply nothing is displaced yet, so no element carries data-motion and a bare
 * rest wait would pass at once, while the new card is still in its appear/hold/
 * cross on the sender's half. So every save first waits for the answer to have
 * arrived - the form has left the DOM AND the new card is present, counted by
 * data-entry - and only then for every displaced element to have come to rest.
 * Only after both may a side, ring, box or count be read.
 */
const atRestAfterSave = async (page: Page, expectedEntries: number): Promise<void> => {
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(expectedEntries)
  await atRest(page)
}

/**
 * The currency pill slides for 300 ms under its own transition, which carries no
 * data-motion marker, so its rectangle is read only once it holds still across
 * two consecutive animation frames.
 */
const pillStill = async (page: Page): Promise<void> => {
  const pill = page.locator('[data-pill]')
  await expect(pill).toBeVisible()
  await expect(async () => {
    const first = await pill.boundingBox()
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    const second = await pill.boundingBox()
    if (!first || !second) throw new Error('The currency pill has no layout box')
    expect(second.x).toBeCloseTo(first.x, 1)
    expect(second.width).toBeCloseTo(first.width, 1)
  }).toPass()
}

test('MVR slides the pill and opens the rate card beside In dollars; the worked-out dollars reach the button, the card and the store, while the card names only the dollars, the person and the method and the rufiyaa figure and rate stay on the sheet', async ({
  page,
}) => {
  await signIn(page)
  // Home rises, its balance counts up from $0 and its entries slide in.
  await atRest(page)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // ----- USD is the opening currency: the note is shown, the rate row is not. -----
  const form = await openSendForm(page)
  const mvrButton = page.getByRole('button', { name: 'MVR', exact: true })
  const usdButton = page.getByRole('button', { name: 'USD', exact: true })
  await expect(usdButton).toHaveAttribute('aria-pressed', 'true')
  await expect(form.getByText(USD_NOTE)).toBeVisible()
  // The rate row is closed, whether it is absent or collapsed.
  await expect(page.getByLabel(RATE_LABEL)).toBeHidden()
  await expect(page.locator('[data-usd]')).toBeHidden()
  await expect(page.locator('[data-prefix]')).toHaveText('$')

  // ----- Tapping MVR: pressed state, the pill slides under it, prefix MVR. -----
  await mvrButton.click()
  await atRest(page)
  await pillStill(page)
  await expect(mvrButton).toHaveAttribute('aria-pressed', 'true')
  await expect(usdButton).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-prefix]')).toHaveText('MVR')

  // The white pill lies over the MVR button, not the USD one. The slide takes
  // 300 ms, so this is read once it has settled.
  const pill = page.locator('[data-pill]')
  await expect(pill).toBeVisible()
  await expect(async () => {
    const pillCentre = await centreOf(pill)
    const mvrBox = await mvrButton.boundingBox()
    if (!mvrBox) throw new Error('The MVR button has no layout box')
    expect(pillCentre.x).toBeGreaterThanOrEqual(mvrBox.x)
    expect(pillCentre.x).toBeLessThanOrEqual(mvrBox.x + mvrBox.width)
  }).toPass()

  // The dollars-need-no-rate note belongs to USD only.
  await expect(form.getByText(USD_NOTE)).toBeHidden()

  // ----- The rate card and the white In dollars card open side by side. -----
  const rate = page.getByLabel(RATE_LABEL)
  await expect(rate).toBeVisible()
  await expect(rate).toHaveAttribute('inputmode', 'decimal')

  const inDollarsLabel = form.getByText('In dollars', { exact: true })
  await expect(inDollarsLabel).toBeVisible()

  const worked = page.locator('[data-usd]')
  await expect(worked).toBeVisible()

  // The rate row opens over 380 ms; its cards are measured at their resting
  // place, not 1-2 px short of it.
  await atRest(page)

  // One row: like is compared with like. In both cards the label sits above its
  // value, so the two values line up with each other and the two labels line up
  // with each other, and the In dollars card sits to the right of the rate card.
  const rateCentre = await centreOf(rate)
  const workedCentre = await centreOf(worked)
  expect(Math.abs(rateCentre.y - workedCentre.y)).toBeLessThanOrEqual(24)
  expect(workedCentre.x).toBeGreaterThan(rateCentre.x)

  const rateLabelCentre = await centreOf(form.getByText(RATE_LABEL, { exact: true }))
  const dollarsLabelCentre = await centreOf(inDollarsLabel)
  expect(Math.abs(rateLabelCentre.y - dollarsLabelCentre.y)).toBeLessThanOrEqual(24)
  expect(dollarsLabelCentre.x).toBeGreaterThan(rateLabelCentre.x)

  // That card is white, which is what sets it apart from the blue form.
  const dollarsCard = form
    .locator('*', { hasText: 'In dollars' })
    .filter({ has: page.locator('[data-usd]') })
    .last()
  await expect(dollarsCard).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  // ----- Nothing is claimed or savable before the amount and rate are given. -----
  await expect(saveButton(page)).toBeDisabled()

  // ----- MVR 10,000 at 20 is worked out to $500.00 as the owner types. -----
  await page.getByLabel('Amount sent').fill('10,000')
  await rate.fill('20')
  await expect(worked).toHaveText('$500.00')

  // A person is still needed before this can be saved.
  await expect(saveButton(page)).toBeDisabled()

  const chip = page.locator(`[data-person-chip="${savedPersonId}"]`)
  await expect(chip).toHaveText(SAVED_PERSON)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  // Method is left untouched, so this send is a Transfer: that is what the card's
  // third line and the stored row are read against below.
  const methodGroup = form.getByRole('radiogroup', { name: 'Method' })
  await expect(methodGroup.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1)
  await expect(methodGroup.locator('[data-method="transfer"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )

  // The button's name follows the worked-out dollars, not the rufiyaa figure.
  const save = page.getByRole('button', { name: 'Send · $500.00' })
  await expect(save).toBeEnabled()
  await save.click()

  // ----- Home: the card reads its dollars, its person and its method, right of the line. -----
  // The save is first waited for to have been answered by Home (the form gone
  // and the new card present), and only then for the Saved message, Home's
  // growth, the counting balance and the card's crossing to have come to rest.
  // Nothing below is read before both.
  await atRestAfterSave(page, 1)

  const entries = page.locator('[data-entry]')
  const entry = entries.first()
  await expect(entry).toContainText('$500.00')
  await expect(entry).toContainText(SAVED_PERSON)

  // The third line is the method, with its word exactly, and there is one of it.
  const methodLine = entry.locator('[data-entry-method]')
  await expect(methodLine).toHaveCount(1)
  await expect(methodLine).toHaveAttribute('data-entry-method', 'transfer')
  await expect(methodLine).toHaveText('Transfer')

  // The rufiyaa figure and the rate are not on the card at all: they belong to
  // the sheet, which is read further down.
  await expect(entry).not.toContainText('MVR')
  await expect(entry).not.toContainText('20.00')
  await expect(entry).not.toContainText('Paid in USD')

  // A send's card rests on Abbaas's side: the money was received by him, so the
  // card names that side and lies wholly right of the centre line, which at this
  // one centred column is the middle of the viewport.
  // One entry is on the board, so there is exactly one row naming a side.
  const sideRow = page.locator('[data-side]')
  await expect(sideRow).toHaveCount(1)
  await expect(sideRow).toHaveAttribute('data-side', 'right')
  const rect = await entry.boundingBox()
  if (!rect) throw new Error('The saved entry has no layout box')
  expect(rect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)

  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', '50000')
  await expect(abbaasBox).toContainText('$500.00')
  await expect(page.locator('[data-box="you"]')).toHaveAttribute('data-state', 'empty')

  // ----- What was stored, read outside the browser. -----
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(1)
  const row = stored[0]!
  expect(row.kind).toBe('send')
  expect(row.currency).toBe('MVR')
  // Laari, not cents: storing the dollar value here would read 50000.
  expect(row.amount_minor).toBe(1000000)
  expect(Number(row.rate)).toBe(20)
  expect(row.usd_cents).toBe(50000)
  expect(row.note).toBeNull()
  expect(row.person_id).toBe(savedPersonId)
  expect(row.person_name).toBe(SAVED_PERSON)
  // The untouched Method row stored its default, which is what the card names.
  expect(await readStoredMethods()).toEqual(['transfer'])

  // ----- The sheet keeps the rufiyaa figure and the rate the card no longer shows. -----
  await entry.click()
  await atRest(page)

  const sheet = page.getByRole('dialog')
  await expect(sheet).toHaveCount(1)
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('[data-sheet-usd]')).toHaveText('$500.00')
  await expect(sheet.locator('[data-sheet-mvr]')).toContainText('MVR 10,000')
  await expect(sheet.locator('[data-sheet-rate]')).toContainText('20.00')
  await expect(sheet.locator('[data-sheet-person]')).toContainText(SAVED_PERSON)
  await expect(sheet.locator('[data-sheet-method]')).toContainText('Transfer')

  await sheet.getByRole('button', { name: 'Close' }).click()
  await atRest(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Reading the entry wrote nothing.
  expect(await readEntries(stack, account)).toHaveLength(1)

  // ----- Switching back to USD closes the rate row again. -----
  const reopened = await openSendForm(page)
  await expect(page.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'MVR', exact: true }).click()
  await atRest(page)
  await pillStill(page)
  await page.getByLabel('Amount sent').fill('250')
  await page.getByLabel(RATE_LABEL).fill('20')
  await expect(page.locator('[data-usd]')).toHaveText('$12.50')
  await expect(page.getByRole('button', { name: 'Send · $12.50' })).toBeVisible()

  await page.getByRole('button', { name: 'USD', exact: true }).click()
  await atRest(page)
  await pillStill(page)
  await expect(page.getByLabel(RATE_LABEL)).toBeHidden()
  await expect(page.locator('[data-usd]')).toBeHidden()
  await expect(reopened.getByText(USD_NOTE)).toBeVisible()
  await expect(page.locator('[data-prefix]')).toHaveText('$')
  // The typed amount is kept and now read as dollars, and the button follows it.
  await expect(page.getByLabel('Amount sent')).toHaveValue('250')
  await expect(page.getByRole('button', { name: 'Send · $250.00' })).toBeVisible()
})
