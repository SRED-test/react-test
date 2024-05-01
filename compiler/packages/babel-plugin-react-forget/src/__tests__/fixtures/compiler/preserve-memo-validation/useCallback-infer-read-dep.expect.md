
## Input

```javascript
// @validatePreserveExistingMemoizationGuarantees
import { useCallback } from "react";
import { sum } from "shared-runtime";

function useFoo() {
  const val = [1, 2, 3];

  return useCallback(() => {
    return sum(...val);
  }, [val]);
}

export const FIXTURE_ENTRYPOINT = {
  fn: useFoo,
  params: [],
};

```

## Code

```javascript
// @validatePreserveExistingMemoizationGuarantees
import { useCallback, c as useMemoCache } from "react";
import { sum } from "shared-runtime";

function useFoo() {
  const $ = useMemoCache(2);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [1, 2, 3];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const val = t0;
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => sum(...val);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: useFoo,
  params: [],
};

```
      
### Eval output
(kind: ok) "[[ function params=0 ]]"