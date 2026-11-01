// Your game: answers -> estimated profile (src/lib/profile.js). The four
// example bowlers are the ones worked through by hand in docs/BOWLING.md.
import test from "node:test";
import assert from "node:assert/strict";
import { estimateProfile, cleanAnswers, blankAnswers } from "../src/lib/profile.js";

const answers = (over) => ({ ...blankAnswers(), ...over });

const STROKER = answers({ stand: 16, target: 11, breakpoint: 8, hands: "one", style: "stroker", problems: ["heavy"], speed: 15 });
const TWEENER = answers({ stand: 24, target: 12, breakpoint: 7, hands: "one", style: "tweener", problems: ["none"], speedBand: "medium" });
const CRANKER = answers({ stand: 35, target: 15, breakpoint: 8, hands: "one", style: "cranker", problems: ["early", "dry"], speed: 17 });
const TWO_HANDER = answers({ stand: 38, target: 17, breakpoint: 7, hands: "two", problems: ["dry"] });

const range = (r) => [r.low, r.high];

test("stroker: speed-dominant, a little hook", () => {
  const p = estimateProfile(STROKER);
  assert.deepEqual(range(p.speed), [14.5, 15.5]);
  assert.equal(p.speed.told, true);
  assert.deepEqual(range(p.revRate), [220, 280]);
  assert.equal(p.revRate.confidence, "medium");
  assert.equal(p.matchUp.key, "speed-dominant");
  assert.equal(p.matchUp.confidence, "medium");
  assert.equal(p.hook.boards, 17.5);
  assert.deepEqual(range(p.hook), [15, 21]);
  assert.equal(p.hook.label, "a little hook");
  assert.equal(p.hook.confidence, "high");
});

test("tweener: balanced, moderate hook", () => {
  const p = estimateProfile(TWEENER);
  assert.deepEqual(range(p.speed), [14.5, 16.5]);
  assert.equal(p.speed.confidence, "medium");
  assert.deepEqual(range(p.revRate), [300, 380]);
  assert.equal(p.revRate.confidence, "medium");
  assert.equal(p.matchUp.key, "balanced");
  assert.equal(p.matchUp.confidence, "medium");
  assert.deepEqual(range(p.hook), [25, 31]);
  assert.equal(p.hook.label, "moderate hook");
});

test("cranker: rev-dominant, big hook, with the 'ball may be too strong' note", () => {
  const p = estimateProfile(CRANKER);
  assert.deepEqual(range(p.revRate), [400, 510]);
  assert.equal(p.matchUp.key, "rev-dominant");
  assert.equal(p.matchUp.confidence, "medium");
  assert.match(p.matchUp.note, /too strong/);
  assert.deepEqual(range(p.hook), [34, 40]);
  assert.equal(p.hook.label, "big hook");
});

test("two-hander: rev-dominant, big hook; revs are a wide guess without a speed", () => {
  const p = estimateProfile(TWO_HANDER);
  assert.deepEqual(range(p.speed), [14, 17]);
  assert.equal(p.speed.confidence, "low");
  assert.deepEqual(range(p.revRate), [375, 560]);
  assert.equal(p.revRate.confidence, "low");
  assert.equal(p.matchUp.key, "rev-dominant");
  assert.deepEqual(range(p.hook), [39, 45]);

  const withSpeed = estimateProfile({ ...TWO_HANDER, speed: 17 });
  assert.deepEqual(range(withSpeed.revRate), [435, 555]);
  assert.equal(withSpeed.revRate.confidence, "medium");
});

test("the four styles come out in order of revs and hook", () => {
  const ps = [STROKER, TWEENER, CRANKER, TWO_HANDER].map(estimateProfile);
  for (let i = 1; i < ps.length; i++) {
    assert.ok(ps[i].revRate.mid > ps[i - 1].revRate.mid);
    assert.ok(ps[i].hook.boards > ps[i - 1].hook.boards);
  }
});

test("nothing answered: no profile yet", () => {
  assert.equal(estimateProfile(blankAnswers()), null);
  assert.equal(estimateProfile(answers({ oil: "heavy", brandsSkip: ["Storm"] })), null);
});

