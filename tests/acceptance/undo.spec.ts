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

// Refined board value 5: the dark Saved message and Undo on the refined board.
//
// Judged through the declared public port only: the built bundle's DOM right after a
// save (the role=status bar carrying data-saved-message with its tick badge and Undo
// button, the entry list, the balance boxes and the bottom buttons) and, outside the
// browser, the rows the account actually holds. An Undo that merely hides the entry
// leaves it stored, which the service-role read catches.
//
// This replaces version one's Undo oracle at the same path: the save now goes through
// the reworked send form, whose save button is named 'Send · $X', and the message is
// the board's dark bar rather than version one's plain notice.

const PASSWORD_FIELD = 'input[type="password"]'
// The refined board is read at this phone size, which the stimulus fixes.
const VIEWPORT = { width: 390, height: 844 } as const

const UNDO_ACCOUNT = {
  email: 'owner-undo@abbaas.test',
  password: 'undo-password-7',
} as const

// Abbaas starts out holding $400.00 of the owner's money; the owner then sends $100
// more, so the balance right after the save is $500.00.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 40000
const SEEDED_SEND_DATE = '2026-10-05'
const SAVED_AMOUNT = '100'
const SAVE_BUTTON = 'Send · $100.00'
const BALANCE_AFTER_SAVE_CENTS = 50000

// The board's colours, as the decisions fix them.
const BAR_BACKGROUND = 'rgb(13, 31, 28)'
const TICK_BADGE_BACKGROUND = 'rgb(41, 179, 166)'
const UNDO_INK = 'rgb(127, 224, 212)'

let stack: Stack
let served: ServedOrigin
let account: Account

test.use({ viewport: VIEWPORT })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, UNDO_ACCOUNT)
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
  // The Home that sign-in reaches enters: let it arrive before anything is read.
  await settled(page)
}

/**
 * Value 7's entrances (the Home enter, the box rise, the balance count-up from $0, the
 * entry slide, the form row rise and the Saved message's 18 px rise) all mark the
 * elements still travelling with data-motion. Every text, geometry and style reading
 * below is taken only once nothing carries it, so the board is read at rest and no
 * expected value has to be loosened.
 */
const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

const savedMessage = (page: Page): Locator => page.locator('[data-saved-message]')
const undoButton = (page: Page): Locator =>
  savedMessage(page).getByRole('button', { name: 'Undo' })

type Rect = { x: number; y: number; width: number; height: number }

const boxOf = async (element: Locator): Promise<Rect> => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('The element has no layout box')
  return rect
}

/** Saves a $100 send to the seeded person through the reworked send form. */
const saveAHundredSend = async (page: Page): Promise<void> => {
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  // The form's rows rise on open; fill it only once they have landed.
  await settled(page)
  await page.getByLabel('Amount sent').fill(SAVED_AMOUNT)
  await page.getByRole('button', { name: SEEDED_PERSON }).click()
  await page.getByRole('button', { name: SAVE_BUTTON }).click()
  await expect(form).toHaveCount(0)
  // The Home behind the save enters and the Saved message rises 18 px.
  await settled(page)
}

/**
 * The tick badge has no attribute of its own in the contract, so it is found the way
 * the board describes it: a round 26 px element in the badge's teal inside the bar.
 */
const tickBadge = async (
  message: Locator,
): Promise<{ width: number; height: number; radius: string } | null> =>
  message.evaluate((element, background) => {
    for (const node of Array.from(element.querySelectorAll('*'))) {
      const style = window.getComputedStyle(node)
      if (style.backgroundColor !== background) continue
      const rect = node.getBoundingClientRect()
      return { width: rect.width, height: rect.height, radius: style.borderTopLeftRadius }
    }
    return null
  }, TICK_BADGE_BACKGROUND)

