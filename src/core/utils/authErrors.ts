import type { AuthError } from '@supabase/supabase-js'

/**
 * Zero-width space, non-joiner, joiner, and the byte-order mark. Built from escapes on
 * purpose: a literal one of these in source would be invisible and unreviewable.
 */
const INVISIBLE = new RegExp('[\\u200B\\u200C\\u200D\\uFEFF]', 'g')

/**
 * Canonical form of an address typed on a phone.
 *
 * Android keyboards append a space when a suggestion is accepted, password managers paste
 * trailing newlines, and iOS capitalises the first letter unless every input on the path
 * opts out. None of that is visible in a one-line field, so the user sees only that their
 * correct-looking address was rejected.
 */
export const normalizeEmail = (value: string): string =>
  value.replace(INVISIBLE, '').trim().toLowerCase()

/**
 * The outcome of an auth call, in words a user can act on.
 *
 * `error` and `notice` are both human-readable: the screen renders whichever is set and
 * never inspects GoTrue's own strings, which say things like "Invalid login credentials"
 * for the very different cases of a wrong password and an account that does not exist.
 */
export interface AuthResult {
  error: string | null
  notice: string | null
  /** The account exists but its address has never been confirmed. */
  awaitingConfirmation?: boolean
}

/**
 * GoTrue's own message, unless what arrived is not a message at all.
 *
 * When the response body will not parse as JSON, auth-js builds the error with
 * `JSON.stringify(response)` for its message, so `error.message` reaches this function as
 * `{"status":500,"statusText":"","redirected":false,"url":"…/auth/v1/signup"}`. That is a
 * serialised Response object, and printing it in a red box under the password field tells
 * the user nothing while leaking the internals of a failure they did not cause.
 */
const humanReadable = (message: string): string => {
  const trimmed = message.trim()
  if (trimmed === '' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'Something went wrong on the sign-in server. Try again in a minute.'
  }
  return trimmed
}

/**
 * Turns a GoTrue error into a sentence naming the likely cause and the way out.
 *
 * Matching is on `code` rather than `message`: the codes are a stable API, the messages
 * are prose that changes between GoTrue releases.
 */
export const describeAuthError = (error: AuthError, email: string): string => {
  // A request that never reached the server carries no code at all.
  if (error.status === 0 || /network request failed|failed to fetch/i.test(error.message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }

  /*
    Any 5xx from the auth server is its mailer failing or hanging — a server-side problem no
    amount of retrying from this screen will fix. 504 when the SMTP connection hangs, 500
    when it is refused outright; both arrive as an unparseable body.

    The way out is "Sign in", not another signup: GoTrue creates the account before it sends
    the confirmation email, so a send that fails after the insert leaves a real account
    behind. Telling the user to sign up again earns them "that email already has an account"
    and no explanation.
  */
  if ((error.status !== undefined && error.status >= 500) || /timeout/i.test(error.message)) {
    return (
      'The server could not send the confirmation email. Your account may already have been ' +
      'created — try "Sign in" first, or come back in a minute.'
    )
  }

  switch (error.code) {
    case 'invalid_credentials':
      return (
        `Wrong password, or there is no account for ${email} yet. ` +
        'The app and the website share one login — if you have never signed up, ' +
        'tap "Create account".'
      )
    case 'email_not_confirmed':
      return `${email} is not confirmed yet. Open the link in the email we sent, then sign in.`
    case 'user_already_exists':
    case 'email_exists':
      return `${email} already has an account. Switch to "Sign in".`
    case 'over_email_send_rate_limit':
      return 'Too many emails sent to that address. Wait a minute before trying again.'
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute before trying again.'
    case 'weak_password':
      return `That password is too weak. ${humanReadable(error.message)}`
    case 'validation_failed':
      return 'That does not look like a valid email address.'
    case 'signup_disabled':
      return 'New accounts are turned off for this server.'
    case 'email_address_invalid':
      return `${email} was rejected as invalid. Check it for typos.`
    default:
      return humanReadable(error.message)
  }
}
