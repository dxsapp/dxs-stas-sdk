# Stream Task - Delivery Backend Contracts

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Zone: `Z1 - Protocol Core`
- Status: `blocked`
- Depends on: `reliability/platform escalation only`

## Goal

Respond only if the new remainder-chain regression exposes a protocol helper or parser/decomposer gap.

## Trigger conditions

- remainder-chain behavior cannot be expressed with current swap decomposition helpers
- counterparty script extraction or piece reconstruction is incorrect for later generations
- normative swap semantics need a parser/decomposer fix
