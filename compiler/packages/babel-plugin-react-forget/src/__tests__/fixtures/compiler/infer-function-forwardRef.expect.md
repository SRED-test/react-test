
## Input

```javascript
// @compilationMode(infer)
React.forwardRef((props) => {
  return <div />;
});

```

## Code

```javascript
import { c as useMemoCache } from "react"; // @compilationMode(infer)
React.forwardRef((props) => {
  const $ = useMemoCache(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <div />;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
});

```
      