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

// Travelling cards value 2: a payment rests on the owner's side.
//
// Judged through the declared public port only: the built bundle's DOM (Home's
// Receive button and balance boxes, the teal receive form with its frame,
// currency switch, Amount received field, date chip and white Receive button,
// and Home's centre-line cards) and, outside the browser, the rows the app
// stored. The receive form, the storage and the balances are asserted exactly
// as the refined board's oracle did. What changes is the resting side: a card
// rests on the side of whoever RECEIVED the money, so a payment from Abbaas now
// lies wholly LEFT of the centre line (the owner's side) while a send stays
// wholly RIGHT of it (Abbaas's side).

const PASSWORD_FIELD = 'input[type="password"]'
/** The refined board's reference phone. */
const VIEWPORT = { width: 390, height: 844 } as const

const RECEIVE_ACCOUNT = {
  email: 'owner-receive-refined@abbaas.test',
  password: 'receive-password-r4',
} as const

// Abbaas starts out holding $740.00 of the owner's money.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 74000
const SEEDED_SEND_DATE = '2026-10-05'

let stack: Stack
let served: ServedOrigin
let account: Account

test.describe.configure({ mode: 'serial' })
test.use({ viewport: VIEWPORT })

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
  // A fresh Home enters: its root carries data-motion while the boxes rise, the
  // balance counts up from $0 and each card crosses in from the sender's side.
  await expect(page.locator('[data-box="you"]')).toBeVisible()
  await settle(page)
}

/**
 * Saving grows Home from the save button, carries the new card across the centre
 * line from the sender's side and counts the boxes, each marked with data-motion
 * while it runs.
 * Positions and box amounts are only the settled truth once nothing in the
 * document is still moving, so every read after a save waits for that first.
 */
const settle = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

/**
 * A save is answered by Home, not by the tap: between the tap and the store's
 * reply nothing is displaced yet, so no element carries data-motion and a bare
 * rest wait would pass at once, mid-crossing. So every save first waits for the
 * answer to have arrived - the form has left the DOM and the new card is in it -
 * and only then for every displaced element to have come to rest. Only after
 * both may a side, ring, box or count be read.
 */
const settleAfterSave = async (page: Page, expectedEntries: number): Promise<void> => {
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(expectedEntries)
  await settle(page)
}

/**
 * The currency pill travels under its pressed label on a CSS transition, which
 * carries no data-motion of its own. Two equal reads across animation frames are
 * no proof of rest for a compositor transition, so the resting claim itself is
 * polled: the pill's centre must come to lie within the pressed button's x span.
 */
const expectPillOver = async (page: Page, button: Locator): Promise<void> => {
  const pill = page.locator('[data-pill]')
  await expect(pill).toBeVisible()
  const buttonRect = await button.boundingBox()
  if (!buttonRect) throw new Error('The currency switch has no layout box')
  await expect
    .poll(
      async () => {
        const rect = await pill.boundingBox()
        if (!rect) return false
        const centreX = rect.x + rect.width / 2
        return centreX >= buttonRect.x && centreX <= buttonRect.x + buttonRect.width
      },
      { timeout: 2000 },
    )
    .toBe(true)
  const pillRect = await pill.boundingBox()
  if (!pillRect) throw new Error('The currency pill has no layout box')
  const pillCentreX = pillRect.x + pillRect.width / 2
  expect(pillCentreX).toBeGreaterThanOrEqual(buttonRect.x)
  expect(pillCentreX).toBeLessThanOrEqual(buttonRect.x + buttonRect.width)
}

const openReceiveForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="receive"]').click()
  const form = page.locator('[data-form="receive"]')
  await expect(form).toBeVisible()
  // The form reveals and its rows rise in; geometry is only settled after that.
  await settle(page)
  return form
}

/** The board's white save button names itself after the worked-out dollars. */
const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Receive · / })

/** A payment carries data-entry and no data-person, so it is found by its party. */
const receiveEntries = (page: Page): Locator =>
  page.locator('[data-entry]').filter({ hasText: 'from Abbaas' })

const expectEmptyBox = async (box: Locator): Promise<void> => {
  await expect(box).toHaveAttribute('data-state', 'empty')
  await expect(box).toHaveAttribute('data-amount', '0')
}

/** The seeded $740.00 send card, found by the person it names. */
const sendEntry = (page: Page): Locator =>
  page.locator('[data-entry]').filter({ hasText: SEEDED_PERSON })

/**
 * A card rests on the side of whoever received the money, and the page is one
 * centred column filling this 390 px phone, so the centre line is the middle of
 * the viewport. A send's card lies wholly right of it: Abbaas received it.
 */
const expectWhollyInRightHalf = async (element: Locator): Promise<void> => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('The card has no layout box')
  expect(rect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)
  expect(rect.x + rect.width).toBeLessThanOrEqual(VIEWPORT.width)
}

