# Wave 02 — Low-Level Edge Coverage

## Status

`done`

## Goal

Raise coverage on low-level parser, builder, model, and helper seams without bloating high-level DSTAS flow tests.

## Delivered Suites

- `tests/asm-template-builder.test.ts`
- `tests/base-script-reader-edge.test.ts`
- `tests/dstas-locking-decomposer.test.ts`
- `tests/dstas-swap-script.test.ts`
- `tests/script-reader-extensions.test.ts`
- `tests/stas-bundle-factory.test.ts`
- `tests/transaction-builder-edge.test.ts`
- `tests/transaction-input.test.ts`

## Coverage Improvements

Material improvements from this wave:

- `src/stas-bundle-factory.ts`: `0.8% -> 45.96%`
- `src/script/build/asm-template-builder.ts`: `12.5% -> 100%`
- `src/bitcoin/transaction-input.ts`: `38.46% -> 92.3%`
- `src/script/read/base-script-reader.ts`: `47.61% -> 67.85%`
- `src/script/read/script-reader-extensions.ts`: `46.66% -> 86.66%`
- `src/transaction/build/transaction-builder.ts`: `76.19% -> 96.19%`

Repo baseline after this wave:

- statements: `84.27%`
- branches: `72.43%`
- functions: `95.09%`
- lines: `86.34%`

## Validation

Focused pack:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/dstas-swap-script.test.ts tests/transaction-input.test.ts tests/asm-template-builder.test.ts tests/base-script-reader-edge.test.ts tests/dstas-locking-decomposer.test.ts tests/transaction-builder-edge.test.ts tests/stas-bundle-factory.test.ts tests/script-reader-extensions.test.ts
```

Full validation:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand
PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand
PATH=/usr/local/bin:$PATH npm run lint
```

## Residuals

- `src/stas-bundle-factory.ts` is no longer a near-zero blind spot, but it is still far below the target maintenance floor.
- `src/script/dstas-swap-script.ts` and `src/script/read/dstas-locking-script-decomposer.ts` still need dedicated branch-deep follow-up.
