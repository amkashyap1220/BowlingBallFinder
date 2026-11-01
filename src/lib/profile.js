/* ==========================================================================
   Your game: answers to the questions -> an estimated profile.

   Pure: no DOM, no env. The /profile page runs it as you answer, and the
   Worker checks what gets saved with cleanAnswers().

   Four estimates, each a range with a confidence (high, medium, low):
     speed      the speed the lane screen shows (mph)
     revRate    rpm
     matchUp    rev-to-speed: speed-dominant ... balanced ... rev-dominant
     hook       boards out to the breakpoint plus boards back to the pocket

   A speed or rev rate the bowler types (from the lane screen, a pro shop or
   video) counts as measured and replaces the estimate.

   Every number is in PROFILE_MODEL so it can be tuned with the users'
   feedback. Where the numbers come from: docs/BOWLING.md ("Profile math").
   ========================================================================== */

export const PROFILE_MODEL = {
  // Starting point from style: screen speed (mph) and rev rate (rpm).
  // Rev ranges are the usual published split; speeds are about 2 mph under
  // the published release-speed averages, because screens read lower.
  styles: {
    stroker: { speed: [14, 16], rpm: [200, 300] },
    tweener: { speed: [15, 17], rpm: [300, 370] },
    cranker: { speed: [15.5, 18], rpm: [400, 500] },
    two: { speed: [14, 17], rpm: [400, 550] },
    oneHand: { speed: [14, 17.5], rpm: [250, 450] },   // one hand, style not given
    unknown: { speed: [13.5, 18], rpm: [200, 550] },   // nothing given
  },
  // Slow / Medium / Fast, in screen mph
  speedBands: { slow: [12.5, 14.5], medium: [14.5, 16.5], fast: [16.5, 18.5] },
  typedSpeedSpread: 0.5,     // mph either side of a typed speed
  typedRpmSpread: 15,        // rpm either side of a typed rev rate

  pocketBoard: 17.5,
  // No breakpoint given: breakpoint = target - this x (stand - target).
  // Gives 8 for 35/15 and 6.5 for 20/10, the examples in docs/BOWLING.md.
  breakpointFromTarget: 0.35,
  hookSpread: { high: 3, medium: 4, low: 6 },          // boards either side
  hookLabels: [[20, "a little hook"], [30, "moderate hook"], [36, "strong hook"], [Infinity, "big hook"]],

  // More hook at the same speed means more revs:
  // rpm per mph of screen speed = ratioBase + ratioPerBoard x hook
  ratioBase: 7,
  ratioPerBoard: 0.55,
  hookWeight: 0.6,           // rpm from hook vs. the middle of the style range
  agreeWithin: 0.15,         // the two rpm figures agree when this close
  rpmSpread: { medium: 0.12, low: 0.2 },

  // Matched: 300 rpm at 17 mph release, 50 rpm more per mph faster.
  // Screens read about 2 mph under release, so 300 rpm at 15 on the screen.
  matched: { rpm: 300, screenSpeed: 15, rpmPerMph: 50 },
  // What goes wrong: + pushes toward rev-dominant, - toward speed-dominant
  problemPush: { early: 1, dry: 0.5, skids: -1, heavy: -0.5, none: 0 },
  matchUpLabels: [
    [-1.5, "speed-dominant", "Speed-dominant"],
    [-0.5, "slightly-speed", "Slightly speed-dominant"],
    [0.5, "balanced", "Balanced"],
    [1.5, "slightly-rev", "Slightly rev-dominant"],
    [Infinity, "rev-dominant", "Rev-dominant"],
  ],
};

/* ---------- The questions' choices (the page and the checks share these) ---------- */

export const HANDS = ["one", "two"];
export const STYLES = ["stroker", "tweener", "cranker"];
export const PROBLEMS = ["early", "skids", "dry", "heavy", "none"];
export const SPEED_BANDS = ["slow", "medium", "fast"];
export const PATTERNS = ["house", "mix", "sport"];
export const OILS = ["heavy", "medium", "light"];
export const LANES = ["wood", "synthetic"];
export const REV_SOURCES = ["pro_shop", "video", "other"];
export const RELEASED_WITHIN = ["any", "2y", "1y"];

/** Every answer, blank. Blank is null (or an empty list), never a guess. */
export function blankAnswers() {
  return {
    stand: null, target: null, breakpoint: null,              // 1: boards 1-39
    hands: null, style: null,                                 // 2
    problems: [],                                             // 3
    speed: null, speedBand: null,                             // 4
    pattern: null, oil: null, lanes: null,                    // 5 (saved for recommendations)
    revRate: null, revRateSource: null,                       // 7
    axisRotation: null, axisTilt: null, pap: null,            // 7 (saved for later)
    brandsInclude: [], brandsSkip: [], releasedWithin: "any", // 8 (saved for recommendations)
  };
}

