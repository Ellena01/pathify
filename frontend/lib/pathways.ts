/**
 * Skill pathway catalogue.
 *
 * A match tells you what you are missing; a pathway tells you what to do about
 * it. Each entry is a concrete, ordered plan: the steps to work through, a
 * project that proves the skill, and a milestone that marks it done.
 *
 * Coverage is intentionally explicit rather than exhaustive. `getPathway`
 * returns `null` for unlisted skills and callers fall back to a generic plan
 * derived from the skill's taxonomy category, so the UI is never empty and
 * never pretends to have bespoke content it does not have.
 */

import { skillCategory, type SkillCategory } from './taxonomy';

export interface PathwayStep {
  title: string;
  detail: string;
  /** Rough effort, so the plan is plannable. */
  effort: '2 hours' | '1 day' | '1 week' | '2–3 weeks';
  /** A resource type rather than a hardcoded link, which would rot. */
  resource:
    | 'Documentation'
    | 'Interactive course'
    | 'Structured video'
    | 'Reading'
    | 'Practice project'
    | 'Open source'
    | 'Community';
}

export interface Pathway {
  skill: string;
  summary: string;
  /** Why this skill matters for the opportunities the user is short on. */
  why: string;
  steps: PathwayStep[];
  /** A portfolio artefact that demonstrates the skill. */
  project: { title: string; brief: string };
  milestone: string;
  /** Rough weeks to competence at a job-ready level. */
  durationWeeks: number;
}

