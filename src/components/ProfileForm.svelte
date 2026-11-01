<script>
  // Your game: the questions, with the profile worked out live as you answer
  // (src/lib/profile.js) and saved with PUT /api/profile. Every question is
  // optional. The order is docs/BOWLING.md's: what tells us most comes first.
  import ProfileResult from "./ProfileResult.svelte";
  import { blankAnswers, cleanAnswers, estimateProfile } from "../lib/profile.js";

  const BOARDS = Array.from({ length: 39 }, (_, i) => i + 1);
  const ARROWS = { 5: "1st arrow", 10: "2nd arrow", 15: "3rd arrow", 20: "4th arrow", 25: "5th arrow", 30: "6th arrow", 35: "7th arrow" };
  const boardLabel = (n) => (ARROWS[n] ? `${n} (${ARROWS[n]})` : String(n));

  const STYLES = [
    { value: "stroker", label: "Straighter, smooth roll", hint: "Stroker: a smooth, even release with a gentle arc." },
    { value: "tweener", label: "In between", hint: "Tweener: some hook, some speed, neither extreme." },
    { value: "cranker", label: "Big hook, lots of turn", hint: "Cranker: a strong wrist and a lot of revs." },
  ];
  const PROBLEMS = [
    { value: "early", label: "Hooks early and runs out of steam" },
    { value: "skids", label: "Skids too far and doesn't come back" },
    { value: "dry", label: "Hard to control once the lanes dry out" },
    { value: "heavy", label: "Can't get it to turn on heavy oil" },
    { value: "none", label: "None of these, it mostly does what I want" },
  ];
  const SPEED_BANDS = [
    { value: "slow", label: "Slow (about 12.5–14.5)" },
    { value: "medium", label: "Medium (14.5–16.5)" },
    { value: "fast", label: "Fast (16.5–18.5)" },
  ];

  let answers = $state(blankAnswers());
  let brands = $state([]);
  let loading = $state(true);
  let saving = $state(false);
  let savedAt = $state(null);
  let savedJson = $state(JSON.stringify(blankAnswers()));
  let error = $state("");

  const clean = $derived(cleanAnswers(answers));
  const profile = $derived(clean.ok ? estimateProfile(clean.answers) : null);
  const changed = $derived(clean.ok && JSON.stringify(clean.answers) !== savedJson);

  async function request(method, body) {
    const res = await fetch("/api/profile", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function take(data) {
    if (data.answers) answers = { ...blankAnswers(), ...data.answers };
    savedAt = data.savedAt;
    savedJson = JSON.stringify(cleanAnswers(answers).answers);
  }

  async function load() {
    try {
      take(await request("GET"));
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
    // The brands for question 8 come from the ball list
    try {
      const res = await fetch("/api/balls");
      if (res.ok) brands = [...new Set((await res.json()).balls.map((b) => b.brand))].sort();
    } catch {
      // Not fatal: question 8 just shows no brands
    }
  }
  load();

  async function save(e) {
    e.preventDefault();
    if (!clean.ok) return;
    saving = true;
    error = "";
    try {
      take(await request("PUT", { answers: clean.answers }));
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  // "None of these" and the other problems rule each other out
  function toggleProblem(value, on) {
    if (!on) answers.problems = answers.problems.filter((p) => p !== value);
    else if (value === "none") answers.problems = ["none"];
    else answers.problems = [...answers.problems.filter((p) => p !== "none"), value];
  }

  function brandState(b) {
    return answers.brandsInclude.includes(b) ? "include" : answers.brandsSkip.includes(b) ? "skip" : "";
  }
  function setBrand(b, state) {
    answers.brandsInclude = answers.brandsInclude.filter((x) => x !== b);
    answers.brandsSkip = answers.brandsSkip.filter((x) => x !== b);
    if (state === "include") answers.brandsInclude.push(b);
    if (state === "skip") answers.brandsSkip.push(b);
  }

  const when = (d) => new Date(d.replace(" ", "T") + "Z").toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
</script>

{#if loading}
  <p class="muted">Loading…</p>
{:else}
  <div class="profile-layout">
    <form class="questions" onsubmit={save}>
      <fieldset>
        <legend>1. Where you play on a fresh house shot</legend>
        <p class="small muted">Count boards from the gutter on your bowling-hand side: the edge board is 1, the arrows are 5, 10, 15 and so on.</p>
        <div class="row">
          <label>
            <span>Board your sliding foot is on</span>
            <select bind:value={answers.stand}>
              <option value={null}>Not sure</option>
              {#each BOARDS as n}<option value={n}>{n}</option>{/each}
            </select>
          </label>
          <label>
            <span>Board or arrow you aim at</span>
            <select bind:value={answers.target}>
              <option value={null}>Not sure</option>
              {#each BOARDS as n}<option value={n}>{boardLabel(n)}</option>{/each}
            </select>
          </label>
          <label>
            <span>Where it starts turning back (breakpoint)</span>
            <select bind:value={answers.breakpoint}>
              <option value={null}>Not sure</option>
              {#each BOARDS as n}<option value={n}>{n}</option>{/each}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>2. Your style</legend>
        <div class="choices">
          <label class="choice"><input type="radio" bind:group={answers.hands} value="one" /> One hand</label>
          <label class="choice"><input type="radio" bind:group={answers.hands} value="two" /> Two hands</label>
        </div>
        {#if answers.hands === "one"}
          <p class="small muted">Which sounds most like you?</p>
          <div class="choices stacked">
            {#each STYLES as s}
              <label class="choice">
                <input type="radio" bind:group={answers.style} value={s.value} />
                <span>{s.label}<br /><span class="small muted">{s.hint}</span></span>
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>

      <fieldset>
        <legend>3. What goes wrong most?</legend>
        <p class="small muted">Pick any.</p>
        <div class="choices stacked">
          {#each PROBLEMS as p}
            <label class="choice">
              <input type="checkbox" checked={answers.problems.includes(p.value)} onchange={(e) => toggleProblem(p.value, e.currentTarget.checked)} />
              {p.label}
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend>4. Ball speed</legend>
        <label>
          <span>What the lane screen shows for your strike ball (mph)</span>
          <input type="number" inputmode="decimal" min="10" max="25" step="0.1" bind:value={answers.speed} placeholder="e.g. 16.2" />
        </label>
        {#if answers.speed === null || answers.speed === undefined || answers.speed === ""}
          <p class="small muted">No number? Pick the closest:</p>
          <div class="choices">
            {#each SPEED_BANDS as b}
              <label class="choice"><input type="radio" bind:group={answers.speedBand} value={b.value} /> {b.label}</label>
            {/each}
            <label class="choice"><input type="radio" bind:group={answers.speedBand} value={null} /> Not sure</label>
          </div>
        {/if}
      </fieldset>

      <fieldset>
        <legend>5. Where you bowl</legend>
        <p class="small muted">Not part of the profile above; it's used for recommendations.</p>
        <div class="row">
          <label>
            <span>Lane patterns</span>
            <select bind:value={answers.pattern}>
              <option value={null}>Not sure</option>
              <option value="house">Mostly house shots</option>
              <option value="mix">A mix</option>
              <option value="sport">Mostly sport or PBA patterns</option>
            </select>
          </label>
          <label>
            <span>Usual oil</span>
            <select bind:value={answers.oil}>
              <option value={null}>Not sure</option>
              <option value="heavy">Heavy</option>
              <option value="medium">Medium</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>
            <span>Lanes</span>
            <select bind:value={answers.lanes}>
              <option value={null}>Not sure</option>
              <option value="wood">Wood</option>
              <option value="synthetic">Synthetic</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>6. Numbers you know</legend>
        <p class="small muted">Skip any you don't know. A rev rate here replaces the estimate.</p>
        <div class="row">
          <label>
            <span>Rev rate (rpm)</span>
            <input type="number" inputmode="numeric" min="100" max="700" step="1" bind:value={answers.revRate} />
          </label>
          {#if answers.revRate}
            <label>
              <span>Where it came from</span>
              <select bind:value={answers.revRateSource}>
                <option value={null}>Not saying</option>
                <option value="pro_shop">Pro shop</option>
                <option value="video">Video</option>
                <option value="other">Other</option>
              </select>
            </label>
          {/if}
          <label>
            <span>Axis rotation (°)</span>
            <input type="number" inputmode="numeric" min="0" max="90" bind:value={answers.axisRotation} />
          </label>
          <label>
            <span>Axis tilt (°)</span>
            <input type="number" inputmode="numeric" min="0" max="30" bind:value={answers.axisTilt} />
          </label>
          <label>
            <span>PAP</span>
            <input type="text" maxlength="40" bind:value={answers.pap} placeholder="e.g. 5 3/4 over, 1/2 up" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>7. Preferences</legend>
        <p class="small muted">Used for recommendations.</p>
        <label>
          <span>Release date</span>
          <select bind:value={answers.releasedWithin}>
            <option value="any">Any age</option>
            <option value="2y">Released in the last 2 years</option>
            <option value="1y">Released in the last 12 months</option>
          </select>
        </label>
        {#if brands.length}
          <p class="small muted">Brands</p>
          <div class="brand-picks">
            {#each brands as b}
              <label>
                <span>{b}</span>
                <select value={brandState(b)} onchange={(e) => setBrand(b, e.currentTarget.value)}>
                  <option value="">Either</option>
                  <option value="include">Include</option>
                  <option value="skip">Skip</option>
                </select>
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>

      <div class="save-bar">
        <button class="btn primary" type="submit" disabled={saving || !clean.ok || !changed}>{saving ? "Saving…" : "Save my answers"}</button>
        <span class="small muted" aria-live="polite">
          {#if !clean.ok}{clean.error}
          {:else if changed}Not saved yet
          {:else if savedAt}Saved {when(savedAt)}{/if}
        </span>
      </div>
      {#if error}<p class="notice" role="alert">{error}</p>{/if}
    </form>

    <ProfileResult {profile} />
  </div>
{/if}
