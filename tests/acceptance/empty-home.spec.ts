import { test, expect, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, type Account } from '../support/accounts.js'

// Value 2: the shape of Home before any money is recorded.
//
// Judged only through the stable attribute contract the design fixes for the
// balance card (data-box, data-state, data-amount, data-square, data-empty-hint,
// data-action) plus accessible names and geometry, so later values may restyle
// freely without breaking this oracle.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 360, height: 780 } as const
const BOTTOM_BAND = 120

// An account of its own, created with no people and no entries.
const EMPTY_ACCOUNT = {
  email: 'owner-empty@abbaas.test',
  password: 'empty-home-password-2',
} as const

let stack: Stack
let served: ServedOrigin
let account: Account

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, EMPTY_ACCOUNT)
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

const boxOf = async (page: Page, who: 'you' | 'abbaas') => {
  const box = page.locator(`[data-box="${who}"]`)
  await expect(box).toHaveCount(1)
  return box
}

test('an empty ledger shows both boxes empty, All square, the hint and the two bottom buttons', async ({
  page,
}) => {
  await signIn(page)

  // A failed read must never be dressed up as an empty, all-square ledger.
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // --- Both boxes are present, empty and claim no money. ---
  const you = await boxOf(page, 'you')
  const abbaas = await boxOf(page, 'abbaas')

  for (const box of [you, abbaas]) {
    await expect(box).toBeVisible()
    await expect(box).toHaveAttribute('data-state', 'empty')
    await expect(box).toHaveAttribute('data-amount', '0')
    await expect(box).toContainText('$0')
  }
  await expect(page.locator('[data-state="filled"]')).toHaveCount(0)

  // --- You on the left, Abbaas on the right, on the same row. ---
  const youRect = await you.boundingBox()
  const abbaasRect = await abbaas.boundingBox()
  if (!youRect || !abbaasRect) throw new Error('A balance box has no layout box')
  expect(youRect.x + youRect.width).toBeLessThanOrEqual(abbaasRect.x)
  // Same row: their vertical extents overlap.
  expect(youRect.y).toBeLessThan(abbaasRect.y + abbaasRect.height)
  expect(abbaasRect.y).toBeLessThan(youRect.y + youRect.height)

  // --- All square is shown exactly because the balance is zero. ---
  const square = page.locator('[data-square]')
  await expect(square).toHaveCount(1)
  await expect(square).toBeVisible()
  await expect(square).toHaveText(/All square/)

  // --- The hint names both ways to record money. ---
  const hint = page.locator('[data-empty-hint]')
  await expect(hint).toHaveCount(1)
  await expect(hint).toBeVisible()
  await expect(hint).toContainText('Send')
  await expect(hint).toContainText('Receive')

  // --- The bottom buttons: named, on their own half, near the bottom. ---
  const send = page.locator('[data-action="send"]')
  const receive = page.locator('[data-action="receive"]')
  await expect(send).toHaveCount(1)
  await expect(receive).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Receive', exact: true })).toHaveCount(1)

  const centreOf = async (locator: typeof send): Promise<{ x: number; y: number }> => {
    const rect = await locator.boundingBox()
    if (!rect) throw new Error('A bottom button has no layout box')
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }

  const sendCentre = await centreOf(send)
  const receiveCentre = await centreOf(receive)

  expect(sendCentre.x).toBeLessThan(VIEWPORT.width / 2)
  expect(receiveCentre.x).toBeGreaterThan(VIEWPORT.width / 2)
  for (const centre of [sendCentre, receiveCentre]) {
    expect(centre.y).toBeGreaterThan(VIEWPORT.height - BOTTOM_BAND)
    expect(centre.y).toBeLessThanOrEqual(VIEWPORT.height)
  }
})
