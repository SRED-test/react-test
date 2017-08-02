/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberDevToolsHook
 * @flow
 */

'use strict';

import type {Fiber} from 'ReactFiber';
import type {FiberRoot} from 'ReactFiberRoot';

declare var __REACT_DEVTOOLS_GLOBAL_HOOK__: Object | void;

if (__DEV__) {
  var warning = require('fbjs/lib/warning');
}

let rendererID = null;

function injectInternals(internals: Object): boolean {
  if (__DEV__) {
    warning(rendererID == null, 'Cannot inject into DevTools twice.');
  }
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined') {
    // No DevTools
    return false;
  }
  if (!__REACT_DEVTOOLS_GLOBAL_HOOK__.supportsFiber) {
    if (__DEV__) {
      warning(
        false,
        'The installed version of React DevTools is too old and will not work ' +
          'with the current version of React. Please update React DevTools. ' +
          'https://fb.me/react-devtools#installation',
      );
    }
    // DevTools exists, even though it doesn't support Fiber.
    return true;
  }
  try {
    rendererID = __REACT_DEVTOOLS_GLOBAL_HOOK__.inject(internals);
  } catch (err) {
    // Catch all errors because it is unsafe to throw during initialization.
    if (__DEV__) {
      warning(false, 'React DevTools encountered an error: %s.', err);
    }
  }
  // DevTools exists
  return true;
}

function onCommitRoot(root: FiberRoot) {
  if (rendererID == null) {
    return;
  }
  try {
    __REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot(rendererID, root);
  } catch (err) {
    // Catch all errors because it is unsafe to throw in the commit phase.
    if (__DEV__) {
      warning(false, 'React DevTools encountered an error: %s', err);
    }
  }
}

function onCommitUnmount(fiber: Fiber) {
  if (rendererID == null) {
    return;
  }
  try {
    __REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberUnmount(rendererID, fiber);
  } catch (err) {
    // Catch all errors because it is unsafe to throw in the commit phase.
    if (__DEV__) {
      warning(false, 'React DevTools encountered an error: %s', err);
    }
  }
}

exports.injectInternals = injectInternals;
exports.onCommitRoot = onCommitRoot;
exports.onCommitUnmount = onCommitUnmount;