/**
 * Checks answers from a request (or the page) and returns a clean copy:
 * known keys only, blanks as null. Unknown keys are dropped.
 * @returns {{ ok: true, answers: object } | { ok: false, error: string }}
 */
export function cleanAnswers(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "answers must be an object" };
  const out = blankAnswers();
  const blank = (v) => v === null || v === undefined || v === "";

  const number = (key, min, max, { whole = false } = {}) => {
    const v = input[key];
    if (blank(v)) return null;
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) {
      throw `${key} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}`;
    }
    return n;
  };
  const choice = (key, options) => {
    const v = input[key];
    if (blank(v)) return null;
    if (!options.includes(v)) throw `${key} must be one of: ${options.join(", ")}`;
    return v;
  };
  const list = (key, check) => {
    const v = input[key];
    if (blank(v)) return [];
    if (!Array.isArray(v) || v.length > 30) throw `${key} must be a list`;
    return [...new Set(v.map((x) => check(x)))];
  };
  const brand = (x) => {
    if (typeof x !== "string" || !x.trim() || x.length > 40) throw "brands must be names";
    return x.trim();
  };

  try {
    out.stand = number("stand", 1, 39, { whole: true });
    out.target = number("target", 1, 39, { whole: true });
    out.breakpoint = number("breakpoint", 1, 39, { whole: true });
    out.hands = choice("hands", HANDS);
    out.style = out.hands === "two" ? null : choice("style", STYLES);
    out.problems = list("problems", (x) => {
      if (!PROBLEMS.includes(x)) throw `problems must be from: ${PROBLEMS.join(", ")}`;
      return x;
    });
    // "None of these" only counts on its own
    if (out.problems.length > 1) out.problems = out.problems.filter((p) => p !== "none");
    out.speed = number("speed", 10, 25);
    out.speedBand = out.speed === null ? choice("speedBand", SPEED_BANDS) : null;
    out.pattern = choice("pattern", PATTERNS);
    out.oil = choice("oil", OILS);
    out.lanes = choice("lanes", LANES);
    out.revRate = number("revRate", 100, 700);
    out.revRateSource = out.revRate === null ? null : choice("revRateSource", REV_SOURCES);
    out.axisRotation = number("axisRotation", 0, 90);
    out.axisTilt = number("axisTilt", 0, 30);
    if (!blank(input.pap)) {
      if (typeof input.pap !== "string" || input.pap.length > 40) throw "pap must be a short note";
      out.pap = input.pap.trim() || null;
    }
    out.brandsInclude = list("brandsInclude", brand);
    out.brandsSkip = list("brandsSkip", brand).filter((b) => !out.brandsInclude.includes(b));
    out.releasedWithin = choice("releasedWithin", RELEASED_WITHIN) ?? "any";
  } catch (error) {
    if (typeof error === "string") return { ok: false, error };
    throw error;
  }
  return { ok: true, answers: out };
}

/* ---------- The estimate ---------- */

const M = PROFILE_MODEL;
const round5 = (x) => Math.round(x / 5) * 5;
const round1 = (x) => Math.round(x * 10) / 10;
const mid = ([a, b]) => (a + b) / 2;

function styleKey(a) {
  if (a.hands === "two") return "two";
  if (a.style) return a.style;
  return a.hands === "one" ? "oneHand" : "unknown";
}

function estimateSpeed(a, prior) {
  if (a.speed !== null) {
    const s = M.typedSpeedSpread;
    return { low: a.speed - s, high: a.speed + s, mid: a.speed, confidence: "high", told: true };
  }
  const range = a.speedBand ? M.speedBands[a.speedBand] : prior.speed;
  return { low: range[0], high: range[1], mid: mid(range), confidence: a.speedBand ? "medium" : "low", told: false };
}

/** Hook from the board answers, or null (with a note when they don't add up). */
function hookFromBoards(a, notes) {
  const { stand, target } = a;
  if (stand === null) return null;
  let breakpoint = a.breakpoint;
  let confidence = "high";
  if (breakpoint === null) {
    if (target === null || target > stand) return null;
    breakpoint = Math.max(1, target - M.breakpointFromTarget * (stand - target));
    confidence = "medium";
  }
  if (breakpoint > stand) {
    notes.push("Your breakpoint is further in than where you stand, so the boards were left out. Check you counted from the gutter on your bowling-hand side.");
    return null;
  }
  if (breakpoint >= M.pocketBoard) {
    notes.push("Your breakpoint is at or past the pocket (board 17.5), so the boards were left out.");
    return null;
  }
  const boards = stand - breakpoint + (M.pocketBoard - breakpoint);
  return { boards, confidence };
}

