
## Input

```javascript
// @flow @gating
import { memo } from "react";

type Props = React.ElementConfig<typeof Component>;

component Component(value: string) {
  return <div>{value}</div>;
}

export default memo<Props>(Component);

```

## Code

```javascript
import { isForgetEnabled_Fixtures } from "ReactForgetFeatureFlag";
import { memo, c as useMemoCache } from "react";

type Props = React.ElementConfig<typeof Component>;
const Component = isForgetEnabled_Fixtures()
  ? function Component(t0) {
      const $ = useMemoCache(2);
      const { value } = t0;
      let t1;
      if ($[0] !== value) {
        t1 = <div>{value}</div>;
        $[0] = value;
        $[1] = t1;
      } else {
        t1 = $[1];
      }
      return t1;
    }
  : function Component({ value }: $ReadOnly<{ value: string }>) {
      return <div>{value}</div>;
    };

export default memo<Props>(Component);

```
      