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

// Value 7: the Saved message with Undo.
//
// Judged through the declared public port only: the built bundle's DOM right after
// a save (the role=status message carrying data-saved-message and its Undo button,
// the entry list, the balance boxes and the bottom buttons) and, outside the
// browser, the rows the account actually holds. An Undo that merely hides the entry
// leaves it stored, which the service-role read catches.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 360, height: 780 } as const

const UNDO_ACCOUNT = {
  email: 'owner-undo@abbaas.test',
  password: 'undo-password-7',
} as const

// Abbaas starts out holding $740.00 of the owner's money; the owner then sends $500
// more, so the balance right after the save is $1,240.00.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 74000
const SEEDED_SEND_DATE = '2026-10-05'
const SAVED_AMOUNT = '500'
const BALANCE_AFTER_SAVE_CENTS = 124000

let stack: Stack
let served: ServedOrigin
let account: Account

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
}

const savedMessage = (page: Page): Locator => page.locator('[data-saved-message]')
const undoButton = (page: Page): Locator =>
  savedMessage(page).getByRole('button', { name: 'Undo' })

const boxOf = async (element: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('The element has no layout box')
  return rect
}

test('the Saved message names the new balance and Undo takes the entry back, from the list and from the store', async ({
  page,
}) => {
  await signIn(page)

  // ----- Where the balance starts: one seeded send, and no Saved message. -----
  const abbaasBox = page.locator('[data-box="abbaas"]')
  const youBox = page.locator('[data-box="you"]')
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$740.00')
  await expect(page.locator('[data-entry]')).toHaveCount(1)
  await expect(savedMessage(page)).toHaveCount(0)

  // ===== Save a $500 send to the saved person. =====
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  await page.getByLabel('Amount sent').fill(SAVED_AMOUNT)
  await page.getByRole('button', { name: SEEDED_PERSON }).click()
  await page.getByRole('button', { name: /^Save entry/ }).click()

  // ----- Home right after the save: the message states who now holds how much. -----
  await expect(form).toHaveCount(0)
  const message = savedMessage(page)
  await expect(message).toBeVisible()
  await expect(message).toHaveAttribute('role', 'status')
  // The balance AFTER the save, not before it.
  await expect(message).toHaveText('Saved. Abbaas now has $1,240.00 of yours.')
  await expect(undoButton(page)).toBeVisible()

  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(BALANCE_AFTER_SAVE_CENTS))
  await expect(abbaasBox).toContainText('$1,240.00')

  // Both rows are really stored at this point, so Undo has something to remove.
  expect(await readEntries(stack, account)).toHaveLength(2)

  // ----- The message sits above the bottom buttons and covers neither. -----
  const messageRect = await boxOf(message)
  const sendRect = await boxOf(page.locator('[data-action="send"]'))
  const receiveRect = await boxOf(page.locator('[data-action="receive"]'))
  expect(messageRect.y + messageRect.height).toBeLessThanOrEqual(sendRect.y)
  expect(messageRect.y + messageRect.height).toBeLessThanOrEqual(receiveRect.y)
  expect(messageRect.y).toBeGreaterThanOrEqual(0)
  expect(messageRect.x + messageRect.width).toBeLessThanOrEqual(VIEWPORT.width)
  // The buttons are still tappable, not merely uncovered.
  await expect(page.locator('[data-action="send"]')).toBeEnabled()
  await expect(page.locator('[data-action="receive"]')).toBeEnabled()

  // ===== Undo that cannot reach the server keeps the entry and says so. =====
  await page.context().setOffline(true)
  await undoButton(page).click()
  await expect(message).toContainText('Could not undo. Try again.')
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  expect(await readEntries(stack, account)).toHaveLength(2)
  await page.context().setOffline(false)

  // ===== Undo: the entry leaves the list, the boxes and the stored ledger. =====
  await undoButton(page).click()
  await expect(savedMessage(page)).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(1)
  await expect(page.locator('[data-entry]')).toContainText('$740.00')

  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', String(SEEDED_SEND_CENTS))
  await expect(abbaasBox).toContainText('$740.00')
  await expect(youBox).toHaveAttribute('data-state', 'empty')
  await expect(youBox).toHaveAttribute('data-amount', '0')
  // The totals come from the same ledger the boxes do.
  await expect(page.locator('[data-total="sent"]')).toHaveText('You sent $740.00')
  await expect(page.locator('[data-total="paid"]')).toHaveText('He paid back $0.00')

  // Removed from the store, not merely hidden: one row remains, the seeded one.
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(1)
  expect(stored[0]!.kind).toBe('send')
  expect(stored[0]!.usd_cents).toBe(SEEDED_SEND_CENTS)
  expect(stored[0]!.entry_date).toBe(SEEDED_SEND_DATE)

  // ===== A reload never shows a Saved message. =====
  await page.reload()
  await expect(abbaasBox).toContainText('$740.00')
  await expect(savedMessage(page)).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(1)
})
