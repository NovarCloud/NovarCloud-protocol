# NOVAR

**A quicker lane for Solana.**

[![Live site](https://img.shields.io/badge/live-novar.cloud-1276f2)](https://novar.cloud)
![Chain](https://img.shields.io/badge/chain-Solana-0051cf)

- **Chain:** Solana mainnet
- **CA:** `to be announced` (the site keeps the slot inert until the address is stated)

## Overview

Novar is a speed layer for the code Solana developers already run: short slots, shared authorship of each slot, and a live market board that follows the chain's busiest tokens. This repository holds the public site, a static build with zero runtime dependencies.

## Features

- Live market board: top boosted Solana tokens, polled every minute, paused while the tab is hidden, with backoff and last-good retention.
- Row #1 reserved for the Novar token; it switches on by itself once the contract address is stated.
- Click-to-copy contract address pinned to the top of every page view.
- Single register of external facts (contract address, social links); anything unstated renders inert.
- Motion built on a damped-spring solver, with a full reduced-motion fallback.

## Links

- Site: https://novar.cloud
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)
- X: to be announced
- GitHub: to be announced

## Develop

```bash
npm run build   # builds dist/ and runs every gate
npm run serve   # serves dist/ on http://localhost:4173
```

Facts live in `src/js/register.js`. Set a record's `state` to `stated` and fill its value, then rebuild.

## License

MIT
