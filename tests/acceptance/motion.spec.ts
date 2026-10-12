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

// Refined board value 6: the save motion. Home grows as a circle from the form's
// white save button, then only the new entry arrives from its own side, the balance
// counts, and the Saved message rises last.
//
// Judged through the declared public port only: the built bundle's DOM OVER TIME,
// with and without prefers-reduced-motion. The observable contract is the one the
// design fixed: while a motion runs its element carries data-motion with the value
// grow (the Home mounted above the form), enter (the new entry), count or swap (the
// boxes), and the attribute is removed when that motion ends. Home is located as the
// element carrying data-motion="grow"; no new attribute is needed and none is used.
//
// A single transient state cannot be caught by a round-trip assertion, so the frames
// are recorded inside the page with requestAnimationFrame and judged afterwards. The
// recorder reads nothing but the public attributes, text, and the computed clip-path,
// transform, opacity and ring of the elements the contract names.
//
// Not judged here: the save button's 16 % pressed overlay and the dim layer over the
// form carry no public marker in the design, so this oracle asserts only that the
// form is still mounted under the growing Home, which is what makes the dim layer and
// the press visible at all.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 390, height: 844 } as const

// Each test drives its own save from the same seeded balance, so each needs its own
// account: sharing one would leave a later test looking at an earlier one's end state.
const SEND_ACCOUNT = {
  email: 'owner-save-motion-send@abbaas.test',
  password: 'save-motion-password-6',
} as const
const RECEIVE_ACCOUNT = {
  email: 'owner-save-motion-receive@abbaas.test',
  password: 'save-motion-password-6',
} as const
const REDUCED_ACCOUNT = {
  email: 'owner-save-motion-reduced@abbaas.test',
  password: 'save-motion-password-6',
} as const

// Abbaas starts out holding $400.00 of the owner's money, on a past day, so every
// save in these tests opens a new day group for today.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEEDED_SEND_CENTS = 40000
const SEEDED_SEND_DATE = '2026-10-05'
const SEEDED_TEXT = '$400.00'

// A $100.00 send leaves $500.00 on his side.
const SENT_AMOUNT = '100'
const SENT_TEXT = '$100.00'
const SEND_BUTTON_NAME = 'Send · $100.00'
const AFTER_SEND_CENTS = 50000
const AFTER_SEND_TEXT = '$500.00'

// A $600.00 payment is more than he holds: his box drains to $0 while the owner's
// fills with the $200.00 difference.
const RECEIVED_AMOUNT = '600'
const RECEIVED_TEXT = '$600.00'
const RECEIVE_BUTTON_NAME = 'Receive · $600.00'
const AFTER_RECEIVE_CENTS = 20000
const AFTER_RECEIVE_TEXT = '$200.00'

// The ring the design puts on the new card, in its kind's colour.
const SEND_COLOUR = 'rgb(36, 80, 138)'
const RECEIVE_COLOUR = 'rgb(15, 111, 104)'
const RING_WIDTH_PX = 2

// The grow runs 520 ms and the form leaves the DOM at its end, so the whole of it is
// over well inside 900 ms of the tap. The Saved message is the last thing to appear
// and the design allows it up to 2.5 s from the start of the save motion. The window
// covers that plus the save's round trip to the local stack.
const WINDOW_MS = 3_500
const GROW_LIMIT_MS = 900
const SAVED_MESSAGE_LIMIT_MS = 2_500

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
  /** The text of the half-size cents span inside the box, or null when absent. */
  readonly cents: string | null
}

type EntrySample = {
  readonly motion: string | null
  readonly text: string
  readonly transform: string
  readonly opacity: number
  /** The card's ring: its border when it has one, else its outline. */
  readonly ringWidth: number
  readonly ringColour: string
}