test("style only: everything low, hook worked back from the ratio, and a nudge to answer question 1", () => {
  const p = estimateProfile(answers({ hands: "one", style: "tweener" }));
  assert.deepEqual(range(p.speed), [15, 17]);
  assert.deepEqual(range(p.revRate), [270, 400]);
  assert.equal(p.revRate.confidence, "low");
  assert.equal(p.matchUp.key, "balanced");
  assert.equal(p.matchUp.confidence, "low");
  assert.equal(p.hook.confidence, "low");
  assert.equal(p.hook.label, "moderate hook");
  assert.ok(p.notes.some((n) => /question 1/.test(n)));
});

test("no breakpoint: it's guessed from the target, and the hook is less sure", () => {
  // 35 / 15 -> breakpoint 8, as in docs/BOWLING.md
  const p = estimateProfile({ ...CRANKER, breakpoint: null });
  assert.equal(p.hook.boards, 36.5);
  assert.equal(p.hook.confidence, "medium");
  assert.deepEqual(range(p.hook), [33, 41]);
});

test("boards that don't add up are left out, with a note", () => {
  const inside = estimateProfile(answers({ hands: "one", style: "tweener", stand: 10, breakpoint: 15 }));
  assert.equal(inside.hook.confidence, "low");
  assert.ok(inside.notes.some((n) => /further in/.test(n)));
  const pastPocket = estimateProfile(answers({ hands: "one", style: "tweener", stand: 30, breakpoint: 20 }));
  assert.ok(pastPocket.notes.some((n) => /pocket/.test(n)));
});

test("a typed rev rate and speed replace the estimates and make the match-up sure", () => {
  const p = estimateProfile({ ...TWEENER, revRate: 410, revRateSource: "video", speed: 16 });
  assert.deepEqual(range(p.revRate), [395, 425]);
  assert.equal(p.revRate.told, true);
  assert.equal(p.revRate.source, "video");
  assert.equal(p.matchUp.confidence, "high");
  // 410 rpm vs. 350 matched at 16 mph = 1.2 mph worth of revs over
  assert.equal(p.matchUp.score, 1.2);
  assert.equal(p.matchUp.key, "slightly-rev");
});

test("numbers and 'what goes wrong' disagreeing makes the match-up a guess", () => {
  const p = estimateProfile({ ...CRANKER, problems: ["skids"] });
  assert.equal(p.matchUp.confidence, "low");
  assert.match(p.matchUp.note, /different ways/);
});

test("cleanAnswers keeps good answers and blanks the rest", () => {
  const r = cleanAnswers({ ...TWEENER, stand: "24", extra: "dropped", speed: "", pap: "  5 3/4 over  " });
  assert.equal(r.ok, true);
  assert.equal(r.answers.stand, 24);
  assert.equal(r.answers.speed, null);
  assert.equal(r.answers.pap, "5 3/4 over");
  assert.ok(!("extra" in r.answers));
  assert.deepEqual(Object.keys(r.answers).sort(), Object.keys(blankAnswers()).sort());
});

test("cleanAnswers tidies choices that depend on each other", () => {
  const r = cleanAnswers({ hands: "two", style: "cranker", problems: ["none", "early"], speed: 16, speedBand: "fast", brandsInclude: ["Storm"], brandsSkip: ["Storm", "Motiv"] }).answers;
  assert.equal(r.style, null);              // two-handers have no one-hand style
  assert.deepEqual(r.problems, ["early"]);  // "none" only counts alone
  assert.equal(r.speedBand, null);          // a typed speed wins
  assert.deepEqual(r.brandsSkip, ["Motiv"]);
});

test("cleanAnswers refuses wrong values", () => {
  for (const bad of [
    null, [], "x",
    { stand: 0 }, { stand: 40 }, { breakpoint: 7.5 }, { hands: "three" }, { style: "spinner" },
    { problems: ["bad"] }, { problems: "early" }, { speed: 40 }, { speed: "fast" }, { revRate: 50 },
    { axisTilt: 45 }, { pap: "x".repeat(41) }, { brandsInclude: [""] }, { releasedWithin: "5y" },
  ]) {
    assert.equal(cleanAnswers(bad).ok, false, JSON.stringify(bad));
  }
});
