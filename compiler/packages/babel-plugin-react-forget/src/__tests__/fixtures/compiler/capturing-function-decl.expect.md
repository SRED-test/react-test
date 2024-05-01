
## Input

```javascript
function component(a) {
  let t = { a };
  function x() {
    t.foo();
  }
  x(t);
  return t;
}

export const FIXTURE_ENTRYPOINT = {
  fn: component,
  params: ["TodoAdd"],
  isComponent: "TodoAdd",
};

```

## Code

```javascript
import { c as useMemoCache } from "react";
function component(a) {
  const $ = useMemoCache(2);
  let t;
  if ($[0] !== a) {
    t = { a };
    const x = function x() {
      t.foo();
    };

    x(t);
    $[0] = a;
    $[1] = t;
  } else {
    t = $[1];
  }
  return t;
}

export const FIXTURE_ENTRYPOINT = {
  fn: component,
  params: ["TodoAdd"],
  isComponent: "TodoAdd",
};

```
      