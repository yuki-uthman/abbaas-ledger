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

// Travelling cards value 1: a send rests on Abbaas's side.
//
// Judged through the declared public port only: the built bundle's DOM (the Send
// button, the blue form's labelled fields and contract attributes, Home's centre
// line and balance boxes) and, outside the browser, the rows the app stored.
//
// Everything this oracle said about the form, the storage and the balances is
// kept. What changes is the resting side: a card rests on the side of whoever
// RECEIVED the money, so a send's card lies wholly RIGHT of the centre line, on
// Abbaas's side, and its row names that side with data-side='right'.

const PASSWORD_FIELD = 'input[type="password"]'
// The refined board is drawn at 390 by 844; the shared config's phone is version
// one's. Only this oracle's pages are resized, so the support stays untouched.
const VIEWPORT = { width: 390, height: 844 } as const

test.use({ viewport: VIEWPORT })

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

/** A day in the device's own time zone, as the Date input must carry it. */
const deviceDate = (page: Page, dayOffset: number): Promise<string> =>
  page.evaluate((offset) => {
    const day = new Date()
    day.setDate(day.getDate() + offset)
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
  }, dayOffset)

/**
 * The date chip's words for a day that is not today, in the fixed en-GB shape
 * 'Sat, 10 Oct': short weekday, day of the month, short month.
 */
const chipWordsFor = (page: Page, isoDate: string): Promise<string> =>
  page.evaluate((iso) => {
    const parts = iso.split('-').map(Number)
    const day = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
    const weekday = day.toLocaleDateString('en-GB', { weekday: 'short' })
    const month = day.toLocaleDateString('en-GB', { month: 'short' })
    return `${weekday}, ${day.getDate()} ${month}`
  }, isoDate)

const openSendForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  return form
}

/** The board's white save button: its name carries the USD value. */
const sendButton = (page: Page, dollars: string): Locator =>
  page.getByRole('button', { name: `Send · ${dollars}`, exact: true })

/**
 * A send's card rests on Abbaas's side: wholly in the right half, judged on the
 * centre line, which is the viewport's middle because the page is one centred
 * column. Its row names that resting side with data-side='right'.
 */
const expectRestingRight = async (card: Locator): Promise<void> => {
  const rect = await card.boundingBox()
  if (!rect) throw new Error('An entry card has no layout box')
  expect(rect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)

  const side = await card.evaluate(
    (node) => node.closest('[data-side]')?.getAttribute('data-side') ?? null,
  )
  expect(side).toBe('right')
}

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

