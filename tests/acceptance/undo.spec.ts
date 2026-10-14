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

// Travelling cards value 4: no Saved message and no Undo after a save; the ringed card
// at rest on the RECEIVER's side is the whole feedback.
//
// Judged through the declared public port only: the built bundle's DOM on the Home a
// save reaches (no data-saved-message element, no role=status save message, no 'Saved.'
// text, no Undo control; the new card's ring, its side of the centre line and the
// balance boxes) and, outside the browser, the rows the account actually holds. A save
// that merely drew a card without storing its row is caught by the service-role read.
//
// This replaces the oracle that asserted the dark Saved message and its Undo at this
// same path: the same save now has to produce the card and nothing else.

const PASSWORD_FIELD = 'input[type="password"]'
// The refined board is read at this phone size, which the stimulus fixes.
const VIEWPORT = { width: 390, height: 844 } as const

const ACCOUNT = {
  email: 'owner-no-undo@abbaas.test',
  password: 'no-undo-password-7',
} as const

// Abbaas starts out holding $400.00 of the owner's money. The owner sends $100 more
// ($500.00 held), then records a $50.00 repayment ($450.00 held).
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 40000
const SEEDED_SEND_DATE = '2026-10-05'

const SEND_AMOUNT = '100'
const SEND_BUTTON = 'Send · $100.00'
const AFTER_SEND_CENTS = 50000

const RECEIVE_AMOUNT = '50'
const RECEIVE_BUTTON = 'Receive · $50.00'
const AFTER_RECEIVE_CENTS = 45000

// The kinds' colours, as the board's decisions fix them.
const SEND_INK = 'rgb(36, 80, 138)'
const PAYMENT_INK = 'rgb(15, 111, 104)'

let stack: Stack
let served: ServedOrigin
let account: Account

test.use({ viewport: VIEWPORT })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, ACCOUNT)
  await seedUsdSend(stack, account, {
    personName: SEEDED_PERSON,
    usdCents: SEEDED_SEND_CENTS,
    entryDate: SEEDED_SEND_DATE,
  })
})

test.afterAll(async () => {
  await served?.close()
})

/**
 * Every entrance and save motion marks the elements still travelling with data-motion.
 * Each reading below is taken only once nothing carries it, so the board is read at
 * rest: the ring, the card's half and the box amounts are their settled values, and an
 * absent Saved message is absent after the moment it used to rise, not merely before it.
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
  // The Home that sign-in reaches plays its entrance; let it land.
  await settled(page)
}

type Rect = { x: number; y: number; width: number; height: number }

const boxOf = async (element: Locator): Promise<Rect> => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('The element has no layout box')
  return rect
}

/**
 * The save feedback the decisions remove, read every way the contract names it: the
 * attribute, the role, the wording and the control. None of these may exist on Home.
 */
