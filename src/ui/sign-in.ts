// The sign-in screen as a function from state to DOM. It imports the Identity
// port's value types and nothing else: no Supabase, no global state.
import type { Credentials } from '../ports/identity.js'

export type SignInState = {
  /** Kept across a failed attempt so the owner does not retype it. */
  readonly email: string
  /** A named Refusal or Retry message, or null on a first visit. */
  readonly message: string | null
  readonly busy: boolean
}

export const emptySignInState = (): SignInState => ({ email: '', message: null, busy: false })

export type SignInHandlers = {
  readonly onSignIn: (credentials: Credentials) => void
}

const labelledInput = (
  id: string,
  label: string,
  type: string,
  value: string,
  autocomplete: string,
): { readonly field: HTMLElement; readonly input: HTMLInputElement } => {
  const field = document.createElement('p')
  field.className = 'sign-in-field'
  const element = document.createElement('label')
  element.htmlFor = id
  element.textContent = label

  const input = document.createElement('input')
  input.id = id
  input.type = type
  input.value = value
  input.name = id
  input.setAttribute('autocomplete', autocomplete)
  input.required = true
  input.className = 'sign-in-input'
  if (type === 'email') input.inputMode = 'email'

  field.append(element, input)
  return { field, input }
}

export const renderSignIn = (state: SignInState, handlers: SignInHandlers): HTMLElement => {
  const screen = document.createElement('section')
  screen.dataset.screen = 'sign-in'
  screen.className = 'screen sign-in'

  // The two holders' colours, overlapping: the app's mark, drawn and not loaded.
  const mark = document.createElement('div')
  mark.className = 'sign-in-mark'
  mark.setAttribute('aria-hidden', 'true')
  mark.append(document.createElement('span'), document.createElement('span'))

  const title = document.createElement('h1')
  title.className = 'sign-in-title'
  title.textContent = 'Abbaas Ledger'

  const lead = document.createElement('p')
  lead.className = 'sign-in-lead'
  lead.textContent = 'Sign in once on this phone. It stays signed in.'

  const form = document.createElement('form')
  form.className = 'sign-in-card'
  form.noValidate = true

  const email = labelledInput('email', 'Email', 'email', state.email, 'username')
  // The password is never carried across an attempt: a Refusal clears it.
  const password = labelledInput('password', 'Password', 'password', '', 'current-password')

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'sign-in-button'
  submit.textContent = 'Sign in'
  submit.disabled = state.busy

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (state.busy) return
    handlers.onSignIn({ email: email.input.value.trim(), password: password.input.value })
  })

  form.append(email.field, password.field)

  if (state.message !== null) {
    // Named failures are spoken, not guessed at: wrong credentials, an
    // unreachable server, or a session that must be renewed.
    const notice = document.createElement('p')
    notice.setAttribute('role', 'alert')
    notice.dataset.signInMessage = ''
    notice.className = 'sign-in-message'
    notice.textContent = state.message
    form.append(notice)
  }

  form.append(submit)
  screen.append(mark, title, lead, form)

  return screen
}
