// Composition root: the one place the Supabase adapters and the ports meet. The
// UI below it sees ports and plain values only.
//
// The order here is the observable promise of this value: the session this phone
// already holds is resolved BEFORE anything is painted, so a later visit, such as
// a launch from the home-screen icon, opens Home without the sign-in screen ever
// flashing.
import './ui/theme.css'
import { createSupabaseClient } from './adapters/supabase/client.js'
import { createSupabaseIdentity } from './adapters/supabase/identity.js'
import { createSupabaseLedgerStore } from './adapters/supabase/ledger-store.js'
import { balanceOf, type Balance } from './domain/balance.js'
import type { Credentials, Identity } from './ports/identity.js'
import type { LedgerEntry, LedgerStore, NewEntry } from './ports/ledger-store.js'
import { openEntrySheet, type OpenEntrySheet } from './ui/entry-sheet.js'
import { renderHome } from './ui/home.js'
import { centreOf, growFrom, prefersReducedMotion, rippleAt, type Point } from './ui/motion.js'
import { renderReceiveForm } from './ui/receive-form.js'
import { renderSendForm } from './ui/send-form.js'
import { emptySignInState, renderSignIn, type SignInState } from './ui/sign-in.js'

/** The one hash the send form answers to, so Android's back button closes it. */
const SEND_HASH = '#send'
/** The receive form's own hash, so the back button closes it the same way. */
const RECEIVE_HASH = '#receive'
/**
 * The hash an entry's sheet answers to. It names the entry, so the sheet is one
 * ordinary history entry over Home: Android's back button closes the sheet and
 * leaves Home in place, and a visit straight to it opens Home with that sheet
 * already up.
 */
const ENTRY_HASH_PREFIX = '#entry/'

/** Which entry this hash names, or null when it names no entry at all. */
const entryIdFromHash = (hash: string): string | null => {
  if (!hash.startsWith(ENTRY_HASH_PREFIX)) return null
  const id = decodeURIComponent(hash.slice(ENTRY_HASH_PREFIX.length))
  return id === '' ? null : id
}

const mount = (root: HTMLElement, screen: HTMLElement): void => {
  root.replaceChildren(screen)
}

/**
 * Leaves one screen mounted and takes every other out of the DOM. It is not
 * replaceChildren: a screen that is already mounted must not be moved, because
 * re-inserting it would cancel the motions running inside it.
 */
const keepOnly = (root: HTMLElement, screen: HTMLElement): void => {
  for (const child of Array.from(root.children)) {
    if (child !== screen) child.remove()
  }
}

