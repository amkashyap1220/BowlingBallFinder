# Bowling knowledge for this app

What the app needs to know about balls and bowlers. Milestones 1–5 build on
this. It's a starting point: correct it as the three users give feedback.

## The problem

Serious bowlers already own 6–12 balls, and dozens of new balls come out every
year. The useful question isn't "what's a good ball?" but **"what reaction is
my arsenal missing, for how I bowl and where I bowl?"**

## Ball data

Makers publish these for every ball (USBC's approved-ball list confirms a ball
is legal; the specs come from the maker's own page):

| Spec | What it means | Effect |
| --- | --- | --- |
| RG (radius of gyration), ~2.46–2.60 | How the core's weight is spread | Low revs up early; high goes longer before it turns |
| Differential, ~0.010–0.060 | How unevenly the core spins | Higher means more flare and more total hook |
| Mass bias / intermediate diff, 0–~0.020 | Asymmetry of the core | Higher (asymmetric) means a sharper, quicker move at the end of the oil |
| Core type | Symmetric or asymmetric | As above |
| Coverstock type | Solid, hybrid, pearl, urethane (and plastic for spares) | Solid: most friction, early and smooth. Pearl: length and a sharp backend. Hybrid: between. Urethane: early, smooth, controlled |
| Coverstock name | e.g. a maker's named reactive cover | Same type can differ in strength between covers |
| Factory surface | e.g. 2000/3000/4000 grit, polished or not | Rougher grips earlier; polished goes longer and turns harder |
| Release date, line/tier | e.g. top of the line vs. mid-performance | Filtering, and "what's new" |

Brands' own "hook" or "flare" ratings use different scales: don't use them.
Specs are only part of the story: two balls with similar numbers can still
react differently. The app should say its picks are a shortlist for a pro shop
conversation, not a final answer.

## The bowler

What drives ball reaction, and how a bowler can tell us without knowing numbers:

| Factor | Typical range | How we learn it |
| --- | --- | --- |
| Ball speed | 13–22 mph at release (lower at the pins) | Scoring monitors in many centers show it; video; or "slow / medium / fast" |
| Rev rate | ~200 (stroker) to 500+ (two-handers) rpm | Video; or style (stroker, tweener, cranker, two-handed) |
| Rev-to-speed match-up | Balanced, rev-dominant, speed-dominant | From "what goes wrong" answers; or from measured numbers |
| Axis rotation / tilt | 0–90° / 0–25° | Pro shop; or skip. Too hard to measure from a phone video |
| PAP (positive axis point) | Measured on the ball | Pro shop only; optional |
| Total hook | Boards from where they stand to the breakpoint | From where they stand and where it breaks (below) |

## The questions

Every question is optional and in plain words. In order of how much they tell us:

1. **Where you play on a fresh house shot:** board you stand on, arrow/board you
   target, board where the ball turns (breakpoint). Stand 35 / target 15 /
   break 8 is a lot of hook; stand 20 / target 10 / break 6 is little.
   This one answer reflects speed, revs and axis together.
2. **Style:** one- or two-handed; straighter (stroker), in between (tweener),
   or big hook (cranker). Show a short picture or description of each.
3. **What goes wrong:** "hooks early and dies" (rev-dominant, or ball too
   strong); "skids and doesn't come back" (speed-dominant); "over/under-reacts
   when the lanes break down"; "can't get it to turn on heavy oil"; etc.
4. **Ball speed** if the monitor shows it.
5. **Where you bowl:** house shot vs. sport/PBA patterns, how often each; oil
   heavy/medium/light; lanes wood or synthetic if known.
6. **Their arsenal** (milestone 3) and which ball they reach for first.
7. **Known numbers** (optional): rev rate, axis rotation and tilt, PAP.
8. **Preferences:** brands to include or skip, newer releases only. No budget:
   the app is about finding the right reaction, not price.

`profile.js` turns these into estimated **ranges** with a confidence, e.g.
"probably 300–380 rpm, balanced". Measured numbers replace them.

## Profile math (milestone 2; numbers in `PROFILE_MODEL`, to be tuned)

**Speed** is always the speed the lane screen shows. Published rules of thumb
use release speed, and screens read about 2 mph lower (they measure down the
lane), so the published numbers are shifted by 2 mph.

Starting point from style, from the usual published rev split (strokers under
300 rpm, tweeners 300–370, crankers over 400, two-handers up to 600) and an
average release speed of 17–18 mph:

| Style | Screen speed (mph) | Rev rate (rpm) |
| --- | --- | --- |
| Stroker | 14–16 | 200–300 |
| Tweener | 15–17 | 300–370 |
| Cranker | 15.5–18 | 400–500 |
| Two hands | 14–17 | 400–550 |

Worked out in this order, each step using the one before:

1. **Speed:** a typed number ±0.5 (high); Slow 12.5–14.5 / Medium 14.5–16.5 /
   Fast 16.5–18.5 (medium); else the style range (low).
2. **Hook** = boards out to the breakpoint plus boards back to the pocket:
   (stand − breakpoint) + (17.5 − breakpoint). ±3 boards (high). With no
   breakpoint, it's guessed as target − 0.35 × (stand − target) (gives 8 for
   35/15, 6.5 for 20/10), ±4 (medium). Labels: under 20 a little, 20–29
   moderate, 30–35 strong, 36+ big.