const CATALOGUE: Record<string, Pathway> = {
  Python: {
    skill: 'Python',
    summary: 'The default language for data, automation and backend work.',
    why: 'Almost every data, ML and backend listing assumes working Python.',
    steps: [
      { title: 'Syntax, types and control flow', detail: 'Lists, dicts, comprehensions, f-strings, exception handling. Write scripts, not just read them.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Virtual environments and packaging', detail: 'venv, pip, requirements.txt, pyproject.toml. Being able to set up an environment is half the job.', effort: '2 hours', resource: 'Documentation' },
      { title: 'NumPy and pandas', detail: 'Vectorised computation, loading tabular data, groupby and aggregation.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Work with real APIs', detail: 'requests, authentication, pagination, rate limits, and handling failure gracefully.', effort: '1 day', resource: 'Reading' },
    ],
    project: { title: 'Data pipeline CLI', brief: 'A command-line tool that pulls data from a public API, cleans it, and writes a summary report. Include tests and a README.' },
    milestone: 'Ship a Python project on GitHub that someone else can clone and run without hand-holding.',
    durationWeeks: 6,
  },
  JavaScript: {
    skill: 'JavaScript',
    summary: 'The language of the web, and a prerequisite for most of the others here.',
    why: 'Every web-facing role assumes it, and it is the base for React and Node.js.',
    steps: [
      { title: 'Language fundamentals', detail: 'Closures, prototypes, `this`, destructuring, spread, modules.', effort: '1 week', resource: 'Interactive course' },
      { title: 'The browser platform', detail: 'DOM manipulation, events, fetch, and what the async event loop actually does.', effort: '1 week', resource: 'Documentation' },
      { title: 'Build tooling', detail: 'npm, a bundler, and what transpilation is doing under the hood.', effort: '2 hours', resource: 'Reading' },
    ],
    project: { title: 'Vanilla JS app', brief: 'A dependency-free single-page app — no framework — that consumes a public API and handles loading, error and empty states.' },
    milestone: 'Ship a framework-free JS app that works in every current browser.',
    durationWeeks: 5,
  },
  React: {
    skill: 'React',
    summary: 'The dominant front-end framework, and the most requested skill in web listings.',
    why: 'The single highest-frequency requirement across front-end roles.',
    steps: [
      { title: 'Components and JSX', detail: 'Props, composition, and thinking in components rather than templates.', effort: '1 week', resource: 'Interactive course' },
      { title: 'State and effects', detail: 'useState, useEffect, and when NOT to reach for an effect. Learn the rendering model first.', effort: '1 week', resource: 'Documentation' },
      { title: 'Data fetching and loading states', detail: 'Suspense, error boundaries, and rendering skeleton vs spinner.', effort: '1 day', resource: 'Structured video' },
      { title: 'Forms and validation', detail: 'Controlled inputs, schema validation, accessible error messaging.', effort: '1 day', resource: 'Reading' },
    ],
    project: { title: 'Data-dense dashboard', brief: 'A dashboard over a public API with search, filtering, pagination, and full empty/loading/error states.' },
    milestone: 'Ship a React app that handles every async state, not just the happy path.',
    durationWeeks: 6,
  },
  TypeScript: {
    skill: 'TypeScript',
    summary: 'Type safety for JavaScript at scale.',
    why: 'Expected in most professional front-end and back-end roles; its absence is a signal.',
    steps: [
      { title: 'Structural typing', detail: 'How TypeScript actually compares types — it is not nominal.', effort: '1 day', resource: 'Documentation' },
      { title: 'Generics', detail: 'Write functions that preserve relationships between input and output types.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Narrowing and guards', detail: 'Discriminated unions, type guards, and exhaustive checks with `never`.', effort: '2–3 weeks', resource: 'Reading' },
    ],
    project: { title: 'Typed SDK', brief: 'A small typed client for a public REST API, with generics on the response layer and no `any`.' },
    milestone: 'Convert an existing JavaScript project to TypeScript with strict mode enabled and zero suppressions.',
    durationWeeks: 4,
  },
  'Next.js': {
    skill: 'Next.js',
    summary: 'The React framework for production apps — server rendering, routing, data fetching.',
    why: 'The most common framework named in African and global remote front-end listings.',
    steps: [
      { title: 'App Router fundamentals', detail: 'Layouts, nested routes, server vs client components, and the boundary between them.', effort: '1 week', resource: 'Documentation' },
      { title: 'Data fetching and mutations', detail: 'Server Actions, revalidation, and form handling without a client-side fetch layer.', effort: '1 week', resource: 'Documentation' },
      { title: 'Caching and revalidation', detail: 'Route segment config, `revalidate`, and tag-based invalidation. Read the current docs — this changed recently.', effort: '2–3 weeks', resource: 'Reading' },
      { title: 'Deployment and observability', detail: 'Build output, environment variables, and reading a production error before your users do.', effort: '1 day', resource: 'Practice project' },
    ],
    project: { title: 'Server-rendered product', brief: 'A multi-route app backed by a real database, with server-side auth and no client-side data fetching for initial paint.' },
    milestone: 'Deploy a Next.js app to production with auth, a database, and no hydration warnings.',
    durationWeeks: 7,
  },
  SQL: {
    skill: 'SQL',
    summary: 'Querying relational data — still the highest-leverage backend skill.',
    why: 'Every data and backend role assumes it, and it is frequently the actual differentiator in interviews.',
    steps: [
      { title: 'SELECT, WHERE, ORDER BY', detail: 'Filtering, sorting, limiting, and reading a query plan.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Joins', detail: 'INNER vs LEFT, and reading a schema diagram to work out the join before writing it.', effort: '1 week', resource: 'Documentation' },
      { title: 'Aggregation', detail: 'GROUP BY, HAVING, window functions, and when a CTE is clearer than a subquery.', effort: '1 week', resource: 'Practice project' },
      { title: 'Performance', detail: 'Indexes, EXPLAIN, and the N+1 problem at the database layer.', effort: '2–3 weeks', resource: 'Reading' },
    ],
    project: { title: 'Analytics query set', brief: 'Ten business questions against a real open dataset, each with an index recommendation justified by EXPLAIN.' },
    milestone: 'Answer a complex analytical question and explain why your query is fast.',
    durationWeeks: 5,
  },
  PostgreSQL: {
    skill: 'PostgreSQL',
    summary: 'The default relational database for new products.',
    why: 'Paired with Supabase and most modern back-end stacks.',
    steps: [
      { title: 'Types and constraints', detail: 'Enums, CHECK, UNIQUE, and modelling integrity in the schema rather than in application code.', effort: '1 week', resource: 'Documentation' },
      { title: 'Indexes and query planning', detail: 'B-tree vs GIN, partial indexes, and reading EXPLAIN ANALYZE output.', effort: '1 week', resource: 'Reading' },
      { title: 'Row Level Security', detail: 'Writing policies so the database — not the API — enforces tenant isolation.', effort: '2–3 weeks', resource: 'Documentation' },
    ],
    project: { title: 'Multi-tenant schema', brief: 'A schema where two tenants cannot read each other\'s rows, enforced by RLS and verified with a test suite.' },
    milestone: 'Design a schema where a missing application-level check cannot leak data.',
    durationWeeks: 5,
  },
  Docker: {
    skill: 'Docker',
    summary: 'Reproducible environments and deployments.',
    why: 'Expected in most back-end and platform roles; frequently the line between amateur and professional.',
    steps: [
      { title: 'Images and containers', detail: 'Dockerfile layers, caching, and why layer order matters for build speed.', effort: '1 day', resource: 'Documentation' },
      { title: 'Compose', detail: 'Multi-service local environments: app, database, cache.', effort: '2 hours', resource: 'Documentation' },
      { title: 'Multi-stage builds', detail: 'Shipping a production image without compilers or package managers in it.', effort: '1 day', resource: 'Reading' },
    ],
    project: { title: 'One-command local stack', brief: 'A repository where `docker compose up` yields a working app plus database, from a clean clone.' },
    milestone: 'Hand someone your repo and a single command, and it works on their machine.',
    durationWeeks: 3,
  },
  'CI/CD': {
    skill: 'CI/CD',
    summary: 'Automated build, test and deploy pipelines.',
    why: 'A differentiator on most engineering applications; teams screen for it explicitly.',
    steps: [
      { title: 'Pipeline basics', detail: 'A workflow that installs, lints, typechecks and tests on every push.', effort: '2 hours', resource: 'Documentation' },
      { title: 'Caching and matrix builds', detail: 'Speeding up feedback loops; running tests across versions.', effort: '1 day', resource: 'Reading' },
      { title: 'Deployment', detail: 'Preview environments per pull request, and a gated production deploy.', effort: '1 week', resource: 'Practice project' },
    ],
    project: { title: 'Zero-touch deploy pipeline', brief: 'Push to main and the app is live. A failing test blocks it.' },
    milestone: 'Never deploy manually again.',
    durationWeeks: 3,
  },
  Git: {
    skill: 'Git',
    summary: 'Version control — assumed everywhere, but often used poorly.',
    why: 'Every collaborative role assumes fluency; weak history signals a learning curve.',
    steps: [
      { title: 'The mental model', detail: 'Commits as snapshots, branches as pointers, and what a rebase actually does.', effort: '2 hours', resource: 'Interactive course' },
      { title: 'Undo safely', detail: 'revert vs reset, reflog, and recovering a lost commit.', effort: '1 day', resource: 'Reading' },
      { title: 'Collaborative workflow', detail: 'Rebase-based branching, clean commit messages, and reviewing a pull request well.', effort: '1 day', resource: 'Practice project' },
    ],
    project: { title: 'Clean-history repository', brief: 'A repository with a readable `git log`, meaningful commit messages, and a CONTRIBUTING guide.' },
    milestone: 'Can recover any mistake without panicking.',
    durationWeeks: 2,
  },
  'Machine Learning': {
    skill: 'Machine Learning',
    summary: 'Building models that generalise, and knowing when not to.',
    why: 'The core requirement for ML and data-science roles, and increasingly for product roles.',
    steps: [
      { title: 'Linear models and evaluation', detail: 'Fit, regularisation, and choosing a metric that reflects the real cost of being wrong.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Feature engineering', detail: 'Where most of the real performance gain lives. Leakage and how to avoid it.', effort: '1 week', resource: 'Reading' },
      { title: 'Trees and ensembles', detail: 'Decision trees, gradient boosting, and why they dominate tabular data.', effort: '2–3 weeks', resource: 'Structured video' },
      { title: 'Deployment', detail: 'Packaging a model behind an endpoint, and monitoring drift.', effort: '1 week', resource: 'Practice project' },
    ],
    project: { title: 'End-to-end ML system', brief: 'A dataset, a baseline, a tuned model, honest evaluation, and a served endpoint. Include the analysis that failed.' },
    milestone: 'Can explain, in an interview, why your model beats the baseline and when it would not.',
    durationWeeks: 12,
  },
  'NLP': {
    skill: 'NLP',
    summary: 'Language as data — the basis of the AI products now being hired for.',
    why: 'Directly relevant to the AI tooling roles Pathfinder Labs surfaces, and the fastest-moving field.',
    steps: [
      { title: 'Text preprocessing', detail: 'Tokenisation, normalisation, and what a subword vocabulary actually does.', effort: '1 week', resource: 'Documentation' },
      { title: 'Embeddings', detail: 'Vector representations, similarity search, and when embeddings beat keyword matching.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Transformers', detail: 'Attention, fine-tuning, and retrieval-augmented generation. Use the current model docs — this area moves fast.', effort: '2–3 weeks', resource: 'Documentation' },
      { title: 'Evaluation', detail: 'Building a test set before you build the system, not after.', effort: '1 week', resource: 'Reading' },
    ],
    project: { title: 'Grounded QA over your own docs', brief: 'A retrieval-augmented assistant that answers only from a document set you control, and says so when it cannot.' },
    milestone: 'Ship an LLM feature with an evaluation set and measurable accuracy.',
    durationWeeks: 10,
  },
  Figma: {
    skill: 'Figma',
    summary: 'Interface design, prototyping and design systems.',
    why: 'Required for product design roles and increasingly expected of front-end engineers.',
    steps: [
      { title: 'Auto-layout and components', detail: 'Constraint-based layout and reusable components — the fundamentals most tutorials skip.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Design systems', detail: 'Tokens, variants, and handing off a system rather than a set of screens.', effort: '1 week', resource: 'Practice project' },
      { title: 'Prototyping and handoff', detail: 'Interactive prototypes, and annotating specs engineers can implement without guessing.', effort: '1 week', resource: 'Reading' },
    ],
    project: { title: 'Component library', brief: 'A Figma file with a documented token set and variants, plus a live prototype showing the main flows.' },
    milestone: 'An engineer can implement your design from the file without a meeting.',
    durationWeeks: 5,
  },
  'UI/UX Design': {
    skill: 'UI/UX Design',
    summary: 'Research, information architecture, and interface design.',
    why: 'The core requirement across design roles; pairs with Figma but is a distinct discipline.',
    steps: [
      { title: 'User research', detail: 'Interviews, synthesis, and turning findings into decisions rather than a report nobody reads.', effort: '1 week', resource: 'Reading' },
      { title: 'Information architecture', detail: 'Card sorting, tree testing, and why the navigation model is the hardest design decision.', effort: '1 week', resource: 'Practice project' },
      { title: 'Interaction design', detail: 'States, transitions, and designing the error and empty cases first.', effort: '1 week', resource: 'Interactive course' },
      { title: 'Accessibility', detail: 'WCAG in practice: contrast, focus order, keyboard paths, screen readers.', effort: '2–3 weeks', resource: 'Documentation' },
    ],
    project: { title: 'End-to-end product case study', brief: 'Research through shipped interface, including the decisions you reversed and why.' },
    milestone: 'A shipped flow that passes a keyboard-only and screen-reader walkthrough.',
    durationWeeks: 10,
  },
};

