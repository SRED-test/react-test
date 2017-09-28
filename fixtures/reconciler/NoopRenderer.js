/**
 * This is a renderer of React that doesn't have a render target output.
 * It is used to test that the react-reconciler package doesn't blow up.
 *
 * @flow
 */

'use strict';

var ReactFiberReconciler = require('react-reconciler');
var emptyObject = require('fbjs/lib/emptyObject');
var assert = require('assert');

const UPDATE_SIGNAL = {};

var scheduledCallback = null;

type Container = {rootID: string, children: Array<Instance | TextInstance>};
type Props = {prop: any, hidden?: boolean};
type Instance = {|
  type: string,
  id: number,
  children: Array<Instance | TextInstance>,
  prop: any,
|};
type TextInstance = {|text: string, id: number|};

var instanceCounter = 0;

function appendChild(
  parentInstance: Instance | Container,
  child: Instance | TextInstance
): void {
  const index = parentInstance.children.indexOf(child);
  if (index !== -1) {
    parentInstance.children.splice(index, 1);
  }
  parentInstance.children.push(child);
}

function insertBefore(
  parentInstance: Instance | Container,
  child: Instance | TextInstance,
  beforeChild: Instance | TextInstance
): void {
  const index = parentInstance.children.indexOf(child);
  if (index !== -1) {
    parentInstance.children.splice(index, 1);
  }
  const beforeIndex = parentInstance.children.indexOf(beforeChild);
  if (beforeIndex === -1) {
    throw new Error('This child does not exist.');
  }
  parentInstance.children.splice(beforeIndex, 0, child);
}

function removeChild(
  parentInstance: Instance | Container,
  child: Instance | TextInstance
): void {
  const index = parentInstance.children.indexOf(child);
  if (index === -1) {
    throw new Error('This child does not exist.');
  }
  parentInstance.children.splice(index, 1);
}

var NoopRenderer = ReactFiberReconciler({
  getRootHostContext() {
    return emptyObject;
  },

  getChildHostContext() {
    return emptyObject;
  },

  getPublicInstance(instance) {
    return instance;
  },

  createInstance(type: string, props: Props): Instance {
    const inst = {
      id: instanceCounter++,
      type: type,
      children: [],
      prop: props.prop,
    };
    // Hide from unit tests
    Object.defineProperty(inst, 'id', {value: inst.id, enumerable: false});
    return inst;
  },

  appendInitialChild(
    parentInstance: Instance,
    child: Instance | TextInstance
  ): void {
    parentInstance.children.push(child);
  },

  finalizeInitialChildren(
    domElement: Instance,
    type: string,
    props: Props
  ): boolean {
    return false;
  },

  prepareUpdate(
    instance: Instance,
    type: string,
    oldProps: Props,
    newProps: Props
  ): null | {} {
    return UPDATE_SIGNAL;
  },

  commitMount(instance: Instance, type: string, newProps: Props): void {
    // Noop
  },

  commitUpdate(
    instance: Instance,
    updatePayload: Object,
    type: string,
    oldProps: Props,
    newProps: Props
  ): void {
    instance.prop = newProps.prop;
  },

  shouldSetTextContent(type: string, props: Props): boolean {
    return (
      typeof props.children === 'string' || typeof props.children === 'number'
    );
  },

  resetTextContent(instance: Instance): void {},

  shouldDeprioritizeSubtree(type: string, props: Props): boolean {
    return !!props.hidden;
  },

  createTextInstance(
    text: string,
    rootContainerInstance: Container,
    hostContext: Object,
    internalInstanceHandle: Object
  ): TextInstance {
    var inst = {text: text, id: instanceCounter++};
    // Hide from unit tests
    Object.defineProperty(inst, 'id', {value: inst.id, enumerable: false});
    return inst;
  },

  commitTextUpdate(
    textInstance: TextInstance,
    oldText: string,
    newText: string
  ): void {
    textInstance.text = newText;
  },

  appendChild: appendChild,
  appendChildToContainer: appendChild,
  insertBefore: insertBefore,
  insertInContainerBefore: insertBefore,
  removeChild: removeChild,
  removeChildFromContainer: removeChild,

  scheduleDeferredCallback(callback) {
    if (scheduledCallback) {
      throw new Error(
        'Scheduling a callback twice is excessive. Instead, keep track of ' +
          'whether the callback has already been scheduled.'
      );
    }
    scheduledCallback = callback;
  },

  prepareForCommit(): void {},

  resetAfterCommit(): void {},
});

var rootContainers = new Map();
var roots = new Map();
var DEFAULT_ROOT_ID = '<default>';

let yieldedValues = null;

function* flushUnitsOfWork(n: number): Generator<Array<mixed>, void, void> {
  var didStop = false;
  while (!didStop && scheduledCallback !== null) {
    var cb = scheduledCallback;
    scheduledCallback = null;
    yieldedValues = null;
    var unitsRemaining = n;
    cb({
      timeRemaining() {
        if (yieldedValues !== null) {
          return 0;
        }
        if (unitsRemaining-- > 0) {
          return 999;
        }
        didStop = true;
        return 0;
      },
    });

    if (yieldedValues !== null) {
      const values = yieldedValues;
      yieldedValues = null;
      yield values;
    }
  }
}

var ReactNoop = {
  getChildren(rootID: string = DEFAULT_ROOT_ID) {
    const container = rootContainers.get(rootID);
    if (container) {
      return container.children;
    } else {
      return null;
    }
  },

  // Shortcut for testing a single root
  render(element: React$Element<any>, callback: ?Function) {
    ReactNoop.renderToRootWithID(element, DEFAULT_ROOT_ID, callback);
  },

  renderToRootWithID(
    element: React$Element<any>,
    rootID: string,
    callback: ?Function
  ) {
    let root = roots.get(rootID);
    if (!root) {
      const container = {rootID: rootID, children: []};
      rootContainers.set(rootID, container);
      root = NoopRenderer.createContainer(container);
      roots.set(rootID, root);
    }
    NoopRenderer.updateContainer(element, root, null, callback);
  },

  unmountRootWithID(rootID: string) {
    const root = roots.get(rootID);
    if (root) {
      NoopRenderer.updateContainer(null, root, null, () => {
        roots.delete(rootID);
        rootContainers.delete(rootID);
      });
    }
  },

  flush(): Array<mixed> {
    return ReactNoop.flushUnitsOfWork(Infinity);
  },

  flushUnitsOfWork(n: number): Array<mixed> {
    let values = [];
    for (const value of flushUnitsOfWork(n)) {
      values.push(...value);
    }
    return values;
  },

  batchedUpdates: NoopRenderer.batchedUpdates,

  deferredUpdates: NoopRenderer.deferredUpdates,

  unbatchedUpdates: NoopRenderer.unbatchedUpdates,

  flushSync: NoopRenderer.flushSync,
};

module.exports = ReactNoop;
