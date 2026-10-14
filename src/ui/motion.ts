// Motion as a handful of helpers over the DOM: whether this device asked for
// less of it, the circle a form grows from the tapped button, the circle HOME
// grows from that form's save button, the journey of a saved card across the
// centre line, and the count of a box's amount to its new value. Nothing here knows
// what a balance or an entry means; the callers hand over the element and the
// two ends of the journey.
//
// Refined board value 7 adds the two entrances the app opens with: Home's own,
// played once when the app opens, and the rows of a form that has just been
// tapped open, with the white ripple that marks the tap. Both are built from the
// same one idea as everything above - a part is put in its start state, declares
// itself mid-motion, travels on the one curve and is left with no inline style
// at all - so nothing here grew a second way of moving.
//
// The observable contract this value fixes:
//   - while a motion runs its element carries data-motion with one of
//     'reveal' (a form root), 'grow' (Home, mounted above the form it was saved
//     from), 'cross' (a new or entering card, and the dot and after line that
//     arrive with it), 'count' (a box whose amount is counting),
//     'swap' (both boxes while the holder changes), 'home-enter' (Home's root
//     while the opening entrance runs), 'row' (a form row rising in) or
//     'sheet-rise'/'sheet-fall' (the entry sheet and its scrim, which travel
//     together as one motion)
//   - the attribute is removed the moment that motion ends
//   - with prefers-reduced-motion: reduce nothing here runs at all, so
//     data-motion is never set, nothing is ever clipped, and the screen the
//     caller painted - which is already the end state - is simply shown
//
// Only transform, opacity, box-shadow, clip-path and the max-height of the one
// day group that opens are touched. The longest single motion is the 900 ms a
// pair of swapping boxes may count over; the longest thing here of any kind is
// a save, whose last part rests well inside the 2.6 s the design caps it at,
// and Home's opening entrance - whose longest part is the last card's crossing -
// rests inside its own 2.2 s.
//
// This module depends on the DOM and on nothing else: even the words a counting
// amount reads are not its business, so the caller hands in the painter it
// already uses for that figure and the count cannot drift from it.

/** The reveal, and Home growing from the save button: the entrance band's top. */
export const REVEAL_MS = 520
export const GROW_MS = 520
/**
 * The count Home's opening entrance runs. A save's own count, which travels
 * with the crossing card and is the same length whether one box counts or the
 * two of them swap, is SAVE_COUNT_MS below.
 */
export const COUNT_MS = 700
/** The length a swapping pair used to count over, kept as the band's own top. */
export const SWAP_MS = 900
/** The pressed state the save button wears once the save has gone through. */
export const PRESS_MS = 120
/* Refined board value 5 removed the Saved message, so nothing is raised after
   the rest of a save has landed and no such pause is declared here. */

/**
 * Home's opening entrance, in the refined board's own numbers: the boxes rise
 * one after the other, the centre line draws down from its top, the holder's
 * amount counts up from nothing, each card CROSSES the line from its sender's
 * half to the half it rests in, the totals and the Entries heading fade in and
 * the bottom buttons rise.
 *
 * Every delay is measured from the moment Home is mounted, and the longest of
 * them plus its own journey is what the whole entrance takes.
 */
const BOX_SHIFT_PX = 12
const BOX_SCALE = 0.97
/** The Abbaas box follows the You box, so the pair reads left to right. */
const BOX_STEP_MS = 70
const BOX_RISE_MS = 460
const SPINE_DELAY_MS = 200
const SPINE_DRAW_MS = 640
/** When the holder's amount starts counting; how long it takes is COUNT_MS. */
const COUNT_DELAY_MS = 250
const CARD_DELAY_MS = 260
/** Each card begins 90 ms after the card above it, as the board's board shows. */
const CARD_STEP_MS = 90
/** The crossing every card of the opening makes, on the one curve. */
export const CARD_CROSS_MS = 680
/**
 * How many cards are staggered before the rest travel together: a long ledger
 * must still land inside the 2.2 s the design allows the whole entrance, and
 * anything past the first few cards is below the fold anyway.
 */
const CARD_STAGGER_CAP = 8
const FADE_DELAY_MS = 200
const FADE_MS = 320
const ACTION_DELAY_MS = 180
const ACTION_SHIFT_PX = 24
const ACTION_RISE_MS = 420

/** A form's rows rising in after the circle has started filling the screen. */
const ROW_DELAY_MS = 240
const ROW_STEP_MS = 45
const ROW_SHIFT_PX = 16
const ROW_RISE_MS = 280

/** The ripple that marks the tap a form was opened by. */
const RIPPLE_SIZE_PX = 120
const RIPPLE_MS = 360

