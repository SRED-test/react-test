/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {pushDispatcher, popDispatcher} from '../shared/ReactDOMDispatcher';

let currentResourceMap = null;

export const DNS_PREFETCH = 0;
export const PRECONNECT = 1;
export const PREFETCH = 2;
export const PRELOAD = 3;
export const PREINIT = 4;
type Priority = 0 | 1 | 2 | 3 | 4;

export const CORS_NONE = 0;
export const CORS_ANON = 1;
export const CORS_CREDS = 2;
type CrossOrigin = 0 | 1 | 2;

export const NO_RESOURCE = /*            */ 0b0000;
export const HOST_RESOURCE = /*          */ 0b0001;

export const INITIALIZABLE_RESOURCE = /* */ 0b0110;
export const STYLE_RESOURCE = /*         */ 0b0010;
export const SCRIPT_RESOURCE = /*        */ 0b0100;

export const FONT_RESOURCE = /*          */ 0b1000;
type ResourceAsType = number;

export type Resource = {
  // "priority" and "as" define the branching for how to flush these resources.
  // Not all combinations are valid but flow isn't smart enought to allow for disjoint unions
  // while keeping object allocations and mutations as small as possible in code
  priority: Priority,
  as: ResourceAsType,
  // "href" is the resource location but also the key to define uniquenes of a given resource
  href: string,
  // "flushed" is how we track whether we need to emit the resource in the next flush
  flushed: boolean,
  // Certain resources have module variants. only applies to 'script' resources
  module: boolean,
  crossorigin: CrossOrigin,
  type: MimeType,
};
type ResourceMap = Map<string, Resource>;

type MimeType = string;

export function prepareToRender(resourceMap: ResourceMap) {
  currentResourceMap = resourceMap;

  pushDispatcher(Dispatcher);
}

export function cleanupAfterRender() {
  currentResourceMap = null;

  popDispatcher();
}

type CrossOriginOption = boolean | string | 'use-credentials';
type PrefetchDNSOptions = {crossOrigin?: CrossOriginOption};
function prefetchDNS(href: string, options?: PrefetchDNSOptions) {
  if (currentResourceMap === null) {
    // @TODO excluding these errors since these methods are not exported (yet) and the error logic is going to evolve
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error(
      'prefetchDNS was called while currentResourceMap is null. this is a bug in React',
    );
  }
  const crossOriginOption = options ? options.crossOrigin : false;
  let crossorigin;
  if (crossOriginOption === 'use-credentials') {
    crossorigin = CORS_CREDS;
  } else if (
    typeof crossOriginOption === 'string' ||
    crossOriginOption === true
  ) {
    crossorigin = CORS_ANON;
  } else {
    crossorigin = CORS_NONE;
  }
  const key = href + crossorigin;
  const currentResource = currentResourceMap.get(key);
  if (currentResource) {
    // In this Float function we can avoid checking priority because DNS_PREFETCH is the lowest priority
    return;
  } else {
    const resource: Resource = {
      priority: DNS_PREFETCH,
      as: HOST_RESOURCE,
      href,
      flushed: false,
      module: false,
      crossorigin,
      type: '',
    };
    currentResourceMap.set(key, resource);
  }
}

type PreconnectOptions = {crossOrigin?: CrossOriginOption};
function preconnect(href: string, options?: PreconnectOptions) {
  if (currentResourceMap === null) {
    // @TODO excluding these errors since these methods are not exported (yet) and the error logic is going to evolve
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error(
      'preconnect was called while currentResourceMap is null. this is a bug in React',
    );
  }
  const crossOriginOption = options ? options.crossOrigin : false;
  let crossorigin;
  if (crossOriginOption === 'use-credentials') {
    crossorigin = CORS_CREDS;
  } else if (
    typeof crossOriginOption === 'string' ||
    crossOriginOption === true
  ) {
    crossorigin = CORS_ANON;
  } else {
    crossorigin = CORS_NONE;
  }
  const key = href + crossorigin;
  const currentResource = currentResourceMap.get(key);
  if (currentResource) {
    if (currentResource.priority >= PRECONNECT) {
      return;
    } else {
      currentResource.priority = PRECONNECT;
      // We are upgrading from prefetchDNS which also has an "as" of "host" so we don't need to reset it here
      currentResource.flushed = false;
    }
  } else {
    const resource: Resource = {
      priority: PRECONNECT,
      as: HOST_RESOURCE,
      href,
      flushed: false,
      module: false,
      crossorigin,
      type: '',
    };
    currentResourceMap.set(key, resource);
  }
}

