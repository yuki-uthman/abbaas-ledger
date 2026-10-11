import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, seedUsdSend, type Account } from '../support/accounts.js'

// Value 9: motion on open, save and balance change.
//
// Judged through the declared public port only: the built bundle's DOM OVER TIME,
// with and without prefers-reduced-motion. The observable contract is the one the
// design fixed: while a motion runs its element carries data-motion with the value
// reveal, enter, count or swap, and the attribute is removed when it ends; the
// reveal's clip-path circle is centred on the tapped button; a counting box already
// carries the final data-amount while its text is still between the two values.
//
// The contract covers the whole of a motion, including the frames in which an element
// is being held in its start state before it visibly moves: an entry that is shifted
// or transparent is mid-motion and must say so on itself, so that a reader which waits
// for no data-motion to remain and then measures sees the resting state and nothing
// else. The recorder therefore samples each entry's computed transform and opacity,
// which are the only properties the design lets the entrance use, alongside the
// attributes.
//
// A single transient state cannot be caught by a round-trip assertion, so the frames
// are recorded inside the page with requestAnimationFrame and judged afterwards. The
// recorder reads nothing but the public attributes, text and computed clip-path.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 360, height: 780 } as const
const HALF = VIEWPORT.width / 2

// Each test drives the same two saves, so each needs its own account starting from
// the same seeded balance: sharing one account would leave the second test looking at
// the first test's end state. The emails differ only by the test they belong to.
const FULL_MOTION_ACCOUNT = {
  email: 'owner-motion-full@abbaas.test',
  password: 'motion-password-9',
} as const
const REDUCED_MOTION_ACCOUNT = {
  email: 'owner-motion-reduced@abbaas.test',
  password: 'motion-password-9',
} as const

// Abbaas starts out holding $740.00 of the owner's money. A $500 send takes the
// balance to $1,240.00 on his side; a $2,000 repayment then moves it to the owner's
// side, leaving $760.00 of his.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 74000
const SEEDED_SEND_DATE = '2026-10-05'
const SENT_AMOUNT = '500'
const RECEIVED_AMOUNT = '2000'
const AFTER_SEND_CENTS = 124000
const AFTER_RECEIVE_CENTS = 76000
const AFTER_SEND_TEXT = '$1,240.00'
const AFTER_RECEIVE_TEXT = '$760.00'

// The design fixes every motion at 520 ms or less except the balance count (700 ms,
// 900 ms for a swap), the entry entrance starting about 380 ms after Home appears,
// and nothing running longer than 1.5 s from its start. A recording window of 2.5 s
// covers the whole of the longest motion plus the save's round trip to the stack.
const WINDOW_MS = 2_500
const LONGEST_MOTION_MS = 1_500

let stack: Stack
let served: ServedOrigin

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
})

/**
 * A fresh account holding nothing but one USD send of the seeded cents, so every test
 * starts from Abbaas holding $740.00 whether it runs alone or after another.
 */
const freshSeededAccount = async (credentials: {
  readonly email: string
  readonly password: string
}): Promise<Account> => {
  const created = await createAccount(stack, credentials)
  await seedUsdSend(stack, created, {
    personName: SEEDED_PERSON,
    usdCents: SEEDED_SEND_CENTS,
    entryDate: SEEDED_SEND_DATE,
  })
  return created
}

test.afterAll(async () => {
  await served?.close()
})

// ---------------------------------------------------------------------------
// The in-page frame recorder: one sample per animation frame of the public
// attributes, the boxes' text and the form root's computed clip-path.
// ---------------------------------------------------------------------------

type Sample = {
  readonly motion: string | null
  readonly amount: string | null
  readonly state: string | null
  readonly text: string
}

type Frame = {
  readonly t: number
  /** Every data-motion value present anywhere in the document at this frame. */
  readonly motions: readonly string[]
  readonly form:
    | {
        readonly kind: string | null
        readonly motion: string | null
        readonly clipPath: string
        readonly left: number
        readonly top: number
      }
    | null
  readonly you: Sample | null
  readonly abbaas: Sample | null
  readonly entries: readonly {
    readonly motion: string | null
    readonly text: string
    readonly transform: string
    readonly opacity: number
  }[]
}

declare global {
  interface Window {
    __recordFrames: (durationMs: number) => Promise<Frame[]>
  }
}

