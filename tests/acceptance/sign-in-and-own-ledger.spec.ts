import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import {
  ACCOUNT_A,
  ACCOUNT_B,
  A_PRIVATE_TEXTS,
  createAccount,
  seedLedger,
  type Account,
  type SeededLedger,
} from '../support/accounts.js'

// Value 1: sign in once per phone, and a ledger that belongs to the account.
//
// Ownership is judged on the stable attribute contract, data-entry and
// data-person, never on wording or layout, so the balance boxes and centre line
// of later values cannot break this oracle.

const PASSWORD_FIELD = 'input[type="password"]'

let stack: Stack
let served: ServedOrigin
let accountA: Account
let accountB: Account
let seed: SeededLedger

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  accountA = await createAccount(stack, ACCOUNT_A)
  accountB = await createAccount(stack, ACCOUNT_B)
  seed = await seedLedger(stack, accountA)
})

test.afterAll(async () => {
  await served?.close()
})

/** Records whether a password field was EVER in the document, even for one frame. */
const watchForPasswordField = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(() => {
    const flag = window as unknown as { __sawPasswordField?: boolean }
    flag.__sawPasswordField = false
    const check = (): void => {
      if (document.querySelector('input[type="password"]')) flag.__sawPasswordField = true
    }
    const observe = (): void => {
      check()
      new MutationObserver(check).observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    }
    if (document.documentElement) observe()
    else document.addEventListener('DOMContentLoaded', observe)
  })
}

const sawPasswordField = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __sawPasswordField?: boolean }).__sawPasswordField === true)

const signIn = async (page: Page, account: Account): Promise<void> => {
  await page.goto(ORIGIN)
  // A first visit on a phone asks for credentials.
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Home has been reached when the sign-in screen's password field is gone. */
const expectHome = async (page: Page): Promise<void> => {
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  // A failed read must never be mistaken for an owned-or-empty ledger.
  await expect(page.getByRole('alert')).toHaveCount(0)
}

const entryIdsOn = (page: Page): Promise<string[]> =>
  page.locator('[data-entry]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-entry') ?? ''),
  )

const personIdsOn = (page: Page): Promise<string[]> =>
  page.locator('[data-person]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-person') ?? ''),
  )

test('signing in once per phone opens an account-owned ledger that no other account sees', async ({
  browser,
}) => {
  // --- Phone A, first visit: sign in once. ---
  const phoneA = await browser.newContext()
  const firstVisit = await phoneA.newPage()
  await signIn(firstVisit, accountA)
  await expectHome(firstVisit)

  await expect(firstVisit.locator('[data-entry]')).toHaveCount(3)
  const seenEntryIds = await entryIdsOn(firstVisit)
  expect([...seenEntryIds].sort()).toEqual([...seed.entryIds].sort())

  // Two sends name a person; the receive names none.
  const seenPersonIds = await personIdsOn(firstVisit)
  expect(seenPersonIds).toHaveLength(2)
  expect(new Set(seenPersonIds).size).toBe(2)
  expect([...new Set(seenPersonIds)].sort()).toEqual([...seed.peopleIds].sort())

  for (const text of A_PRIVATE_TEXTS) {
    await expect(firstVisit.getByText(text, { exact: false }).first()).toBeVisible()
  }

  // --- Phone A, later visit: a home-screen launch, not a fresh sign-in. ---
  await watchForPasswordField(phoneA)
  const laterVisit = await phoneA.newPage()
  await laterVisit.goto(ORIGIN)
  await expect(laterVisit.locator('[data-entry]')).toHaveCount(3)
  await expectHome(laterVisit)
  expect([...(await entryIdsOn(laterVisit))].sort()).toEqual([...seenEntryIds].sort())
  // Not merely absent at the end: never shown at all, so no sign-in screen flashes
  // while the persisted session resolves.
  expect(await sawPasswordField(laterVisit)).toBe(false)

  // --- Phone B: a second phone is a second browser with its own storage. ---
  const phoneB = await browser.newContext()
  const otherOwner = await phoneB.newPage()
  await signIn(otherOwner, accountB)
  await expectHome(otherOwner)

  await expect(otherOwner.locator('[data-entry]')).toHaveCount(0)
  await expect(otherOwner.locator('[data-person]')).toHaveCount(0)
  for (const text of A_PRIVATE_TEXTS) {
    await expect(otherOwner.getByText(text, { exact: false })).toHaveCount(0)
  }

  // --- Phone A again: B's empty Home was row-level security, not a lost seed. ---
  const finalVisit = await phoneA.newPage()
  await finalVisit.goto(ORIGIN)
  await expect(finalVisit.locator('[data-entry]')).toHaveCount(3)
  await expectHome(finalVisit)
  expect(await sawPasswordField(finalVisit)).toBe(false)

  await phoneA.close()
  await phoneB.close()
})
