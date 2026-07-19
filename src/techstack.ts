import { DEVICON_CATALOG, type DeviconTech } from './generated/devicon-catalog';

export type ReelLayer = 'fe' | 'be' | 'db';

export type Tech = {
  id: string;
  name: string;
  short: string;
  devicon: string;
  docsUrl: string | null;
  githubUrl: string | null;
  tags: string[];
  color: string | null;
};

/** Per-reel tech catalogs: FE | BE | DB */
export const REEL_LAYERS: ReelLayer[] = ['fe', 'be', 'db'];

export const LAYER_LABELS = {
  fe: 'Frontend',
  be: 'Backend',
  db: 'Database',
};

const CURATED_TECH_STACK = {
  fe: [
    { id: 'react', name: 'React', short: 'REACT', devicon: 'react', docsUrl: 'https://react.dev/reference/react', githubUrl: 'https://github.com/facebook/react' },
    { id: 'vue', name: 'Vue', short: 'VUE', devicon: 'vuejs', docsUrl: 'https://vuejs.org/guide/', githubUrl: 'https://github.com/vuejs/core' },
    { id: 'svelte', name: 'Svelte', short: 'SVLT', devicon: 'svelte', docsUrl: 'https://svelte.dev/docs/svelte/overview', githubUrl: 'https://github.com/sveltejs/svelte' },
    { id: 'next', name: 'Next.js', short: 'NEXT', devicon: 'nextjs', docsUrl: 'https://nextjs.org/docs', githubUrl: 'https://github.com/vercel/next.js' },
    { id: 'angular', name: 'Angular', short: 'NGLR', devicon: 'angularjs', docsUrl: 'https://angular.dev/overview', githubUrl: 'https://github.com/angular/angular' },
    { id: 'solid', name: 'Solid', short: 'SLID', devicon: 'solidjs', docsUrl: 'https://docs.solidjs.com/', githubUrl: 'https://github.com/solidjs/solid' },
  ],
  be: [
    { id: 'node', name: 'Node.js', short: 'NODE', devicon: 'nodejs', docsUrl: 'https://nodejs.org/docs/latest/api/', githubUrl: 'https://github.com/nodejs/node' },
    { id: 'go', name: 'Go', short: 'GO', devicon: 'go', docsUrl: 'https://go.dev/doc/', githubUrl: 'https://github.com/golang/go' },
    { id: 'rust', name: 'Rust', short: 'RUST', devicon: 'rust', docsUrl: 'https://doc.rust-lang.org/', githubUrl: 'https://github.com/rust-lang/rust' },
    { id: 'django', name: 'Django', short: 'DJNG', devicon: 'django', docsUrl: 'https://docs.djangoproject.com/', githubUrl: 'https://github.com/django/django' },
    { id: 'rails', name: 'Rails', short: 'RAIL', devicon: 'rails', docsUrl: 'https://guides.rubyonrails.org/', githubUrl: 'https://github.com/rails/rails' },
    { id: 'fastapi', name: 'FastAPI', short: 'FAST', devicon: 'fastapi', docsUrl: 'https://fastapi.tiangolo.com/', githubUrl: 'https://github.com/fastapi/fastapi' },
  ],
  db: [
    { id: 'postgres', name: 'Postgres', short: 'PG', devicon: 'postgresql', docsUrl: 'https://www.postgresql.org/docs/current/', githubUrl: 'https://github.com/postgres/postgres' },
    { id: 'mongo', name: 'MongoDB', short: 'MONGO', devicon: 'mongodb', docsUrl: 'https://www.mongodb.com/docs/', githubUrl: 'https://github.com/mongodb/mongo' },
    { id: 'redis', name: 'Redis', short: 'REDIS', devicon: 'redis', docsUrl: 'https://redis.io/docs/latest/', githubUrl: 'https://github.com/redis/redis' },
    { id: 'mysql', name: 'MySQL', short: 'MYSQL', devicon: 'mysql', docsUrl: 'https://dev.mysql.com/doc/', githubUrl: 'https://github.com/mysql/mysql-server' },
    { id: 'sqlite', name: 'SQLite', short: 'SQLT', devicon: 'sqlite', docsUrl: 'https://www.sqlite.org/docs.html', githubUrl: 'https://github.com/sqlite/sqlite' },
    { id: 'dynamo', name: 'DynamoDB', short: 'DYNO', devicon: 'dynamodb', docsUrl: 'https://docs.aws.amazon.com/dynamodb/', githubUrl: null },
  ],
};

const REEL_FOR_LAYER = { fe: 'frontend', be: 'backend', db: 'database' } as const;
const curatedByDevicon = new Map(
  Object.values(CURATED_TECH_STACK).flat().map((tech) => [tech.devicon, tech]),
);

const titleize = (id: string) => id
  .replace(/js$/, '.js')
  .replace(/(^|[-_])([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`);

const toTech = (icon: DeviconTech): Tech => {
  const curated = curatedByDevicon.get(icon.id);
  return {
    id: icon.id,
    name: curated?.name ?? titleize(icon.id),
    short: curated?.short ?? icon.id.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6),
    devicon: icon.id,
    docsUrl: curated?.docsUrl ?? null,
    githubUrl: curated?.githubUrl ?? null,
    tags: icon.tags,
    color: icon.color,
  };
};

export const TECH_STACK: Record<ReelLayer, Tech[]> = Object.fromEntries(
  REEL_LAYERS.map((layer) => [
    layer,
    DEVICON_CATALOG.filter(({ reel }) => reel === REEL_FOR_LAYER[layer]).map(toTech),
  ]),
) as Record<ReelLayer, Tech[]>;

export function layerForReel(index: number): ReelLayer {
  return REEL_LAYERS[index] ?? 'fe';
}

export function techById(layer: ReelLayer, id: string) {
  return TECH_STACK[layer]?.find((item) => item.id === id) ?? null;
}

export function pickTech(index: number, random = Math.random) {
  const layer = layerForReel(index);
  const pool = TECH_STACK[layer];
  return pool[Math.floor(random() * pool.length)].id;
}

export function docsUrlFor(tech: Pick<Tech, 'name' | 'docsUrl' | 'githubUrl'> | null | undefined, fallbackName = 'technology') {
  if (tech?.docsUrl) return tech.docsUrl;
  if (tech?.githubUrl) return tech.githubUrl;
  const query = encodeURIComponent(`${tech?.name ?? fallbackName} documentation`);
  return `https://www.google.com/search?q=${query}`;
}

export function describeStack(symbols: string[] = []) {
  return symbols.map((id, index) => {
    const layer = layerForReel(index);
    const tech = techById(layer, id);
    const name = tech?.name ?? id;
    return {
      layer,
      layerLabel: LAYER_LABELS[layer],
      id,
      name,
      short: tech?.short ?? String(id).toUpperCase(),
      docsUrl: docsUrlFor(tech, name),
    };
  });
}
