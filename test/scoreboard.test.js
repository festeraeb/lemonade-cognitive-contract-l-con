// Tests for lib/scoreboard.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyBoard, record, wilsonLower, pickSteer } from '../lib/scoreboard.js';

test('emptyBoard starts with no models', () => {
  assert.deepEqual(emptyBoard(), { models: {} });
});

test('record counts outcomes and creates missing entries', () => {
  const board = emptyBoard();
  const same = record(board, 'model-a', 'steer-1', 'helped');
  record(board, 'model-a', 'steer-1', 'neutral');
  record(board, 'model-a', 'steer-2', 'hurt');

  assert.equal(same, board);
  assert.deepEqual(board.models['model-a']['steer-1'], { helped: 1, neutral: 1, hurt: 0 });
  assert.deepEqual(board.models['model-a']['steer-2'], { helped: 0, neutral: 0, hurt: 1 });
});

test('record rejects unknown outcomes with a TypeError', () => {
  const board = emptyBoard();
  assert.throws(() => record(board, 'model-a', 'steer-1', 'maybe'), TypeError);
  assert.throws(() => record(board, 'model-a', 'steer-1', undefined), TypeError);
  assert.deepEqual(board, { models: {} });
});

test('wilsonLower matches known values', () => {
  assert.equal(wilsonLower(0, 0), 0);
  assert.ok(Math.abs(wilsonLower(8, 10) - 0.49) < 0.01);
  assert.ok(Math.abs(wilsonLower(80, 100) - 0.71) < 0.01);
});

test('pickSteer explores the least-sampled steer first', () => {
  const board = emptyBoard();
  record(board, 'model-a', 'steer-1', 'helped');
  record(board, 'model-a', 'steer-1', 'neutral');
  record(board, 'model-a', 'steer-1', 'hurt');
  record(board, 'model-a', 'steer-2', 'helped');
  record(board, 'model-a', 'steer-2', 'neutral');

  assert.equal(pickSteer(board, 'model-a', ['steer-1', 'steer-2'], { minSamples: 5 }), 'steer-2');
});

test('pickSteer breaks exploration ties in list order', () => {
  const board = emptyBoard();
  record(board, 'model-a', 'steer-1', 'helped');
  record(board, 'model-a', 'steer-2', 'helped');

  assert.equal(pickSteer(board, 'model-a', ['steer-1', 'steer-2'], { minSamples: 5 }), 'steer-1');
});

test('pickSteer exploits the better steer once exploration is done', () => {
  const board = emptyBoard();
  for (let i = 0; i < 5; i++) record(board, 'model-a', 'steer-1', 'helped');
  for (let i = 0; i < 5; i++) record(board, 'model-a', 'steer-2', 'hurt');

  assert.equal(pickSteer(board, 'model-a', ['steer-1', 'steer-2'], { minSamples: 5 }), 'steer-1');
  assert.equal(pickSteer(board, 'model-a', ['steer-2', 'steer-1'], { minSamples: 5 }), 'steer-1');
});

test('pickSteer scores per exact model, never across a family', () => {
  const board = emptyBoard();
  for (let i = 0; i < 2; i++) record(board, 'model-a', 'push-back', 'helped');
  for (let i = 0; i < 2; i++) record(board, 'model-a', 'agree', 'hurt');
  for (let i = 0; i < 2; i++) record(board, 'model-b', 'push-back', 'hurt');
  for (let i = 0; i < 2; i++) record(board, 'model-b', 'agree', 'helped');

  const ids = ['push-back', 'agree'];
  assert.equal(pickSteer(board, 'model-a', ids, { minSamples: 2 }), 'push-back');
  assert.equal(pickSteer(board, 'model-b', ids, { minSamples: 2 }), 'agree');
});

test('pickSteer returns null for an empty steer list', () => {
  const board = emptyBoard();
  assert.equal(pickSteer(board, 'model-a', []), null);
  assert.equal(pickSteer(board, 'model-a', [], { minSamples: 1 }), null);
});

test('a board survives a JSON round trip', () => {
  const board = emptyBoard();
  record(board, 'model-a', 'steer-1', 'helped');
  record(board, 'model-a', 'steer-1', 'hurt');
  record(board, 'model-b', 'steer-2', 'neutral');

  const clone = JSON.parse(JSON.stringify(board));
  assert.deepEqual(clone, board);
  assert.equal(pickSteer(clone, 'model-a', ['steer-1'], { minSamples: 1 }), 'steer-1');
});
