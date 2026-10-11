import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, readEntries, seedUsdSend, type Account } from '../support/accounts.js'

// Value 5: recording a repayment from Abbaas.
//
// Judged through the declared public port only: the built bundle's DOM (Home's
// Receive button and balance boxes, the teal receive form with its currency
// buttons, Amount received field, quick amounts, note and preview boxes, and
// Home's centre-line entries) and, outside the browser, the rows the app stored.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 360, height: 780 } as const

const RECEIVE_ACCOUNT = {
  email: 'owner-receive@abbaas.test',
  password: 'receive-password-5',
} as const

// Abbaas starts out holding $740.00 of the owner's money.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 74000
const SEEDED_SEND_DATE = '2026-10-05'

const RATE_LABEL = 'Rate (MVR per $1)'

let stack: Stack
let served: ServedOrigin
let account: Account

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, RECEIVE_ACCOUNT)
  await seedUsdSend(stack, account, {
    personName: SEEDED_PERSON,
    usdCents: SEEDED_SEND_CENTS,
    entryDate: SEEDED_SEND_DATE,
  })
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

const openReceiveForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="receive"]').click()
  const form = page.locator('[data-form="receive"]')
  await expect(form).toBeVisible()
  return form
}

const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Save entry/ })
const receiveNote = (page: Page): Locator => page.locator('[data-receive-note]')
const allOfIt = (page: Page): Locator => page.getByRole('button', { name: /^All of it/ })

/** A receive carries data-entry and no data-person, so it is found by its party. */
const receiveEntries = (page: Page): Locator =>
  page.locator('[data-entry]').filter({ hasText: 'from Abbaas' })

const expectEmptyBox = async (box: Locator): Promise<void> => {
  await expect(box).toHaveAttribute('data-state', 'empty')
  await expect(box).toHaveAttribute('data-amount', '0')
}

/**
 * A newly saved entry and the balance boxes animate on arriving Home, carrying
 * data-motion while they do. Positions and box amounts are only the settled
 * truth once nothing in the document is still moving, so every read after a
 * save waits for that first.
 */
const settle = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

const expectWhollyInLeftHalf = async (element: Locator): Promise<void> => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('The entry has no layout box')
  expect(rect.x).toBeGreaterThanOrEqual(0)
  expect(rect.x + rect.width).toBeLessThanOrEqual(VIEWPORT.width / 2)
}

