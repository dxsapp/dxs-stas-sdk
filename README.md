# DXS STAS SDK

**dxs-stas-sdk** is a TypeScript Software Development Kit (SDK) designed to simplify working with multiple Bitcoin SV transaction types.

In addition to STAS-specific operations, the SDK provides abstractions for constructing and handling **standard Bitcoin transactions**, such as **P2PKH**, enabling developers to build applications that work with both tokenized assets and native BSV transfers using a unified toolset.

## Overview

STAS is a token standard for Bitcoin SV (BSV) that enables the creation of self-describing, script-based digital assets.  
This SDK is intended for developers building wallets, marketplaces, exchanges, or backend services that require support for **multiple transaction models**, including STAS and standard BSV transactions.

The goal of the SDK is to abstract low-level transaction construction, signing, and validation logic while maintaining flexibility for advanced use cases.

## Features

- Written in **TypeScript** with full type definitions
- Supports **multiple transaction types**
  - STAS token transactions
  - Standard BSV transactions (e.g. **P2PKH**)
- Unified API for tokenized and non-tokenized transfers
- Modular and extensible architecture
- Test coverage for core transaction logic

## Installation

Clone the repository and install dependencies:

```sh
git clone https://github.com/dxsapp/dxs-stas-sdk.git
cd dxs-stas-sdk
npm install
