import type { Tech } from './techstack';

export type PromptStackItem = Pick<Tech, 'id' | 'name'> & {
  layer: 'fe' | 'be' | 'db';
  layerLabel: string;
  runtime?: Pick<Tech, 'id' | 'name'>;
};

export type GeminiPromptOptions = {
  authentication: boolean;
};

const stackLine = (item: PromptStackItem) => item.runtime
  ? `- ${item.layerLabel}: ${item.name} (framework id: ${item.id}) + ${item.runtime.name} (runtime id: ${item.runtime.id})`
  : `- ${item.layerLabel}: ${item.name} (id: ${item.id})`;

export function buildGeminiSystemPrompt(
  stack: PromptStackItem[],
  { authentication }: GeminiPromptOptions,
) {
  const authScope = authentication
    ? `Authentication is enabled. Implement secure sign-up/sign-in/sign-out, password hashing, session or token rotation, authorization middleware, and at least ADMIN and STAFF roles. Protect every write endpoint and explain how to add more roles later.`
    : `Authentication is disabled for this first version. Keep clear extension points (user module, authorization middleware/policy interface, ownership/audit fields, and environment placeholders), but do not implement fake login code or add an auth dependency yet.`;

  return `You are a senior full-stack and platform engineer. Produce an implementation blueprint for a small but production-minded Student Management System using exactly the rolled stack below.

ROLLED STACK
${stack.map(stackLine).join('\n')}

PROJECT GOAL
Build a Student Management System with a clean architecture that can grow without a rewrite. The first vertical slice must support student CRUD: create, list with pagination/search/sort, get by id, update, and delete. A student has id, studentCode, fullName, email, dateOfBirth, status, createdAt, and updatedAt. Enforce unique studentCode and email, validate all input, return consistent errors, and include seed data.

AUTHENTICATION DECISION
${authScope}

NON-NEGOTIABLE DELIVERY RULES
1. Use the rolled frontend for the UI, the rolled backend framework with its exact compatible runtime for the API/business layer, and the rolled database for persistence. Do not silently replace any selected technology. Keep both backend technologies materially used.
2. Keep UI, application/use-case, domain, persistence, and infrastructure concerns separate. Organize by feature/module so courses, classes, attendance, grades, imports, and notifications can be added later.
3. Define the REST API contract, database schema/indexes/migrations, validation rules, error envelope, pagination metadata, health check, and environment variables before implementation.
4. Include unit tests and API/integration tests for the student CRUD happy paths, validation failures, duplicates, missing records, and authentication/authorization behavior when enabled.
5. Package the entire runnable system with production-minded multi-stage Dockerfile(s) and one docker-compose.yml. Add health checks, persistent database storage, service dependencies, a non-root runtime user where supported, .dockerignore, and .env.example. Do not put secrets in images or source files.
6. All setup, file creation, migrations, seeding, tests, builds, and startup must be possible from a terminal. Never instruct the user to click through an IDE, database GUI, Docker Desktop UI, or web console.
7. Pin or explicitly state important runtime/tool versions. Prefer official scaffolding and migration commands over hand-created generated files.
8. Commands must be safe to paste into a new empty directory. Do not use ellipses, pseudo-commands, or omit required arguments.

RESPONSE FORMAT
Write the answer in Vietnamese, while keeping code identifiers and commands in English. Return these sections in this exact order:

1. Tóm tắt giải pháp
- Explain how each rolled technology is used, key trade-offs, assumptions, and the authentication decision.

2. Kiến trúc và luồng dữ liệu
- Show a compact ASCII architecture diagram and request flow.
- Give the final repository tree and explain extension points.

3. API, dữ liệu và bảo mật
- Provide endpoint table, request/response examples, schema/indexes, validation, error format, pagination, and security measures.

4. Cài đặt trên Linux/macOS (Bash)
- Give numbered, copy-paste-ready Bash command blocks starting from an empty directory.
- Use CLI commands to scaffold and create every required file. For multi-line files, use quoted heredocs that prevent accidental variable expansion.

5. Cài đặt trên Windows (PowerShell 7+)
- Give equivalent numbered, copy-paste-ready PowerShell blocks starting from an empty directory.
- Do not reuse Bash syntax. Use PowerShell-native commands and single-quoted here-strings for multi-line files.

6. Nội dung implementation
- Provide the complete content of every hand-written source/config file required for a working student CRUD vertical slice. No TODOs, placeholders, omitted imports, or “same as above”.

7. Docker và vận hành
- Provide complete Dockerfile(s), docker-compose.yml, .dockerignore, .env.example, migration/seed commands, health checks, logs, stop/reset, and production build/start commands.

8. Kiểm thử và tiêu chí nghiệm thu
- Provide terminal commands for Linux and Windows, test cases, sample curl and Invoke-RestMethod smoke tests, and a concrete acceptance checklist.

9. Hướng mở rộng
- Explain the exact modules/interfaces to touch when adding authentication (if currently disabled), courses, classes, attendance, grades, bulk import, audit logging, caching, and background jobs.

Before answering, internally check that all filenames match imports, all services/ports/environment variables agree across source and Docker Compose, migrations run before seed data, and every command works in the stated shell. Output only the final guide; do not describe your hidden reasoning.`;
}
