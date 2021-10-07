/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext} from 'shared/ReactTypes';
import type {FiberRoot} from './ReactInternalTypes';
import type {Lanes} from './ReactFiberLane.new';
import type {StackCursor} from './ReactFiberStack.new';

import {enableCache} from 'shared/ReactFeatureFlags';
import {REACT_CONTEXT_TYPE} from 'shared/ReactSymbols';

import {isPrimaryRenderer} from './ReactFiberHostConfig';
import {createCursor, push, pop} from './ReactFiberStack.new';
import {pushProvider, popProvider} from './ReactFiberNewContext.new';

export type Cache = {|
  controller: AbortController,
  data: Map<() => mixed, mixed>,
  refCount: number,
  key?: string,
|};

export type CacheComponentState = {|
  +parent: Cache,
  +cache: Cache,
|};

export type SpawnedCachePool = {|
  +parent: Cache,
  +pool: Cache,
|};

export const CacheContext: ReactContext<Cache> = enableCache
  ? {
      $$typeof: REACT_CONTEXT_TYPE,
      // We don't use Consumer/Provider for Cache components. So we'll cheat.
      Consumer: (null: any),
      Provider: (null: any),
      // We'll initialize these at the root.
      _currentValue: (null: any),
      _currentValue2: (null: any),
      _threadCount: 0,
    }
  : (null: any);

if (__DEV__ && enableCache) {
  CacheContext._currentRenderer = null;
  CacheContext._currentRenderer2 = null;
}

// The cache that newly mounted Cache boundaries should use. It's either
// retrieved from the cache pool, or the result of a refresh.
let pooledCache: Cache | null = null;

// When retrying a Suspense/Offscreen boundary, we override pooledCache with the
// cache from the render that suspended.
const prevFreshCacheOnStack: StackCursor<Cache | null> = createCursor(null);

// Creates a new empty Cache instance with a ref-count of 0. The caller is responsible
// for retaining the cache once it is in use (retainCache), and releasing the cache
// once it is no longer needed (releaseCache).
let _cacheIndex = 0;
export function createCache(): Cache {
  const cache: Cache = {
    controller: new AbortController(),
    data: new Map(),
    refCount: 0,
  };

  // TODO: remove debugging code
  if (__DEV__) {
    cache.key = '' + _cacheIndex++;
    trace(`createCache #${cache.key ?? ''}`);
  }

  return cache;
}

export function retainCache(cache: Cache) {
  if (__DEV__) {
    trace(
      `retainCache #${cache.key ?? ''} ${cache.refCount} -> ${cache.refCount +
        1}`,
    );
  }
  cache.refCount++;
}

// Cleanup a cache instance, potentially freeing it if there are no more references
export function releaseCache(cache: Cache) {
  if (__DEV__) {
    trace(
      `releaseCache #${cache.key ?? ''} ${cache.refCount} -> ${cache.refCount -
        1}`,
    );
  }
  cache.refCount--;
  if (__DEV__) {
    if (cache.refCount < 0) {
      throw new Error(
        'Error in React: cache reference count should not be negative',
      );
    }
  }
  if (cache.refCount === 0) {
    // TODO: considering scheduling this call, and adding error handling for
    // any event listeners that get triggered.
    cache.controller.abort();
  }
}

export function trace(msg: string, levels: number = 2) {
  if (__DEV__) {
    // console.log(
    //   `${msg}:\n` +
    //     new Error().stack
    //       .split('\n')
    //       .slice(3, 3 + Math.max(levels, 0))
    //       .join('\n'),
    // );
  }
}

export function pushCacheProvider(workInProgress: Fiber, cache: Cache) {
  if (!enableCache) {
    return;
  }
  pushProvider(workInProgress, CacheContext, cache);
}

export function popCacheProvider(workInProgress: Fiber, cache: Cache) {
  if (!enableCache) {
    return;
  }
  popProvider(CacheContext, workInProgress);
}

export function requestCacheFromPool(renderLanes: Lanes): Cache {
  if (!enableCache) {
    return (null: any);
  }
  if (pooledCache !== null) {
    return pooledCache;
  }
  // Create a fresh cache.
  pooledCache = createCache();
  return pooledCache;
}

