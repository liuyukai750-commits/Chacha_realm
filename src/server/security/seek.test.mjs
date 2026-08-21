import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

let source = readFileSync(new URL("./seek.ts", import.meta.url), "utf8");
source = source
  .replace('import { evaluateSeekState } from "@/features/discovery";', 'let evaluation; const evaluateSeekState = () => evaluation; export const setEvaluation = (value) => { evaluation = value; };')
  .replace('import { ApiProblem } from "@/server/api";', 'class ApiProblem extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }');
const { requireSafeSeek, setEvaluation } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("returns the shared seek result without recalculating thresholds", () => {
  setEvaluation({ ok: true, spotId: "spot-1", seekState: "found" });
  assert.deepEqual(requireSafeSeek("spot-1", {}), { spotId: "spot-1", seekState: "found" });
});

test("maps safety review and accuracy-boundary failures explicitly", () => {
  setEvaluation({ ok: false, reason: "seek_target_review_required" });
  assert.throws(() => requireSafeSeek("spot-1", {}), (error) => error.status === 400 && error.code === "invalid_spot");
  setEvaluation({ ok: false, reason: "boundary_uncertain" });
  assert.throws(
    () => requireSafeSeek("spot-1", {}),
    (error) => error.status === 400 && error.code === "location_too_imprecise",
  );
});
