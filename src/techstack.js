/** Per-reel tech catalogs: FE | BE | DB */
export const REEL_LAYERS = ['fe', 'be', 'db'];

export const LAYER_LABELS = {
  fe: 'Frontend',
  be: 'Backend',
  db: 'Database',
};

export const TECH_STACK = {
  fe: [
    { id: 'react', name: 'React', short: 'REACT', devicon: 'react' },
    { id: 'vue', name: 'Vue', short: 'VUE', devicon: 'vuejs' },
    { id: 'svelte', name: 'Svelte', short: 'SVLT', devicon: 'svelte' },
    { id: 'next', name: 'Next.js', short: 'NEXT', devicon: 'nextjs' },
    { id: 'angular', name: 'Angular', short: 'NGLR', devicon: 'angularjs' },
    { id: 'solid', name: 'Solid', short: 'SLID', devicon: 'solidjs' },
  ],
  be: [
    { id: 'node', name: 'Node.js', short: 'NODE', devicon: 'nodejs' },
    { id: 'go', name: 'Go', short: 'GO', devicon: 'go' },
    { id: 'rust', name: 'Rust', short: 'RUST', devicon: 'rust' },
    { id: 'django', name: 'Django', short: 'DJNG', devicon: 'django' },
    { id: 'rails', name: 'Rails', short: 'RAIL', devicon: 'rails' },
    { id: 'fastapi', name: 'FastAPI', short: 'FAST', devicon: 'fastapi' },
  ],
  db: [
    { id: 'postgres', name: 'Postgres', short: 'PG', devicon: 'postgresql' },
    { id: 'mongo', name: 'MongoDB', short: 'MONGO', devicon: 'mongodb' },
    { id: 'redis', name: 'Redis', short: 'REDIS', devicon: 'redis' },
    { id: 'mysql', name: 'MySQL', short: 'MYSQL', devicon: 'mysql' },
    { id: 'sqlite', name: 'SQLite', short: 'SQLT', devicon: 'sqlite' },
    { id: 'dynamo', name: 'DynamoDB', short: 'DYNO', devicon: 'dynamodb' },
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
      devicon: tech?.devicon ?? id,
    };
  });
}