type Frame = {
  readonly t: number
  /** Every data-motion value present anywhere in the document at this frame. */
  readonly motions: readonly string[]
  /** The data-form values mounted at this frame; empty once the form has left. */
  readonly formKinds: readonly string[]
  /** The element carrying data-motion="grow": Home, mounted above the form. */
  readonly grow:
    | {
        readonly clipPath: string
        readonly left: number
        readonly top: number
      }
    | null
  /** How many elements anywhere in the document have a circle() clip-path. */
  readonly circleClipped: number
  readonly you: Sample | null
  readonly abbaas: Sample | null
  readonly entries: readonly EntrySample[]
  readonly saved: { readonly opacity: number } | null
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
          const cents = element.querySelector('[data-cents]')
          return {
            motion: element.getAttribute('data-motion'),
            amount: element.getAttribute('data-amount'),
            state: element.getAttribute('data-state'),
            text: clean(element.textContent),
            cents: cents ? clean(cents.textContent) : null,
          }
        }
        const tick = (): void => {
          const t = performance.now() - started
          const grow = document.querySelector('[data-motion="grow"]')
          const growRect = grow ? grow.getBoundingClientRect() : null
          const saved = document.querySelector('[data-saved-message]')
          frames.push({
            t,
            motions: Array.from(
              document.querySelectorAll('[data-motion]'),
              (element) => element.getAttribute('data-motion') ?? '',
            ),
            formKinds: Array.from(
              document.querySelectorAll('[data-form]'),
              (element) => element.getAttribute('data-form') ?? '',
            ),
            grow:
              grow && growRect
                ? {
                    clipPath: getComputedStyle(grow).clipPath,
                    left: growRect.left,
                    top: growRect.top,
                  }
                : null,
            circleClipped: Array.from(document.querySelectorAll('*')).filter((element) =>
              getComputedStyle(element).clipPath.includes('circle('),
            ).length,
            you: sample('[data-box="you"]'),
            abbaas: sample('[data-box="abbaas"]'),
            entries: Array.from(document.querySelectorAll('[data-entry]'), (element) => {
              const style = getComputedStyle(element)
              // A ring is a border when the card has one and an outline otherwise;
              // the design fixes its width and colour, not which property draws it.
              const borderWidth = Number.parseFloat(style.borderTopWidth) || 0
              return {
                motion: element.getAttribute('data-motion'),
                text: clean(element.textContent),
                transform: style.transform,
                opacity: Number(style.opacity),
                ringWidth:
                  borderWidth > 0 ? borderWidth : Number.parseFloat(style.outlineWidth) || 0,
                ringColour: borderWidth > 0 ? style.borderTopColor : style.outlineColor,
              }
            }),
            saved: saved ? { opacity: Number(getComputedStyle(saved).opacity) } : null,
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

/** The centre of the growing Home's clip-path circle, in viewport pixels. */
const circleCentre = (
  grow: NonNullable<Frame['grow']>,
): { readonly x: number; readonly y: number } | null => {
  const found = /circle\([^)]*?\s+at\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*\)/.exec(grow.clipPath)
  if (!found) return null
  // The circle is placed in Home's own reference box; the viewport point is that box's
  // origin plus the offset, which is the same thing for a full-screen Home.
  return { x: grow.left + Number(found[1]), y: grow.top + Number(found[2]) }
}

/** The x translation a computed transform applies, or null when it is unreadable. */
const translationX = (transform: string): number | null => {
  if (transform === 'none') return 0
  const flat = /^matrix\(([^)]+)\)$/.exec(transform)
  if (flat) return Number(flat[1]!.split(',')[4])
  const three = /^matrix3d\(([^)]+)\)$/.exec(transform)
  if (three) return Number(three[1]!.split(',')[12])
  return null
}

const framesWith = (frames: readonly Frame[], motion: string): readonly Frame[] =>
  frames.filter((frame) => frame.motions.includes(motion))

/** The first frame at which an entry whose text holds `amount` is mid-entrance. */
const firstEntering = (frames: readonly Frame[], amount: string): EntrySample => {
  for (const frame of frames) {
    const entry = frame.entries.find(
      (candidate) => candidate.text.includes(amount) && candidate.motion === 'enter',
    )
    if (entry) return entry
  }
  throw new Error(`no frame showed the ${amount} entry carrying data-motion="enter"`)
}

/** The resting ring of the entry whose text holds `amount`, at the last frame. */
const restingEntry = (frames: readonly Frame[], amount: string): EntrySample => {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const entry = frames[index]!.entries.find((candidate) => candidate.text.includes(amount))
    if (entry) return entry
  }
  throw new Error(`no frame showed an entry containing ${amount}`)
}

const signIn = async (page: Page, account: Account): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  await expect(page.locator('[data-box="abbaas"]')).toContainText(SEEDED_TEXT)
}

/** A phone-sized context on the refined board's viewport, optionally reduced-motion. */
const openPhone = async (
  browser: Browser,
  options?: { readonly reduce: boolean },
): Promise<{ readonly page: Page; readonly close: () => Promise<void> }> => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ...(options?.reduce ? { reducedMotion: 'reduce' as const } : {}),
  })
  const page = await context.newPage()
  await installRecorder(page)
  return { page, close: () => context.close() }
}

/**
 * Taps the save button while the page records every frame, after noting where that
 * button was: the grow must start from exactly that centre.
 */
