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

// Travelling cards value 6: the new card crosses the line.
// Home still grows as a circle from the form's white save button over the dimmed form.
// Then the new card APPEARS ON THE SENDER'S HALF -- a send on the owner's left, a
// payment on Abbaas's right -- lifted and already wearing its uncut ring, holds there,
// and crosses the centre line to rest on the RECEIVER'S half while the boxes count.
//
// Judged through the declared public port only: the built bundle's DOM OVER TIME,
// with and without prefers-reduced-motion. The observable contract is the one the
// design fixed: while a motion runs its element carries data-motion with the value
// grow (the Home mounted above the form), cross (the new card, from before its first
// displaced frame until it rests), count or swap (the boxes), and the attribute is
// removed when that motion ends. Home is located as the element carrying
// data-motion="grow"; no new attribute is needed and none is used.
//
// The crossing itself is judged geometrically, not by any invented marker, against the
// one line the design names: the centre line is the viewport's middle at every width
// (the page is one centred column). 'Wholly on a half' is read from the card's own
// bounding box, which already carries the scale and the translation of the motion. The
// card is required to cross ONCE, so between the sampled frame on the sender's half and
// its rest its x only moves the one way: a send's only rightward, a payment's only
// leftward.
//
// A single transient state cannot be caught by a round-trip assertion, so the frames
// are recorded inside the page with requestAnimationFrame and judged afterwards. The
// recorder reads nothing but the public attributes, text, and the computed clip-path,
// transform, opacity and ring of the elements the contract names.
//
// The ring: the design leaves the drawing property open ('an inset 2 px box-shadow in
// its colour, or a border inside the card's box') and fixes only that it is 2 px, in
// the entry's colour, and that value 7's horizontal clip of the entries area never
// cuts it. So the ring is read as either a border or an inset box-shadow, and 'uncut'
// is judged geometrically at rest: the ringed card's whole box lies inside the
// viewport and inside the box of the ancestor that clips it horizontally. An OUTSIDE
// ring (a plain outline or an outward box-shadow) is not accepted, because that is the
// very drawing the design ruled out as the one that gets cut.
//
// Not judged here: the save button's 16 % pressed overlay and the dim layer over the
// form carry no public marker in the design, so this oracle asserts only that the
// form is still mounted under the growing Home, which is what makes the dim layer and
// the press visible at all. The Saved message is gone from Home at this board (its own
// value asserts its absence at tests/acceptance/undo.spec.ts), so nothing here waits
// for it or asserts it.

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
// over well inside 900 ms of the tap. The longest motion after it is the 900 ms swap.
// The window covers the whole save motion plus the save's round trip to the local
// stack, so the recording always reaches the resting state.
const WINDOW_MS = 3_500
const GROW_LIMIT_MS = 900

// The design fixes the whole save, from the tap to rest, at under 2.6 s: the grow, the
// day group opening, the +120 ms appear over 240 ms, the 500 ms hold, the 760 ms cross
// and the 800 ms count all finish inside it. Measured from the tap, which is the frame
// the recording starts on, to the last frame on which anything still carries
// data-motion. The 3,500 ms window is longer so that an overrun is SEEN and reported
// rather than cutting the recording short.
const SETTLE_LIMIT_MS = 2_600