const installRecorder = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.__recordFrames = (durationMs: number) =>
      new Promise((resolve) => {
        const frames: unknown[] = []
        const started = performance.now()
        const clean = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim()
        const sample = (selector: string): unknown => {
          const element = document.querySelector(selector)
          if (!element) return null
          return {
            motion: element.getAttribute('data-motion'),
            amount: element.getAttribute('data-amount'),
            state: element.getAttribute('data-state'),
            text: clean(element.textContent),
          }
        }
        const tick = (): void => {
          const t = performance.now() - started
          const form = document.querySelector('[data-form]')
          const formRect = form ? form.getBoundingClientRect() : null
          frames.push({
            t,
            motions: Array.from(
              document.querySelectorAll('[data-motion]'),
              (element) => element.getAttribute('data-motion') ?? '',
            ),
            form:
              form && formRect
                ? {
                    kind: form.getAttribute('data-form'),
                    motion: form.getAttribute('data-motion'),
                    clipPath: getComputedStyle(form).clipPath,
                    left: formRect.left,
                    top: formRect.top,
                  }
                : null,
            you: sample('[data-box="you"]'),
            abbaas: sample('[data-box="abbaas"]'),
            entries: Array.from(document.querySelectorAll('[data-entry]'), (element) => {
              const style = getComputedStyle(element)
              return {
                motion: element.getAttribute('data-motion'),
                text: clean(element.textContent),
                transform: style.transform,
                opacity: Number(style.opacity),
              }
            }),
          })
          if (t < durationMs) requestAnimationFrame(tick)
          else resolve(frames as Frame[])
        }
        requestAnimationFrame(tick)
      })
  })
}

/**
 * Starts recording and returns the pending handle, so the stimulus can be applied
 * while the page keeps sampling. Awaiting the handle yields the frames.
 */
const startRecording = (page: Page): Promise<Frame[]> =>
  page.evaluate((ms) => window.__recordFrames(ms), WINDOW_MS)

// ---------------------------------------------------------------------------
// Reading the recording
// ---------------------------------------------------------------------------

const centsOf = (text: string): number | null => {
  const found = /\$([\d,]+)(?:\.(\d{2}))?/.exec(text)
  if (!found) return null
  const dollars = Number(found[1]!.replace(/,/g, ''))
  const cents = Number(found[2] ?? '0')
  return dollars * 100 + cents
}

/** The centre of a clip-path circle, in viewport pixels. */
const circleCentre = (
  form: NonNullable<Frame['form']>,
): { readonly x: number; readonly y: number } | null => {
  const found = /circle\([^)]*?\s+at\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*\)/.exec(form.clipPath)
  if (!found) return null
  // The circle is placed in the form's own reference box; the viewport point is that
  // box's origin plus the offset, which is the same thing for a full-screen form.
  return { x: form.left + Number(found[1]), y: form.top + Number(found[2]) }
}

const framesWith = (frames: readonly Frame[], motion: string): readonly Frame[] =>
  frames.filter((frame) => frame.motions.includes(motion))

/** Every motion of this kind finished within 1.5 s of its start. */
const expectWithinBudget = (frames: readonly Frame[], motion: string): void => {
  const running = framesWith(frames, motion)
  expect(running.length, `no frame ever carried data-motion="${motion}"`).toBeGreaterThan(0)
  const span = running[running.length - 1]!.t - running[0]!.t
  expect(span, `data-motion="${motion}" ran for ${span} ms`).toBeLessThanOrEqual(LONGEST_MOTION_MS)
}

const signIn = async (page: Page, account: Account): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  await expect(page.locator('[data-box="abbaas"]')).toContainText('$740.00')
}

// ===========================================================================
// Without reduced motion: every motion is observable while it runs and gone after.
// ===========================================================================