// ---------------------------------------------------------------------------

const CATEGORY_FALLBACK: Record<SkillCategory, { summary: string; why: string; project: string; milestone: string; weeks: number }> = {
  tech: {
    summary: 'A technical skill expected across most engineering roles.',
    why: 'It appears as a requirement on opportunities you are already being matched to.',
    project: 'Build a small, complete, public project that uses the skill in a real setting.',
    milestone: 'Ship it, write the README, and be able to defend every decision in it.',
    weeks: 6,
  },
  soft: {
    summary: 'A professional skill that is assessed in almost every interview loop.',
    why: 'Interview feedback frequently turns on this more than on technical depth.',
    project: 'Apply it in a real collaborative setting — a community project, a role, or a study group.',
    milestone: 'Get explicit, specific feedback from someone who has seen you do it.',
    weeks: 4,
  },
  domain: {
    summary: 'Domain knowledge specific to your target sector.',
    why: 'It is what separates a candidate who understands the problem from one who can only code.',
    project: 'Write up how the domain works and where a newcomer most often gets it wrong.',
    milestone: 'Explain the domain to a technical person in five minutes, without jargon.',
    weeks: 5,
  },
  tool: {
    summary: 'A specific tool used day to day in the role.',
    why: 'Recruiters screen for it explicitly because it determines your ramp-up time.',
    project: 'Use the tool for a real, non-toy piece of work and learn its escape hatches.',
    milestone: 'Be the person others ask when they get stuck with it.',
    weeks: 3,
  },
};