// Sub-pixel tolerance for 'wholly on one half of the line' and for 'moves only one
// way': layout and compositing round, and a card resting exactly on the line is not a
// card on the wrong side.
const EDGE_TOLERANCE_PX = 0.5

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
 * starts from Abbaas holding $400.00 whether it runs alone or after another.
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
  /** The card's ring, drawn inside its box: a border or an inset box-shadow. */
  readonly ringWidth: number
  readonly ringColour: string
  /** Which property drew it, for a legible failure. */
  readonly ringSource: 'border' | 'inset-shadow' | 'none'
  /** The card's box in viewport pixels, as drawn: the motion's transform is in it. */
  readonly left: number
  readonly right: number
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
  /** The centre line: the viewport's middle at this frame's width. */
  readonly middle: number
  readonly you: Sample | null
  readonly abbaas: Sample | null
  readonly entries: readonly EntrySample[]
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
        // The ring the design draws INSIDE the card: a border, or an inset box-shadow
        // whose widest length (its spread) is the ring. An outward shadow and a plain
        // outline are ignored, so a ring drawn where the clip would cut it reads as
        // absent rather than as a pass.
        const insetRing = (boxShadow: string): { width: number; colour: string } | null => {
          if (!boxShadow || boxShadow === 'none') return null
          for (const part of boxShadow.split(/,(?![^(]*\))/)) {
            if (!part.includes('inset')) continue
            const colour = /(rgba?\([^)]*\))/.exec(part)
            const lengths = Array.from(part.matchAll(/(-?[\d.]+)px/g), (found) =>
              Math.abs(Number(found[1])),
            )
            // offsetX, offsetY, blur, spread: the ring's thickness is the widest.
            const width = lengths.length > 0 ? Math.max(...lengths) : 0
            if (width > 0 && colour) return { width, colour: colour[1]! }
          }
          return null
        }

        const tick = (): void => {
          const t = performance.now() - started
          const grow = document.querySelector('[data-motion="grow"]')
          const growRect = grow ? grow.getBoundingClientRect() : null
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
            middle: document.documentElement.clientWidth / 2,
            you: sample('[data-box="you"]'),
            abbaas: sample('[data-box="abbaas"]'),
            entries: Array.from(document.querySelectorAll('[data-entry]'), (element) => {
              const style = getComputedStyle(element)
              // The design leaves the property open: a border inside the card's box,
              // or an inset box-shadow. Either is accepted; nothing outside the box is.
              const borderWidth = Number.parseFloat(style.borderTopWidth) || 0
              const shadow = borderWidth > 0 ? null : insetRing(style.boxShadow)
              const box = element.getBoundingClientRect()
              return {
                left: box.left,
                right: box.right,
                motion: element.getAttribute('data-motion'),
                text: clean(element.textContent),
                transform: style.transform,
                opacity: Number(style.opacity),
                ringWidth: borderWidth > 0 ? borderWidth : (shadow?.width ?? 0),
                ringColour: borderWidth > 0 ? style.borderTopColor : (shadow?.colour ?? ''),
                ringSource: borderWidth > 0 ? 'border' : shadow ? 'inset-shadow' : 'none',
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

type Tracked = { readonly t: number; readonly middle: number; readonly card: EntrySample }

/** Every frame on which the card whose text holds `amount` is in the document. */
const track = (frames: readonly Frame[], amount: string): readonly Tracked[] =>
  frames.flatMap((frame) => {
    const card = frame.entries.find((candidate) => candidate.text.includes(amount))
    return card ? [{ t: frame.t, middle: frame.middle, card }] : []
  })

/**
 * The crossing, judged on the one line the design names and on nothing else.
 *
 * `toward` is the receiver's half: 'right' for a send (Abbaas received), 'left' for a
 * payment (the owner received). The card must be SEEN wholly on the opposite half --
 * the sender's -- while it is visible and while it still says it is moving, must come
 * to rest wholly on the receiver's half, and must get there by moving the one way.
 */
const expectCrossing = (
  frames: readonly Frame[],
  amount: string,
  toward: 'left' | 'right',
  what: string,
): void => {
  const seen = track(frames, amount)
  expect(seen.length, `no frame showed the ${what} card (${amount})`).toBeGreaterThan(0)

  // It says it is moving: the design's marker for a new or entering card.
  expect(
    seen.some((frame) => frame.card.motion === 'cross'),
    `the new ${what} card never carried data-motion="cross"`,
  ).toBe(true)

  // Seen on the SENDER'S half, visible, while it is still marked as crossing.
  const onSender = (frame: Tracked): boolean =>
    toward === 'right'
      ? frame.card.right <= frame.middle + EDGE_TOLERANCE_PX
      : frame.card.left >= frame.middle - EDGE_TOLERANCE_PX
  const departure = seen.find(
    (frame) => frame.card.motion === 'cross' && frame.card.opacity > 0.5 && onSender(frame),
  )
  expect(
    departure,
    `the new ${what} card was never seen wholly on the sender's ${
      toward === 'right' ? 'left' : 'right'
    } half while visible and crossing; its boxes were ` +
      JSON.stringify(
        seen
          .filter((frame) => frame.card.motion === 'cross')
          .slice(0, 12)
          .map((frame) => ({
            t: Math.round(frame.t),
            left: Math.round(frame.card.left),
            right: Math.round(frame.card.right),
            opacity: frame.card.opacity,
            middle: frame.middle,
          })),
      ),
  ).toBeDefined()

  // At rest, wholly on the RECEIVER'S half, and no longer marked.
  const resting = seen[seen.length - 1]!
  expect(resting.card.motion, `the ${what} card still carried data-motion at rest`).toBeNull()
  if (toward === 'right') {
    expect(
      resting.card.left,
      `the ${what} card rested with its left edge at ${resting.card.left}, left of the centre line (${resting.middle}), not wholly on the receiver's right half`,
    ).toBeGreaterThanOrEqual(resting.middle - EDGE_TOLERANCE_PX)
  } else {
    expect(
      resting.card.right,
      `the ${what} card rested with its right edge at ${resting.card.right}, right of the centre line (${resting.middle}), not wholly on the receiver's left half`,
    ).toBeLessThanOrEqual(resting.middle + EDGE_TOLERANCE_PX)
  }

  // It crosses ONCE: from the departure to rest its x only moves the one way.
  const path = seen.slice(seen.indexOf(departure!)).map((frame) => frame.card.left)
  const backwards = path.flatMap((left, index) => {
    if (index === 0) return []
    const previous = path[index - 1]!
    const wrongWay =
      toward === 'right' ? left < previous - EDGE_TOLERANCE_PX : left > previous + EDGE_TOLERANCE_PX
    return wrongWay ? [{ from: previous, to: left }] : []
  })
  expect(
    backwards,
    `the ${what} card moved back toward the sender's side instead of crossing once`,
  ).toEqual([])
}

/** Nothing is still moving: the last frame on which anything carried data-motion. */
const expectRestedWithin = (frames: readonly Frame[], limitMs: number): void => {
  const moving = frames.filter((frame) => frame.motions.length > 0)
  const last = moving[moving.length - 1]
  expect(
    last ? last.t : 0,
    `something still carried data-motion ${last ? Math.round(last.t) : 0} ms after the tap (${
      last ? last.motions.join(', ') : ''
    })`,
  ).toBeLessThanOrEqual(limitMs)
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
 * The ring is never cut off. Measured at rest, through the public port: the ringed
 * card's whole box lies inside the viewport and inside the box of the ancestor that
 * clips it horizontally (value 7's entries area, found by its computed overflow-x and
 * not by any invented attribute). A ring drawn inside that box therefore cannot be
 * clipped at the screen edge.
 */
const expectRingNotCutOff = async (page: Page, amount: string): Promise<void> => {
  const measured = await page.evaluate((text: string) => {
    const card = Array.from(document.querySelectorAll('[data-entry]')).find((element) =>
      (element.textContent ?? '').includes(text),
    )
    if (!card) return null
    const clipper = ((): Element | null => {
      let walk = card.parentElement
      while (walk) {
        const overflowX = getComputedStyle(walk).overflowX
        if (overflowX === 'clip' || overflowX === 'hidden' || overflowX === 'auto') return walk
        walk = walk.parentElement
      }
      return null
    })()
    const box = card.getBoundingClientRect()
    const clip = clipper ? clipper.getBoundingClientRect() : null
    return {
      card: { left: box.left, right: box.right },
      clip: clip ? { left: clip.left, right: clip.right } : null,
      viewportWidth: document.documentElement.clientWidth,
    }
  }, amount)

  expect(measured, `no resting card contained ${amount}`).not.toBeNull()
  const found = measured!

  // Inside the viewport: the ring at either end of the card is on screen.
  expect(
    found.card.left,
    `the ${amount} card's left edge (${found.card.left}) is off the left of the screen, so its ring is cut`,
  ).toBeGreaterThanOrEqual(0)
  expect(
    found.card.right,
    `the ${amount} card's right edge (${found.card.right}) is past the screen's width (${found.viewportWidth}), so its ring is cut`,
  ).toBeLessThanOrEqual(found.viewportWidth)

  // Inside whatever clips the entries area horizontally, when anything does.
  if (found.clip) {
    expect(
      found.card.left,
      `the ${amount} card's left edge (${found.card.left}) is outside its clipping area (${found.clip.left}), so its ring is cut`,
    ).toBeGreaterThanOrEqual(found.clip.left - 0.5)
    expect(
      found.card.right,
      `the ${amount} card's right edge (${found.card.right}) is outside its clipping area (${found.clip.right}), so its ring is cut`,
    ).toBeLessThanOrEqual(found.clip.right + 0.5)
  }
}

/** The ring is drawn inside the card, so the clip cannot reach it. */
const expectRingInsideCard = (entry: EntrySample, colour: string, what: string): void => {
  expect(
    entry.ringSource,
    `the new ${what} card had no ring drawn inside it (a border or an inset box-shadow); an outline or an outward shadow is the drawing the design ruled out`,
  ).not.toBe('none')
  expect(entry.ringWidth, `the new ${what} card had no 2 px ring`).toBeCloseTo(RING_WIDTH_PX, 1)
  expect(entry.ringColour, `the new ${what} card's ring was not in its own colour`).toBe(colour)
}

/** No board after this one shows a Saved message or an Undo on Home. */
const expectNoSavedMessage = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-saved-message]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
}

// ===========================================================================
// Without reduced motion: every motion is observable while it runs and gone after.
// ===========================================================================

test('saving a send grows Home from the button over the form, shows the card on the owner’s left and carries it across the line to Abbaas’s right with an uncut ring while the balance counts', async ({
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

    // ===== The new card appears on the SENDER'S half (the owner's left), holds, and
    // ===== crosses the centre line to rest on the RECEIVER'S half (Abbaas's right).
    expectCrossing(frames, SENT_TEXT, 'right', 'send')

    // The older entry never moves: only the new card is marked and only it is shifted.
    const movedOthers = frames.flatMap((frame) =>
      frame.entries
        .filter((entry) => !entry.text.includes(SENT_TEXT))
        .filter((entry) => entry.motion !== null || translationX(entry.transform) !== 0)
        .map((entry) => ({ t: frame.t, text: entry.text, transform: entry.transform, motion: entry.motion })),
    )
    expect(movedOthers, 'an entry other than the new one was marked or displaced').toEqual([])

    expectRingInsideCard(restingEntry(frames, SENT_TEXT), SEND_COLOUR, 'send')

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

    // ===== The whole save, tap to rest, is over within 2.6 s. =====
    expectRestedWithin(frames, SETTLE_LIMIT_MS)

    // ===== The end state, with the ring on screen and uncut. =====
    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-form]')).toHaveCount(0)
    await expect(abbaasBox).toHaveAttribute('data-amount', String(AFTER_SEND_CENTS))
    await expect(abbaasBox).toContainText(AFTER_SEND_TEXT)
    await expect(abbaasBox.locator('[data-cents]')).toHaveText('.00')
    await expect(page.locator('[data-entry]')).toHaveCount(2)
    await expectRingNotCutOff(page, SENT_TEXT)
    await expectNoSavedMessage(page)
  } finally {
    await phone.close()
  }
})

// ===========================================================================
// A payment larger than he holds: the card crosses from his right to the owner's left
// and the boxes swap, his draining as the owner's fills.
// ===========================================================================

test('saving a payment larger than Abbaas holds shows the card on his right, carries it across the line to the owner’s left and swaps the boxes', async ({
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

    // The payment card appears on the SENDER'S half (Abbaas's right) and crosses to
    // rest on the RECEIVER'S half (the owner's left).
    expectCrossing(frames, RECEIVED_TEXT, 'left', 'payment')
    expectRestedWithin(frames, SETTLE_LIMIT_MS)

    expectRingInsideCard(restingEntry(frames, RECEIVED_TEXT), RECEIVE_COLOUR, 'payment')

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

    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-form]')).toHaveCount(0)
    await expect(youBox).toHaveAttribute('data-state', 'filled')
    await expect(youBox).toHaveAttribute('data-amount', String(AFTER_RECEIVE_CENTS))
    await expect(youBox).toContainText(AFTER_RECEIVE_TEXT)
    await expect(abbaasBox).toHaveAttribute('data-state', 'empty')
    await expect(abbaasBox).toHaveAttribute('data-amount', '0')
    await expect(page.locator('[data-entry]')).toHaveCount(2)
    await expectRingNotCutOff(page, RECEIVED_TEXT)
    await expectNoSavedMessage(page)
  } finally {
    await phone.close()
  }
})

// ===========================================================================
// With prefers-reduced-motion: reduce, the saved Home shows its end state at once.
// ===========================================================================

test('with reduced motion saving shows Home in its end state at once, with no motion and the ring already resting', async ({
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

    // The first frame Home is shown is already the end state: the form has gone and
    // the balance is already the one after the save, with no count in between.
    const homeFrames = frames.filter(
      (frame) => frame.formKinds.length === 0 && frame.entries.length === 2,
    )
    expect(homeFrames.length, 'Home never showed the two entries after the save').toBeGreaterThan(0)
    const firstHome = homeFrames[0]!
    expect(firstHome.abbaas!.amount).toBe(String(AFTER_SEND_CENTS))
    expect(firstHome.abbaas!.text).toContain(AFTER_SEND_TEXT)
    expect(firstHome.abbaas!.cents, 'the box lost its data-cents span').toBe('.00')

    // The new card is at rest on the receiver's half from the very first frame: it
    // never shows on the sender's side and never crosses.
    const newCard = firstHome.entries.find((entry) => entry.text.includes(SENT_TEXT))
    expect(newCard, `the first Home frame showed no ${SENT_TEXT} card`).toBeDefined()
    expect(
      newCard!.left,
      `with reduced motion the new send card's left edge (${newCard!.left}) was left of the centre line (${firstHome.middle}) instead of resting wholly on the receiver's right half`,
    ).toBeGreaterThanOrEqual(firstHome.middle - EDGE_TOLERANCE_PX)

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
    // The ring is a resting state, not a motion: it is there under reduce too, uncut.
    await expectRingNotCutOff(page, SENT_TEXT)
    await expectNoSavedMessage(page)
  } finally {
    await phone.close()
  }
})
