import test from "node:test";
import assert from "node:assert/strict";
import { emptyBoard, record } from "../lib/scoreboard.js";

test("record rejects an empty or blank model name", () => {
  const board = emptyBoard();
  assert.throws(() => record(board, "", "steer-a", "helped"), TypeError);
  assert.throws(() => record(board, "   ", "steer-a", "helped"), TypeError);
  assert.deepEqual(board, { models: {} });
});

test("record rejects an empty or blank steer id", () => {
  const board = emptyBoard();
  assert.throws(() => record(board, "model-x", "", "helped"), TypeError);
  assert.throws(() => record(board, "model-x", "  ", "hurt"), TypeError);
  assert.deepEqual(board, { models: {} });
});

test("record rejects non-string model or steer id", () => {
  const board = emptyBoard();
  assert.throws(() => record(board, 42, "steer-a", "helped"), TypeError);
  assert.throws(() => record(board, "model-x", null, "helped"), TypeError);
  assert.throws(() => record(board, undefined, undefined, "helped"), TypeError);
  assert.deepEqual(board, { models: {} });
});

test("record still counts valid outcomes after the new checks", () => {
  const board = emptyBoard();
  record(board, "model-x", "steer-a", "helped");
  record(board, "model-x", "steer-a", "hurt");
  assert.deepEqual(board.models["model-x"]["steer-a"], { helped: 1, neutral: 0, hurt: 1 });
});
