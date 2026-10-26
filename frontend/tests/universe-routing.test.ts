/**
 * Post-auth routing tests — the universe boundary at login, signup and callback.
 *
 * Run with:  npm test
 *
 * Every authenticated request is funneled through `resolvePostAuthPath`, and
 * the middleware is only a second line of defence: getting this wrong does not
 * break anything visibly, it parks the wrong product in front of a signed-in
 * user for one round trip and then again on every later visit. So the rules
 * are pinned here — universe confinement, onboarding priority, and the shape
 * checks that keep `next` from bouncing a fresh session off-site.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accountTypeFromUserMetadata,
  homeFor,
  universeOfRoute,
  universeSafeNext,
  resolvePostAuthPath,
} from '../lib/universe';

test('metadata is a usable account-type signal when the profile row is unreadable', () => {
  assert.equal(accountTypeFromUserMetadata({ account_type: 'organization' }), 'organization');
  assert.equal(accountTypeFromUserMetadata({ account_type: 'investor' }), 'investor');
  assert.equal(accountTypeFromUserMetadata({ role: 'organization' }), 'organization');

  // A job title under `role` is the shape older signups wrote. It must resolve
  // to the universe with no privileged surface, never to an organisation.
  assert.equal(accountTypeFromUserMetadata({ role: 'Senior Engineer' }), 'individual');
  assert.equal(accountTypeFromUserMetadata({ role: 'Platform Lead' }), 'individual');

  assert.equal(accountTypeFromUserMetadata(null), 'individual');
  assert.equal(accountTypeFromUserMetadata('nonsense'), 'individual');
  assert.equal(accountTypeFromUserMetadata({}), 'individual');
});

test('an account lands on its own universe home', () => {
  assert.equal(homeFor('individual'), '/dashboard');
  assert.equal(homeFor('organization'), '/org/dashboard');
  assert.equal(homeFor('investor'), '/org/dashboard');
  assert.equal(homeFor(undefined), '/dashboard');
});

test('route classification matches the universe the middleware enforces', () => {
  assert.equal(universeOfRoute('/org'), 'org');
  assert.equal(universeOfRoute('/org/talent'), 'org');
  assert.equal(universeOfRoute('/organization'), 'individual');
  assert.equal(universeOfRoute('/dashboard'), 'individual');
  assert.equal(universeOfRoute('/opportunities/https%3A%2F%2Fx.test'), 'individual');
});

test('a next target is rejected on shape before it is judged on universe', () => {
  // Off-site: protocol-relative, backslash-escaped, absolute, control chars.
  assert.equal(universeSafeNext('//evil.example', 'individual'), null);
  assert.equal(universeSafeNext('/\\evil.example', 'individual'), null);
  assert.equal(universeSafeNext('https://evil.example', 'individual'), null);
  assert.equal(universeSafeNext('/dashboard\u0000@evil.example', 'individual'), null);
  assert.equal(universeSafeNext('/dashboard\nSet-Cookie: x=y', 'individual'), null);
  assert.equal(universeSafeNext('', 'individual'), null);
  assert.equal(universeSafeNext(null, 'individual'), null);
});

test('an organisation is never parked on a talent route, nor the reverse', () => {
  assert.equal(universeSafeNext('/dashboard', 'organization'), null);
  assert.equal(universeSafeNext('/opportunities?q=x', 'organization'), null);
  assert.equal(universeSafeNext('/org/talent', 'individual'), null);
  assert.equal(universeSafeNext('/org', 'individual'), null);

  assert.equal(universeSafeNext('/org/dashboard', 'organization'), '/org/dashboard');
  assert.equal(universeSafeNext('/dashboard?q=x', 'individual'), '/dashboard?q=x');
  assert.equal(universeSafeNext('/opportunities?q=x#top', 'individual'), '/opportunities?q=x#top');
});

test('/onboarding is reachable from either universe', () => {
  assert.equal(universeSafeNext('/onboarding', 'individual'), '/onboarding');
  assert.equal(universeSafeNext('/onboarding?step=2', 'organization'), '/onboarding?step=2');
});

test('onboarding outranks next, and an unreadable profile never forces it', () => {
  assert.equal(
    resolvePostAuthPath({ next: '/org/talent', accountType: 'organization', onboardingCompleted: false }),
    '/onboarding'
  );
  assert.equal(
    resolvePostAuthPath({ next: '/dashboard', accountType: 'individual', onboardingCompleted: false }),
    '/onboarding'
  );

  // `null` means "the profile could not be read" — a returning user with an
  // unreadable row must not be bounced back into onboarding.
  assert.equal(
    resolvePostAuthPath({ next: '/org/talent', accountType: 'organization', onboardingCompleted: null }),
    '/org/talent'
  );
  assert.equal(
    resolvePostAuthPath({ next: null, accountType: 'organization', onboardingCompleted: null }),
    '/org/dashboard'
  );
  assert.equal(
    resolvePostAuthPath({ next: '/dashboard', accountType: 'organization', onboardingCompleted: true }),
    '/org/dashboard'
  );
  assert.equal(
    resolvePostAuthPath({ next: '/skills', accountType: 'individual', onboardingCompleted: true }),
    '/skills'
  );
});
