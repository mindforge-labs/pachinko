/** Per-reel tech catalogs: FE | BE | DB */
export const REEL_LAYERS = ['fe', 'be', 'db'];

export const LAYER_LABELS = {
  fe: 'Frontend',
  be: 'Backend',
  db: 'Database',
};

export const TECH_STACK = {
  fe: [
    { id: 'react', name: 'React', short: 'REACT' },
    { id: 'vue', name: 'Vue', short: 'VUE' },
    { id: 'svelte', name: 'Svelte', short: 'SVLT' },
    { id: 'next', name: 'Next.js', short: 'NEXT' },
    { id: 'angular', name: 'Angular', short: 'NGLR' },
    { id: 'solid', name: 'Solid', short: 'SLID' },
  ],
  be: [
    { id: 'node', name: 'Node.js', short: 'NODE' },
    { id: 'go', name: 'Go', short: 'GO' },
    { id: 'rust', name: 'Rust', short: 'RUST' },
    { id: 'django', name: 'Django', short: 'DJNG' },
    { id: 'rails', name: 'Rails', short: 'RAIL' },
    { id: 'fastapi', name: 'FastAPI', short: 'FAST' },
  ],
  db: [
    { id: 'postgres', name: 'Postgres', short: 'PG' },
    { id: 'mongo', name: 'MongoDB', short: 'MONGO' },
    { id: 'redis', name: 'Redis', short: 'REDIS' },
    { id: 'mysql', name: 'MySQL', short: 'MYSQL' },
    { id: 'sqlite', name: 'SQLite', short: 'SQLT' },
    { id: 'dynamo', name: 'DynamoDB', short: 'DYNO' },
  ],
};

export function layerForReel(index) {
  return REEL_LAYERS[index] ?? 'fe';
}

export function techById(layer, id) {
  return TECH_STACK[layer]?.find((item) => item.id === id) ?? null;
}

export function pickTech(index, random = Math.random) {
  const layer = layerForReel(index);
  const pool = TECH_STACK[layer];
  return pool[Math.floor(random() * pool.length)].id;
}

export function describeStack(symbols = []) {
  return symbols.map((id, index) => {
    const layer = layerForReel(index);
    const tech = techById(layer, id);
    return {
      layer,
      layerLabel: LAYER_LABELS[layer],
      id,
      name: tech?.name ?? id,
      short: tech?.short ?? String(id).toUpperCase(),
    };
  });
}