const saveAndRecord = async (
  page: Page,
  buttonName: string,
): Promise<{ readonly frames: readonly Frame[]; readonly centre: { x: number; y: number } }> => {
  const button = page.getByRole('button', { name: buttonName })
  await expect(button).toBeEnabled()
  const rect = await button.boundingBox()
  if (!rect) throw new Error(`The ${buttonName} button has no layout box`)
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const recording = startRecording(page)
  await button.click()
  return { frames: await recording, centre }
}

/**
 * The grow: Home mounted above the still-present form, clipped to a circle centred on
 * the save button, and both the clip and the form gone within 900 ms of the tap.
 */
const expectGrowFromButton = (
  frames: readonly Frame[],
  centre: { readonly x: number; readonly y: number },
  formKind: string,
): void => {
  const growing = frames.filter((frame) => frame.grow !== null)
  expect(growing.length, 'no frame carried data-motion="grow" on Home after the save').toBeGreaterThan(0)

  // The form is still mounted under the growing Home, which is what the dim layer and
  // the pressed button are seen through.
  expect(
    growing[0]!.formKinds,
    'the form had already left the DOM when Home began to grow',
  ).toContain(formKind)

  const centres = growing.map((frame) => circleCentre(frame.grow!))
  expect(
    centres.filter((found) => found !== null).length,
    'no grow frame showed a clip-path circle on Home',
  ).toBeGreaterThan(0)
  for (const found of centres) {
    if (!found) continue
    expect(Math.abs(found.x - centre.x), `grow centre x was ${found.x}, the button's ${centre.x}`).toBeLessThanOrEqual(4)
    expect(Math.abs(found.y - centre.y), `grow centre y was ${found.y}, the button's ${centre.y}`).toBeLessThanOrEqual(4)
  }

  // Within 900 ms of the tap the grow is over: Home carries no data-motion="grow",
  // nothing is clipped to a circle any more, and the form has left the DOM.
  const settled = frames.filter(
    (frame) =>
      frame.t <= GROW_LIMIT_MS &&
      frame.grow === null &&
      frame.circleClipped === 0 &&
      frame.formKinds.length === 0,
  )
  expect(
    settled.length,
    `the form, the grow or its clip-path was still there ${GROW_LIMIT_MS} ms after the tap`,
  ).toBeGreaterThan(0)
}

/**
 * The Saved message rises last: it is absent or fully transparent for as long as the
 * entry or the balance is still moving, and visible by the end of the motion.
 */
const expectSavedMessageLast = (frames: readonly Frame[]): void => {
  const stillMoving = frames.filter((frame) =>
    frame.motions.some((motion) => ['grow', 'enter', 'count', 'swap'].includes(motion)),
  )
  expect(stillMoving.length, 'no frame of the save motion carried data-motion').toBeGreaterThan(0)
  expect(
    stillMoving
      .filter((frame) => frame.saved !== null && frame.saved.opacity > 0)
      .map((frame) => ({ t: frame.t, motions: frame.motions, opacity: frame.saved!.opacity })),
    'the Saved message was already showing while the entry or the balance was still moving',
  ).toEqual([])

  const started = stillMoving[0]!.t
  const shown = frames.filter(
    (frame) => frame.saved !== null && frame.saved.opacity > 0 && frame.t - started <= SAVED_MESSAGE_LIMIT_MS,
  )
  expect(
    shown.length,
    `the Saved message was not showing within ${SAVED_MESSAGE_LIMIT_MS} ms of the save motion starting`,
  ).toBeGreaterThan(0)
}

// ===========================================================================
// Without reduced motion: every motion is observable while it runs and gone after.
// ===========================================================================

