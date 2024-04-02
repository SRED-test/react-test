/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext, ReactConsumerType} from 'shared/ReactTypes';
import type {Fiber} from './ReactInternalTypes';

import {
  disableLegacyMode,
  enableLegacyHidden,
  enableRenderableContext,
} from 'shared/ReactFeatureFlags';

import {
  FunctionComponent,
  ClassComponent,
  HostRoot,
  HostPortal,
  HostComponent,
  HostHoistable,
  HostSingleton,
  HostText,
  Fragment,
  Mode,
  ContextConsumer,
  ContextProvider,
  ForwardRef,
  Profiler,
  SuspenseComponent,
  MemoComponent,
  SimpleMemoComponent,
  LazyComponent,
  IncompleteClassComponent,
  DehydratedFragment,
  SuspenseListComponent,
  ScopeComponent,
  OffscreenComponent,
  LegacyHiddenComponent,
  CacheComponent,
  TracingMarkerComponent,
} from 'react-reconciler/src/ReactWorkTags';
import getComponentNameFromType from 'shared/getComponentNameFromType';
import {REACT_STRICT_MODE_TYPE} from 'shared/ReactSymbols';

// Keep in sync with shared/getComponentNameFromType
function getWrappedName(
  outerType: mixed,
  innerType: any,
  wrapperName: string,
): string {
  const functionName = innerType.displayName || innerType.name || '';
  return (
    (outerType: any).displayName ||
    (functionName !== '' ? `${wrapperName}(${functionName})` : wrapperName)
  );
}

// Keep in sync with shared/getComponentNameFromType
function getContextName(type: ReactContext<any>) {
  return type.displayName || 'Context';
}

export default function getComponentNameFromFiber(fiber: Fiber): string | null {
  const {tag, type} = fiber;
  switch (tag) {
    case CacheComponent:
      return 'Cache';
    case ContextConsumer:
      if (enableRenderableContext) {
        const consumer: ReactConsumerType<any> = (type: any);
        return getContextName(consumer._context) + '.Consumer';
      } else {
        const context: ReactContext<any> = (type: any);
        return getContextName(context) + '.Consumer';
      }
    case ContextProvider:
      if (enableRenderableContext) {
        const context: ReactContext<any> = (type: any);
        return getContextName(context) + '.Provider';
      } else {
        const provider = (type: any);
        return getContextName(provider._context) + '.Provider';
      }
    case DehydratedFragment:
      return 'DehydratedFragment';
    case ForwardRef:
      return getWrappedName(type, type.render, 'ForwardRef');
    case Fragment:
      return 'Fragment';
    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      // Host component type is the display name (e.g. "div", "View")
      return type;
    case HostPortal:
      return 'Portal';
    case HostRoot:
      return 'Root';
    case HostText:
      return 'Text';
    case LazyComponent:
      // Name comes from the type in this case; we don't have a tag.
      return getComponentNameFromType(type);
    case Mode:
      if (type === REACT_STRICT_MODE_TYPE) {
        // Don't be less specific than shared/getComponentNameFromType
        return 'StrictMode';
      }
      return 'Mode';
    case OffscreenComponent:
      return 'Offscreen';
    case Profiler:
      return 'Profiler';
    case ScopeComponent:
      return 'Scope';
    case SuspenseComponent:
      return 'Suspense';
    case SuspenseListComponent:
      return 'SuspenseList';
    case TracingMarkerComponent:
      return 'TracingMarker';
    // The display name for these tags come from the user-provided type:
    case IncompleteClassComponent:
    case IncompleteFunctionComponent:
      if (disableLegacyMode) {
        break;
      }
    // Fallthrough
    case ClassComponent:
    case FunctionComponent:
    case MemoComponent:
    case SimpleMemoComponent:
      if (typeof type === 'function') {
        return (type: any).displayName || type.name || null;
      }
      if (typeof type === 'string') {
        return type;
      }
      break;
    case LegacyHiddenComponent:
      if (enableLegacyHidden) {
        return 'LegacyHidden';
      }
  }

  return null;
}
