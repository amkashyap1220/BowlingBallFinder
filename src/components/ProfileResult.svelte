<script>
  // The estimated profile panel: speed, rev rate, match-up and hook, each
  // with how sure we are. Worked out by src/lib/profile.js; this only shows it.
  let { profile } = $props();

  const SURE = { high: "Sure", medium: "Fairly sure", low: "Rough guess" };
  const HEDGE = { high: "", medium: "Probably ", low: "Maybe " };
  const SOURCE = { pro_shop: "from your pro shop", video: "from video", other: "you told us" };
  const MATCH_UP = {
    "speed-dominant": "Your speed outruns your revs: the ball tends to go long and hook less than you'd like.",
    "slightly-speed": "Your speed is a little ahead of your revs.",
    balanced: "Your revs and speed are well matched.",
    "slightly-rev": "Your revs are a little ahead of your speed.",
    "rev-dominant": "Your revs outrun your speed: the ball tends to read the lane early and hook a lot.",
  };

  const mph = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
</script>

<section class="result card" aria-live="polite">
  <h2 class="section-title">Your profile</h2>
  {#if !profile}
    <p class="muted">Answer a question or two (where you stand and your style tell the most) and your profile shows up here.</p>
  {:else}
    <dl class="result-list">
      <div>
        <dt>Ball speed <span class="sure {profile.speed.confidence}">{SURE[profile.speed.confidence]}</span></dt>
        <dd>
          {#if profile.speed.told}{mph(profile.speed.mid)} mph, you told us
          {:else}{HEDGE[profile.speed.confidence]}{mph(profile.speed.low)}–{mph(profile.speed.high)} mph{/if}
        </dd>
        <dd class="small muted">As the lane screen shows it.</dd>
      </div>
      <div>
        <dt>Rev rate <span class="sure {profile.revRate.confidence}">{SURE[profile.revRate.confidence]}</span></dt>
        <dd>
          {#if profile.revRate.told}{profile.revRate.mid} rpm, {SOURCE[profile.revRate.source] ?? "you told us"}
          {:else}{HEDGE[profile.revRate.confidence]}{profile.revRate.low}–{profile.revRate.high} rpm{/if}
        </dd>
      </div>
      <div>
        <dt>Revs vs. speed <span class="sure {profile.matchUp.confidence}">{SURE[profile.matchUp.confidence]}</span></dt>
        <dd>{HEDGE[profile.matchUp.confidence]}{HEDGE[profile.matchUp.confidence] ? profile.matchUp.label.toLowerCase() : profile.matchUp.label}</dd>
        <dd class="small muted">{MATCH_UP[profile.matchUp.key]}{profile.matchUp.note ? ` ${profile.matchUp.note}` : ""}</dd>
      </div>
      <div>
        <dt>Hook <span class="sure {profile.hook.confidence}">{SURE[profile.hook.confidence]}</span></dt>
        <dd>{cap(profile.hook.label)}: about {profile.hook.low}–{profile.hook.high} boards</dd>
        <dd class="small muted">Boards out to your breakpoint plus back to the pocket, on a fresh house shot.</dd>
      </div>
    </dl>
    {#each profile.notes as note}<p class="small notice">{note}</p>{/each}
    <p class="small muted">These are estimates from your answers. A speed or rev rate you know (from the lane screen, a pro shop or video) replaces the guess.</p>
  {/if}
</section>