const start = async (root: HTMLElement, identity: Identity, store: LedgerStore): Promise<void> => {
  /**
   * What the save that has just happened left behind: the id of the stored
   * entry, which is the card that arrives wearing its ring, and the balance the
   * ledger stood at before it, which is where the boxes count from. Both live
   * here and nowhere else: a reload starts this as null, so a reload shows the
   * stored entries with no ring and no motion, and leaving Home for either form
   * clears it.
   *
   * There is nothing to take back from a save: value 5 removed the Saved
   * message and its Undo. The one removal the app offers is the entry sheet's
   * Delete, which is not a save and leaves this null.
   */
  let justSaved: { readonly id: string; readonly balanceBefore: Balance } | null = null

  /**
   * Where the tap that is opening a form landed. It is taken by the screen that
   * grows from it and cleared, so a form reached by the back or forward button,
   * or by a visit straight to the hash, is shown whole rather than growing from
   * a point nobody touched.
   */
  let openOrigin: Point | null = null

  const takeOrigin = (): Point | null => {
    const origin = openOrigin
    openOrigin = null
    return origin
  }

  /**
   * Where the save button that has just been tapped was, in viewport pixels:
   * the point Home grows from, over the form that is still mounted under it. It
   * is taken by the one Home that grows from it, so a later visit to Home - a
   * back button, a reload - is simply shown.
   */
  let saveOrigin: Point | null = null

  const takeSaveOrigin = (): Point | null => {
    const origin = saveOrigin
    saveOrigin = null
    return origin
  }

  /**
   * Whether the screen about to be painted is the one this visit opens on: only
   * the Home the app opens on plays the entrance. It lives here because only the
   * router knows which arrival is the first, and it is false ever after, so a
   * back button out of a form or a save shows Home without it.
   */
  let opening = true

  /**
   * The Home that is mounted right now, and the entries it was painted from.
   *
   * Both live here because a sheet is raised OVER the Home that is already
   * there: Home is not rebuilt to open one and not rebuilt to close one, which
   * is what makes 'Home stays exactly as it was' true of the DOM itself rather
   * than only of what it reads. The entries are kept beside it so the sheet can
   * be given the entry the owner is looking at without a second read, and so a
   * hash naming an entry this Home does not hold is answered by Home alone.
   */
  let mountedHome: HTMLElement | null = null
  let homeEntries: readonly LedgerEntry[] = []

  /** The sheet that is open over Home, or null when none is. */
  let openSheet: OpenEntrySheet | null = null

  /**
   * Whether the sheet about to be shown was pushed onto the history by a tap on
   * a card, rather than being the hash this visit opened on. It is set by the
   * tap and taken by the sheet it opens, so a sheet reached by a visit straight
   * to its hash knows it has no Home behind it to walk back to.
   */
  let sheetPushed = false

  /**
   * Whether the Home that is mounted no longer says what is stored, which only
   * a delete makes true: the entry it was painted from is gone, so this Home
   * cannot be left in place and must be painted again from a fresh read. Every
   * other arrival at Home over a Home is a sheet closing, which changes nothing
   * underneath and must repaint nothing.
   */
  let homeStale = false

  /**
   * Closes the open sheet, if any, and answers when it is wholly gone. The sheet
   * plays its own fall and takes itself out of the DOM; Home is untouched either
   * way. Waiting matters in one place only - a Home about to be repainted must
   * not replace the screen the sheet is still falling inside.
   */
  const closeSheet = (): Promise<void> => {
    const sheet = openSheet
    openSheet = null
    if (sheet === null) return Promise.resolve()
    sheet.close()
    return sheet.closed
  }

  /**
   * Leaves whatever Home was mounted behind, because another screen is taking
   * over. Any open sheet is closed first, so the sheet gives up the keyboard it
   * was listening for before the screen it was raised over is replaced.
   */
  const forgetHome = (): void => {
    void closeSheet()
    mountedHome = null
    homeEntries = []
    homeStale = false
  }

  const showHome = async (entering = false): Promise<void> => {
    // A Home that is already mounted is left exactly as it is: the ordinary
    // arrival at Home over a Home is a sheet being closed, and closing a sheet
    // must not repaint, re-read or replay anything underneath it.
    if (mountedHome !== null && mountedHome.isConnected && justSaved === null && !homeStale) {
      void closeSheet()
      return
    }
    // A delete is the one arrival that must repaint: the sheet's fall is let
    // land first, so it falls exactly as a Close does, and only then is the
    // screen it fell inside replaced by a Home read back from the store.
    if (homeStale) {
      homeStale = false
      await closeSheet()
    }
    const saved = justSaved
    // Only a save has a button behind it, and only then does Home grow.
    const grownFrom = saved === null ? null : takeSaveOrigin()
    // The read is awaited before painting, so Home is never shown as empty while
    // its entries are still on the way. The balance it paints is the balance
    // after the save, which is the one the boxes count to.
    const ledger = await store.readEntries()
    const screen = renderHome(
      ledger,
      saved === null
        ? undefined
        : {
            entryId: saved.id,
            // The balance the boxes count from; the one they land on is the one
            // the re-read ledger above already says.
            balanceBefore: saved.balanceBefore,
          },
      // A save has its own motion, so a Home that grows from a save button is
      // never also the Home the app opened on.
      entering && saved === null,
    )
    // This Home and what it was painted from, so a sheet can be raised over it
    // without reading the ledger a second time.
    mountedHome = screen
    homeEntries = ledger.outcome === 'read' ? ledger.entries : []
    openSheet = null

    // Each card is the way into its entry's sheet. The card only changes the
    // hash, as Send and Receive do, so a tap, a visit straight to the hash and
    // the phone's back button all travel the one path through the router.
    for (const card of Array.from(screen.querySelectorAll<HTMLElement>('[data-entry]'))) {
      const id = card.dataset.entry
      if (id === undefined) continue
      const open = (): void => {
        // Pushed, which is what makes the phone's back button able to close it.
        sheetPushed = true
        location.hash = `${ENTRY_HASH_PREFIX}${encodeURIComponent(id)}`
      }
      card.addEventListener('click', open)
      // A card is not a button, so nothing opens it from the keyboard for free:
      // the two keys that activate anything do it here.
      card.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        // Space would scroll the list out from under the sheet about to open.
        event.preventDefault()
        open()
      })
    }

    // Tapping Send only changes the hash; the router paints the form, so the
    // back button and the button itself travel the same single path. What the
    // tap adds is where it landed, which is where the form grows from.
    const sendButton = screen.querySelector<HTMLElement>('[data-action="send"]')
    if (sendButton !== null) {
      sendButton.addEventListener('click', () => {
        const origin = centreOf(sendButton)
        openOrigin = origin
        // The tap is answered where it landed, before the screen it landed on
        // is replaced: the ripple is fixed to the viewport, not to the button.
        rippleAt(origin)
        location.hash = SEND_HASH
      })
    }
    // Receive travels the same single path: the button only changes the hash and
    // the router paints the form.
    const receiveButton = screen.querySelector<HTMLElement>('[data-action="receive"]')
    if (receiveButton !== null) {
      receiveButton.addEventListener('click', () => {
        const origin = centreOf(receiveButton)
        openOrigin = origin
        rippleAt(origin)
        location.hash = RECEIVE_HASH
      })
    }

    // After a save Home is mounted ABOVE the form it was saved from and grows
    // as a circle from that form's save button; the form and its dim layer stay
    // under it and leave the DOM when the circle has filled the screen. Every
    // other arrival at Home, and every device that asked for less motion,
    // replaces whatever was there with the end state at once.
    if (grownFrom !== null && !prefersReducedMotion()) {
      root.append(screen)
      growFrom(screen, grownFrom, () => keepOnly(root, screen))
      return
    }
    mount(root, screen)
  }

  /** Leaves a form the way the back button would, so history stays honest. */
  const leaveForm = (hash: string): void => {
    if (location.hash === hash) history.back()
    else void showHome()
  }

  const leaveSend = (): void => leaveForm(SEND_HASH)
  const leaveReceive = (): void => leaveForm(RECEIVE_HASH)

  const showSend = async (): Promise<void> => {
    // Leaving Home ends any earlier save: the next Home it is reached by shows
    // no ring and plays no count. The Home being left is let go of too, along
    // with any sheet raised over it.
    justSaved = null
    forgetHome()
    const origin = takeOrigin()
    // The form needs the saved people and the balance the new entry adds to.
    const [peopleOutcome, ledger] = await Promise.all([store.listPeople(), store.readEntries()])
    // The balance the form opened on is also the balance a save moves away
    // from, so it is what Home's boxes count up or down from afterwards.
    const balance = balanceOf(ledger.outcome === 'read' ? ledger.entries : [])
    mount(
      root,
      renderSendForm(
        {
          people: peopleOutcome.outcome === 'read' ? peopleOutcome.people : [],
          balance,
          origin,
        },
        {
          onClose: leaveSend,
          onAddPerson: (name: string) => store.addPerson(name),
          onSave: async (entry: NewEntry, origin: Point) => {
            const outcome = await store.addEntry(entry)
            // Only a stored entry leaves the form; a Retry keeps every value.
            // The stored row's id is the card Home rings, and the tapped button
            // is where Home grows from.
            if (outcome.outcome === 'added') {
              justSaved = { id: outcome.id, balanceBefore: balance }
              saveOrigin = origin
              leaveSend()
            }
            return outcome
          },
        },
      ),
    )
  }

  const showReceive = async (): Promise<void> => {
    // Leaving Home ends any earlier save, exactly as the send form does, and
    // the Home being left is let go of with any sheet over it.
    justSaved = null
    forgetHome()
    const origin = takeOrigin()
    // A repayment names nobody, so the form needs the balance alone: what Abbaas
    // holds is what 'All of it' offers and what the note is measured against.
    const ledger = await store.readEntries()
    // The same balance a save moves away from, which Home's boxes count from.
    const balance = balanceOf(ledger.outcome === 'read' ? ledger.entries : [])
    mount(
      root,
      renderReceiveForm(
        { balance, origin },
        {
          onClose: leaveReceive,
          onSave: async (entry: NewEntry, origin: Point) => {
            const outcome = await store.addEntry(entry)
            // Only a stored payment leaves the form; a Retry keeps every value.
            // Leaving re-reads the ledger, so Home shows the new balance, the
            // stored row's id is the card Home rings, and the tapped button is
            // where Home grows from.
            if (outcome.outcome === 'added') {
              justSaved = { id: outcome.id, balanceBefore: balance }
              saveOrigin = origin
              leaveReceive()
            }
            return outcome
          },
        },
      ),
    )
  }

  /**
   * Leaves a sheet the way the back button would, so history stays honest: the
   * pushed entry is walked off rather than replaced. Close, a tap on the dimmed
   * Home and Escape all come through here, so every close path is the one the
   * phone's own back button takes.
   */
  const leaveSheet = (pushed: boolean): void => {
    if (entryIdFromHash(location.hash) === null) {
      // The hash has already left this entry behind; only the sheet is left.
      void closeSheet()
      return
    }
    if (pushed) {
      // The ordinary history: the pushed entry is walked off, which is exactly
      // what the phone's own back button does, so both paths are one path.
      history.back()
      return
    }
    // A sheet this visit OPENED on has no Home behind it to walk back to, so
    // walking back would leave the app. The entry is taken off the hash in
    // place instead, which fires no hashchange, so the sheet is closed here.
    history.replaceState(null, '', `${location.pathname}${location.search}`)
    void closeSheet()
  }

  /**
   * The entry the sheet was reading has been removed from storage.
   *
   * The sheet leaves exactly as it does for Close - the same hash walk, so the
   * entry's history entry is left behind rather than kept, and a later back
   * press cannot reopen a sheet for a row that is gone - and the Home it falls
   * back onto is painted again from a fresh read, so the card's absence, the
   * count and the boxes are all worked out from what is stored rather than
   * patched in the page. No entrance and no save motion: justSaved is untouched
   * and null, and nothing is grown from a button.
   *
   * There is nothing else to say. No Undo, no toast and no message on Home: the
   * card being gone and the boxes being recounted are the whole of the feedback.
   */
  const afterDelete = async (pushed: boolean): Promise<void> => {
    homeStale = true
    if (entryIdFromHash(location.hash) !== null) {
      if (pushed) {
        // The pushed entry is walked off, which fires a hashchange: the router
        // reaches Home, sees it stale and repaints it from the store.
        history.back()
        return
      }
      // A sheet this visit opened on has no Home behind it; the entry comes off
      // the hash in place, which fires nothing, so Home is painted from here.
      history.replaceState(null, '', `${location.pathname}${location.search}`)
    }
    await showHome(false)
  }

  /**
   * Shows the sheet for the entry this hash names, over Home.
   *
   * A visit straight to the hash has no Home under it yet, so Home is painted
   * first - at rest, with no entrance: this visit opens on the sheet, and Home
   * must be found underneath it exactly as it is stored rather than arriving
   * part by part behind it.
   *
   * The declared Refusal: a hash naming an entry the read ledger does not hold
   * is not an error the owner has to read and not a sheet either. It is Home,
   * with nothing raised over it.
   */
  const showEntry = async (id: string): Promise<void> => {
    // Leaving Home for a sheet ends any earlier save: the sheet is a reading of
    // one entry, and nothing of a save is replayed under it.
    justSaved = null
    if (mountedHome === null || !mountedHome.isConnected) await showHome(false)
    const screen = mountedHome
    if (screen === null) return
    // Already the sheet being asked for: nothing to raise and nothing to move.
    if (openSheet !== null && openSheet.entryId === id) return
    void closeSheet()

    const entry = homeEntries.find((candidate) => candidate.id === id)
    if (entry === undefined) return

    // The card this sheet was opened from, which is where focus goes back to.
    const card = screen.querySelector<HTMLElement>(`[data-entry="${id}"]`)
    // Whether this sheet was pushed onto the history by a tap, which decides
    // whether leaving it walks back or simply takes the entry off the hash.
    const pushed = sheetPushed
    sheetPushed = false
    openSheet = openEntrySheet(screen, entry, card, {
      onLeave: () => leaveSheet(pushed),
      // The one delete path the app has: the store's own removeEntry, under the
      // policy that decides whose row it is. The sheet asks for it; whether it
      // landed is the store's word, not the sheet's.
      onDelete: () => store.removeEntry(entry.id),
      onRemoved: () => {
        void afterDelete(pushed)
      },
    })
  }

  const route = async (): Promise<void> => {
    // Whichever screen this visit lands on, it is the only one that opens: a
    // visit straight to a form has spent the opening on that form.
    const entering = opening
    opening = false
    const entryId = entryIdFromHash(location.hash)
    if (location.hash === SEND_HASH) await showSend()
    else if (location.hash === RECEIVE_HASH) await showReceive()
    else if (entryId !== null) await showEntry(entryId)
    // An '#entry/' with nothing after it, or any other hash, is Home: a sheet
    // is closed the moment the hash stops naming an entry.
    else await showHome(entering)
  }

  /** Starts routing from wherever this visit landed, Home or the send form. */
  let routing = false
  const startRouting = async (): Promise<void> => {
    if (!routing) {
      routing = true
      window.addEventListener('hashchange', () => {
        void route()
      })
    }
    await route()
  }

  const showSignIn = (state: SignInState): void => {
    // The sign-in screen replaces whatever was there, Home and sheet alike.
    forgetHome()
    mount(
      root,
      renderSignIn(state, {
        onSignIn: (credentials: Credentials) => {
          void attempt(credentials)
        },
      }),
    )
  }

  const attempt = async (credentials: Credentials): Promise<void> => {
    const outcome = await identity.signIn(credentials)
    if (outcome.outcome === 'signed-in') {
      await startRouting()
      return
    }
    // A Refusal and a Retry both keep the sign-in screen and say which it was;
    // the password is dropped either way, because renderSignIn never carries it.
    showSignIn({ email: credentials.email, message: outcome.message, busy: false })
  }

  const session = await identity.currentAccount()
  if (session.outcome === 'signed-in') {
    await startRouting()
    return
  }
  // A rejected refresh is a Refusal that names itself, never an empty Home.
  showSignIn(
    session.outcome === 'refusal'
      ? { ...emptySignInState(), message: session.message }
      : emptySignInState(),
  )
}

/**
 * Registers the service worker, which is what lets Chrome offer to add the app to
 * the Android home screen and what lets the icon open it offline.
 *
 * It is deliberately a side errand: the promise is never awaited and a failure is
 * swallowed, because the ledger is an ordinary web page first. A browser without
 * service workers, or an origin that refuses one, must still sign in and work.
 *
 * The URLs are resolved against the document, so the same build registers at the
 * origin root in development and under the GitHub Pages sub-path in production.
 */
const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) return
  const worker = new URL('sw.js', document.baseURI).href
  const scope = new URL('./', document.baseURI).href
  void navigator.serviceWorker.register(worker, { scope }).catch(() => {
    // Nothing to say and nothing to do: the page itself is unaffected.
  })
}

registerServiceWorker()

const root = document.querySelector<HTMLElement>('#app')
if (root) {
  const client = createSupabaseClient()
  void start(root, createSupabaseIdentity(client), createSupabaseLedgerStore(client))
}