test("the blue send form records a USD send to a saved and to a new person, resting right of the centre line on Abbaas's side", async ({
  page,
}) => {
  await signIn(page)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // ----- The form opens on the board's blue screen with USD already chosen. -----
  const form = await openSendForm(page)
  await expect(form).toContainText('New entry · Send')
  await expect(
    form.getByRole('heading', { name: 'Money sent for Abbaas', level: 1 }),
  ).toBeVisible()
  await expect(form.getByRole('button', { name: 'Close' })).toBeVisible()
  // The top line states the balance: nothing is recorded yet.
  await expect(form).toContainText('All square')

  const usd = page.getByRole('button', { name: 'USD', exact: true })
  await expect(usd).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'MVR', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  // The white pill sits under the pressed half of the switch.
  const pill = form.locator('[data-pill]')
  await expect(pill).toHaveCount(1)
  const pillRect = await pill.boundingBox()
  const usdRect = await usd.boundingBox()
  if (!pillRect || !usdRect) throw new Error('The currency switch has no layout box')
  const pillCentre = pillRect.x + pillRect.width / 2
  expect(pillCentre).toBeGreaterThanOrEqual(usdRect.x)
  expect(pillCentre).toBeLessThanOrEqual(usdRect.x + usdRect.width)

  // ----- The amount is the board's large field, prefixed with a dollar sign. -----
  await expect(form.locator('[data-prefix]')).toHaveText('$')
  const amount = page.getByLabel('Amount sent')
  await expect(amount).toHaveAttribute('inputmode', 'decimal')
  expect(
    await amount.evaluate((node) => window.getComputedStyle(node).fontSize),
  ).toBe('44px')

  // In USD no rate is asked for, and the form says so.
  await expect(form).toContainText('Dollars go straight onto the balance. No rate needed.')

  // ----- What the refined board removed is absent. -----
  await expect(page.getByLabel('Note')).toHaveCount(0)
  await expect(form.locator('[data-preview-box]')).toHaveCount(0)
  await expect(form).not.toContainText('After saving')
  await expect(page.getByRole('button', { name: /Save entry/ })).toHaveCount(0)

  // ----- The date chip starts on today and carries the device's day. -----
  const today = await deviceDate(page, 0)
  const dateField = page.getByLabel('Date')
  await expect(dateField).toHaveAttribute('type', 'date')
  await expect(dateField).toHaveValue(today)
  // The chip over the input reads today in words, e.g. 'Today, 12 Oct'.
  await expect(form.getByText(/^Today, \d{1,2} [A-Za-z]{3}$/).first()).toBeVisible()

  // ----- Nothing can be saved before an amount and a person exist. -----
  await expect(sendButton(page, '$0.00')).toBeDisabled()

  await amount.fill('250.00')

  // The button's name follows the typed dollars, but an amount alone is not
  // savable: a send must name who was paid.
  const save = sendButton(page, '$250.00')
  await expect(save).toBeDisabled()

  const savedChip = page.locator(`[data-person-chip="${savedPersonId}"]`)
  await expect(savedChip).toContainText(SAVED_PERSON)
  await expect(savedChip).toHaveAttribute('aria-pressed', 'false')
  await savedChip.click()
  await expect(savedChip).toHaveAttribute('aria-pressed', 'true')

  // The chosen chip turns white with blue ink and shows its tick.
  expect(
    await savedChip.evaluate((node) => window.getComputedStyle(node).backgroundColor),
  ).toBe('rgb(255, 255, 255)')
  expect(await savedChip.evaluate((node) => window.getComputedStyle(node).color)).toBe(
    'rgb(27, 63, 110)',
  )
  await expect(savedChip.locator('svg').first()).toBeVisible()

  await expect(save).toBeEnabled()
  await save.click()

  // ----- Home: the card rests wholly in the RIGHT half, Abbaas's side. -----
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  const entries = page.locator('[data-entry]')
  await expect(entries).toHaveCount(1)
  await settled(page)

  const first = entries.first()
  await expect(first).toContainText('$250.00')
  await expect(first).toContainText(SAVED_PERSON)
  await expect(first.locator('[data-person]')).toHaveCount(1)
  await expectRestingRight(first)

  // ----- The balance is unsigned, in Abbaas's box, captioned for him. -----
  await expectBox(page, 'abbaas', 'filled', '25000')
  await expectBox(page, 'you', 'empty', '0')
  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(abbaasBox).toContainText('$250.00')
  await expect(abbaasBox).toContainText('has your money')
  expect(await abbaasBox.innerText()).not.toMatch(/[+−-]\s*\$250\.00/)

  // ----- A second send, to a person typed for the first time, dated yesterday. -----
  const secondForm = await openSendForm(page)
  // The top line now states what Abbaas holds.
  await expect(secondForm).toContainText('Abbaas has $250.00 of yours')

  await page.getByRole('button', { name: 'New person', exact: true }).click()
  await page.getByLabel('Name').fill(NEW_PERSON)
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  // Add both stores the person and chooses them, so only the amount is left.
  const newChip = page.locator('[data-person-chip]').filter({ hasText: NEW_PERSON })
  await expect(newChip).toHaveCount(1)
  await expect(newChip).toHaveAttribute('aria-pressed', 'true')

  await page.getByLabel('Amount sent').fill('100')

  // The chip's words follow the date input, so the picker is readable at a glance.
  const yesterday = await deviceDate(page, -1)
  await page.getByLabel('Date').fill(yesterday)
  await expect(page.getByLabel('Date')).toHaveValue(yesterday)
  const yesterdayWords = await chipWordsFor(page, yesterday)
  await expect(secondForm.getByText(yesterdayWords, { exact: true }).first()).toBeVisible()
  await expect(secondForm.getByText(/^Today, /)).toHaveCount(0)

  const secondSave = sendButton(page, '$100.00')
  await expect(secondSave).toBeEnabled()
  await secondSave.click()

  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  await expect(entries).toHaveCount(2)
  await settled(page)
  for (let index = 0; index < 2; index += 1) {
    await expectRestingRight(entries.nth(index))
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
  await expect(chips.nth(0)).toContainText(NEW_PERSON)
  await expect(chips.nth(1)).toContainText(SAVED_PERSON)

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

  // The date each form carried is the date each row keeps.
  expect(toSaved.entry_date).toBe(today)
  expect(toNew.entry_date).toBe(yesterday)

  for (const entry of [toSaved, toNew]) {
    expect(entry.kind).toBe('send')
    expect(entry.currency).toBe('USD')
    expect(entry.rate).toBeNull()
    // The refined form has no note field, so nothing can be stored in one.
    expect(entry.note).toBeNull()
    // For a USD send the minor unit IS the cent, so the two must agree.
    expect(entry.amount_minor).toBe(entry.usd_cents)
    expect(entry.person_id).not.toBeNull()
  }
  expect(toSaved.person_id).toBe(savedPersonId)
  expect(toNew.person_id).not.toBe(savedPersonId)
})
