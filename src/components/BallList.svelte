<script>
  // The ball list: filters, sorting, and the balls as a table (wide screens)
  // or cards (phones). Filtering is done by GET /api/balls; sorting happens
  // here, on the balls already loaded.
  const COVERS = [
    { value: "", label: "Any cover" },
    { value: "solid", label: "Solid" },
    { value: "hybrid", label: "Hybrid" },
    { value: "pearl", label: "Pearl" },
    { value: "urethane", label: "Urethane" },
  ];
  const CORES = [
    { value: "", label: "Any core" },
    { value: "symmetric", label: "Symmetric" },
    { value: "asymmetric", label: "Asymmetric" },
  ];
  // How each column sorts. Balls missing the value always go last.
  const SORTS = {
    name: { label: "Brand and name", get: (b) => `${b.brand} ${b.name}`.toLowerCase() },
    released: { label: "Newest first", get: (b) => b.releaseDate, desc: true },
    rg: { label: "RG (low to high)", get: (b) => b.rg },
    differential: { label: "Differential (high to low)", get: (b) => b.differential, desc: true },
    massBias: { label: "Mass bias (high to low)", get: (b) => b.massBias, desc: true },
    cover: { label: "Cover type", get: (b) => b.coverstock.type },
  };

  let brands = $state([]);
  let balls = $state([]);
  let loading = $state(true);
  let error = $state("");

  let brand = $state("");
  let cover = $state("");
  let core = $state("");
  let after = $state("");
  let sortKey = $state("name");
  let reversed = $state(false);

  const sorted = $derived.by(() => {
    const s = SORTS[sortKey];
    const dir = (s.desc ? -1 : 1) * (reversed ? -1 : 1);
    return [...balls].sort((a, b) => {
      const x = s.get(a), y = s.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;   // unknowns last
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  });

  async function load() {
    const q = new URLSearchParams();
    if (brand) q.set("brand", brand);
    if (cover) q.set("cover", cover);
    if (core) q.set("core", core);
    if (after) q.set("after", after);
    loading = true;
    error = "";
    try {
      const res = await fetch("/api/balls" + (q.size ? "?" + q : ""));
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      balls = body.balls;
      if (!brands.length) brands = [...new Set(body.balls.map((b) => b.brand))].sort();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Reload whenever a filter changes (and once at the start)
  $effect(() => {
    [brand, cover, core, after];
    load();
  });

  function sortBy(key) {
    if (sortKey === key) reversed = !reversed;
    else {
      sortKey = key;
      reversed = false;
    }
  }
  const ariaSort = (key) => (sortKey === key ? ((SORTS[key].desc ? !reversed : reversed) ? "descending" : "ascending") : undefined);

  function clear() {
    brand = cover = core = after = "";
  }

  const n3 = (v) => (v == null ? "–" : v.toFixed(3));
  const rg = (v) => (v == null ? "–" : String(v));   // as precise as the maker gives it
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const date = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "–");
  const surface = (b) => [b.surface.text, b.surface.finish === "polished" ? "polished" : ""].filter(Boolean).join(", ");
</script>

<form class="filters" onsubmit={(e) => e.preventDefault()}>
  <label>
    <span>Brand</span>
    <select bind:value={brand}>
      <option value="">All brands</option>
      {#each brands as b}<option value={b}>{b}</option>{/each}
    </select>
  </label>
  <label>
    <span>Cover</span>
    <select bind:value={cover}>
      {#each COVERS as c}<option value={c.value}>{c.label}</option>{/each}
    </select>
  </label>
  <label>
    <span>Core</span>
    <select bind:value={core}>
      {#each CORES as c}<option value={c.value}>{c.label}</option>{/each}
    </select>
  </label>
  <label>
    <span>Released after</span>
    <input type="date" bind:value={after} />
  </label>
  <label class="sort-pick">
    <span>Sort</span>
    <select bind:value={sortKey} onchange={() => (reversed = false)}>
      {#each Object.entries(SORTS) as [key, s]}<option value={key}>{s.label}</option>{/each}
    </select>
  </label>
  <button type="button" class="btn" onclick={clear}>Clear</button>
</form>

{#if error}
  <p class="notice" role="alert">{error}</p>
{:else}
  <p class="muted count" aria-live="polite">
    {loading ? "Loading…" : `${balls.length} ${balls.length === 1 ? "ball" : "balls"}`}{after && !loading ? " (balls with no known release date are hidden)" : ""}
  </p>
{/if}

{#if sorted.length}
  <table class="balls-table">
    <thead>
      <tr>
        <th aria-sort={ariaSort("name")}><button onclick={() => sortBy("name")}>Ball</button></th>
        <th aria-sort={ariaSort("released")}><button onclick={() => sortBy("released")}>Released</button></th>
        <th aria-sort={ariaSort("cover")}><button onclick={() => sortBy("cover")}>Cover</button></th>
        <th>Core</th>
        <th class="num" aria-sort={ariaSort("rg")}><button onclick={() => sortBy("rg")}>RG</button></th>
        <th class="num" aria-sort={ariaSort("differential")}><button onclick={() => sortBy("differential")}>Diff</button></th>
        <th class="num" aria-sort={ariaSort("massBias")}><button onclick={() => sortBy("massBias")}>Mass bias</button></th>
        <th>Surface</th>
        <th>Specs</th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as b (b.id)}
        <tr>
          <td><span class="muted">{b.brand}</span><br /><b>{b.name}</b>{#if b.line}<br /><span class="muted small">{b.line}</span>{/if}</td>
          <td>{date(b.releaseDate)}</td>
          <td>{cap(b.coverstock.type)}<br /><span class="muted small">{b.coverstock.name}</span></td>
          <td>{cap(b.core.type)}<br /><span class="muted small">{b.core.name}</span></td>
          <td class="num">{rg(b.rg)}</td>
          <td class="num">{n3(b.differential)}</td>
          <td class="num">{n3(b.massBias)}</td>
          <td class="small">{surface(b)}</td>
          <td class="small"><a href={b.sourceUrl} target="_blank" rel="noopener">Maker's page</a>{#if b.notes}<br /><span class="muted" title={b.notes}>Note</span>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <ul class="ball-cards">
    {#each sorted as b (b.id)}
      <li class="card">
        <span class="muted small">{b.brand}{b.line ? ` · ${b.line}` : ""}</span>
        <h3>{b.name}</h3>
        <dl>
          <dt>Released</dt><dd>{date(b.releaseDate)}</dd>
          <dt>Cover</dt><dd>{cap(b.coverstock.type)} <span class="muted">({b.coverstock.name})</span></dd>
          <dt>Core</dt><dd>{cap(b.core.type)} <span class="muted">({b.core.name})</span></dd>
          <dt>RG / Diff</dt><dd>{rg(b.rg)} / {n3(b.differential)}</dd>
          <dt>Mass bias</dt><dd>{n3(b.massBias)}</dd>
          <dt>Surface</dt><dd>{surface(b)}</dd>
        </dl>
        {#if b.notes}<p class="small muted">{b.notes}</p>{/if}
        <a class="small" href={b.sourceUrl} target="_blank" rel="noopener">Specs from the maker's page</a>
      </li>
    {/each}
  </ul>
{:else if !loading && !error}
  <p>No balls match these filters. <button type="button" class="link" onclick={clear}>Clear the filters</button></p>
{/if}
