<script setup lang="ts">
/**
 * Layered-architecture description rendered via `home-features-before`,
 * just above the features grid. Five small cards on a single row at
 * desktop width — one per body layer — collapsing to fewer columns on
 * narrower viewports.
 */

interface BodyLayer {
  name:    string
  details: string
}

const layers: BodyLayer[] = [

]
</script>

<template>
  <section class="home-intro" aria-label="Architecture de StellexJS">
    <dl class="home-intro__grid">
      <div v-for="layer in layers" :key="layer.name" class="home-intro__card">
        <dt class="home-intro__name">{{ layer.name }}</dt>
        <dd class="home-intro__details">{{ layer.details }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.home-intro {
  max-width: 1152px;
  margin: 0 auto;
  pointer-events: none;
}

@media (max-width: 960px) { .home-intro { padding: 8px 48px 24px 48px; } }
@media (max-width: 768px) { .home-intro { padding: 4px 24px 20px 24px; } }

/* Head */
.home-intro__head { margin: 0 0 16px 0; }

.home-intro__eyebrow {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 6px;
}

.home-intro__title {
  font-size: clamp(18px, 1.7vw, 22px);
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.92);
  margin: 0;
  border: 0;
  padding: 0;
}

/* Cards */
.home-intro__grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
}

.home-intro__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.035);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.005);
  backdrop-filter: blur(50px) saturate(100%);
  -webkit-backdrop-filter: blur(50px) saturate(100%);
  transition: background 200ms ease, border-color 200ms ease;
}

.home-intro__card:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.10);
}

.home-intro__name {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
}

.home-intro__details {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.55);
}

/* Responsive collapse */
@media (max-width: 1024px) {
  .home-intro__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .home-intro__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 420px) {
  .home-intro__grid { grid-template-columns: 1fr; }
}
</style>