3. **Rev rate:** rpm per mph = 7 + 0.55 × hook; times speed gives rpm from
   hook. Blend 60% that and 40% the middle of the style range. Medium (±12%)
   when boards, a speed and a style are all given and the two agree within
   15%; else low (±20%). A typed rev rate is ±15 (high).
4. **Match-up:** matched is 300 rpm at 17 mph release, ±50 rpm per mph, so
   matched rpm = 300 + 50 × (screen speed − 15). Score = (rpm − matched) ÷ 50,
   plus "what goes wrong": hooks early +1, hard to control when dry +0.5,
   skids −1, won't turn on heavy oil −0.5. Below −1.5 speed-dominant, to −0.5
   slightly, to +0.5 balanced, to +1.5 slightly rev-dominant, above that
   rev-dominant. "Leaves corner pins" was left out: it happens both ways.
5. With no board answers, hook is worked back from the ratio (low).

The four example bowlers (stroker, tweener, cranker, two-hander) in
`tests/profile.test.mjs` are the ones worked through by hand and agreed with
the users. Sources: [Motiv](https://www.motivbowling.com/blog/am-i-rev-or-speed-dominant.html)
(averages, 50 rpm per mph), [ballreviews.com](https://www.ballreviews.com/miscellaneous/rev-rate-vs-ball-speed/)
(300 at 17 baseline, release speed, screens 2–3 mph lower),
[Wikipedia: Bowling form](https://en.wikipedia.org/wiki/Bowling_form) (rev
ranges by style). Lane screens differ between centers, so the 2 mph shift is
the first thing to tune.

## Scoring (first version, to be tuned)

1. Turn each ball into **reaction scores** (0–100) from its specs:
   - **Total hook**: coverstock type and strength, factory surface, differential
   - **Length** (how far before it turns): RG, cover (pearl/polish = more),
     surface (rough = less)
   - **Backend shape** (smooth arc vs. sharp turn): mass bias, cover type, polish
   A user's surface change (e.g. sanding to 2000) shifts hook and length.
2. From the profile and conditions, work out the **reaction this bowler
   needs**. High revs on short/light oil need more length and less hook; high
   speed and low revs need early friction (solid, rough, low RG).
3. Plot the user's arsenal on the same scores, find **the biggest empty spot**
   among the reactions they need, and rank balls that fill it best.
4. Show the top 3–5 with **a reason** for each, e.g. "Fills the gap between
   your X and your Y: more length than X, sharper backend than Y."

Keep every weight in one named object in `src/lib/score.js` so it can be tuned.

## Video

What a phone video can measure:

| Measurement | Difficulty | How |
| --- | --- | --- |
| Ball speed | Easy | ~60 ft from foul line to head pin. Speed = 60 ft ÷ (frames between release and pin hit ÷ fps). This is the *average* speed; release speed is higher |
| Rev rate | Medium | Count full turns of a mark (logo, thumb hole, a piece of tape) over a number of frames: rpm = turns ÷ (frames ÷ fps) × 60 |
| Axis rotation / tilt | Hard | Needs the 3D spin axis from 2D video; research-level (milestone 7) |
| PAP | Not from video | Ask, or skip |

Recording tips to show users:
- Use **slow motion (120 or 240 fps)**. At 30 fps a 400 rpm ball turns ~80°
  between frames, too far to count reliably
- Film from behind, steady (tripod or both hands), the whole lane in view if
  possible
- A strip of bright tape on the ball makes turns easy to count
- Some phones export slow-motion clips at 30 fps: check the clip still plays
  slowly. The app asks the user to confirm the fps because browsers can't read
  it reliably