test('the dark Saved message names the new balance above the buttons, and Undo takes the entry back from the list, the boxes and the store', async ({
  page,
}) => {
  await signIn(page)

  // ----- Where the balance starts: one seeded send, and no Saved message. -----
  const abbaasBox = page.locator('[data-box="abbaas"]')
  const youBox = page.locator('[data-box="you"]')
  const entries = page.locator('[data-entry]')
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$400.00')
  await expect(entries).toHaveCount(1)
  await expect(savedMessage(page)).toHaveCount(0)

  // ===== Save a $100 send to the saved person through the reworked form. =====
  await saveAHundredSend(page)

  // ----- The dark bar states who now holds how much, with a tick and an Undo. -----
  const message = savedMessage(page)
  await expect(message).toBeVisible()
  await expect(message).toHaveAttribute('role', 'status')
  // The balance AFTER the save, never the one before it.
  await expect(message).toContainText('Saved. Abbaas now has $500.00 of yours.')
  await expect(message).not.toContainText('$400.00')

  await expect(message).toHaveCSS('background-color', BAR_BACKGROUND)
  await expect(message).toHaveCSS('border-top-left-radius', '16px')

  const badge = await tickBadge(message)
  expect(badge, 'the bar starts with a round teal tick badge').not.toBeNull()
  expect(badge!.width).toBeGreaterThanOrEqual(24)
  expect(badge!.width).toBeLessThanOrEqual(28)
  expect(badge!.height).toBeGreaterThanOrEqual(24)
  expect(badge!.height).toBeLessThanOrEqual(28)
  // Round: either a half-side radius or the percentage that computes to one.
  expect(badge!.radius === '50%' || Number.parseFloat(badge!.radius) >= 12).toBe(true)

  const undo = undoButton(page)
  await expect(undo).toBeVisible()
  await expect(undo).toHaveCSS('color', UNDO_INK)
  // A tappable target on a phone.
  expect((await boxOf(undo)).height).toBeGreaterThanOrEqual(44)

  await expect(entries).toHaveCount(2)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(BALANCE_AFTER_SAVE_CENTS))
  await expect(abbaasBox).toContainText('$500.00')

  // Both rows are really stored at this point, so Undo has something to remove.
  expect(await readEntries(stack, account)).toHaveLength(2)

  // ----- The bar sits 16 px from each side, above the buttons, covering neither. -----
  const sendButton = page.locator('[data-action="send"]')
  const receiveButton = page.locator('[data-action="receive"]')
  const messageRect = await boxOf(message)
  const sendRect = await boxOf(sendButton)
  const receiveRect = await boxOf(receiveButton)
  const messageBottom = messageRect.y + messageRect.height

  expect(messageBottom).toBeLessThanOrEqual(sendRect.y)
  expect(messageBottom).toBeLessThanOrEqual(receiveRect.y)
  expect(messageRect.y).toBeGreaterThanOrEqual(0)
  expect(messageRect.x).toBeGreaterThanOrEqual(15)
  expect(messageRect.x).toBeLessThanOrEqual(17)
  expect(messageRect.x + messageRect.width).toBeGreaterThanOrEqual(VIEWPORT.width - 17)
  expect(messageRect.x + messageRect.width).toBeLessThanOrEqual(VIEWPORT.width - 15)
  // It rides just above the buttons rather than floating anywhere on the screen.
  expect(VIEWPORT.height - messageBottom).toBeGreaterThanOrEqual(80)
  expect(VIEWPORT.height - messageBottom).toBeLessThanOrEqual(112)
  // The buttons are still tappable, not merely uncovered.
  await expect(sendButton).toBeEnabled()
  await expect(receiveButton).toBeEnabled()

  // ===== An Undo that cannot reach the server keeps everything and says so. =====
  await page.context().setOffline(true)
  await undo.click()
  await expect(message.locator('[data-undo-error]')).toHaveText('Could not undo. Try again.')
  await settled(page)
  await expect(message).toBeVisible()
  await expect(entries).toHaveCount(2)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(BALANCE_AFTER_SAVE_CENTS))
  expect(await readEntries(stack, account)).toHaveLength(2)
  await page.context().setOffline(false)

  // ===== Undo: the entry leaves the list, the boxes and the stored ledger. =====
  await undo.click()
  await expect(savedMessage(page)).toHaveCount(0)
  // The boxes and the balance settle back to the figure before the save.
  await settled(page)
  await expect(entries).toHaveCount(1)
  await expect(entries).toContainText('$400.00')

  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$400.00')
  await expect(youBox).toHaveAttribute('data-state', 'empty')
  await expect(youBox).toHaveAttribute('data-amount', '0')
  // The totals come from the same ledger the boxes do.
  await expect(page.locator('[data-total="sent"]')).toHaveText('You sent $400.00')
  await expect(page.locator('[data-total="paid"]')).toHaveText('He paid back $0.00')

  // Removed from the store, not merely hidden: one row remains, the seeded one.
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(1)
  expect(stored[0]!.kind).toBe('send')
  expect(stored[0]!.usd_cents).toBe(SEEDED_SEND_CENTS)
  expect(stored[0]!.entry_date).toBe(SEEDED_SEND_DATE)

  // ===== The message belongs to the Home that save reached: a form ends it. =====
  await saveAHundredSend(page)
  await expect(savedMessage(page)).toBeVisible()
  await page.locator('[data-action="send"]').click()
  await expect(page.locator('[data-form="send"]')).toBeVisible()
  await settled(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  // The Home returned to after closing enters again.
  await settled(page)
  await expect(savedMessage(page)).toHaveCount(0)
  await expect(entries).toHaveCount(2)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(BALANCE_AFTER_SAVE_CENTS))

  // ===== A reload never shows a Saved message either. =====
  await page.reload()
  // A fresh Home counts its balance up from $0; read it only once it has arrived.
  await settled(page)
  await expect(abbaasBox).toContainText('$500.00')
  await expect(savedMessage(page)).toHaveCount(0)
  await expect(entries).toHaveCount(2)
})