const expectNoSaveMessageOrUndo = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-saved-message]')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0)
  await expect(page.getByText('Saved.', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Undo' })).toHaveCount(0)
  // Nothing of the old bar survives under another name either.
  await expect(page.locator('[data-undo-error]')).toHaveCount(0)
}

/**
 * The ring has no attribute of its own in the contract, so it is read as the board
 * draws it: a 2 px edge in the entry's colour, whether that is a border or the inset
 * box-shadow value 6 allows so the list's horizontal clip cannot cut it.
 */
const hasRing = async (card: Locator, ink: string): Promise<boolean> =>
  card.evaluate((element, colour) => {
    const style = window.getComputedStyle(element)
    const borderRing =
      Number.parseFloat(style.borderTopWidth) >= 2 && style.borderTopColor === colour
    const shadow = style.boxShadow
    const shadowRing = shadow !== 'none' && shadow.includes('inset') && shadow.includes(colour)
    return borderRing || shadowRing
  }, ink)

/** The card for a given amount, which is the entry the save just created. */
const cardWith = (page: Page, amount: string): Locator =>
  page.locator('[data-entry]').filter({ hasText: amount })

test('after a save Home shows no Saved message and no Undo: the ringed card on its own side is the whole feedback, and the row stays stored', async ({
  page,
}) => {
  await signIn(page)

  const abbaasBox = page.locator('[data-box="abbaas"]')
  const entries = page.locator('[data-entry]')

  // ----- Where the balance starts: one seeded send and no save feedback. -----
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$400.00')
  await expect(entries).toHaveCount(1)
  await expectNoSaveMessageOrUndo(page)

  // ===== Save a $100 send through the reworked blue form. =====
  const sendForm = page.locator('[data-form="send"]')
  await page.locator('[data-action="send"]').click()
  await expect(sendForm).toBeVisible()
  // The form's rows rise on open; fill it only once they have landed.
  await settled(page)
  await page.getByLabel('Amount sent').fill(SEND_AMOUNT)
  await page.getByRole('button', { name: SEEDED_PERSON }).click()
  await page.getByRole('button', { name: SEND_BUTTON }).click()
  // The save has been answered by Home before anything is read: the form has left the
  // DOM and the new card is present. Only then is the board waited into rest — waiting
  // for rest before the store answers would pass in the gap where nothing has begun to
  // travel yet, and the card would be read mid-crossing, on the half it only holds on.
  await expect(sendForm).toHaveCount(0)
  await expect(entries).toHaveCount(2)
  await expect(cardWith(page, '$100.00')).toBeVisible()
  // Home grows from the button, the card arrives and the balance counts.
  await settled(page)

  // ----- No message, no Undo: only the card. -----
  await expectNoSaveMessageOrUndo(page)
  await expect(entries).toHaveCount(2)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_SEND_CENTS))
  await expect(abbaasBox).toContainText('$500.00')

  // The new card wears the ring in the send's colour and rests on the side of whoever
  // received the money: a send's receiver is Abbaas, so the card lies wholly RIGHT of
  // the centre line, which is the viewport's middle at every width.
  const sendCard = cardWith(page, '$100.00')
  await expect(sendCard).toHaveCount(1)
  expect(await hasRing(sendCard, SEND_INK), 'the new send card wears its 2 px ring').toBe(true)
  const sendRect = await boxOf(sendCard)
  expect(sendRect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)

  // The seeded send, which this save did not touch, wears no ring.
  const seededCard = cardWith(page, '$400.00')
  expect(await hasRing(seededCard, SEND_INK), 'only the new card is ringed').toBe(false)

  // The save is real, not only drawn.
  expect(await readEntries(stack, account)).toHaveLength(2)

  // ===== Save a $50.00 payment through the reworked teal form. =====
  const receiveForm = page.locator('[data-form="receive"]')
  await page.locator('[data-action="receive"]').click()
  await expect(receiveForm).toBeVisible()
  await settled(page)
  await page.getByLabel('Amount received').fill(RECEIVE_AMOUNT)
  await page.getByRole('button', { name: RECEIVE_BUTTON }).click()
  // Again: the save is answered by Home first (form gone, the new card present), and
  // only then is rest awaited and any side, ring, box or count read.
  await expect(receiveForm).toHaveCount(0)
  await expect(entries).toHaveCount(3)
  await expect(cardWith(page, '$50.00')).toBeVisible()
  await settled(page)

  // ----- Again no message and no Undo, and the payment's own ring and side. -----
  await expectNoSaveMessageOrUndo(page)
  await expect(entries).toHaveCount(3)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_RECEIVE_CENTS))
  await expect(abbaasBox).toContainText('$450.00')

  const paymentCard = cardWith(page, '$50.00')
  await expect(paymentCard).toHaveCount(1)
  expect(await hasRing(paymentCard, PAYMENT_INK), 'the new payment card wears its ring').toBe(
    true,
  )
  // A payment from Abbaas is received by the owner, so its card lies wholly LEFT of the
  // centre line.
  const paymentRect = await boxOf(paymentCard)
  expect(paymentRect.x + paymentRect.width).toBeLessThanOrEqual(VIEWPORT.width / 2)

  // The previous save's card has handed its ring on.
  expect(await hasRing(sendCard, SEND_INK), 'the ring belongs to the newest save only').toBe(
    false,
  )

  expect(await readEntries(stack, account)).toHaveLength(3)

  // ===== A reload: the entries are stored, with no message and no ring. =====
  await page.reload()
  // The reloaded Home has to have been answered by the store before rest is awaited,
  // for the same reason: an empty Home carries nothing travelling.
  await expect(entries).toHaveCount(3)
  // A fresh Home counts its balance up from $0; read it only once it has arrived.
  await settled(page)
  await expectNoSaveMessageOrUndo(page)
  await expect(entries).toHaveCount(3)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_RECEIVE_CENTS))
  await expect(abbaasBox).toContainText('$450.00')

  expect(await hasRing(cardWith(page, '$100.00'), SEND_INK)).toBe(false)
  expect(await hasRing(cardWith(page, '$50.00'), PAYMENT_INK)).toBe(false)
  expect(await hasRing(cardWith(page, '$400.00'), SEND_INK)).toBe(false)

  // Stored, and exactly what was saved: the seed, the send and the payment.
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(3)
  expect(stored.map((entry) => entry.kind)).toEqual(['send', 'send', 'receive'])
  expect(stored.map((entry) => entry.usd_cents)).toEqual([SEEDED_SEND_CENTS, 10000, 5000])
  expect(stored[0]!.entry_date).toBe(SEEDED_SEND_DATE)
  expect(stored[2]!.person_name).toBeNull()
})
