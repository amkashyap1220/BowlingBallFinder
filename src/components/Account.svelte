<script>
  // Who's signed in, in the header, with a sign-out link. Loads GET /api/me,
  // which also creates the person's row the first time they visit.
  // Sign-out is Cloudflare Access's own address on this domain.
  let user = $state(null);
  let error = $state("");

  async function load() {
    try {
      const res = await fetch("/api/me");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      user = body.user;
    } catch (err) {
      error = err.message;
    }
  }
  load();
</script>

<div class="account">
  {#if user}
    <span>Signed in as <b>{user.name || user.email}</b></span>
  {:else if error}
    <span class="notice" role="alert">{error}</span>
  {/if}
  <a href="/cdn-cgi/access/logout">Sign out</a>
</div>