export function pushRootCachePool(root: FiberRoot) {
  if (!enableCache) {
    return;
  }
  // When we start rendering a tree, read the pooled cache for this render
  // from `root.pooledCache`. If it's currently `null`, we will lazily
  // initialize it the first type it's requested. However, we only mutate
  // the root itself during the complete/unwind phase of the HostRoot.
  const rootCache = root.pooledCache;
  if (rootCache != null) {
    trace('pushRootCachePool');
    pooledCache = rootCache;
    root.pooledCache = null;
  } else {
    pooledCache = null;
  }
}

export function popRootCachePool(root: FiberRoot, renderLanes: Lanes) {
  if (!enableCache) {
    return;
  }
  // The `pooledCache` variable points to the cache that was used for new
  // cache boundaries during this render, if any. Move ownership of the
  // cache to the root so that parallel transitions may share the same
  // cache. We will clear this field once all the transitions that depend
  // on it (which we track with `pooledCacheLanes`) have committed.
  root.pooledCache = pooledCache;
  if (pooledCache !== null) {
    trace('popRootCachePool');
    root.pooledCacheLanes |= renderLanes;
  }
  // set to null, conceptually we are moving ownership to the root
  pooledCache = null;
}

export function restoreSpawnedCachePool(
  offscreenWorkInProgress: Fiber,
  prevCachePool: SpawnedCachePool,
): SpawnedCachePool | null {
  if (!enableCache) {
    return (null: any);
  }
  const nextParentCache = isPrimaryRenderer
    ? CacheContext._currentValue
    : CacheContext._currentValue2;
  if (nextParentCache !== prevCachePool.parent) {
    // There was a refresh. Don't bother restoring anything since the refresh
    // will override it.
    trace('restoreSpawnedCachePool refresh');
    return null;
  } else {
    // No refresh. Resume with the previous cache. This will override the cache
    // pool so that any new Cache boundaries in the subtree use this one instead
    // of requesting a fresh one.
    push(prevFreshCacheOnStack, pooledCache, offscreenWorkInProgress);
    pooledCache = prevCachePool.pool;

    // Return the cache pool to signal that we did in fact push it. We will
    // assign this to the field on the fiber so we know to pop the context.
    trace('restoreSpawnedCachePool hasCache=' + (pooledCache != null));
    return prevCachePool;
  }
}

// Note: Ideally, `popCachePool` would return this value, and then we would pass
// it to `getSuspendedCachePool`. But factoring reasons, those two functions are
// in different phases/files. They are always called in sequence, though, so we
// can stash the value here temporarily.
let _suspendedPooledCache: Cache | null = null;

export function popCachePool(workInProgress: Fiber) {
  if (!enableCache) {
    return;
  }
  trace('popCachePool');
  _suspendedPooledCache = pooledCache;
  pooledCache = prevFreshCacheOnStack.current;
  pop(prevFreshCacheOnStack, workInProgress);
}

export function getSuspendedCachePool(): SpawnedCachePool | null {
  if (!enableCache) {
    return null;
  }
  trace(
    'getSuspendedCachePool hasCache=' +
      ((pooledCache ?? _suspendedPooledCache) != null),
  );

  // We check the cache on the stack first, since that's the one any new Caches
  // would have accessed.
  let pool = pooledCache;
  if (pool === null) {
    // There's no pooled cache above us in the stack. However, a child in the
    // suspended tree may have requested a fresh cache pool. If so, we would
    // have unwound it with `popCachePool`.
    if (_suspendedPooledCache !== null) {
      pool = _suspendedPooledCache;
      _suspendedPooledCache = null;
    } else {
      // There's no suspended cache pool.
      return null;
    }
  }

  return {
    // We must also save the parent, so that when we resume we can detect
    // a refresh.
    parent: isPrimaryRenderer
      ? CacheContext._currentValue
      : CacheContext._currentValue2,
    pool,
  };
}

export function getOffscreenDeferredCachePool(): SpawnedCachePool | null {
  if (!enableCache) {
    return null;
  }

  if (pooledCache === null) {
    // There's no deferred cache pool.
    return null;
  }
  trace('getOffscreenDeferredCachePool');

  return {
    // We must also store the parent, so that when we resume we can detect
    // a refresh.
    parent: isPrimaryRenderer
      ? CacheContext._currentValue
      : CacheContext._currentValue2,
    pool: pooledCache,
  };
}
