import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, readEntries, seedPerson, type Account } from '../support/accounts.js'

// Refined board value 3: sending in rufiyaa on the reworked send form.
//
// Judged through the declared public port only: the built bundle's DOM (the
// currency switch with its sliding data-pill, data-prefix, the 'Rate · MVR per $1'
// card beside the white 'In dollars' card with its data-usd output, the white
// 'Send · $X' button, Home's centre-line card and the balance boxes) and, outside
// the browser, the row the app stored.

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

test('MVR slides the pill and opens the rate card beside In dollars, and the worked-out dollars reach the button, Home and the store', async ({
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

  // The button's name follows the worked-out dollars, not the rufiyaa figure.
  const save = page.getByRole('button', { name: 'Send · $500.00' })
  await expect(save).toBeEnabled()
  await save.click()

  // ----- Home: the card reads its detail under its USD amount, left of the line. -----
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  const entries = page.locator('[data-entry]')
  await expect(entries).toHaveCount(1)

  // The Saved message rises 18 px, Home grows in, the balance counts up from $0
  // and the entry slides 28 px from its side; read only once all of that is done.
  await atRest(page)

  const entry = entries.first()
  await expect(entry).toContainText('$500.00')
  await expect(entry).toContainText('MVR 10,000 at 20.00')
  await expect(entry).toContainText(SAVED_PERSON)
  const rect = await entry.boundingBox()
  if (!rect) throw new Error('The saved entry has no layout box')
  expect(rect.x + rect.width).toBeLessThanOrEqual(VIEWPORT.width / 2)

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
