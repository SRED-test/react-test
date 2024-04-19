
## Input

```javascript
// @compilationMode(infer)
import { useNoAlias } from "shared-runtime";

// This should be compiled by Forget
function useFoo(value1, value2) {
  return {
    value: useNoAlias(value1 + value2),
  };
}

export const FIXTURE_ENTRYPOINT = {
  fn: useFoo,
  params: [1, 2],
};

```

## Code

```javascript
import { unstable_useMemoCache as useMemoCache } from "react"; // @compilationMode(infer)
import { useNoAlias } from "shared-runtime";

// This should be compiled by Forget
function useFoo(value1, value2) {
  const $ = useMemoCache(2);

  const t0 = useNoAlias(value1 + value2);
  let t1;
  if ($[0] !== t0) {
    t1 = { value: t0 };
    $[0] = t0;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: useFoo,
  params: [1, 2],
};

```
      
### Eval output
(kind: ok) {"value":{}}