/**
 * A payment from Abbaas lies wholly left of the centre line: the owner received
 * it, so the card rests under the owner's box.
 */
const expectWhollyInLeftHalf = async (element: Locator): Promise<void> => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('The card has no layout box')
  expect(rect.x).toBeGreaterThanOrEqual(0)
  expect(rect.x + rect.width).toBeLessThanOrEqual(VIEWPORT.width / 2)
}

/** The form must offer none of version one's extras, in any state. */
const expectNoVersionOneExtras = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-quick]')).toHaveCount(0)
  await expect(page.getByText('All of it', { exact: false })).toHaveCount(0)
  await expect(page.getByLabel('Note')).toHaveCount(0)
  await expect(page.locator('[data-preview-box]')).toHaveCount(0)
  await expect(page.getByText('After saving', { exact: false })).toHaveCount(0)
  await expect(page.locator('[data-receive-note]')).toHaveCount(0)
}

test('the receive form records a payment left of the line, clears the balance, and moves it to the owner', async ({
  page,
}) => {
  await signIn(page)

  // ----- Where the balance starts: Abbaas holds $740.00. -----
  const abbaasBox = page.locator('[data-box="abbaas"]')
  const youBox = page.locator('[data-box="you"]')
  await settle(page)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$740.00')
  await expectEmptyBox(youBox)
  await expect(page.locator('[data-entry]')).toHaveCount(1)

  // ===== First payment: $300, less than he holds. =====
  const form = await openReceiveForm(page)
  await expect(page).toHaveURL(/#receive$/)
  await expect(form).toHaveCSS('background-color', 'rgb(15, 111, 104)')

  // ----- The board's frame: Close, the balance line, eyebrow and title. -----
  await expect(form.getByRole('button', { name: 'Close' })).toBeVisible()
  await expect(form).toContainText('Abbaas has $740.00 of yours')
  await expect(form).toContainText('New entry · Receive')
  await expect(form.getByRole('heading', { name: 'Payment from Abbaas' })).toBeVisible()

  // ----- The currency switch: USD pressed with the white pill over it. -----
  const usdButton = page.getByRole('button', { name: 'USD', exact: true })
  const mvrButton = page.getByRole('button', { name: 'MVR', exact: true })
  await expect(usdButton).toHaveAttribute('aria-pressed', 'true')
  await expect(mvrButton).toHaveAttribute('aria-pressed', 'false')
  await expectPillOver(page, usdButton)

  // ----- The large amount field with its prefix. -----
  const amount = page.getByLabel('Amount received')
  await expect(amount).toBeVisible()
  await expect(amount).toHaveCSS('font-size', '44px')
  await expect(page.locator('[data-prefix]')).toHaveText('$')

  // ----- The date chip: today, over a transparent date input. -----
  const today = await page.evaluate(() => {
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })
  await expect(page.getByLabel('Date')).toHaveValue(today)
  await expect(form.getByText(/^Today, \d{1,2} [A-Z][a-z]{2}$/)).toBeVisible()

  // ----- Nothing typed: nothing to save, and none of version one's extras. -----
  await expect(saveButton(page)).toBeDisabled()
  await expectNoVersionOneExtras(page)

  // An amount larger than he holds still raises no note on the refined board.
  await amount.fill('900')
  await expectNoVersionOneExtras(page)

  // ----- $300, saved by the white button that names its dollars. -----
  await amount.fill('300')
  const save = page.getByRole('button', { name: 'Receive · $300.00', exact: true })
  await expect(save).toBeEnabled()
  await save.click()

  // ----- Home: the payment card sits in the LEFT half and his box dropped. -----
  await settleAfterSave(page, 2)
  const firstPayment = receiveEntries(page)
  await expect(firstPayment).toHaveCount(1)
  await expect(firstPayment).toContainText('$300.00')
  await expect(firstPayment.locator('[data-person]')).toHaveCount(0)
  // The owner received this money, so its card rests on the owner's side.
  await expectWhollyInLeftHalf(firstPayment)

  // The seeded $740.00 send stays on Abbaas's side: he received that money. The
  // two sides are read in the same resting Home, so one rule cannot satisfy both
  // by putting every card in one half.
  const seededSend = sendEntry(page)
  await expect(seededSend).toHaveCount(1)
  await expect(seededSend).toContainText('$740.00')
  await expectWhollyInRightHalf(seededSend)

  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', '44000')
  await expect(abbaasBox).toContainText('$440.00')
  await expectEmptyBox(youBox)
  await expect(page.locator('[data-square]')).toHaveCount(0)

  // ===== Second payment: $440, exactly what he holds, so it clears. =====
  await openReceiveForm(page)
  await expect(page.locator('[data-form="receive"]')).toContainText('Abbaas has $440.00 of yours')
  await expectNoVersionOneExtras(page)
  await page.getByLabel('Amount received').fill('440')
  await page.getByRole('button', { name: 'Receive · $440.00', exact: true }).click()

  await settleAfterSave(page, 3)
  await expectEmptyBox(abbaasBox)
  await expectEmptyBox(youBox)
  await expect(page.locator('[data-square]')).toBeVisible()

  // ===== Third payment: $200 when he holds nothing, so it crosses over. =====
  await openReceiveForm(page)
  await expectNoVersionOneExtras(page)
  await page.getByLabel('Amount received').fill('200')
  await page.getByRole('button', { name: 'Receive · $200.00', exact: true }).click()

  // ----- Home: the money is now on the owner's side, unsigned. -----
  await settleAfterSave(page, 4)
  await expect(receiveEntries(page)).toHaveCount(3)
  await expect(youBox).toHaveAttribute('data-state', 'filled')
  await expect(youBox).toHaveAttribute('data-amount', '20000')
  await expect(youBox).toContainText('$200.00')
  await expect(youBox).toContainText('have his money')
  const youText = (await youBox.innerText()).replace(/\s+/g, ' ')
  expect(youText).not.toContain('+')
  expect(youText).not.toContain('-')
  await expectEmptyBox(abbaasBox)
  await expect(page.locator('[data-square]')).toHaveCount(0)

  // Every payment card is wholly in the left half, none claims a person, and the
  // send card is still wholly in the right half.
  for (const card of await receiveEntries(page).all()) {
    await expectWhollyInLeftHalf(card)
    await expect(card.locator('[data-person]')).toHaveCount(0)
  }
  await expectWhollyInRightHalf(sendEntry(page))

  // ===== Closing the form, by its own control and by the back button. =====
  await openReceiveForm(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(youBox).toBeVisible()
  await settle(page)

  await openReceiveForm(page)
  await page.goBack()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(youBox).toBeVisible()
  await settle(page)

  // ===== What was stored, read outside the browser. =====
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(4)
  const receives = stored.filter((row) => row.kind === 'receive')
  expect(receives.map((row) => row.usd_cents)).toEqual([30000, 44000, 20000])
  for (const row of receives) {
    expect(row.currency).toBe('USD')
    expect(row.amount_minor).toBe(row.usd_cents)
    expect(row.rate).toBeNull()
    expect(row.entry_date).toBe(today)
    // The refined form has no note field, so nothing is stored in that column.
    expect(row.note).toBeNull()
    // A payment is money back from Abbaas himself: it names no person.
    expect(row.person_id).toBeNull()
    expect(row.person_name).toBeNull()
  }

  // The seeded send is untouched, so the balance came from arithmetic, not a rewrite.
  const sends = stored.filter((row) => row.kind === 'send')
  expect(sends).toHaveLength(1)
  expect(sends[0]!.usd_cents).toBe(SEEDED_SEND_CENTS)
})

test('in rufiyaa the receive form opens the rate card beside the white In dollars card', async ({
  page,
}) => {
  await signIn(page)
  const form = await openReceiveForm(page)

  const mvrButton = page.getByRole('button', { name: 'MVR', exact: true })
  await mvrButton.click()
  await expect(mvrButton).toHaveAttribute('aria-pressed', 'true')

  // The pill slides under MVR over 300 ms and the rate row rises in; the pill's
  // arrival is polled rather than guessed from equal frames.
  await settle(page)
  await expectPillOver(page, mvrButton)
  await expect(page.locator('[data-prefix]')).toHaveText('MVR')

  // The same rate row as the send form: the rate card and the In dollars card.
  const rate = page.getByLabel('Rate · MVR per $1')
  await expect(rate).toBeVisible()
  const inDollars = form.getByText('In dollars', { exact: true })
  await expect(inDollars).toBeVisible()
  // Side by side: both cards' labels sit on one row, In dollars to the right.
  const rateLabel = form.getByText('Rate · MVR per $1', { exact: true })
  const rateRect = await rateLabel.boundingBox()
  const dollarsRect = await inDollars.boundingBox()
  if (!rateRect || !dollarsRect) throw new Error('The rate row has no layout box')
  expect(dollarsRect.x).toBeGreaterThan(rateRect.x + rateRect.width)
  expect(Math.abs(dollarsRect.y - rateRect.y)).toBeLessThanOrEqual(8)

  // The worked-out dollars drive the output and the button's name.
  await page.getByLabel('Amount received').fill('1,540')
  await rate.fill('15.40')
  await expect(page.locator('[data-usd]')).toHaveText('$100.00')
  await expect(
    page.getByRole('button', { name: 'Receive · $100.00', exact: true }),
  ).toBeEnabled()

  // A missing rate refuses the save and nothing is stored.
  await rate.fill('')
  await expect(saveButton(page)).toBeDisabled()

  // Still none of version one's extras in the rufiyaa state.
  await expectNoVersionOneExtras(page)

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
})
