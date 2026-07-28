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

  // 504 from the auth server means its mailer hung, which is a server-side problem the
  // user cannot fix by retrying. Saying so beats the raw body, which arrives as plain
  // text and renders as "{}" once the client fails to parse it as JSON.
  if (error.status === 504 || error.status === 502 || /timeout/i.test(error.message)) {
    return 'The sign-in server timed out sending email. Use a password instead, or try again in a minute.'
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
      return `That password is too weak. ${error.message}`
    case 'validation_failed':
      return 'That does not look like a valid email address.'
    case 'signup_disabled':
      return 'New accounts are turned off for this server.'
    case 'email_address_invalid':
      return `${email} was rejected as invalid. Check it for typos.`
    default:
      return error.message
  }
}
