# TS Loader Validation (Private Linux / Meteor Build)

Use this runbook on your private Linux test server to validate the `.ts` loader fix path against the same parser-failure baseline.

## Preconditions

- Linux host with Docker/tooling as used by your deployment path.
- Node `22.x`, npm `10.x`.
- Meteor `3.4` CLI installed and available in `$PATH`.
- Repo checkout at `svelte-app/mofacts`.

## Step 1: Baseline parser failure repro (expected to fail today)

```bash
cd svelte-app/mofacts
npm ci
npm run repro:ts-loader-parse-failure
```

Expected baseline error shape:

- Parse error in `scripts/ts-loader-repro/typedProbe.ts`
- Message similar to: `Expected ',', got ':'`
- Indicates TypeScript is being parsed as plain JavaScript (no TS loader in chain).

## Step 2: Meteor production build smoke check

```bash
cd svelte-app/mofacts
meteor build ../tmp-meteor-prod-build --directory
```

Record:

- Success/failure.
- Full error logs if failure includes TS parse/loader output.
- Whether failure originates from rspack/swc loader handling `.ts`.

## Step 3: Validation criteria after loader fix

All of the following must pass:

1. `npm run repro:ts-loader-parse-failure` no longer fails due to TS syntax parse.
2. `meteor build ... --directory` succeeds with `.ts` files present in runtime import graph.
3. `npm run typecheck` and `npm run lint` still pass.

## Artifacts to share back

- Command output for Step 1 and Step 2.
- Any modified loader/rspack config diff.
- Confirmation of whether runtime `.js -> .ts` renames are now safe.
