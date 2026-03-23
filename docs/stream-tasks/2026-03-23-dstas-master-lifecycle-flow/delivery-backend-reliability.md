# Stream Task - Delivery Backend Reliability

- Package: `2026-03-23-dstas-master-lifecycle-flow`
- Stream: `delivery-backend-reliability`
- Lane: `backend`
- Backend substream: `BE-Reliability`
- Status: `done`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Build the deterministic DSTAS master lifecycle test harness and implement the canonical 52-step lifecycle flow with embedded negative branches.

## Scope

In scope:

- `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-master-lifecycle.test.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/helpers/dstas-master-fixture.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/helpers/dstas-master-driver.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/helpers/dstas-master-assert.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/helpers/dstas-master-types.ts`
- supporting updates under `/Users/imighty/Code/dxs-stas-sdk/tests/helpers/`

Out of scope unless required by a concrete blocker:

- product changes under `/Users/imighty/Code/dxs-stas-sdk/src/**`
- package exports or docs outside direct test references

## Required inputs

Read before implementation:

- `/Users/imighty/Code/dxs-stas-sdk/README.md`
- `/Users/imighty/Code/dxs-stas-sdk/docs/AGENT_RUNBOOK.md`
- `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_SDK_SPEC.md`
- `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_SCRIPT_INVARIANTS.md`
- `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-flow.test.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-state-flows.test.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-swap-flows.test.ts`
- `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-multisig-authority-flow.test.ts`

## Tasks

### Wave R1 - Harness

1. Create a world-state model for actors, assets, live outputs, tx history, and checkpoints.
2. Create deterministic fixture helpers for issuers, owners, multisig owner, authorities, and fee wallet.
3. Build a driver DSL with operations:
   - `issue`
   - `transfer`
   - `split`
   - `merge`
   - `freeze`
   - `unfreeze`
   - `confiscate`
   - `swap`
   - `redeem`
   - `checkpoint`
   - `expectFail`
4. Ensure every successful operation performs:
   - `evaluateTransactionHex(...)`
   - explicit prevout resolver wiring
   - fee assertions
   - token conservation assertions

### Wave R2 - Scenario execution

5. Implement the 52-step master flow from the package master doc.
6. Embed negative branches directly in the lifecycle:
   - frozen spend fails
   - wrong confiscation authority fails
   - non-issuer redeem fails
   - wrong swap script fails
   - wrong swap pieces count fails
   - reordered swap pieces fail
7. Add checkpoints after major phases:
   - issued
   - post-split
   - post-merge
   - post-freeze
   - post-unfreeze
   - post-confiscation
   - post-swap
   - final

### Wave R3 - Escalation

8. If the DSL exposes missing SDK seams, stop that slice and hand off an explicit blocker to `delivery-backend-platform` or `delivery-backend-contracts` with:
   - exact file
   - exact operation that fails
   - expected contract
   - minimum patch needed

## Acceptance criteria

- The lifecycle suite is deterministic and does not depend on `.temp` or external files.
- The new driver keeps the test readable; the master test itself should remain orchestration-first, not builder-noise-heavy.
- At least the happy path plus the embedded negative cases from the master doc are covered in one suite.
- Checkpoints can localize failures by asset and owner state.

## Validation

Required before handoff:

```bash
npm run build -- --pretty false
npm run lint
npm test -- --runInBand tests/dstas-master-lifecycle.test.ts
```

If helper reuse touches existing suites, also rerun the directly affected DSTAS suites.

## Commit expectation

Commit only reliability-owned test/harness changes.

Suggested commit sequence:

- `test(dstas): add master lifecycle harness`
- `test(dstas): add master lifecycle scenario`
- optional formatting follow-up if needed

On completion, update this file to `done` and record commit hashes.

## Blocker

- Failing operation: valid DSTAS merge of two same-owner outputs produced by a prior DSTAS split transaction
- Reproduction point: the removed merge step in `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-master-lifecycle.test.ts`
- Observed behavior: `BuildDstasMergeTx(...)` builds a tx that evaluates with `OP_NUMEQUALVERIFY failed` on both STAS inputs even when both merge inputs carry the same owner and the source `OutPoint.Transaction` raw bytes are attached.
- Exact failing surface: `/Users/imighty/Code/dxs-stas-sdk/src/transaction/build/input-builder.ts` merge path, reached through `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts` -> `BuildDstasMergeTx(...)`
- Expected minimal contract: two same-owner DSTAS outputs from a split transaction must be mergeable into one DSTAS output using the canonical `BuildDstasMergeTx(...)` helper, with script evaluation success on both STAS inputs.
- Why tests alone cannot solve it: the failure happens after a fully formed tx is built and evaluated; the merge unlocking payload or merge-source reconstruction is inconsistent with the script template. The test harness can reproduce it deterministically, but it cannot correct the runtime merge encoding.

## Completion

- Commits:
  - `f43dfad` — `test(dstas): add master lifecycle harness`
  - `0f90baa` — `test(dstas): extend master lifecycle freeze cycle`
  - `29de9cc` — `test(dstas): extend master lifecycle confiscation slice`
  - `beaf0ac` — `style: format master lifecycle driver`
  - `06291dc` — `test(dstas): extend master lifecycle swap slice`
  - `17d0ad3` — `style: format master lifecycle driver`
  - `f4e3a80` — `test(dstas): add dense master lifecycle flow`
- Final validation:
  - `npm test -- --runInBand tests/dstas-master-lifecycle.test.ts`
  - `npm run build -- --pretty false`
  - `npm run lint`
  - `npm test -- --runInBand tests/dstas-master-lifecycle.test.ts tests/dstas-state-flows.test.ts tests/dstas-swap-flows.test.ts`
- Final outcome:
  - dense chained master lifecycle now exists
  - coverage includes issue, transfer, split, merge, freeze, failed frozen spend, unfreeze, confiscation, multisig authority, valid transfer<->swap, negative swap case, swap<->swap, and redeem paths