export function getPathway(skill: string): Pathway {
  const direct = CATALOGUE[skill];
  if (direct) return direct;

  // Tolerate casing differences from user-entered skill lists.
  const match = Object.keys(CATALOGUE).find((k) => k.toLowerCase() === skill.toLowerCase());
  if (match) return CATALOGUE[match];

  const category = skillCategory(skill);
  const fallback = CATEGORY_FALLBACK[category];
  const steps: PathwayStep[] = [
    { title: 'Learn the fundamentals', detail: `Start with the official documentation for ${skill}. Skim it end to end once before starting.`, effort: '1 day', resource: 'Documentation' },
    { title: 'Build the smallest useful thing', detail: 'Make something trivial that works. Depth comes from repetition, not from more tutorials.', effort: '1 day', resource: 'Practice project' },
    { title: 'Read how others use it in production', detail: 'Find a real codebase or a detailed write-up and work out why each decision was made.', effort: '1 week', resource: 'Reading' },
    { title: 'Deliberately practise the hard parts', detail: 'Identify what you cannot yet do, and target exactly that.', effort: '1 week', resource: 'Practice project' },
    { title: 'Get it reviewed', detail: 'Show your work to someone who does this professionally and act on the feedback.', effort: '2 hours', resource: 'Community' },
  ];

  return {
    skill,
    summary: fallback.summary,
    why: fallback.why,
    steps,
    project: { title: `${skill} portfolio project`, brief: fallback.project },
    milestone: fallback.milestone,
    durationWeeks: fallback.weeks,
  };
}

/** True when the catalogue has bespoke content rather than a generated plan. */
export function hasBespokePathway(skill: string): boolean {
  return (
    skill in CATALOGUE ||
    Object.keys(CATALOGUE).some((k) => k.toLowerCase() === skill.toLowerCase())
  );
}

export const CATALOGUE_SIZE = Object.keys(CATALOGUE).length;
