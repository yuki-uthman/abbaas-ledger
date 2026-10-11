import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import {
  createAccount,
  readEntries,
  readPeopleNames,
  seedPerson,
  type Account,
} from '../support/accounts.js'

// Value 3: recording a USD send to a saved or a new person.
//
// Judged through the declared public port only: the built bundle's DOM (the Send
// button, the blue form's labelled fields and contract attributes, Home's centre
// line and balance boxes) and, outside the browser, the rows the app stored.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 360, height: 780 } as const

const SEND_ACCOUNT = {
  email: 'owner-send-usd@abbaas.test',
  password: 'send-usd-password-3',
} as const

const SAVED_PERSON = 'Mariyam Nisha'
const NEW_PERSON = 'Ahmed Shifaz'

let stack: Stack
let served: ServedOrigin
let account: Account
let savedPersonId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, SEND_ACCOUNT)
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

/** Today in the device's own time zone, as the Date field must show it. */
const deviceToday = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })

const openSendForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  return form
}

const saveButton = (page: Page): Locator =>
  page.getByRole('button', { name: /^Save entry/ })

/**
 * Home animates a newly saved entry and its counting boxes, so a position or a
 * box text read the instant Home appears would be read mid-flight. Resting
 * layout is only defined once nothing in the document is still moving.
 */
const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

/** The holder's box, judged on the attribute contract fixed by value 2. */
const expectBox = async (
  page: Page,
  who: 'you' | 'abbaas',
  state: 'filled' | 'empty',
  cents: string,
): Promise<void> => {
  const box = page.locator(`[data-box="${who}"]`)
  await expect(box).toHaveCount(1)
  await expect(box).toHaveAttribute('data-state', state)
  await expect(box).toHaveAttribute('data-amount', cents)
}

test('a USD send to a saved person and to a new one lands right of the centre line and fills Abbaas\'s box', async ({
  page,
}) => {
  await signIn(page)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // ----- The form opens on the blue send screen with USD already chosen. -----
  const form = await openSendForm(page)
  await expect(form).toContainText('Money sent for Abbaas')
  await expect(page.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const today = await deviceToday(page)
  const dateField = page.getByLabel('Date')
  await expect(dateField).toHaveAttribute('type', 'date')
  await expect(dateField).toHaveValue(today)

  // ----- Nothing can be saved before an amount and a person exist. -----
  await expect(saveButton(page)).toBeDisabled()

  const amount = page.getByLabel('Amount sent')
  await expect(amount).toHaveAttribute('inputmode', 'decimal')
  await amount.fill('250.00')

  // The after-saving preview follows the typed amount, before any person is chosen.
  const abbaasPreview = page.locator('[data-preview-box="abbaas"]')
  await expect(abbaasPreview).toHaveAttribute('data-state', 'filled')
  await expect(abbaasPreview).toHaveAttribute('data-amount', '25000')
  await expect(page.locator('[data-preview-box="you"]')).toHaveAttribute('data-state', 'empty')

  // An amount alone is still not savable: a send must name who was paid.
  await expect(saveButton(page)).toBeDisabled()

  const savedChip = page.locator(`[data-person-chip="${savedPersonId}"]`)
  await expect(savedChip).toHaveText(SAVED_PERSON)
  await savedChip.click()
  await expect(savedChip).toHaveAttribute('aria-pressed', 'true')

  await page.getByLabel('Note').fill('School fees')

  const save = saveButton(page)
  await expect(save).toBeEnabled()
  await expect(save).toHaveAccessibleName(/\$250\.00/)
  await save.click()

  // ----- Home: the entry sits wholly in the right half of the centre line. -----
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  const entries = page.locator('[data-entry]')
  await expect(entries).toHaveCount(1)
  await settled(page)

  const first = entries.first()
  await expect(first).toContainText('$250.00')
  await expect(first).toContainText(SAVED_PERSON)
  await expect(first.locator('[data-person]')).toHaveCount(1)
  const firstRect = await first.boundingBox()
  if (!firstRect) throw new Error('The saved entry has no layout box')
  expect(firstRect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)

  // ----- The balance is unsigned, in Abbaas's box, captioned for him. -----
  await expectBox(page, 'abbaas', 'filled', '25000')
  await expectBox(page, 'you', 'empty', '0')
  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(abbaasBox).toContainText('$250.00')
  await expect(abbaasBox).toContainText('has your money')
  expect(await abbaasBox.innerText()).not.toMatch(/[+−-]\s*\$250\.00/)

  // ----- A second send, this time to a person typed for the first time. -----
  await openSendForm(page)
  await page.getByRole('button', { name: 'New person', exact: true }).click()
  await page.getByLabel('Name').fill(NEW_PERSON)
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  // Add both stores the person and chooses them, so only the amount is left.
  const newChip = page.locator('[data-person-chip]').filter({ hasText: NEW_PERSON })
  await expect(newChip).toHaveCount(1)
  await expect(newChip).toHaveAttribute('aria-pressed', 'true')

  await page.getByLabel('Amount sent').fill('100')
  const secondSave = saveButton(page)
  await expect(secondSave).toBeEnabled()
  await secondSave.click()

  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  await expect(entries).toHaveCount(2)
  await settled(page)
  for (let index = 0; index < 2; index += 1) {
    const rect = await entries.nth(index).boundingBox()
    if (!rect) throw new Error('An entry has no layout box')
    expect(rect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)
  }
  await expectBox(page, 'abbaas', 'filled', '35000')
  await expect(abbaasBox).toContainText('$350.00')
  await expectBox(page, 'you', 'empty', '0')

  // ----- Both entries and the new person survive a reload: they are stored. -----
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await settled(page)
  await expectBox(page, 'abbaas', 'filled', '35000')

  // A person is typed once and chosen thereafter, in name order.
  await openSendForm(page)
  const chips = page.locator('[data-person-chip]')
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(0)).toHaveText(NEW_PERSON)
  await expect(chips.nth(1)).toHaveText(SAVED_PERSON)

  // ----- What was stored, read outside the browser. -----
  expect([...(await readPeopleNames(stack, account))]).toEqual([NEW_PERSON, SAVED_PERSON])

  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(2)

  const byName = (name: string) => {
    const found = stored.find((entry) => entry.person_name === name)
    if (!found) throw new Error(`No stored entry for ${name}`)
    return found
  }

  const toSaved = byName(SAVED_PERSON)
  const toNew = byName(NEW_PERSON)

  expect(toSaved.usd_cents).toBe(25000)
  expect(toNew.usd_cents).toBe(10000)
  expect(toSaved.note).toBe('School fees')

  for (const entry of [toSaved, toNew]) {
    expect(entry.kind).toBe('send')
    expect(entry.currency).toBe('USD')
    expect(entry.rate).toBeNull()
    // For a USD send the minor unit IS the cent, so the two must agree.
    expect(entry.amount_minor).toBe(entry.usd_cents)
    expect(entry.entry_date).toBe(today)
    expect(entry.person_id).not.toBeNull()
  }
  expect(toSaved.person_id).toBe(savedPersonId)
  expect(toNew.person_id).not.toBe(savedPersonId)
})