function hookLabel(boards) {
  return M.hookLabels.find(([below]) => boards < below)[1];
}

function makeHook(boards, confidence) {
  const spread = M.hookSpread[confidence];
  return {
    boards: round1(boards),
    low: Math.max(0, Math.round(boards - spread)),
    high: Math.round(boards + spread),
    label: hookLabel(boards),
    confidence,
  };
}

function estimateRevRate(a, prior, speed, boardHook, hasStyle) {
  if (a.revRate !== null) {
    const s = M.typedRpmSpread;
    return { low: a.revRate - s, high: a.revRate + s, mid: a.revRate, confidence: "high", told: true, source: a.revRateSource };
  }
  const styleMid = mid(prior.rpm);
  let rpm, confidence = "low";
  if (boardHook) {
    const fromHook = (M.ratioBase + M.ratioPerBoard * boardHook.boards) * speed.mid;
    if (hasStyle) {
      rpm = M.hookWeight * fromHook + (1 - M.hookWeight) * styleMid;
      const agree = Math.abs(fromHook - styleMid) / styleMid <= M.agreeWithin;
      if (agree && speed.confidence !== "low") confidence = "medium";
    } else {
      rpm = fromHook;
    }
  } else {
    rpm = styleMid;
  }
  const s = M.rpmSpread[confidence];
  return { low: round5(rpm * (1 - s)), high: round5(rpm * (1 + s)), mid: rpm, confidence, told: false };
}

function estimateMatchUp(a, speed, rev) {
  const m = M.matched;
  const matchedRpm = m.rpm + m.rpmPerMph * (speed.mid - m.screenSpeed);
  const fromNumbers = (rev.mid - matchedRpm) / m.rpmPerMph;
  const push = a.problems.reduce((sum, p) => sum + M.problemPush[p], 0);
  const score = fromNumbers + push;
  const [, key, label] = M.matchUpLabels.find(([below]) => score < below);

  let confidence, note = null;
  if (speed.told && rev.told) confidence = "high";
  else if (a.problems.includes("none")) confidence = "medium";
  else if (push === 0) confidence = "low";
  else if (Math.abs(fromNumbers) < 0.5 || Math.sign(push) === Math.sign(fromNumbers)) confidence = "medium";
  else {
    confidence = "low";
    note = "Your numbers and what goes wrong point different ways, so this one is a guess.";
  }
  if (a.problems.includes("early")) {
    const tooStrong = "A ball that hooks early and runs out of steam can also just be too strong for the lane.";
    note = note ? `${note} ${tooStrong}` : tooStrong;
  }
  return { key, label, score: round1(score), matchedRpm: round5(matchedRpm), confidence, note };
}

/** True when nothing that feeds the estimates has been answered. */
function nothingToGoOn(a) {
  return a.stand === null && a.hands === null && a.speed === null && a.speedBand === null && a.revRate === null;
}

/**
 * The estimated profile for a set of answers (run cleanAnswers first), or
 * null when there's nothing to go on yet.
 */
export function estimateProfile(answers) {
  const a = { ...blankAnswers(), ...answers };
  if (nothingToGoOn(a)) return null;
  const notes = [];
  const key = styleKey(a);
  const prior = M.styles[key];
  const hasStyle = key !== "unknown" && key !== "oneHand";

  const speed = estimateSpeed(a, prior);
  const boardHook = hookFromBoards(a, notes);
  const revRate = estimateRevRate(a, prior, speed, boardHook, hasStyle);
  const matchUp = estimateMatchUp(a, speed, revRate);

  // No usable boards: work the hook back from the rev-to-speed ratio
  const hook = boardHook
    ? makeHook(boardHook.boards, boardHook.confidence)
    : makeHook(Math.max(0, (revRate.mid / speed.mid - M.ratioBase) / M.ratioPerBoard), "low");
  if (!boardHook && a.stand === null) notes.push("Tell us where you stand and where the ball breaks (question 1): it's the biggest clue to your revs and hook.");

  return {
    speed: { ...speed, mid: round1(speed.mid) },
    revRate: { ...revRate, mid: round5(revRate.mid) },
    matchUp,
    hook,
    notes,
  };
}
