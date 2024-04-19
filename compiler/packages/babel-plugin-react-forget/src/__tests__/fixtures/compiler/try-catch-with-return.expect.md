
## Input

```javascript
const { shallowCopy, throwInput } = require("shared-runtime");

function Component(props) {
  let x = [];
  try {
    const y = shallowCopy({});
    if (y == null) {
      return;
    }
    x.push(throwInput(y));
  } catch {
    return null;
  }
  return x;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{}],
};

```

## Code

```javascript
import { unstable_useMemoCache as useMemoCache } from "react";
const { shallowCopy, throwInput } = require("shared-runtime");

function Component(props) {
  const $ = useMemoCache(2);
  let x;
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = Symbol.for("react.early_return_sentinel");
    bb26: {
      x = [];
      try {
        const y = shallowCopy({});
        if (y == null) {
          t0 = undefined;
          break bb26;
        }

        x.push(throwInput(y));
      } catch {
        t0 = null;
        break bb26;
      }
    }
    $[0] = x;
    $[1] = t0;
  } else {
    x = $[0];
    t0 = $[1];
  }
  if (t0 !== Symbol.for("react.early_return_sentinel")) {
    return t0;
  }
  return x;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{}],
};

```
      
### Eval output
(kind: ok) null