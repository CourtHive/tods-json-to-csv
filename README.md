# TODS JSON2CSV

Converts TODS JSON objects to WTN CSV import format

## Install

```js
yarn install
```

## Build

```js
yarn build
```

## Use

`TODS2CSV` will write all matchUps extracted from all tournaments matching target organizatinId, or the first organizationId that is encountered

```js
// node -r esm

import { TODS2CSV } from "./dist";

const sourceDir = "./example";
const targetDir = "./example";

TODS2CSV({
  organizationId, // optional - specify tournaments beloginging to a specific organization
  tournamentId, // optional - restrict to a single tournament
  sourceDir,
  targetDir,
});
```
