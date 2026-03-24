# Stream Task - Delivery Backend Platform

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Zone: `Z2 - Transaction Assembly & Planning`
- Status: `blocked`
- Depends on: `reliability escalation only`

## Goal

Respond only if the new remainder-chain regression exposes a real SDK seam.

## Trigger conditions

- partial swap remainder cannot be respent even though protocol semantics require it
- wrong remainder action-data inheritance is produced by runtime builder
- piece-based reconstruction breaks on later-generation remainder outputs

## Deliverable

- minimal product fix
- targeted validation
- one commit with exact seam described