test('saving a send presses the button, grows Home from it over the form, brings the card in from the left and counts the balance', async ({
  browser,
}: {
  browser: Browser
}) => {
  const account = await freshSeededAccount(SEND_ACCOUNT)
  const phone = await openPhone(browser)
  const page = phone.page
  try {
    await signIn(page, account)
    const abbaasBox = page.locator('[data-box="abbaas"]')

    // ===== Opening Send still reveals the form as a circle from the tapped button. =====
    let recording = startRecording(page)
    await page.locator('[data-action="send"]').click()
    expect(
      framesWith(await recording, 'reveal').length,
      'the send form never carried data-motion="reveal" on opening',
    ).toBeGreaterThan(0)

    await page.getByLabel('Amount sent').fill(SENT_AMOUNT)
    await page.getByRole('button', { name: SEEDED_PERSON }).click()

    // ===== The save: Home grows from the white button over the mounted form. =====
    const { frames, centre } = await saveAndRecord(page, SEND_BUTTON_NAME)
    expectGrowFromButton(frames, centre, 'send')

    // ===== Only the new entry moves, arriving from the left with its blue ring. =====
    const entering = firstEntering(frames, SENT_TEXT)
    const shift = translationX(entering.transform)
    expect(shift, `the entering card's transform was unreadable: ${entering.transform}`).not.toBeNull()
    expect(
      shift!,
      'the new send card did not start translated toward its own side (the left)',
    ).toBeLessThan(0)

    // The older entry never moves: only the new card is marked and only it is shifted.
    const movedOthers = frames.flatMap((frame) =>
      frame.entries
        .filter((entry) => !entry.text.includes(SENT_TEXT))
        .filter((entry) => entry.motion !== null || translationX(entry.transform) !== 0)
        .map((entry) => ({ t: frame.t, text: entry.text, transform: entry.transform, motion: entry.motion })),
    )
    expect(movedOthers, 'an entry other than the new one was marked or displaced').toEqual([])

    const ringed = restingEntry(frames, SENT_TEXT)
    expect(ringed.ringWidth, 'the new send card had no 2 px ring').toBeCloseTo(RING_WIDTH_PX, 1)
    expect(ringed.ringColour, "the new send card's ring was not in its own colour").toBe(SEND_COLOUR)

    // ===== The holder's box counts from $400.00 to $500.00, keeping its cents span. =====
    const counting = frames.filter((frame) => frame.abbaas?.motion === 'count')
    expect(counting.length, 'the abbaas box never carried data-motion="count"').toBeGreaterThan(0)
    for (const frame of counting) {
      const box = frame.abbaas!
      expect(box.amount, 'a counting box did not already hold the final data-amount').toBe(
        String(AFTER_SEND_CENTS),
      )
      const shown = centsOf(box.text)
      expect(shown, `a counting box showed no amount: ${box.text}`).not.toBeNull()
      expect(shown!).toBeGreaterThanOrEqual(SEEDED_SEND_CENTS)
      expect(shown!).toBeLessThanOrEqual(AFTER_SEND_CENTS)
      // Value 1's structure survives every frame of the count.
      expect(box.cents, `a counting box lost its data-cents span: ${box.text}`).toMatch(/^\.\d{2}$/)
    }
    expect(
      counting.some((frame) => !frame.abbaas!.text.includes(AFTER_SEND_TEXT)),
      'the balance jumped straight to its final text instead of counting',
    ).toBe(true)

    // ===== The Saved message rises only once the entry and the count have landed. =====
    expectSavedMessageLast(frames)

    // ===== The end state. =====
    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-form]')).toHaveCount(0)
    await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_SEND_CENTS))
    await expect(abbaasBox).toContainText(AFTER_SEND_TEXT)
    await expect(abbaasBox.locator('[data-cents]')).toHaveText('.00')
    await expect(page.locator('[data-entry]')).toHaveCount(2)
    await expect(page.locator('[data-saved-message]')).toBeVisible()
  } finally {
    await phone.close()
  }
})

// ===========================================================================
// A payment larger than he holds: the card arrives from the right and the boxes swap.
// ===========================================================================