test('forms grow from the tapped button, the saved entry arrives from its side, and the balance counts and swaps', async ({
  page,
}) => {
  const account = await freshSeededAccount(FULL_MOTION_ACCOUNT)
  await installRecorder(page)
  await signIn(page, account)

  const abbaasBox = page.locator('[data-box="abbaas"]')
  const youBox = page.locator('[data-box="you"]')
  const sendButton = page.locator('[data-action="send"]')
  const receiveButton = page.locator('[data-action="receive"]')

  // ----- The Send button's centre: where its reveal must start from. -----
  const sendRect = await sendButton.boundingBox()
  if (!sendRect) throw new Error('The Send button has no layout box')
  const sendCentre = { x: sendRect.x + sendRect.width / 2, y: sendRect.y + sendRect.height / 2 }
  expect(sendCentre.x).toBeLessThan(HALF)

  // ===== Opening Send: a circle reveal from that button. =====
  let recording = startRecording(page)
  await sendButton.click()
  let frames = await recording

  const sendReveal = framesWith(frames, 'reveal')
  expect(sendReveal.length, 'the send form never carried data-motion="reveal"').toBeGreaterThan(0)
  for (const frame of sendReveal) {
    expect(frame.form?.kind).toBe('send')
    expect(frame.form?.motion).toBe('reveal')
  }
  // A circle, centred on the tapped button, in the left half of the viewport.
  const sendCentres = sendReveal.map((frame) => circleCentre(frame.form!)).filter((c) => c !== null)
  expect(sendCentres.length, `no reveal frame showed a clip-path circle`).toBeGreaterThan(0)
  for (const centre of sendCentres) {
    expect(centre!.x).toBeLessThan(HALF)
    expect(centre!.x).toBeGreaterThanOrEqual(sendRect.x)
    expect(centre!.x).toBeLessThanOrEqual(sendRect.x + sendRect.width)
    expect(centre!.y).toBeGreaterThanOrEqual(sendRect.y)
    expect(centre!.y).toBeLessThanOrEqual(sendRect.y + sendRect.height)
  }
  expectWithinBudget(frames, 'reveal')

  // After the window the reveal is over: no data-motion and no clip-path at all.
  const sendForm = page.locator('[data-form="send"]')
  await expect(sendForm).toBeVisible()
  await expect(sendForm).not.toHaveAttribute('data-motion', /.*/)
  expect(
    await sendForm.evaluate((element) => getComputedStyle(element).clipPath),
  ).toBe('none')

  // ===== Saving the send: the entry enters from its side, the box counts. =====
  await page.getByLabel('Amount sent').fill(SENT_AMOUNT)
  await page.getByRole('button', { name: SEEDED_PERSON }).click()

  recording = startRecording(page)
  await page.getByRole('button', { name: /^Save entry/ }).click()
  frames = await recording

  // The new entry carries data-motion="enter" while it arrives.
  const enterFrames = frames.filter((frame) =>
    frame.entries.some((entry) => entry.text.includes('$500.00') && entry.motion === 'enter'),
  )
  expect(
    enterFrames.length,
    'the new entry never carried data-motion="enter" on returning to Home',
  ).toBeGreaterThan(0)
  expectWithinBudget(frames, 'enter')

  // The entrance is self-declaring for the whole of its run, including the wait before
  // it visibly moves. From the first frame of Home after the save until the entry
  // rests, any frame in which the new entry is displaced or transparent has that entry
  // carrying data-motion="enter"; so a reader that waits for no element to carry
  // data-motion and then measures can only ever read the resting entry.
  const homeFrames = frames.filter((frame) => frame.entries.length === 2)
  expect(homeFrames.length, 'Home never showed the two entries after the save').toBeGreaterThan(0)
  const newEntryFrames = homeFrames.map((frame) => ({
    t: frame.t,
    motions: frame.motions,
    entry: frame.entries.find((entry) => entry.text.includes('$500.00')) ?? null,
  }))
  expect(
    newEntryFrames.filter((frame) => frame.entry === null).map((frame) => frame.t),
    'the new entry was missing from a frame of Home that showed two entries',
  ).toEqual([])

  const moving = (entry: NonNullable<(typeof newEntryFrames)[number]['entry']>): boolean =>
    entry.transform !== 'none' || entry.opacity < 1

  const undeclared = newEntryFrames.filter(
    (frame) => moving(frame.entry!) && frame.entry!.motion !== 'enter',
  )
  expect(
    undeclared.map((frame) => ({
      t: frame.t,
      motion: frame.entry!.motion,
      transform: frame.entry!.transform,
      opacity: frame.entry!.opacity,
    })),
    'the new entry was displaced or transparent without carrying data-motion="enter"',
  ).toEqual([])

  // The same rule read from the other end: with no data-motion anywhere, it rests.
  const stillFrames = newEntryFrames.filter((frame) => frame.motions.length === 0)
  expect(
    stillFrames.length,
    'no frame of Home after the save was free of data-motion',
  ).toBeGreaterThan(0)
  expect(
    stillFrames
      .filter((frame) => moving(frame.entry!))
      .map((frame) => ({
        t: frame.t,
        transform: frame.entry!.transform,
        opacity: frame.entry!.opacity,
      })),
    'the new entry was still displaced or transparent after every data-motion was gone',
  ).toEqual([])

  // The holder's box counts: the final data-amount is already set while the shown
  // amount is still between the balance before the save and the balance after it.
  const countFrames = frames.filter((frame) => frame.abbaas?.motion === 'count')
  expect(countFrames.length, 'the abbaas box never carried data-motion="count"').toBeGreaterThan(0)
  for (const frame of countFrames) {
    expect(frame.abbaas!.amount).toBe(String(AFTER_SEND_CENTS))
    const shown = centsOf(frame.abbaas!.text)
    expect(shown, `a counting box showed no amount: ${frame.abbaas!.text}`).not.toBeNull()
    expect(shown!).toBeGreaterThanOrEqual(SEEDED_SEND_CENTS)
    expect(shown!).toBeLessThanOrEqual(AFTER_SEND_CENTS)
  }
  // It is a count and not a jump: some frame showed neither end value as its text.
  expect(
    countFrames.some((frame) => !frame.abbaas!.text.includes(AFTER_SEND_TEXT)),
    'the balance jumped straight to its final text instead of counting',
  ).toBe(true)
  expectWithinBudget(frames, 'count')

  // After the window every motion is finished and the end state is shown.
  await expect(abbaasBox).not.toHaveAttribute('data-motion', /.*/)
  await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_SEND_CENTS))
  await expect(abbaasBox).toContainText(AFTER_SEND_TEXT)
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await expect(page.locator('[data-motion]')).toHaveCount(0)

  // ===== Opening Receive: the same reveal, from the other side. =====
  const receiveRect = await receiveButton.boundingBox()
  if (!receiveRect) throw new Error('The Receive button has no layout box')
  expect(receiveRect.x + receiveRect.width / 2).toBeGreaterThan(HALF)

  recording = startRecording(page)
  await receiveButton.click()
  frames = await recording

  const receiveReveal = framesWith(frames, 'reveal')
  expect(receiveReveal.length, 'the receive form never carried data-motion="reveal"').toBeGreaterThan(0)
  for (const frame of receiveReveal) {
    expect(frame.form?.kind).toBe('receive')
  }
  const receiveCentres = receiveReveal
    .map((frame) => circleCentre(frame.form!))
    .filter((c) => c !== null)
  expect(receiveCentres.length, 'no reveal frame showed a clip-path circle').toBeGreaterThan(0)
  for (const centre of receiveCentres) {
    expect(centre!.x).toBeGreaterThan(HALF)
    expect(centre!.x).toBeGreaterThanOrEqual(receiveRect.x)
    expect(centre!.x).toBeLessThanOrEqual(receiveRect.x + receiveRect.width)
    expect(centre!.y).toBeGreaterThanOrEqual(receiveRect.y)
    expect(centre!.y).toBeLessThanOrEqual(receiveRect.y + receiveRect.height)
  }
  expectWithinBudget(frames, 'reveal')

  // ===== A repayment larger than he holds: his box drains while the owner's fills. =====
  await page.getByLabel('Amount received').fill(RECEIVED_AMOUNT)

  recording = startRecording(page)
  await page.getByRole('button', { name: /^Save entry/ }).click()
  frames = await recording

  const swapFrames = frames.filter(
    (frame) => frame.abbaas?.motion === 'swap' && frame.you?.motion === 'swap',
  )
  expect(swapFrames.length, 'the two boxes never carried data-motion="swap" together').toBeGreaterThan(0)
  for (const frame of swapFrames) {
    // The end values are already on the attributes while the shown amounts move.
    expect(frame.abbaas!.amount).toBe('0')
    expect(frame.you!.amount).toBe(String(AFTER_RECEIVE_CENTS))
    const drained = centsOf(frame.abbaas!.text)
    const filled = centsOf(frame.you!.text)
    expect(drained, `the draining box showed no amount: ${frame.abbaas!.text}`).not.toBeNull()
    expect(filled, `the filling box showed no amount: ${frame.you!.text}`).not.toBeNull()
    expect(drained!).toBeGreaterThanOrEqual(0)
    expect(drained!).toBeLessThanOrEqual(AFTER_SEND_CENTS)
    expect(filled!).toBeGreaterThanOrEqual(0)
    expect(filled!).toBeLessThanOrEqual(AFTER_RECEIVE_CENTS)
  }
  expectWithinBudget(frames, 'swap')

  // After the window the balance has landed on the owner's side.
  await expect(page.locator('[data-motion]')).toHaveCount(0)
  await expect(youBox).toHaveAttribute('data-state', 'filled')
  await expect(youBox).toHaveAttribute('data-amount', String(AFTER_RECEIVE_CENTS))
  await expect(youBox).toContainText(AFTER_RECEIVE_TEXT)
  await expect(abbaasBox).toHaveAttribute('data-state', 'empty')
  await expect(abbaasBox).toHaveAttribute('data-amount', '0')
  await expect(page.locator('[data-entry]')).toHaveCount(3)
})