/** The circle the form opens from, and how far past the form it grows. */
const START_RADIUS_PX = 30
/** clip-path's circle(150% ...), resolved to pixels so no frame reads calc(). */
const REVEAL_RADIUS_SCALE = 1.5
/** A little past the transition's end, so the attribute is never left behind. */
const ENTER_SLACK_MS = 40

// --- Travelling cards: the new card crossing the centre line. ---
//
// The whole of it, in the order it is read: Home grows from the save button, the
// new card's day group opens its space, the card fades in on the SENDER'S half
// displaced by its own width plus the dot column between the halves, holds there
// lifted and ringed, crosses to the receiver's half, and the dot and the after
// line arrive once it has landed.

/** The card waits for the grow to fill the screen before anything of it shows. */
const CROSS_WAIT_MS = GROW_MS
/** How long after the grow the card begins to fade in, and over how long. */
export const CROSS_APPEAR_DELAY_MS = 120
export const CROSS_APPEAR_MS = 240
/** How long it holds on the sender's half before it travels. */
export const CROSS_HOLD_MS = 500
/** The crossing itself. */
export const CROSS_MS = 760
/** The dot and the after line fade in after the card has landed. */
export const CROSS_TRAIL_MS = 200
/** How far out of its resting half the card starts: the dot column's own width. */
const CROSS_GAP_PX = 36
/** How small it is as it fades in, before it holds at its own size. */
const CROSS_SCALE = 0.92

/** When the card is in place on the sender's half, measured from Home's mount. */
const CROSS_APPEAR_AT_MS = CROSS_WAIT_MS + CROSS_APPEAR_DELAY_MS
/**
 * When the crossing begins, measured from Home's mount: what the boxes start
 * counting with, so the money and the card move together.
 */
export const CROSS_START_MS = CROSS_APPEAR_AT_MS + CROSS_APPEAR_MS + CROSS_HOLD_MS
/** When the card lands on the receiver's half, and stops saying that it moves. */
const CROSS_LANDS_AT_MS = CROSS_START_MS + CROSS_MS
const CROSS_CARD_RESTS_MS = CROSS_LANDS_AT_MS + ENTER_SLACK_MS
/** When the last of the crossing - the dot and the after line - has arrived. */
export const CROSS_TOTAL_MS = CROSS_LANDS_AT_MS + CROSS_TRAIL_MS + ENTER_SLACK_MS

/** The boxes count to the new balance over this, starting with the crossing. */
export const SAVE_COUNT_MS = 800

/**
 * How long the whole of a save's motion on Home takes, from the moment Home is
 * mounted to the moment the last of it rests: the new card is the last to land,
 * because it waits for the grow to fill the screen and for its day to open
 * before it crosses. Nothing follows it - value 5 removed the Saved message that
 * used to rise after it - so this is where a save comes to rest, and the whole
 * of it is well inside the 2.6 s the design caps a save at.
 */
export const SAVE_MOTION_MS = CROSS_TOTAL_MS

/** A point in viewport pixels: where a tap landed. */
export type Point = {
  readonly x: number
  readonly y: number
}

/** The centre of a control, in viewport pixels: what a circle grows from. */
export const centreOf = (element: HTMLElement): Point => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/**
 * Whether this device has asked for reduced motion. Read at the moment a motion
 * would start rather than once at load, so the answer is always the current one.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** One axis of the design's curve, as a cubic Bézier with its ends at 0 and 1. */
const axis = (first: number, second: number, t: number): number => {
  const rest = 1 - t
  return 3 * rest * rest * t * first + 3 * rest * t * t * second + t * t * t
}

/**
 * The design's one curve, cubic-bezier(0.2, 0.8, 0.2, 1), as a function of
 * progress. The x axis is inverted by bisection, which is what a browser does
 * for the same declaration; it is monotonic and never leaves [0, 1], so a count
 * driven by it never shows a value outside the two ends.
 */
const ease = (progress: number): number => {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  let low = 0
  let high = 1
  let t = progress
  for (let turn = 0; turn < 20; turn += 1) {
    if (axis(0.2, 0.2, t) < progress) low = t
    else high = t
    t = (low + high) / 2
  }
  return axis(0.8, 1, t)
}

/**
 * Runs one motion frame by frame: the element carries data-motion from the
 * first frame, paint draws each eased step, and the last frame settles the end
 * state and drops the attribute together, so no frame can ever show the final
 * value while still claiming to be moving.
 *
 * Progress is read from the clock and not counted in frames, so a tab that was
 * hidden while this ran lands on exactly the same end state on its next visible
 * frame.
 */
