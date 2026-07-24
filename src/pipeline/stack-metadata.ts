import matrixJson from '../techstack-matrix.json';
import type { TechPromptMetadata } from './types';

type MetadataFields = Omit<TechPromptMetadata, 'id' | 'name'>;

/**
 * Supporting metadata for pipeline compatibility and verification.
 * Core identities remain in techstack-matrix.json; this layer adds
 * deployment/runtime/database constraints the matrix does not encode.
 *
 * Coverage rule: every technology id in techstack-matrix.json must have an entry.
 */
const METADATA: Record<string, MetadataFields> = {
  // —— Frontend ——
  angular: {
    packageName: '@angular/core',
    version: '19',
    deploymentModel: 'static',
    dockerSupport: 'development-only',
    scaffoldCommand: 'npx @angular/cli@latest new',
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },
  astro: {
    packageName: 'astro',
    version: '5',
    deploymentModel: 'static',
    dockerSupport: 'development-only',
    scaffoldCommand: 'npm create astro@latest',
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },
  nextjs: {
    packageName: 'next',
    version: '15',
    deploymentModel: 'serverless',
    dockerSupport: 'production',
    scaffoldCommand: 'npx create-next-app@latest',
    compatibleRuntimeIds: ['nodejs', 'bun'],
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'dynamodb',
    ],
    recommendedAdapters: ['pg', 'mysql2', 'better-sqlite3', 'mongodb', 'ioredis'],
    installCommand: 'bun install',
    typecheckCommand: 'bunx tsc --noEmit',
    testCommand: 'bun test',
    buildCommand: 'bun run build',
  },
  react: {
    packageName: 'react',
    version: '19',
    deploymentModel: 'static',
    dockerSupport: 'development-only',
    scaffoldCommand: 'npm create vite@latest -- --template react-ts',
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },
  solidjs: {
    packageName: 'solid-js',
    version: '1',
    deploymentModel: 'static',
    dockerSupport: 'development-only',
    scaffoldCommand: 'npm create solid@latest',
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },
  svelte: {
    packageName: 'svelte',
    version: '5',
    deploymentModel: 'static',
    dockerSupport: 'development-only',
    scaffoldCommand: 'npm create svelte@latest',
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },
  vuejs: {
    packageName: 'vue',
    version: '3',
    deploymentModel: 'static',
    dockerSupport: 'development-only',
    scaffoldCommand: 'npm create vue@latest',
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },

  // —— Backend frameworks ——
  django: {
    packageName: 'django',
    version: '5',
    deploymentModel: 'container',
    dockerSupport: 'production',
    compatibleRuntimeIds: ['python'],
    supportedDatabaseIds: ['postgresql', 'mysql', 'sqlite'],
    recommendedAdapters: ['psycopg', 'mysqlclient'],
    installCommand: 'pip install -r requirements.txt',
    testCommand: 'python manage.py test',
    migrateCommand: 'python manage.py migrate',
    seedCommand: 'python manage.py loaddata seed',
    buildCommand: 'python -m compileall .',
  },
  express: {
    packageName: 'express',
    version: '4',
    deploymentModel: 'container',
    dockerSupport: 'production',
    scaffoldCommand: 'npm init -y',
    compatibleRuntimeIds: ['nodejs', 'bun'],
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
      'cassandra', 'dynamodb', 'neo4j', 'couchdb', 'couchbase', 'duckdb', 'clickhouse',
    ],
    recommendedAdapters: ['pg', 'mysql2', 'better-sqlite3', 'mongodb', 'ioredis'],
    installCommand: 'bun install',
    typecheckCommand: 'bunx tsc --noEmit',
    testCommand: 'bun test',
    buildCommand: 'bun run build',
  },
  fastapi: {
    packageName: 'fastapi',
    version: '0.115',
    deploymentModel: 'container',
    dockerSupport: 'production',
    compatibleRuntimeIds: ['python'],
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'dynamodb', 'neo4j', 'duckdb',
    ],
    recommendedAdapters: ['sqlalchemy', 'asyncpg', 'aiosqlite', 'motor', 'redis'],
    installCommand: 'pip install -r requirements.txt',
    testCommand: 'pytest',
    migrateCommand: 'alembic upgrade head',
    buildCommand: 'python -m compileall .',
  },
  flask: {
    packageName: 'flask',
    version: '3',
    deploymentModel: 'container',
    dockerSupport: 'production',
    compatibleRuntimeIds: ['python'],
    supportedDatabaseIds: ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'],
    recommendedAdapters: ['psycopg', 'pymysql', 'pymongo', 'redis'],
    installCommand: 'pip install -r requirements.txt',
    testCommand: 'pytest',
    migrateCommand: 'flask db upgrade',
    buildCommand: 'python -m compileall .',
  },
  rails: {
    packageName: 'rails',
    version: '8',
    deploymentModel: 'container',
    dockerSupport: 'production',
    scaffoldCommand: 'rails new',
    compatibleRuntimeIds: ['ruby'],
    supportedDatabaseIds: ['postgresql', 'mysql', 'sqlite'],
    recommendedAdapters: ['pg', 'mysql2', 'sqlite3'],
    installCommand: 'bundle install',
    testCommand: 'bundle exec rspec',
    migrateCommand: 'bundle exec rails db:migrate',
    seedCommand: 'bundle exec rails db:seed',
    buildCommand: 'bundle exec rails assets:precompile',
  },
  spring: {
    packageName: 'org.springframework.boot',
    version: '3',
    deploymentModel: 'container',
    dockerSupport: 'production',
    scaffoldCommand: 'curl https://start.spring.io',
    compatibleRuntimeIds: ['java', 'kotlin'],
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'mongodb', 'redis', 'cassandra', 'neo4j', 'dynamodb',
    ],
    recommendedAdapters: [
      'org.postgresql:postgresql',
      'com.mysql:mysql-connector-j',
      'org.mongodb:mongodb-driver-sync',
    ],
    installCommand: './mvnw dependency:resolve',
    testCommand: './mvnw test',
    buildCommand: './mvnw package',
    migrateCommand: './mvnw flyway:migrate',
  },

  // —— Backend runtimes ——
  bun: {
    packageName: 'bun',
    version: '1',
    deploymentModel: 'container',
    dockerSupport: 'production',
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
      'cassandra', 'dynamodb', 'neo4j', 'couchdb', 'duckdb', 'clickhouse',
    ],
    installCommand: 'bun install',
    testCommand: 'bun test',
    buildCommand: 'bun run build',
  },
  denojs: {
    packageName: 'deno',
    version: '2',
    deploymentModel: 'edge',
    dockerSupport: 'development-only',
    supportedDatabaseIds: ['postgresql', 'sqlite', 'mongodb', 'redis', 'dynamodb'],
    installCommand: 'deno install',
    testCommand: 'deno test',
    buildCommand: 'deno check',
  },
  java: {
    packageName: 'java',
    version: '21',
    deploymentModel: 'container',
    dockerSupport: 'production',
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'mongodb', 'redis', 'cassandra', 'neo4j', 'dynamodb',
    ],
    installCommand: './mvnw dependency:resolve',
    testCommand: './mvnw test',
    buildCommand: './mvnw package',
  },
  kotlin: {
    packageName: 'kotlin',
    version: '2',
    deploymentModel: 'container',
    dockerSupport: 'production',
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'mongodb', 'redis', 'cassandra', 'neo4j', 'dynamodb',
    ],
    installCommand: './mvnw dependency:resolve',
    testCommand: './mvnw test',
    buildCommand: './mvnw package',
  },
  nodejs: {
    packageName: 'node',
    version: '22',
    deploymentModel: 'container',
    dockerSupport: 'production',
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
      'cassandra', 'dynamodb', 'neo4j', 'couchdb', 'couchbase', 'duckdb', 'clickhouse',
    ],
    installCommand: 'npm install',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
  },
  python: {
    packageName: 'python',
    version: '3.12',
    deploymentModel: 'container',
    dockerSupport: 'production',
    supportedDatabaseIds: [
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
      'cassandra', 'dynamodb', 'neo4j', 'duckdb', 'clickhouse', 'couchdb',
    ],
    installCommand: 'pip install -r requirements.txt',
    testCommand: 'pytest',
    buildCommand: 'python -m compileall .',
  },
  ruby: {
    packageName: 'ruby',
    version: '3.3',
    deploymentModel: 'container',
    dockerSupport: 'production',
    supportedDatabaseIds: ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'],
    installCommand: 'bundle install',
    testCommand: 'bundle exec rspec',
    buildCommand: 'bundle exec rake build',
  },

  // —— Databases ——
  cassandra: {
    packageName: 'cassandra',
    version: '4',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: [
      'cassandra-driver',
      'cassandra-driver (Python)',
      'com.datastax.oss:java-driver-core',
    ],
  },
  clickhouse: {
    packageName: 'clickhouse',
    version: '24',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: ['@clickhouse/client', 'clickhouse-connect', 'clickhouse-java'],
  },
  couchbase: {
    packageName: 'couchbase',
    version: '7',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: ['couchbase', 'couchbase (Python)', 'com.couchbase.client:java-client'],
  },
  couchdb: {
    packageName: 'couchdb',
    version: '3',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: ['nano', 'cloudant', 'org.ektorp:org.ektorp'],
  },
  duckdb: {
    packageName: 'duckdb',
    version: '1',
    deploymentModel: 'managed',
    dockerSupport: 'development-only',
    recommendedAdapters: ['duckdb', 'duckdb (Python)', 'org.duckdb:duckdb_jdbc'],
  },
  dynamodb: {
    packageName: 'dynamodb',
    version: 'latest',
    deploymentModel: 'managed',
    dockerSupport: 'none',
    recommendedAdapters: [
      '@aws-sdk/client-dynamodb',
      'boto3',
      'software.amazon.awssdk:dynamodb',
    ],
  },
  mongodb: {
    packageName: 'mongodb',
    version: '7',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: [
      'mongodb',
      'mongoose',
      'motor',
      'org.mongodb:mongodb-driver-sync',
    ],
  },
  mysql: {
    packageName: 'mysql',
    version: '8',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: [
      'mysql2',
      'pymysql',
      'mysqlclient',
      'com.mysql:mysql-connector-j',
    ],
  },
  neo4j: {
    packageName: 'neo4j',
    version: '5',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: [
      'neo4j-driver',
      'neo4j (Python)',
      'org.neo4j.driver:neo4j-java-driver',
    ],
  },
  postgresql: {
    packageName: 'postgresql',
    version: '16',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: [
      'pg',
      'postgres',
      'asyncpg',
      'psycopg',
      'org.postgresql:postgresql',
    ],
  },
  redis: {
    packageName: 'redis',
    version: '7',
    deploymentModel: 'managed',
    dockerSupport: 'production',
    recommendedAdapters: [
      'ioredis',
      'redis',
      'redis (Python)',
      'redis.clients:jedis',
    ],
  },
  sqlite: {
    packageName: 'sqlite',
    version: '3',
    deploymentModel: 'managed',
    dockerSupport: 'development-only',
    recommendedAdapters: [
      'better-sqlite3',
      'sqlite3',
      'aiosqlite',
      'org.xerial:sqlite-jdbc',
    ],
  },
};

