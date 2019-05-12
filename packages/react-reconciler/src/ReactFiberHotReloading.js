/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactElement} from 'shared/ReactElementType';
import type {Fiber} from './ReactFiber';
import type {FiberRoot} from './ReactFiberRoot';

import {
  batchedUpdates,
  scheduleWork,
  flushPassiveEffects,
} from './ReactFiberScheduler';
import {Sync} from './ReactFiberExpirationTime';
import {FunctionComponent} from 'shared/ReactWorkTags';

type Family = {|
  current: any,
|};

type HotReloadingInterface = {|
  scheduleHotUpdate: (root: FiberRoot, families: Set<Family>) => void,
|};

// Avoid any overhead even in DEV when hot reloading is off:
export let resolveTypeForHotReloading = (type: any): any => type;
export let isCompatibleFamilyForHotReloading = (
  fiber: Fiber,
  element: ReactElement,
) => false;

export function enableHotReloading(
  familiesByType: WeakMap<any, Family>,
): ?HotReloadingInterface {
  if (__DEV__) {
    resolveTypeForHotReloading = type => {
      let family = familiesByType.get(type);
      if (family === undefined) {
        return type;
      }
      // Use the latest known implementation.
      return family.current;
    };

    isCompatibleFamilyForHotReloading = (
      fiber: Fiber,
      element: ReactElement,
    ): boolean => {
      // If we got here, we know types aren't === equal.
      switch (fiber.tag) {
        case FunctionComponent: {
          const prevType = fiber.elementType;
          const nextType = element.type;
          if (typeof nextType !== 'function') {
            return false;
          }
          const prevFamily = familiesByType.get(prevType);
          if (
            prevFamily !== undefined &&
            prevFamily === familiesByType.get(nextType)
          ) {
            return true;
          }
          return false;
        }
        // TODO: support memo, forwardRef, and maybe lazy.
        default:
          return false;
      }
    };

    let scheduleHotUpdate = (root: FiberRoot, families: Set<Family>): void => {
      flushPassiveEffects();
      batchedUpdates(() => {
        scheduleFibersWithFamiliesRecursively(root.current, families);
      });
    };

    let scheduleFibersWithFamiliesRecursively = (
      fiber: Fiber,
      families: Set<Family>,
    ) => {
      const {child, sibling, type} = fiber;
      // TODO: handle other types.
      if (typeof type === 'function') {
        const family = familiesByType.get(type);
        if (family !== undefined) {
          if (families.has(family)) {
            // TODO: skip shallow or custom memo bailouts too.
            fiber.memoizedProps = {...fiber.memoizedProps};
            scheduleWork(fiber, Sync);
            // TODO: remount Hooks like useEffect.
          }
          // TODO: remount the whole component if necessary.
        }
      }
      if (child !== null) {
        scheduleFibersWithFamiliesRecursively(child, families);
      }
      if (sibling !== null) {
        scheduleFibersWithFamiliesRecursively(sibling, families);
      }
    };

    return {
      scheduleHotUpdate,
    };
  }
}
