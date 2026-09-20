#!/usr/bin/env node
/**
 * Checks `parseAuthFragment` against the URLs GoTrue actually emits.
 *
 * WHY THIS FILE EXISTS. The auth deep-link handler read only the query string, so every
 * recovery and confirmation link that came back as a fragment did nothing at all — no
 * session, no error, no UI. It shipped that way because nothing could execute the parse
 * outside a running app on a phone. This runs in Node in a few milliseconds.
 *
 * The expired-link case below is not invented. It is the verbatim `Location` header from
 *   GET /auth/v1/verify?token=invalidtoken&type=recovery&redirect_to=macrofit://auth/callback
 * against the live project, which is how the bug was diagnosed.
 *
 *   node scripts/check-auth-link.mjs
 */

/*
  The REAL module, not a copy of it. Node strips the types on import (native since 23), and
  src/lib/authLink.ts is deliberately free of imports so nothing else has to be resolved.

  A transcribed copy of the parser would have passed this whole suite while the shipped app
  stayed broken, which is the specific way a test can be worse than no test.
*/
import { parseAuthFragment } from '../src/lib/authLink.ts'

const CASES = [
  {
    name: 'recovery link, session in the fragment',
    url:
      'macrofit://auth/callback#access_token=eyJhbGciOiJIUzI1NiJ9.aaa.bbb' +
      '&expires_at=1790000000&expires_in=3600' +
      '&refresh_token=zzz111&token_type=bearer&type=recovery',
    expect: {
      access_token: 'eyJhbGciOiJIUzI1NiJ9.aaa.bbb',
      refresh_token: 'zzz111',
      type: 'recovery',
    },
  },
  {
    name: 'expired link (verbatim from the live project)',
    url:
      'macrofit://auth/callback#error=access_denied&error_code=otp_expired' +
      '&error_description=Email+link+is+invalid+or+has+expired&sb=',
    expect: {
      error: 'access_denied',
      error_code: 'otp_expired',
      // `+` must decode to spaces. decodeURIComponent would leave literal plus signs here,
      // and the message shown to the user would read "Email+link+is+invalid".
      error_description: 'Email link is invalid or has expired',
    },
  },
  {
    name: 'signup confirmation, session in the fragment',
    url: 'macrofit://auth/callback#access_token=tok&refresh_token=ref&type=signup',
    expect: { access_token: 'tok', refresh_token: 'ref', type: 'signup' },
  },
  {
    name: 'PKCE link: nothing in the fragment, query is read elsewhere',
    url: 'macrofit://auth/callback?code=abc123',
    expect: {},
  },
  {
    name: 'no fragment at all',
    url: 'macrofit://auth/callback',
    expect: {},
  },
  {
    name: 'empty fragment',
    url: 'macrofit://auth/callback#',
    expect: {},
  },
]

let failed = 0

for (const { name, url, expect } of CASES) {
  const actual = parseAuthFragment(url)
  // Every expected key must match; `sb=` and the expiry fields are ignored on purpose, since
  // the handler never reads them and asserting them would make this brittle for no gain.
  const problems = Object.entries(expect)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`)

  // An empty expectation means the fragment must yield nothing at all.
  if (Object.keys(expect).length === 0 && Object.keys(actual).length > 0) {
    problems.push(`expected no params, got ${JSON.stringify(actual)}`)
  }

  if (problems.length === 0) {
    console.log(`  ok    ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}`)
    for (const problem of problems) console.log(`          ${problem}`)
  }
}

console.log(
  failed === 0
    ? `\n${CASES.length} cases passed.`
    : `\n${failed} of ${CASES.length} cases failed.`,
)
process.exit(failed === 0 ? 0 : 1)