type PrefetchAs = 'style' | 'font' | 'script';
type PrefetchOptions = {as: PrefetchAs, crossOrigin?: CrossOriginOption};
function prefetch(href: string, options: PrefetchOptions) {
  if (currentResourceMap === null) {
    // @TODO excluding these errors since these methods are not exported (yet) and the error logic is going to evolve
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error(
      'prefetch was called while currentResourceMap is null. this is a bug in React',
    );
  }
  if (!options) {
    return;
  }
  let as;
  switch (options.as) {
    case 'style':
      as = STYLE_RESOURCE;
      break;
    case 'script':
      as = SCRIPT_RESOURCE;
      break;
    case 'font':
      as = FONT_RESOURCE;
      break;
    default:
      return;
  }
  const crossOriginOption = options.crossOrigin;
  let crossorigin;
  if (as === FONT_RESOURCE) {
    crossorigin = CORS_ANON;
  } else if (crossOriginOption === 'use-credentials') {
    crossorigin = CORS_CREDS;
  } else if (
    typeof crossOriginOption === 'string' ||
    crossOriginOption === true
  ) {
    crossorigin = CORS_ANON;
  } else {
    crossorigin = CORS_NONE;
  }
  const key = href + crossorigin;
  const currentResource = currentResourceMap.get(key);
  if (currentResource) {
    if (currentResource.priority >= PREFETCH) {
      return;
    } else {
      currentResource.priority = PREFETCH;
      currentResource.as = as;
      currentResource.flushed = false;
    }
  } else {
    const resource: Resource = {
      priority: PREFETCH,
      as,
      href,
      flushed: false,
      module: false,
      crossorigin,
      type: '',
    };
    currentResourceMap.set(key, resource);
  }
}

type PreloadAs = 'style' | 'font' | 'script';
type PreloadOptions = {as: PreloadAs, crossOrigin?: CrossOriginOption};
function preload(href: string, options: PreloadOptions) {
  if (currentResourceMap === null) {
    // @TODO excluding these errors since these methods are not exported (yet) and the error logic is going to evolve
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error(
      'preload was called while currentResourceMap is null. this is a bug in React',
    );
  }
  if (!options) {
    return;
  }
  let as;
  switch (options.as) {
    case 'style':
      as = STYLE_RESOURCE;
      break;
    case 'script':
      as = SCRIPT_RESOURCE;
      break;
    case 'font':
      as = FONT_RESOURCE;
      break;
    default:
      return;
  }
  const crossOriginOption = options.crossOrigin;
  let crossorigin;
  if (as === FONT_RESOURCE) {
    crossorigin = CORS_ANON;
  } else if (crossOriginOption === 'use-credentials') {
    crossorigin = CORS_CREDS;
  } else if (
    typeof crossOriginOption === 'string' ||
    crossOriginOption === true
  ) {
    crossorigin = CORS_ANON;
  } else {
    crossorigin = CORS_NONE;
  }
  const key = href + crossorigin;
  const currentResource = currentResourceMap.get(key);
  if (currentResource) {
    if (currentResource.priority >= PRELOAD) {
      return;
    } else {
      currentResource.priority = PRELOAD;
      currentResource.as = as;
      currentResource.flushed = false;
    }
  } else {
    const resource: Resource = {
      priority: PRELOAD,
      as,
      href,
      flushed: false,
      module: false,
      crossorigin,
      type: '',
    };
    currentResourceMap.set(key, resource);
  }
}

