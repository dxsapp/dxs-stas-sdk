# Launch Prompt

## Mission

Execute the durable test program in `docs/test-waves` for `dxs-bsv-token-sdk`, starting with the next open wave and keeping the package itself as the only durable source of truth.

## Package Path

- `/Users/imighty/Code/dxs-bsv-token-sdk/docs/test-waves/master.md`
- `/Users/imighty/Code/dxs-bsv-token-sdk/docs/test-waves/slices.md`
- current target wave file:
  - `/Users/imighty/Code/dxs-bsv-token-sdk/docs/test-waves/wave-03-dstas-swap-and-decomposer.md`

## Current Target Wave

`W3` — DSTAS swap helper and decomposer deep unit coverage

## Constraints

- Work in `/Users/imighty/Code/dxs-bsv-token-sdk`.
- Use execution-operator mode.
- Do not create new `stream-tasks` or other operator-log trees.
- Keep the durable package under `docs/test-waves` current as waves close.
- Prefer focused unit tests over inflating existing large flow suites.
- Do not change runtime code unless a real defect is discovered while writing the tests.
- If a defect is discovered, keep the fix bounded and validate it through the owned suites and the full suite.

## Required Execution Order

1. Execute `W3` completely.
2. Rerun coverage and update the package baseline.
3. If `W3` is green and closed, execute `W4`.
4. Rerun coverage and update the package baseline again.
5. Stop before `W5` unless explicitly asked to continue into residual hotspot cleanup.

## Validation

Use:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/dstas-swap-script.test.ts tests/dstas-locking-decomposer.test.ts
PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/stas-bundle-factory.test.ts
PATH=/usr/local/bin:$PATH npm test -- --runInBand
PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand
PATH=/usr/local/bin:$PATH npm run lint
```

## Closeout

After each completed wave:

- mark the wave `done` in `docs/test-waves/master.md`
- update the wave file with the new baseline and residuals
- record the implementation commit hash in `master.md`
- state honest residuals if the coverage target was not met

## Commit And Report Expectations

- Use one implementation commit per wave when practical.
- Keep docs-only package normalization separate from implementation commits.
- Report:
  - what landed
  - what was validated
  - updated coverage numbers
  - whether the wave target was met exactly

## Stop Conditions

Stop and escalate only if:

- coverage targets are blocked by a product decision
- an external dependency is required
- a discovered defect requires broader architecture work than the wave allows

Otherwise, keep executing until `W3` and `W4` are closed.
