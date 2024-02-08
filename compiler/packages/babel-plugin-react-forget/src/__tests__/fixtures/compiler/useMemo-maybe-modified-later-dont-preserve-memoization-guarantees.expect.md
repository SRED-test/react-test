
## Input

```javascript
// @enablePreserveExistingMemoizationGuarantees:false
import { useMemo } from "react";
import { identity, makeObject_Primitives, mutate } from "shared-runtime";

function Component(props) {
  const object = useMemo(() => makeObject_Primitives(), []);
  identity(object);
  return object;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{}],
};

```

## Code

```javascript
// @enablePreserveExistingMemoizationGuarantees:false
import { useMemo, unstable_useMemoCache as useMemoCache } from "react";
import { identity, makeObject_Primitives, mutate } from "shared-runtime";

function Component(props) {
  const $ = useMemoCache(2);
  let t7;
  let object;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t7 = makeObject_Primitives();
    object = t7;
    identity(object);
    $[0] = object;
    $[1] = t7;
  } else {
    object = $[0];
    t7 = $[1];
  }
  return object;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{}],
};

```
      
### Eval output
(kind: ok) {"a":0,"b":"value1","c":true}