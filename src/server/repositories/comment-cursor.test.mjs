import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("./comment-cursor.ts", import.meta.url), "utf8"));
const { CommentCursorError, decodeCommentCursor, encodeCommentCursor } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("round trips a stable timestamp and id cursor", () => {
  const cursor = {
    createdAt: "2026-08-09T08:00:00.000Z",
    id: "10000000-0000-4000-8000-000000000001",
  };
  assert.deepEqual(decodeCommentCursor(encodeCommentCursor(cursor)), cursor);
});
test("rejects malformed or structurally invalid cursors", () => {
  assert.equal(decodeCommentCursor(null), null);
  assert.throws(() => decodeCommentCursor("not-a-cursor"), CommentCursorError);
  assert.throws(
    () => decodeCommentCursor(Buffer.from(JSON.stringify({ createdAt: "bad", id: "bad" })).toString("base64url")),
    CommentCursorError,
  );
});
