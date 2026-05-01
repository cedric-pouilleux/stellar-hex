---
layout: home

hero:
  name: StellexJS
  text: Corps stellaires procéduraux, géométrie hexagonale jouable, physique, simulation et rendu

features:
  - title: Trois points d'entrée
    details: Importez depuis <code>/sim</code> pour la logique pure (Node, worker, CLI), <code>/core</code> pour Three.js vanilla, ou <code>/</code> pour la surface Vue + TresJS complète.
  - title: Déterministe par seed
    details: Un <code>name</code> pilote chaque étape (FBm, voronoi continents, anneaux, variation shader). Même seed, même planète, byte-à-byte — du serveur au client.
  - title: Planètes + étoiles
    details: Pipeline planétaire (3 archétypes <code>terrain / bands / metallic</code>) ou stellaire (7 classes spectrales O–M, granulation, corona, godrays calibrés).
  - title: Tuiles hexagonales jouables
    details: Hexasphère subdivisible, voisinage 6-way, raycasting BVH, dual board sol + atmo, hover unifié, overlays per-tile sans rebuild.
  - title: Atmosphère, anneaux, océans
    details: Couches modulaires assemblées via <code>useBody</code> ou les composants <code>&lt;Body&gt;</code> / <code>&lt;BodyRings&gt;</code>. Anneaux à 12 archétypes, atmo halo procédural, océan animé (vagues, foam, fresnel).
  - title: Backend-ready
    details: <code>/sim</code> tourne sans WebGL — pré-calcul serveur, worker, batch, tests CI sans <code>jsdom</code>. Sérialisable et rejouable depuis le seed seul.
---