test('a repayment lowers what Abbaas holds, can clear it, and moves the balance to the owner when it is larger', async ({
  page,
}) => {
  await signIn(page)

  // ----- Where the balance starts: Abbaas holds $740.00. -----
  const abbaasBox = page.locator('[data-box="abbaas"]')
  const youBox = page.locator('[data-box="you"]')
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$740.00')
  await expectEmptyBox(youBox)
  await expect(page.locator('[data-entry]')).toHaveCount(1)

  // ===== First payment: $300, less than he holds. =====
  const form = await openReceiveForm(page)
  await expect(page).toHaveURL(/#receive$/)
  await expect(form).toContainText('Payment from Abbaas')
  await expect(form).toHaveCSS('background-color', 'rgb(15, 111, 104)')

  const usdButton = page.getByRole('button', { name: 'USD', exact: true })
  const mvrButton = page.getByRole('button', { name: 'MVR', exact: true })
  await expect(usdButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Amount received')).toBeVisible()

  // Nothing typed: no value to save and no note to show.
  await expect(saveButton(page)).toBeDisabled()
  await expect(receiveNote(page)).toHaveCount(0)

  // The quick amounts, including the one that names what he currently holds.
  await expect(page.locator('[data-quick]')).toHaveCount(3)
  await expect(allOfIt(page)).toHaveText('All of it · $740.00')
  await expect(page.getByRole('button', { name: '$500', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '$1,000', exact: true })).toBeVisible()

  // ----- Rufiyaa works here exactly as on the send form. -----
  await mvrButton.click()
  await expect(mvrButton).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Amount received').fill('1,540')
  await page.getByLabel(RATE_LABEL).fill('15.40')
  await expect(page.locator('[data-usd]')).toHaveText('$100.00')
  await expect(page.locator('[data-preview-box="abbaas"]')).toHaveAttribute('data-amount', '64000')

  // A quick amount switches the currency back to dollars.
  await page.getByRole('button', { name: '$500', exact: true }).click()
  await expect(usdButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel(RATE_LABEL)).toHaveCount(0)
  await expect(page.getByLabel('Amount received')).toHaveValue(/^500(\.00)?$/)
  await expect(page.locator('[data-preview-box="abbaas"]')).toHaveAttribute('data-amount', '24000')

  // ----- $300: it leaves money with him, so there is no note. -----
  await page.getByLabel('Amount received').fill('300')
  await expect(receiveNote(page)).toHaveCount(0)
  const abbaasPreview = page.locator('[data-preview-box="abbaas"]')
  await expect(abbaasPreview).toHaveAttribute('data-state', 'filled')
  await expect(abbaasPreview).toHaveAttribute('data-amount', '44000')
  await expectEmptyBox(page.locator('[data-preview-box="you"]'))

  const save = saveButton(page)
  await expect(save).toBeEnabled()
  await save.click()

  // ----- Home: the receive sits in the left half and his box has dropped. -----
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await settle(page)
  const firstReceive = receiveEntries(page)
  await expect(firstReceive).toHaveCount(1)
  await expect(firstReceive).toContainText('$300.00')
  await expect(firstReceive.locator('[data-person]')).toHaveCount(0)
  await expectWhollyInLeftHalf(firstReceive)

  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', '44000')
  await expect(abbaasBox).toContainText('$440.00')
  await expectEmptyBox(youBox)
  await expect(page.locator('[data-square]')).toHaveCount(0)

  // ===== Second payment: All of it, which clears the balance. =====
  await openReceiveForm(page)
  await expect(allOfIt(page)).toHaveText('All of it · $440.00')
  await allOfIt(page).click()
  await expect(page.getByLabel('Amount received')).toHaveValue(/^440(\.00)?$/)
  await expect(receiveNote(page)).toHaveText('This clears it. You will be all square.')
  await expectEmptyBox(page.locator('[data-preview-box="abbaas"]'))
  await expectEmptyBox(page.locator('[data-preview-box="you"]'))
  await saveButton(page).click()

  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(3)
  await settle(page)
  await expectEmptyBox(abbaasBox)
  await expectEmptyBox(youBox)
  await expect(page.locator('[data-square]')).toHaveText('All square')

  // ===== Third payment: $1,000 when he holds nothing. =====
  await openReceiveForm(page)
  // With nothing of the owner's left, there is no 'All of it' to offer.
  await expect(allOfIt(page)).toHaveCount(0)
  await page.getByRole('button', { name: '$1,000', exact: true }).click()
  await expect(page.getByLabel('Amount received')).toHaveValue(/^1,?000(\.00)?$/)
  await expect(receiveNote(page)).toHaveText(
    'This is $1,000.00 more than he has of yours. The balance moves to your side: you will have $1,000.00 of his.',
  )
  const youPreview = page.locator('[data-preview-box="you"]')
  await expect(youPreview).toHaveAttribute('data-state', 'filled')
  await expect(youPreview).toHaveAttribute('data-amount', '100000')
  await expectEmptyBox(page.locator('[data-preview-box="abbaas"]'))
  await saveButton(page).click()

  // ----- Home: the money is now on the owner's side, unsigned. -----
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(4)
  await settle(page)
  await expect(receiveEntries(page)).toHaveCount(3)
  await expect(youBox).toHaveAttribute('data-state', 'filled')
  await expect(youBox).toHaveAttribute('data-amount', '100000')
  await expect(youBox).toContainText('$1,000.00')
  await expect(youBox).toContainText('have his money')
  const youText = (await youBox.innerText()).replace(/\s+/g, ' ')
  expect(youText).not.toContain('+')
  expect(youText).not.toContain('-')
  await expectEmptyBox(abbaasBox)
  await expect(page.locator('[data-square]')).toHaveCount(0)

  // Every receive is wholly in the left half, none claims a person.
  for (const entry of await receiveEntries(page).all()) {
    await expectWhollyInLeftHalf(entry)
    await expect(entry.locator('[data-person]')).toHaveCount(0)
  }

  // ===== Closing the form, by its own control and by the back button. =====
  await openReceiveForm(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(youBox).toBeVisible()

  await openReceiveForm(page)
  await page.goBack()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(youBox).toBeVisible()

  // ===== What was stored, read outside the browser. =====
  const today = await page.evaluate(() => {
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })

  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(4)
  const receives = stored.filter((row) => row.kind === 'receive')
  expect(receives.map((row) => row.usd_cents)).toEqual([30000, 44000, 100000])
  for (const row of receives) {
    expect(row.currency).toBe('USD')
    expect(row.amount_minor).toBe(row.usd_cents)
    expect(row.rate).toBeNull()
    expect(row.entry_date).toBe(today)
    // A receive is money back from Abbaas himself: it names no person.
    expect(row.person_id).toBeNull()
    expect(row.person_name).toBeNull()
  }

  // The seeded send is untouched, so the balance came from arithmetic, not a rewrite.
  const sends = stored.filter((row) => row.kind === 'send')
  expect(sends).toHaveLength(1)
  expect(sends[0]!.usd_cents).toBe(SEEDED_SEND_CENTS)
})
