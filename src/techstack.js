/** Per-reel tech catalogs: FE | BE | DB */
export const REEL_LAYERS = ['fe', 'be', 'db'];

export const LAYER_LABELS = {
  fe: 'Frontend',
  be: 'Backend',
  db: 'Database',
};

export const TECH_STACK = {
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