const MATRIX_TECHNOLOGY_IDS = (matrixJson.technologies as Array<{ id: string }>)
  .map(({ id }) => id)
  .sort();

const MATRIX_COMPATIBILITY = (matrixJson.compatibility as Array<{
  frameworkId: string;
  runtimeIds: string[];
}>);

/** Databases that typically need an explicit client adapter. */
export const DATABASES_REQUIRING_ADAPTER = new Set(
  (matrixJson.technologies as Array<{ id: string; roles: string[] }>)
    .filter(({ roles }) => roles.includes('database'))
    .map(({ id }) => id),
);

/** Runtimes whose production Docker story is weak or edge-oriented. */
export const EDGE_ORIENTED_RUNTIME_IDS = new Set(
  Object.entries(METADATA)
    .filter(([, meta]) => meta.deploymentModel === 'edge')
    .map(([id]) => id),
);

function matrixRuntimeIdsFor(frameworkId: string): string[] | undefined {
  const edge = MATRIX_COMPATIBILITY.find(({ frameworkId: id }) => id === frameworkId);
  return edge ? [...edge.runtimeIds] : undefined;
}

export function getTechPromptMetadata(id: string, name?: string): TechPromptMetadata {
  const extra = METADATA[id] ?? {};
  const matrixRuntimes = matrixRuntimeIdsFor(id);
  return {
    id,
    name: name ?? id,
    ...extra,
    // Prefer matrix-authored framework↔runtime edges when present.
    ...(matrixRuntimes ? { compatibleRuntimeIds: matrixRuntimes } : {}),
  };
}

