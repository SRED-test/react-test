
## Input

```javascript
function Component({}) {
  const outer = () => {
    const inner = () => {
      return x;
    };
    const x = 3;
    return inner();
  };
  return <div>{outer()}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{}],
};

```

## Code

```javascript
import { c as useMemoCache } from "react";
function Component(t0) {
  const $ = useMemoCache(2);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      const inner = () => x;

      const x = 3;
      return inner();
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const outer = t1;
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = <div>{outer()}</div>;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  return t2;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{}],
};

```
      
### Eval output
(kind: ok) <div>3</div>