const step = (
  element: HTMLElement,
  name: string,
  durationMs: number,
  paint: (eased: number) => void,
  settle: () => void,
): void => {
  let startedAt: number | null = null
  const frame = (now: number): void => {
    if (startedAt === null) {
      startedAt = now
      element.dataset.motion = name
    }
    if (now - startedAt >= durationMs) {
      settle()
      delete element.dataset.motion
      return
    }
    paint(ease((now - startedAt) / durationMs))
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/**
 * Grows a form root as a circle from the point that was tapped: a 30 px circle
 * at that point out to 150 % of the form, over 520 ms, after which the form
 * carries no clip-path at all.
 *
 * The circle is placed in the form's own reference box, so the tapped point,
 * which arrives in viewport pixels, is offset by that box's origin. The radius
 * is stepped in pixels rather than transitioned from 30px to 150%, because a
 * browser interpolates those two units into a calc() that says nothing about
 * where the circle is.
 *
 * The form is held at opacity 0 for the single frame before the first circle is
 * in place, so opening never flashes the whole screen first.
 */
export const revealFrom = (form: HTMLElement, origin: Point): void => {
  if (prefersReducedMotion()) return
  form.style.opacity = '0'

  type Circle = { readonly x: number; readonly y: number; readonly endRadius: number }

  /**
   * Measured on the first frame, when the form is laid out, and kept for the
   * rest of the motion, so every frame reports the same centre: the one point
   * the tap landed on.
   */
  const measure = (): Circle => {
    const box = form.getBoundingClientRect()
    // What a percentage radius resolves against: the reference box's diagonal
    // over the square root of two.
    const reach = Math.sqrt(box.width * box.width + box.height * box.height) / Math.SQRT2
    return {
      x: origin.x - box.left,
      y: origin.y - box.top,
      endRadius: REVEAL_RADIUS_SCALE * reach,
    }
  }

  let measured: Circle | null = null
  step(
    form,
    'reveal',
    REVEAL_MS,
    (eased) => {
      const circle = measured ?? measure()
      measured = circle
      // The form was held back only until there was a circle to show it through.
      form.style.opacity = '1'
      const radius = START_RADIUS_PX + (circle.endRadius - START_RADIUS_PX) * eased
      form.style.clipPath = `circle(${radius.toFixed(2)}px at ${circle.x.toFixed(2)}px ${circle.y.toFixed(2)}px)`
    },
    () => {
      form.style.opacity = ''
      // Not an empty string: the form must be read as clipping nothing.
      form.style.clipPath = 'none'
    },
  )
}

/**
 * Grows HOME as a circle from the save button of the form it was saved from:
 * Home is already mounted above that form, which stays under its dim layer
 * until the circle has covered the screen.
 *
 * The radius steps from 0 to past the screen's far corner - the furthest of the
 * four corners from the button, so the last thing the circle reaches is the one
 * that is furthest away - and at the end the clip is removed, data-motion is
 * dropped, and `settle` is what takes the form and its dim layer out of the DOM.
 *
 * With reduced motion nothing grows and nothing is ever clipped: `settle` runs
 * at once, which leaves Home alone on the screen in the end state the caller
 * painted it in.
 */
export const growFrom = (home: HTMLElement, origin: Point, settle: () => void): void => {
  if (prefersReducedMotion()) {
    settle()
    return
  }
  // Held back for the single frame before the first circle is in place, and
  // before Home is lifted over the form: the save never flashes a second screen
  // laid out under the first.
  home.style.opacity = '0'

  type Circle = { readonly x: number; readonly y: number; readonly endRadius: number }

  /**
   * Measured on the first frame, when Home is laid out over the form, and kept
   * for the rest of the motion, so every frame reports the same centre: the one
   * point the tap landed on.
   */
  const measure = (): Circle => {
    const box = home.getBoundingClientRect()
    const x = origin.x - box.left
    const y = origin.y - box.top
    const reach = Math.max(
      Math.hypot(x, y),
      Math.hypot(box.width - x, y),
      Math.hypot(x, box.height - y),
      Math.hypot(box.width - x, box.height - y),
    )
    // A pixel past the far corner, so no edge is left unpainted at the end.
    return { x, y, endRadius: reach + 1 }
  }

  let measured: Circle | null = null
  step(
    home,
    'grow',
    GROW_MS,
    (eased) => {
      const circle = measured ?? measure()
      measured = circle
      // Home was held back only until there was a circle to show it through.
      home.style.opacity = '1'
      const radius = circle.endRadius * eased
      home.style.clipPath = `circle(${radius.toFixed(2)}px at ${circle.x.toFixed(2)}px ${circle.y.toFixed(2)}px)`
    },
    () => {
      // Home clips nothing once it has filled the screen, and the form it grew
      // over has nothing left to be seen through.
      home.style.opacity = ''
      home.style.clipPath = ''
      settle()
    },
  )
}

/**
 * What a form does the moment its save has gone through: the white save button
 * wears a pressed state for 120 ms, and a dim layer fades in over the whole
 * form, so the Home growing above it is read as arriving over something that is
 * still there rather than as a screen that was swapped.
 *
 * Neither is carried by a contract attribute: they are the look of a form that
 * is being left, and the form itself leaves the DOM when the grow ends.
 */
export const pressAndDim = (form: HTMLElement, button: HTMLElement): void => {
  if (prefersReducedMotion()) return
  button.dataset.pressed = ''
  window.setTimeout(() => {
    delete button.dataset.pressed
  }, PRESS_MS)

  const dim = document.createElement('div')
  dim.className = 'form-dim'
  dim.setAttribute('aria-hidden', 'true')
  form.append(dim)
  // Read back, so the layer fades in from nothing instead of starting opaque.
  void dim.offsetHeight
  dim.dataset.dim = 'on'
}

/**
 * Opens the space a new day group takes, so the older days move down rather
 * than jump: the group is held at no height and grows to its own over the same
 * 520 ms the circle takes, starting once the circle has filled the screen - the
 * day opens after Home has grown, and the card crosses after that.
 *
 * The height is read when the opening begins, because a group that is not yet
 * laid out has no height to read. Nothing but max-height moves, and the group is
 * left with no inline height at all afterwards, so the list goes back to being
 * laid out by its own content.
 */
export const openDayGroup = (group: HTMLElement): void => {
  if (prefersReducedMotion()) return
  window.setTimeout(() => {
    const full = group.scrollHeight
    group.dataset.opening = ''
    group.style.maxHeight = '0px'
    // Read back, so the open below travels from no height rather than replacing it.
    void group.offsetHeight
    group.style.maxHeight = `${full}px`
    window.setTimeout(() => {
      delete group.dataset.opening
      group.style.maxHeight = ''
    }, GROW_MS + ENTER_SLACK_MS)
  }, CROSS_WAIT_MS)
}

/**
 * The new card crossing the centre line, with the parts of its row that arrive
 * once it has landed.
 *
 * `restsOn` is the half it comes to rest in, which is the side of whoever
 * RECEIVED the money; it starts on the other half, the sender's, which is where
 * the displacement below takes it.
 */
export type Crossing = {
  readonly card: HTMLElement
  /** The dot on the line and the after line, which fade in once it lands. */
  readonly trailing: readonly HTMLElement[]
  readonly restsOn: 'left' | 'right'
}

/**
 * Carries a saved card across the line: it fades in displaced wholly onto the
 * SENDER'S half - by its own width plus the dot column, which is exactly what
 * puts its box on the other side of the centre of a row whose two halves are
 * equal - holds there, and travels to where it belongs on the receiver's half.
 *
 * The motion is one whole from the moment the card is first held back, not only
 * from the moment it begins to travel: data-motion='cross' is set before the
 * displaced, invisible start state is, and dropped only once the card rests. So
 * the card never sits displaced or transparent without saying that it is
 * mid-motion, and a reader that waits for no data-motion to remain and then
 * measures can only ever read the card at rest, on the receiver's half.
 *
 * The dot and the after line are never displaced - they only fade in behind the
 * card, once it has landed where they answer it from - so they carry no
 * data-motion of their own: the layout a reader measures is the same at every
 * frame of their arrival, which is the whole of what the marker promises.
 *
 * It grows from 0.92 about the edge it travels AWAY from, so the whole of the
 * journey from the sender's half to the receiver's moves the one way: the edge
 * that leads the crossing is the only one the scale moves, and it moves it
 * toward the destination.
 *
 * The two ends are set here; the durations and the curve between them belong to
 * the transitions in theme.css, which hang on the travelling phases alone, so
 * the held state is simply applied instead of being animated into.
 */
export const crossEntry = (crossing: Crossing): void => {
  if (prefersReducedMotion()) return
  const card = crossing.card
  // Declared before anything is displaced: the hold is part of the motion.
  card.dataset.motion = 'cross'
  for (const part of [card, ...crossing.trailing]) {
    part.dataset.cross = 'held'
    part.style.opacity = '0'
  }

  requestAnimationFrame(() => {
    // Measured when the card is laid out, and kept for the whole motion: its own
    // width plus the column the dot sits in is what carries its whole box over
    // the line. A send rests right, so it comes from the left, and the other way
    // about for a payment from Abbaas.
    const reach = card.offsetWidth + CROSS_GAP_PX
    const shift = crossing.restsOn === 'right' ? -reach : reach
    const displaced = `translateX(${shift.toFixed(2)}px)`
    // The edge the card travels away from, so growing to its own size moves only
    // the edge that leads the crossing.
    card.style.transformOrigin = crossing.restsOn === 'right' ? 'left center' : 'right center'
    card.style.transform = `${displaced} scale(${CROSS_SCALE})`
    // Read back, so the fade below travels from this state rather than into it.
    void card.offsetHeight

    window.setTimeout(() => {
      card.dataset.cross = 'appear'
      void card.offsetHeight
      card.style.transform = `${displaced} scale(1)`
      card.style.opacity = '1'
    }, CROSS_APPEAR_AT_MS)

    window.setTimeout(() => {
      card.dataset.cross = 'cross'
      void card.offsetHeight
      card.style.transform = 'none'
    }, CROSS_START_MS)

    window.setTimeout(() => {
      for (const part of crossing.trailing) {
        part.dataset.cross = 'arrive'
        void part.offsetHeight
        part.style.opacity = '1'
      }
    }, CROSS_LANDS_AT_MS)

    // A little past the crossing's end, so the card is left exactly as Home
    // painted it and stops claiming to move only once it has landed.
    window.setTimeout(() => {
      delete card.dataset.motion
      delete card.dataset.cross
      card.style.transform = ''
      card.style.transformOrigin = ''
      card.style.opacity = ''
    }, CROSS_CARD_RESTS_MS)

    // And the parts that answered it, once they have arrived.
    window.setTimeout(() => {
      for (const part of crossing.trailing) {
        delete part.dataset.cross
        part.style.opacity = ''
      }
    }, CROSS_TOTAL_MS)
  })
}

/* A saved entry used to settle in place from 44 px out, on the side it was
   drawn on. Travelling cards replaced that arrival with the crossing above -
   the one way a new card reaches Home - so no second entrance is declared for
   it here. */

/**
 * Counts a balance box's amount from what it held before a save to what it
 * holds after it: 700 ms, or 900 ms when the money has crossed to the other
 * side and this box is one of a swapping pair.
 *
 * Only the figure moves. The box was painted in its end state by Home, so
 * data-amount and data-state already hold the value the count is travelling to.
 *
 * Every frame of the count is written by the caller's own painter, the one that
 * painted the box in the first place, so a counting figure keeps the structure
 * a resting one has - the whole dollars and the half-size cents span beside
 * them - on every frame, and the figure it lands on is the one Home wrote.
 */
export type Count = {
  /** What the box held before the save, and what it holds after it. */
  readonly fromCents: number
  readonly toCents: number
  /** 'swap' when this box is one of a pair the money has crossed between. */
  readonly name: 'count' | 'swap'
  /** How long the figure takes, and how long after now it starts. */
  readonly durationMs: number
  readonly delayMs: number
  /** How the caller writes a figure of cents into the box's amount element. */
  readonly paint: (amount: HTMLElement, cents: number) => void
}

export const countBoxAmount = (box: HTMLElement, count: Count): void => {
  if (prefersReducedMotion()) return
  const amount = box.querySelector<HTMLElement>('[data-box-amount]')
  if (amount === null) return
  const travel = count.toCents - count.fromCents
  // Nothing of the box is displaced before the count begins - its figure is the
  // one Home painted - so the delay is a plain wait and the box says it is
  // counting only while it is.
  const start = (): void => {
    step(
      box,
      count.name,
      count.durationMs,
      (eased) => {
        count.paint(amount, Math.round(count.fromCents + travel * eased))
      },
      () => {
        count.paint(amount, count.toCents)
      },
    )
  }
  if (count.delayMs <= 0) start()
  else window.setTimeout(start, count.delayMs)
}

// ---------------------------------------------------------------------------
// Value 7: the entrances. One part of a screen arriving is one `rise`: it is put
// in its start state at once, says which kind of part it is so the stylesheet
// knows how long it travels for, and is let go after its own delay. Nothing
// about which parts there are, or what any of them mean, is known here.
// ---------------------------------------------------------------------------

type Rise = {
  readonly element: HTMLElement
  /** Which kind of part this is: what the stylesheet times it by. */
  readonly kind: 'box' | 'spine' | 'card' | 'fade' | 'action' | 'row'
  readonly delayMs: number
  readonly riseMs: number
  /** The transform it travels from, or null for a part that only fades in. */
  readonly from: string | null
  /** Whether its opacity travels from 0, or is left exactly as painted. */
  readonly fades: boolean
  /**
   * The data-motion this part carries for a journey of its own. A part of one
   * larger entrance carries none: the screen's own root says that it is running.
   */
  readonly motion?: string
}

/**
 * Puts one part in its start state and schedules its journey, answering with the
 * moment it rests, measured from now.
 *
 * The start state is applied while the part is still held - data-enter-phase is
 * 'held', which no transition hangs on - so the part is simply put where it
 * comes from instead of animating into it; the layout is read back before the
 * phase becomes 'travel', so the frame that starts the transition sees that
 * start state as where the part is travelling from.
 */
const rise = (plan: Rise): number => {
  const element = plan.element
  if (plan.motion !== undefined) element.dataset.motion = plan.motion
  element.dataset.enterRise = plan.kind
  element.dataset.enterPhase = 'held'
  if (plan.from !== null) element.style.transform = plan.from
  if (plan.fades) element.style.opacity = '0'
  window.setTimeout(() => {
    element.dataset.enterPhase = 'travel'
    // Reading the layout flushes the style, so the transition starts from the
    // held state rather than from wherever the part would otherwise rest.
    void element.offsetHeight
    if (plan.from !== null) element.style.transform = 'none'
    if (plan.fades) element.style.opacity = '1'
  }, plan.delayMs)
  return plan.delayMs + plan.riseMs
}

/**
 * Leaves a part exactly as the caller painted it: no inline transform, no
 * inline opacity, no phase and no motion of its own. What is left is the end
 * state, which is the state the screen was built in all along.
 */
const settleRise = (element: HTMLElement): void => {
  delete element.dataset.motion
  delete element.dataset.enterRise
  delete element.dataset.enterPhase
  element.style.transform = ''
  element.style.opacity = ''
}

/**
 * The amount Home's entrance counts up: the holder's figure, from nothing to
 * what it holds. The figure is written by the caller's own painter, as every
 * other count here is, so a counting figure keeps the structure of a resting one
 * and lands exactly on the figure Home wrote.
 */
export type OpeningCount = {
  readonly amount: HTMLElement
  readonly toCents: number
  readonly paint: (amount: HTMLElement, cents: number) => void
}

/**
 * Counts from $0 after a delay, and answers with the moment it rests. The zero
 * is written at once rather than when the count begins, so no frame of the
 * entrance shows the final figure before the count has travelled to it.
 *
 * Progress is read from the clock, so a tab that was hidden while this ran lands
 * on exactly the same end state on its next visible frame.
 */
const countUpFromZero = (count: OpeningCount): number => {
  count.paint(count.amount, 0)
  const startsAt = performance.now() + COUNT_DELAY_MS
  const frame = (now: number): void => {
    const progress = (now - startsAt) / COUNT_MS
    if (progress >= 1) {
      count.paint(count.amount, count.toCents)
      return
    }
    if (progress > 0) count.paint(count.amount, Math.round(count.toCents * ease(progress)))
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return COUNT_DELAY_MS + COUNT_MS
}

/** What Home's entrance travels: the parts, named by the screen that built them. */
export type Opening = {
  /** The two boxes, in reading order: the second follows the first. */
  readonly boxes: readonly HTMLElement[]
  /** The centre line, which draws down from its own top. */
  readonly spine: HTMLElement | null
  /**
   * Each entry's card with the half it comes to rest in - the side of whoever
   * RECEIVED the money - in the order they are read down the list. It starts on
   * the other half, its sender's, and crosses the line to this one.
   */
  readonly cards: readonly {
    readonly element: HTMLElement
    readonly restsOn: 'left' | 'right'
  }[]
  /** The parts that only fade in: the totals, the chip and the Entries heading. */
  readonly fades: readonly HTMLElement[]
  /** The bottom buttons, which rise together. */
  readonly actions: readonly HTMLElement[]
  /** The holder's amount, or null when nobody holds anything to count. */
  readonly count: OpeningCount | null
}

/**
 * Plays Home's entrance on opening the app: the whole of it is one motion, so
 * Home's root carries data-motion="home-enter" from before the first start state
 * is applied until the last part has rested, and every part is left with no
 * inline style of its own afterwards.
 *
 * Home is painted in its end state first and always, exactly as a save's motion
 * finds it, so a device that asked for reduced motion - where this does nothing
 * at all - reads the same screen, at once, from the first frame.
 */
export const enterHome = (screen: HTMLElement, opening: Opening): void => {
  if (prefersReducedMotion()) return
  // Declared before anything is displaced: the hold is part of the motion.
  screen.dataset.motion = 'home-enter'

  const moved: HTMLElement[] = []
  let restsAt = 0
  const plan = (rising: Rise): void => {
    moved.push(rising.element)
    restsAt = Math.max(restsAt, rise(rising))
  }

  opening.boxes.forEach((element, index) => {
    plan({
      element,
      kind: 'box',
      delayMs: index * BOX_STEP_MS,
      riseMs: BOX_RISE_MS,
      from: `translateY(${BOX_SHIFT_PX}px) scale(${BOX_SCALE})`,
      fades: true,
    })
  })

  if (opening.spine !== null) {
    // Only its height travels, from no height at its top: the line draws down.
    plan({
      element: opening.spine,
      kind: 'spine',
      delayMs: SPINE_DELAY_MS,
      riseMs: SPINE_DRAW_MS,
      from: 'scaleY(0)',
      fades: false,
    })
  }

  opening.cards.forEach(({ element, restsOn }, index) => {
    // It starts wholly on its SENDER'S half, which is the half opposite the one
    // it rests in: a send rests right, so it comes from the left, and a payment
    // from Abbaas the other way about. How far out is its own width plus the dot
    // column between the halves - exactly what carries its whole box across the
    // centre of a row whose two halves are equal - and a percentage of its own
    // width needs no measurement, so the start state is applied on the same
    // frame as every other part's, before the card is ever laid out.
    const displaced =
      restsOn === 'right'
        ? `translateX(calc(-100% - ${CROSS_GAP_PX}px))`
        : `translateX(calc(100% + ${CROSS_GAP_PX}px))`
    const cardRestsAt = rise({
      element,
      kind: 'card',
      delayMs: CARD_DELAY_MS + Math.min(index, CARD_STAGGER_CAP) * CARD_STEP_MS,
      riseMs: CARD_CROSS_MS,
      from: displaced,
      // Wholly readable on its sender's half from its first frame: what the eye
      // follows is the journey across the line, not a fade.
      fades: false,
      // Each card's crossing is a journey of its own, so each says so while it
      // travels: a reader that waits for data-motion to clear reads every card
      // landed, not one still in flight.
      motion: 'cross',
    })
    restsAt = Math.max(restsAt, cardRestsAt)
    // It stops claiming to move the moment IT lands, rather than when the rest
    // of the entrance does, and is left exactly as Home painted it.
    window.setTimeout(() => settleRise(element), cardRestsAt + ENTER_SLACK_MS)
  })

  for (const element of opening.fades) {
    plan({
      element,
      kind: 'fade',
      delayMs: FADE_DELAY_MS,
      riseMs: FADE_MS,
      from: null,
      fades: true,
    })
  }

  for (const element of opening.actions) {
    plan({
      element,
      kind: 'action',
      delayMs: ACTION_DELAY_MS,
      riseMs: ACTION_RISE_MS,
      from: `translateY(${ACTION_SHIFT_PX}px)`,
      fades: true,
    })
  }

  if (opening.count !== null) restsAt = Math.max(restsAt, countUpFromZero(opening.count))

  // A little past the last transition's end, so no part is left displaced and
  // the screen stops claiming to be moving only once nothing is.
  window.setTimeout(() => {
    for (const element of moved) settleRise(element)
    delete screen.dataset.motion
  }, restsAt + ENTER_SLACK_MS)
}

/**
 * Rises a form's rows in, one after another, once the circle the form opened as
 * has started filling the screen: each row comes from 16 px below where it
 * belongs, 45 ms after the row above it.
 *
 * Each row owns its own journey, so each carries data-motion while it travels:
 * the form root's reveal is over before the last row has landed, and a row must
 * never sit low and invisible without saying that it is still arriving.
 */
export const enterRows = (rows: readonly HTMLElement[]): void => {
  if (prefersReducedMotion()) return
  rows.forEach((row, index) => {
    const restsAt = rise({
      element: row,
      kind: 'row',
      delayMs: ROW_DELAY_MS + index * ROW_STEP_MS,
      riseMs: ROW_RISE_MS,
      from: `translateY(${ROW_SHIFT_PX}px)`,
      fades: true,
      motion: 'row',
    })
    window.setTimeout(() => settleRise(row), restsAt + ENTER_SLACK_MS)
  })
}

// ---------------------------------------------------------------------------
// Delete value 1: the entry sheet rising over Home and falling away again. It is
// one motion of two parts - the sheet and the scrim travel together - so both
// carry data-motion from before the first start state is applied until the last
// of it rests or is gone, and neither is left with an inline style of its own.
//
// Nothing of Home moves: the sheet is raised over a Home that is already
// mounted, and this touches only the two elements it is handed.
// ---------------------------------------------------------------------------

/** The sheet rises as it fades in; it falls back a little faster. */
export const SHEET_RISE_MS = 280
export const SHEET_FALL_MS = 200
/** How far below where it rests the sheet comes from, and falls back to. */
const SHEET_SHIFT_PX = 24

/** Both parts of the sheet's one motion, in the order they are drawn. */
const sheetParts = (sheet: HTMLElement, scrim: HTMLElement): readonly HTMLElement[] => [scrim, sheet]

/**
 * Puts the sheet and its scrim back exactly as they were painted: no inline
 * transform, no inline opacity, no phase and no motion. What is left is the end
 * state, which is the state they were built in all along.
 */
const settleSheet = (sheet: HTMLElement, scrim: HTMLElement): void => {
  for (const part of sheetParts(sheet, scrim)) {
    delete part.dataset.motion
    delete part.dataset.sheetPhase
    part.style.transform = ''
    part.style.opacity = ''
  }
}

/**
 * Raises the sheet: it comes from 24 px below where it rests and fades in while
 * the scrim fades in with it, over 280 ms on the one curve.
 *
 * The start state is applied while both parts are still held - a phase no
 * transition hangs on - so each is simply put where it comes from instead of
 * animating into it, and data-motion is set before anything is displaced, so
 * neither part can sit shifted or transparent without saying that it is still
 * arriving.
 *
 * With reduced motion asked for nothing runs and no attribute is set: the sheet
 * the caller appended is already its own end state, so it is simply there.
 */
export const raiseSheet = (sheet: HTMLElement, scrim: HTMLElement): void => {
  if (prefersReducedMotion()) return
  for (const part of sheetParts(sheet, scrim)) {
    part.dataset.motion = 'sheet-rise'
    part.dataset.sheetPhase = 'held'
    part.style.opacity = '0'
  }
  sheet.style.transform = `translateY(${SHEET_SHIFT_PX}px)`

  requestAnimationFrame(() => {
    // Reading the layout flushes the style, so the frame that starts the
    // transition sees the shifted, invisible sheet as where it travels from.
    void sheet.offsetHeight
    for (const part of sheetParts(sheet, scrim)) {
      part.dataset.sheetPhase = 'travel'
      part.style.opacity = '1'
    }
    sheet.style.transform = 'none'
    window.setTimeout(() => {
      settleSheet(sheet, scrim)
    }, SHEET_RISE_MS + ENTER_SLACK_MS)
  })
}

/**
 * Lowers the sheet: the reverse of the rise, over 200 ms, after which `settle`
 * is what takes it and its scrim out of the DOM. data-motion is dropped in the
 * same breath as the removal, so a reader that waits for nothing to be moving
 * finds the sheet wholly gone rather than merely on its way out.
 *
 * With reduced motion asked for it disappears at once: `settle` runs on the
 * spot and nothing is ever displaced.
 */
export const lowerSheet = (sheet: HTMLElement, scrim: HTMLElement, settle: () => void): void => {
  if (prefersReducedMotion()) {
    settle()
    return
  }
  for (const part of sheetParts(sheet, scrim)) {
    part.dataset.motion = 'sheet-fall'
    // Straight to travelling: both parts are resting where they belong, which
    // is where this journey starts from.
    part.dataset.sheetPhase = 'travel'
  }
  void sheet.offsetHeight
  for (const part of sheetParts(sheet, scrim)) part.style.opacity = '0'
  sheet.style.transform = `translateY(${SHEET_SHIFT_PX}px)`

  window.setTimeout(() => {
    for (const part of sheetParts(sheet, scrim)) delete part.dataset.motion
    settle()
  }, SHEET_FALL_MS + ENTER_SLACK_MS)
}

/**
 * The white ripple that marks the button a form was opened by: a 120 px circle
 * at that point, growing and fading over 360 ms.
 *
 * It is fixed to the viewport rather than put inside the button, because the
 * screen the button belongs to is replaced the moment the form opens; it says
 * nothing, takes no taps and is hidden from assistive technology, and it is out
 * of the document again as soon as it has faded.
 */
export const rippleAt = (origin: Point): void => {
  if (prefersReducedMotion()) return
  const ripple = document.createElement('div')
  ripple.className = 'tap-ripple'
  ripple.dataset.ripple = 'held'
  ripple.setAttribute('aria-hidden', 'true')
  ripple.style.left = `${origin.x - RIPPLE_SIZE_PX / 2}px`
  ripple.style.top = `${origin.y - RIPPLE_SIZE_PX / 2}px`
  document.body.append(ripple)
  // Read back, so the circle grows from its small self rather than starting big.
  void ripple.offsetHeight
  ripple.dataset.ripple = 'out'
  window.setTimeout(() => {
    ripple.remove()
  }, RIPPLE_MS + ENTER_SLACK_MS)
}