export function listKnownMetadataIds(): string[] {
  return Object.keys(METADATA).sort();
}

export function listMatrixTechnologyIds(): string[] {
  return [...MATRIX_TECHNOLOGY_IDS];
}

export function listMatrixTechnologyIdsMissingMetadata(): string[] {
  return MATRIX_TECHNOLOGY_IDS.filter((id) => !(id in METADATA));
}

export function listMetadataIdsNotInMatrix(): string[] {
  const matrixIds = new Set(MATRIX_TECHNOLOGY_IDS);
  return listKnownMetadataIds().filter((id) => !matrixIds.has(id));
}

export type StackMetadataCoverage = {
  ok: boolean;
  matrixCount: number;
  metadataCount: number;
  missingFromMetadata: string[];
  extraInMetadata: string[];
};

export function getStackMetadataCoverage(): StackMetadataCoverage {
  const missingFromMetadata = listMatrixTechnologyIdsMissingMetadata();
  const extraInMetadata = listMetadataIdsNotInMatrix();
  return {
    ok: missingFromMetadata.length === 0,
    matrixCount: MATRIX_TECHNOLOGY_IDS.length,
    metadataCount: listKnownMetadataIds().length,
    missingFromMetadata,
    extraInMetadata,
  };
}

export function assertStackMetadataCoversMatrix(): void {
  const coverage = getStackMetadataCoverage();
  if (!coverage.ok) {
    throw new Error(
      `stack-metadata missing matrix technologies: ${coverage.missingFromMetadata.join(', ')}`,
    );
  }
}

// Fail fast in development/runtime if matrix and metadata drift.
assertStackMetadataCoversMatrix();
