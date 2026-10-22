// Tests for lib/model_side.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLE_PROFILES, globToRegExp, selectProfile } from '../lib/model_side.js';

const PROFILES = [
  { id: 'family', match: ['qwen3*'], steers: [{ id: 's1', text: 'one' }] },
  { id: 'exact', match: ['Qwen3-4B'], steers: [{ id: 's2', text: 'two' }] },
  { id: 'long', match: ['qwen3-4b*'], steers: [{ id: 's3', text: 'three' }] },
];

test('globToRegExp returns an anchored, case-insensitive RegExp', () => {
  const re = globToRegExp('qwen3*');
  assert.ok(re instanceof RegExp);
  assert.ok(re.flags.includes('i'));
  assert.ok(re.test('Qwen3-4B-Instruct-2507-GGUF'));
  assert.ok(re.test('qwen3'));
  assert.ok(!re.test('qwen'));
  assert.ok(!re.test('prefix-qwen3-4b'));
});

test("'*' matches any run of characters, including the empty run", () => {
  const re = globToRegExp('a*b');
  assert.ok(re.test('ab'));
  assert.ok(re.test('aXYZb'));
  assert.ok(!re.test('xb'));
  assert.ok(!re.test('aXYZbZ'));
});

test('regex metacharacters in patterns are matched literally', () => {
  const re = globToRegExp('model.v1+(x)');
  assert.ok(re.test('MODEL.V1+(X)'));
  assert.ok(!re.test('modelXv1+(x)'));
  assert.ok(!re.test('modelv1+(x)'));
  assert.ok(globToRegExp('a+b').test('a+b'));
  assert.ok(!globToRegExp('a+b').test('aab'));
});

test('an exact match beats a pattern match', () => {
  assert.equal(selectProfile('qwen3-4b', PROFILES)?.id, 'exact');
  assert.equal(selectProfile('QWEN3-4B', PROFILES)?.id, 'exact');
});

test('the longest matching pattern wins', () => {
  assert.equal(selectProfile('Qwen3-4B-Instruct-2507-GGUF', PROFILES)?.id, 'long');
  assert.equal(selectProfile('qwen3-8b', PROFILES)?.id, 'family');
});

test('pattern ties keep the earlier profile', () => {
  const tied = [
    { id: 'first', match: ['qwen3-4b*'], steers: [] },
    { id: 'second', match: ['qwen3-4B*'], steers: [] },
  ];
  assert.equal(selectProfile('Qwen3-4B-Instruct-2507-GGUF', tied)?.id, 'first');
});

test('same-family models can map to different profiles', () => {
  const family = [
    { id: 'small', match: ['qwen3-4b*'], steers: [{ id: 'a', text: 'a' }] },
    { id: 'large', match: ['qwen3-32b*'], steers: [{ id: 'b', text: 'b' }] },
  ];
  assert.equal(selectProfile('Qwen3-4B-Instruct-2507-GGUF', family)?.id, 'small');
  assert.equal(selectProfile('Qwen3-32B-Instruct', family)?.id, 'large');
});

test('matching is case-insensitive', () => {
  assert.equal(selectProfile('GEMINI-2.5-FLASH', EXAMPLE_PROFILES)?.id, 'flatterer-example');
  assert.equal(selectProfile('openai/gpt-4o-mini', EXAMPLE_PROFILES)?.id, 'skeptic-example');
});

test('regex metacharacters in model names are matched literally', () => {
  const profiles = [{ id: 'dotted', match: ['model.v1+(x)'], steers: [] }];
  assert.equal(selectProfile('MODEL.V1+(X)', profiles)?.id, 'dotted');
  assert.equal(selectProfile('modelXv1+(x)', profiles), null);
  assert.equal(selectProfile('model.v1+(x)-GGUF', profiles), null);
});

test('empty or non-string model names return null', () => {
  assert.equal(selectProfile('', PROFILES), null);
  assert.equal(selectProfile(null, PROFILES), null);
  assert.equal(selectProfile(undefined, PROFILES), null);
  assert.equal(selectProfile(42, PROFILES), null);
  assert.equal(selectProfile({}, PROFILES), null);
});

test('no matching profile returns null', () => {
  assert.equal(selectProfile('llama-3.1-8b-instruct', EXAMPLE_PROFILES), null);
  assert.equal(selectProfile('claude-opus-4', EXAMPLE_PROFILES), null);
});

test('profiles without a usable match list are skipped', () => {
  const odd = [
    { id: 'no-match', steers: [] },
    { id: 'yes', match: ['claude*'], steers: [] },
  ];
  assert.equal(selectProfile('claude-opus-4', odd)?.id, 'yes');
  assert.equal(selectProfile('claude-opus-4', [{ id: 'no-match', steers: [] }]), null);
});

test('EXAMPLE_PROFILES shape', () => {
  assert.ok(Array.isArray(EXAMPLE_PROFILES));
  assert.equal(EXAMPLE_PROFILES.length, 2);

  const [flatterer, skeptic] = EXAMPLE_PROFILES;
  assert.equal(flatterer.id, 'flatterer-example');
  assert.deepEqual(flatterer.match, ['*gemini*']);
  assert.equal(flatterer.steers.length, 1);
  assert.equal(flatterer.steers[0].id, 'objection-first');
  assert.equal(
    flatterer.steers[0].text,
    'Before agreeing, give the strongest objection to the plan in one sentence.'
  );

  assert.equal(skeptic.id, 'skeptic-example');
  assert.deepEqual(skeptic.match, ['*gpt*']);
  assert.equal(skeptic.steers.length, 1);
  assert.equal(skeptic.steers[0].id, 'evidence-first');
  assert.equal(
    skeptic.steers[0].text,
    'Lead with the evidence or measurement, then the conclusion.'
  );

  assert.equal(selectProfile('gemini-2.5-flash', EXAMPLE_PROFILES)?.id, 'flatterer-example');
  assert.equal(selectProfile('GPT-5', EXAMPLE_PROFILES)?.id, 'skeptic-example');
});