// ===========================================================================
// With prefers-reduced-motion: reduce, every screen shows its end state at once.
// ===========================================================================

test('with reduced motion nothing animates and every screen shows its end state at once', async ({
  browser,
}: {
  browser: Browser
}) => {
  const account = await freshSeededAccount(REDUCED_MOTION_ACCOUNT)
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await installRecorder(page)
    await signIn(page, account)

    const abbaasBox = page.locator('[data-box="abbaas"]')
    const youBox = page.locator('[data-box="you"]')

    /** No frame of a recording may carry data-motion anywhere in the document. */
    const expectNoMotion = (frames: readonly Frame[], moment: string): void => {
      const moving = frames.filter((frame) => frame.motions.length > 0)
      expect(
        moving.map((frame) => frame.motions).flat(),
        `data-motion was set with reduced motion while ${moment}`,
      ).toEqual([])
    }

    // ===== Opening Send: shown whole, with no clip-path. =====
    let recording = startRecording(page)
    await page.locator('[data-action="send"]').click()
    let frames = await recording
    expectNoMotion(frames, 'opening the send form')
    // Right after opening, and at every frame, the form is unclipped.
    const clipped = frames
      .filter((frame) => frame.form !== null)
      .filter((frame) => frame.form!.clipPath !== 'none')
    expect(
      clipped.map((frame) => frame.form!.clipPath),
      'the form was clipped with reduced motion',
    ).toEqual([])
    expect(
      frames.some((frame) => frame.form?.kind === 'send'),
      'the send form never appeared',
    ).toBe(true)

    // ===== Saving the send: the balance is already $1,240.00 when Home appears. =====
    await page.getByLabel('Amount sent').fill(SENT_AMOUNT)
    await page.getByRole('button', { name: SEEDED_PERSON }).click()

    recording = startRecording(page)
    await page.getByRole('button', { name: /^Save entry/ }).click()
    frames = await recording
    expectNoMotion(frames, 'saving the send')
    // Every frame of Home after the save (two entries) already shows the end state:
    // no frame shows the old balance or any value between the two.
    const afterSend = frames.filter((frame) => frame.entries.length === 2)
    expect(afterSend.length, 'Home never showed the two entries').toBeGreaterThan(0)
    for (const frame of afterSend) {
      expect(frame.abbaas!.amount).toBe(String(AFTER_SEND_CENTS))
      expect(frame.abbaas!.text).toContain(AFTER_SEND_TEXT)
    }
    await expect(abbaasBox).toContainText(AFTER_SEND_TEXT)

    // ===== Opening Receive: again unclipped and unanimated. =====
    recording = startRecording(page)
    await page.locator('[data-action="receive"]').click()
    frames = await recording
    expectNoMotion(frames, 'opening the receive form')
    expect(
      frames
        .filter((frame) => frame.form !== null)
        .filter((frame) => frame.form!.clipPath !== 'none')
        .map((frame) => frame.form!.clipPath),
      'the form was clipped with reduced motion',
    ).toEqual([])
    expect(
      frames.some((frame) => frame.form?.kind === 'receive'),
      'the receive form never appeared',
    ).toBe(true)

    // ===== The swap happens at once: $760.00 on the owner's side, his box empty. =====
    await page.getByLabel('Amount received').fill(RECEIVED_AMOUNT)

    recording = startRecording(page)
    await page.getByRole('button', { name: /^Save entry/ }).click()
    frames = await recording
    expectNoMotion(frames, 'saving the repayment')
    const afterReceive = frames.filter((frame) => frame.entries.length === 3)
    expect(afterReceive.length, 'Home never showed the three entries').toBeGreaterThan(0)
    for (const frame of afterReceive) {
      expect(frame.you!.amount).toBe(String(AFTER_RECEIVE_CENTS))
      expect(frame.you!.text).toContain(AFTER_RECEIVE_TEXT)
      expect(frame.abbaas!.amount).toBe('0')
      expect(frame.abbaas!.state).toBe('empty')
    }
    await expect(youBox).toHaveAttribute('data-state', 'filled')
    await expect(youBox).toContainText(AFTER_RECEIVE_TEXT)
    await expect(abbaasBox).toHaveAttribute('data-state', 'empty')
  } finally {
    await context.close()
  }
})
