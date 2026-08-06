<script lang="ts">
  // ESQUELETO — substituído na branch feat/web-ui pelas telas reais:
  // setup/auth (RF-01..RF-06), lista + filtros (RF-10..RF-18),
  // conversão (RF-20..RF-26) e snapshot/diff (RF-30..RF-35).
  import { PRIORITY_COLORS, PRIORITY_LABELS, ALL_PRIORITIES } from '@anilist-updater/core';
</script>

<main>
  <h1>AniList Manager</h1>
  <p class="sub">Esqueleto do monorepo. As telas chegam na branch <code>feat/web-ui</code>.</p>

  <ul class="scale">
    {#each ALL_PRIORITIES as priority (priority)}
      <li>
        <span class="dot" style="--c: {PRIORITY_COLORS[priority]}">{priority}</span>
        {PRIORITY_LABELS[priority]}
      </li>
    {/each}
  </ul>
</main>

<style>
  main {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h1 {
    font-size: 1.3rem;
  }

  .sub {
    color: var(--fg-muted);
    font-size: 0.82rem;
  }

  .scale {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
  }

  .scale li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--c);
    color: var(--c);
    font-size: 0.78rem;
    font-weight: 700;
  }
</style>