test('saving a payment larger than Abbaas holds brings the card in from the right and swaps the boxes', async ({
  browser,
}: {
  browser: Browser
}) => {
  const account = await freshSeededAccount(RECEIVE_ACCOUNT)
  const phone = await openPhone(browser)
  const page = phone.page
  try {
    await signIn(page, account)
    const abbaasBox = page.locator('[data-box="abbaas"]')
    const youBox = page.locator('[data-box="you"]')

    await page.locator('[data-action="receive"]').click()
    await page.getByLabel('Amount received').fill(RECEIVED_AMOUNT)

    const { frames, centre } = await saveAndRecord(page, RECEIVE_BUTTON_NAME)
    expectGrowFromButton(frames, centre, 'receive')

    // The payment card arrives from its own side: the right.
    const entering = firstEntering(frames, RECEIVED_TEXT)
    const shift = translationX(entering.transform)
    expect(shift, `the entering card's transform was unreadable: ${entering.transform}`).not.toBeNull()
    expect(
      shift!,
      'the new payment card did not start translated toward its own side (the right)',
    ).toBeGreaterThan(0)

    const ringed = restingEntry(frames, RECEIVED_TEXT)
    expect(ringed.ringWidth, 'the new payment card had no 2 px ring').toBeCloseTo(RING_WIDTH_PX, 1)
    expect(ringed.ringColour, "the new payment card's ring was not in its own colour").toBe(
      RECEIVE_COLOUR,
    )

    // Both boxes say so while his drains and the owner's fills, and both already hold
    // their end values on data-amount while the shown amounts are still moving.
    const swapping = frames.filter(
      (frame) => frame.abbaas?.motion === 'swap' && frame.you?.motion === 'swap',
    )
    expect(
      swapping.length,
      'the two boxes never carried data-motion="swap" together',
    ).toBeGreaterThan(0)
    for (const frame of swapping) {
      expect(frame.abbaas!.amount).toBe('0')
      expect(frame.you!.amount).toBe(String(AFTER_RECEIVE_CENTS))
      const drained = centsOf(frame.abbaas!.text)
      const filled = centsOf(frame.you!.text)
      expect(drained, `the draining box showed no amount: ${frame.abbaas!.text}`).not.toBeNull()
      expect(filled, `the filling box showed no amount: ${frame.you!.text}`).not.toBeNull()
      expect(drained!).toBeGreaterThanOrEqual(0)
      expect(drained!).toBeLessThanOrEqual(SEEDED_SEND_CENTS)
      expect(filled!).toBeGreaterThanOrEqual(0)
      expect(filled!).toBeLessThanOrEqual(AFTER_RECEIVE_CENTS)
    }
    expect(
      swapping.some((frame) => !frame.abbaas!.text.includes('$0')),
      'his box jumped straight to $0 instead of draining',
    ).toBe(true)

    expectSavedMessageLast(frames)

    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-form]')).toHaveCount(0)
    await expect(youBox).toHaveAttribute('data-state', 'filled')
    await expect(youBox).toHaveAttribute('data-amount', String(AFTER_RECEIVE_CENTS))
    await expect(youBox).toContainText(AFTER_RECEIVE_TEXT)
    await expect(abbaasBox).toHaveAttribute('data-state', 'empty')
    await expect(abbaasBox).toHaveAttribute('data-amount', '0')
    await expect(page.locator('[data-entry]')).toHaveCount(2)
    await expect(page.locator('[data-saved-message]')).toBeVisible()
  } finally {
    await phone.close()
  }
})

// ===========================================================================
// With prefers-reduced-motion: reduce, the saved Home shows its end state at once.
// ===========================================================================

test('with reduced motion saving shows Home in its end state at once, with the Saved message already there', async ({
  browser,
}: {
  browser: Browser
}) => {
  const account = await freshSeededAccount(REDUCED_ACCOUNT)
  const phone = await openPhone(browser, { reduce: true })
  const page = phone.page
  try {
    await signIn(page, account)
    const abbaasBox = page.locator('[data-box="abbaas"]')

    await page.locator('[data-action="send"]').click()
    await page.getByLabel('Amount sent').fill(SENT_AMOUNT)
    await page.getByRole('button', { name: SEEDED_PERSON }).click()

    const { frames } = await saveAndRecord(page, SEND_BUTTON_NAME)

    // Nothing animates: data-motion is never set and nothing is ever clipped.
    expect(
      frames.filter((frame) => frame.motions.length > 0).map((frame) => frame.motions).flat(),
      'data-motion was set with reduced motion while saving',
    ).toEqual([])
    expect(
      frames.filter((frame) => frame.circleClipped > 0).map((frame) => frame.t),
      'an element was clipped to a circle with reduced motion',
    ).toEqual([])

    // The first frame Home is shown is already the end state: the form has gone, the
    // balance is the one after the save, and the Saved message is visible at once.
    const homeFrames = frames.filter(
      (frame) => frame.formKinds.length === 0 && frame.entries.length === 2,
    )
    expect(homeFrames.length, 'Home never showed the two entries after the save').toBeGreaterThan(0)
    const firstHome = homeFrames[0]!
    expect(firstHome.abbaas!.amount).toBe(String(AFTER_SEND_CENTS))
    expect(firstHome.abbaas!.text).toContain(AFTER_SEND_TEXT)
    expect(firstHome.abbaas!.cents, 'the box lost its data-cents span').toBe('.00')
    expect(
      firstHome.saved,
      'the Saved message was missing from the first frame of Home with reduced motion',
    ).not.toBeNull()
    expect(
      firstHome.saved!.opacity,
      'the Saved message was still fading in with reduced motion',
    ).toBe(1)

    // The new card rests from the first frame: nothing is displaced or transparent.
    for (const frame of homeFrames) {
      for (const entry of frame.entries) {
        expect(
          translationX(entry.transform),
          `an entry was displaced with reduced motion: ${entry.transform}`,
        ).toBe(0)
        expect(entry.opacity, 'an entry was transparent with reduced motion').toBe(1)
      }
    }

    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_SEND_CENTS))
    await expect(abbaasBox).toContainText(AFTER_SEND_TEXT)
    await expect(page.locator('[data-saved-message]')).toBeVisible()
  } finally {
    await phone.close()
  }
})