type PreinitAs = 'style' | 'script';
type PreinitOptions = {as: PreinitAs, crossOrigin?: CrossOriginOption};
function preinit(href: string, options: PreinitOptions) {
  if (__DEV__) {
    if (!options || (options.as !== 'style' && options.as !== 'script')) {
      const reason = !options
        ? 'no option argument was provided'
        : !('as' in options)
        ? `no "as" property was provided in the options argument`
        : // eslint-disable-next-line react-internal/safe-string-coercion
          `the "as" type provided was ${String(options.as)}`;
      // @TODO excluding these errors since these methods are not exported (yet) and the error logic is going to evolve
      // eslint-disable-next-line react-internal/prod-error-codes
      throw new Error(
        `preinit was called without specifying a valid "as" type in the options argument. preinit supports style and script resources only and ${reason}`,
      );
    }
  }
  if (currentResourceMap === null) {
    // @TODO excluding these errors since these methods are not exported (yet) and the error logic is going to evolve
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error(
      'preinit was called while currentResourceMap is null. this is a bug in React',
    );
  }
  if (!options) {
    return;
  }
  let as;
  switch (options.as) {
    case 'style':
      as = STYLE_RESOURCE;
      break;
    case 'script':
      as = SCRIPT_RESOURCE;
      break;
    default:
      return;
  }
  const crossOriginOption = options.crossOrigin;
  let crossorigin;
  if (crossOriginOption === 'use-credentials') {
    crossorigin = CORS_CREDS;
  } else if (
    typeof crossOriginOption === 'string' ||
    crossOriginOption === true
  ) {
    crossorigin = CORS_ANON;
  } else {
    crossorigin = CORS_NONE;
  }
  const key = href + crossorigin;
  const currentResource = currentResourceMap.get(key);
  if (currentResource) {
    if (currentResource.priority >= PREINIT) {
      return;
    } else {
      currentResource.priority = PREINIT;
      currentResource.as = as;
      currentResource.flushed = false;
    }
  } else {
    const resource: Resource = {
      priority: PREINIT,
      as,
      href,
      flushed: false,
      module: false,
      crossorigin,
      type: '',
    };
    currentResourceMap.set(key, resource);
  }
}

// Construct a resource from link props.
// Returns true if the link was fully described by the resource and the link can omitted from the stream.
// Returns false if the link should still be emitted to the stream
export function resourcesFromLink(props: Object): boolean {
  const rel = props.rel;
  const href = props.href;
  if (typeof rel !== 'string' && typeof href !== 'string') {
    return false;
  }

  const crossOrigin = props.hasOwnProperty('crossOrigin')
    ? props.crossOrigin
    : false;

  switch (rel) {
    // case 'dns-prefetch': {
    //   crossOrigin == null || crossOrigin === false
    //     ? prefetchDNS(href)
    //     : prefetchDNS(href, {crossOrigin});
    //   return true;
    // }
    // case 'preconnect': {
    //   crossOrigin == null || crossOrigin === false
    //     ? preconnect(href)
    //     : preconnect(href, {crossOrigin});
    //   return true;
    // }
    // case 'prefetch': {
    //   let as = props.as;
    //   if (as === 'style' || as === 'script' || as === 'font') {
    //     prefetch(href, {as, crossOrigin});
    //     return true;
    //   }
    //   return false;
    // }
    // case 'preload': {
    //   let as = props.as;
    //   if (as === 'style' || as === 'script' || as === 'font') {
    //     preload(href, {as, crossOrigin});
    //     return true;
    //   }
    //   return false;
    // }
    case 'stylesheet': {
      preinit(href, {as: 'style', crossOrigin});
      // If this component is a valid resource, meaning it does not have anything that would
      // cause it to need to be treated like a component we can omit it and return true here.
      // If it is in fact a component it will need to be inserted and we return false here.
      return validateResourceProps(props);
    }
    default:
      return false;
  }
}

// returns false if props object contains any props which invalidate
// treating the element entirely as a Resource
function validateResourceProps(props: Object): boolean {
  for (const prop in props) {
    if (prop.toLowerCase().startsWith('data-')) {
      return false;
    }
  }
  return true;
}

// Construct a resource from script props.
export function resourcesFromScript(props: Object) {
  // const src = props.src;
  // if (typeof src !== 'string') {
  //   return;
  // }

  // let crossOrigin = props.hasOwnProperty('crossOrigin')
  //   ? props.crossOrigin
  //   : false;

  // preload(src, {as: 'script', crossOrigin});
  return;
}

const Dispatcher = {
  prefetchDNS,
  preconnect,
  prefetch,
  preload,
  preinit,
};
