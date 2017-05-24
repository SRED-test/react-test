/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberBeginWork
 * @flow
 */

'use strict';

import type {Fiber, ProgressedWork} from 'ReactFiber';
import type {FiberRoot} from 'ReactFiberRoot';
import type {HostContext} from 'ReactFiberHostContext';
import type {HydrationContext} from 'ReactFiberHydrationContext';
import type {HostConfig} from 'ReactFiberReconciler';
import type {PriorityLevel} from 'ReactPriorityLevel';

var {createWorkInProgress, createProgressedWork, largerPriority} = require('ReactFiber');
var {
  mountChildFibersInPlace,
  reconcileChildFibers,
  reconcileChildFibersInPlace,
} = require('ReactChildFiber');
var {beginUpdateQueue} = require('ReactFiberUpdateQueue');
var {transferEffectsToParent} = require('ReactFiberCompleteWork');
var ReactTypeOfWork = require('ReactTypeOfWork');
var {
  getMaskedContext,
  getUnmaskedContext,
  hasContextChanged,
  pushContextProvider,
  pushTopLevelContextObject,
  invalidateContextProvider,
} = require('ReactFiberContext');
var {
  HostRoot,
  HostComponent,
  HostText,
  IndeterminateComponent,
  FunctionalComponent,
  ClassComponent,
  Fragment,
} = ReactTypeOfWork;
var {
  ClassUpdater,
  validateClassInstance,
  callClassInstanceMethod,
} = require('ReactFiberClassComponent');
var {NoWork, OffscreenPriority} = require('ReactPriorityLevel');
var {Placement, Update, ContentReset, Ref, Err, Callback} = require('ReactTypeOfSideEffect');
var {AsyncUpdates} = require('ReactTypeOfInternalContext');
var {ReactCurrentOwner} = require('ReactGlobalSharedState');
var ReactFeatureFlags = require('ReactFeatureFlags');
var ReactInstanceMap = require('ReactInstanceMap');
var invariant = require('fbjs/lib/invariant');
var shallowEqual = require('fbjs/lib/shallowEqual');

if (__DEV__) {
  var ReactDebugCurrentFiber = require('ReactDebugCurrentFiber');
  var warning = require('fbjs/lib/warning');
  var {startPhaseTimer, stopPhaseTimer} = require('ReactDebugFiberPerf');
  var getComponentName = require('getComponentName');

  var warnedAboutStatelessRefs = {};
}

module.exports = function<T, P, I, TI, PI, C, CX, PL>(
  config: HostConfig<T, P, I, TI, PI, C, CX, PL>,
  hostContext: HostContext<C, CX>,
  hydrationContext: HydrationContext<I, TI, C>,
  scheduleUpdate: (fiber: Fiber, priorityLevel: PriorityLevel) => void,
  getPriorityContext: (fiber: Fiber, forceAsync: boolean) => PriorityLevel,
) {
  const {
    shouldSetTextContent,
    useSyncScheduling,
    shouldDeprioritizeSubtree,
  } = config;

  const {pushHostContext, pushHostContainer} = hostContext;
  const classUpdater = ClassUpdater(scheduleUpdate, getPriorityContext);

  function checkForUpdatedRef(current: Fiber | null, workInProgress: Fiber) {
    const ref = workInProgress.ref;
    if (ref !== null && (current === null || current.ref !== ref)) {
      // We have a new or updated ref. Schedule a Ref effect so that it
      // gets attached during the commit phase.
      workInProgress.effectTag |= Ref;
    }
  }

  function beginHostRoot(current, workInProgress, renderPriority) {
    const root = (workInProgress.stateNode: FiberRoot);
    if (root.pendingContext) {
      pushTopLevelContextObject(
        workInProgress,
        root.pendingContext,
        root.pendingContext !== root.context,
      );
    } else if (root.context) {
      // Should always be set
      pushTopLevelContextObject(workInProgress, root.context, false);
    }

    pushHostContainer(workInProgress, root.containerInfo);

    const memoizedState = workInProgress.memoizedState;
    const updateQueue = workInProgress.updateQueue;
    const nextState = updateQueue === null
      ? memoizedState
      : beginUpdateQueue(
          current,
          workInProgress,
          updateQueue,
          null,
          memoizedState,
          null,
          renderPriority,
        );

    // Schedule a callback effect if needed.
    if (workInProgress.updateQueue !== null && workInProgress.updateQueue.callbackList !== null) {
      workInProgress.effectTag |= Callback;
    }

    if (nextState === memoizedState) {
      // No new state. The root doesn't have props. Bailout.
      // TODO: What about context?
      return bailout(
        current,
        workInProgress,
        null,
        memoizedState,
        renderPriority,
      );
    }

    // The state was updated. We have a new element.
    const nextChildren = nextState.element;
    // Reconcile the children.
    return reconcile(
      current,
      workInProgress,
      nextChildren,
      null,
      nextState,
      renderPriority,
    );
  }

  function beginHostComponent(current, workInProgress, renderPriority) {
    pushHostContext(workInProgress);

    const type = workInProgress.type;

    const memoizedProps = workInProgress.memoizedProps;
    let nextProps = workInProgress.pendingProps;
    if (nextProps === null) {
      nextProps = memoizedProps;
      invariant(nextProps !== null, 'Must have pending or memoized props.');
    }

    // Check if the ref has changed and schedule an effect. This should happen
    // even if we bailout.
    checkForUpdatedRef(current, workInProgress);

    // Check the host config to see if the children are offscreen/hidden.
    const isHidden =
      !useSyncScheduling &&
      shouldDeprioritizeSubtree(type, nextProps);

    if (nextProps === memoizedProps && !hasContextChanged()) {
      // Neither props nor context changed. Bailout.
      if (isHidden) {
        return bailoutHiddenChildren(
          current,
          workInProgress,
          nextProps,
          null,
          renderPriority,
        );
      }
      return bailout(current, workInProgress, nextProps, null, renderPriority);
    }

    let nextChildren = nextProps.children;
    const isDirectTextChild = shouldSetTextContent(type, nextProps);

    if (isDirectTextChild) {
      // We special case a direct text child of a host node. This is a common
      // case. We won't handle it as a reified child. We will instead handle
      // this in the host environment that also have access to this prop. That
      // avoids allocating another HostText fiber and traversing it.
      nextChildren = null;
    } else if (memoizedProps != null && shouldSetTextContent(type, memoizedProps)) {
      // If we're switching from a direct text child to a normal child, or to
      // empty, we need to schedule the text content to be reset.
      workInProgress.effectTag |= ContentReset;
    }

    if (isHidden) {
      return reconcileHiddenChildren(
        current,
        workInProgress,
        nextChildren,
        nextProps,
        null,
        renderPriority,
      );
    }
    return reconcile(
      current,
      workInProgress,
      nextChildren,
      nextProps,
      null,
      renderPriority,
    );
  }

  function beginHostText(current, workInProgress, renderPriority) {
    const memoizedProps = workInProgress.memoizedProps;
    let nextProps = workInProgress.pendingProps;
    if (nextProps === null) {
      nextProps = memoizedProps;
      invariant(nextProps !== null, 'Must have pending or memoized props.');
    }
    if (nextProps === memoizedProps) {
      return bailout(current, workInProgress, nextProps, null, renderPriority);
    }
    // Text nodes don't actually have children, but we call reconcile anyway
    // so that the progressed work gets updated.
    return reconcile(
      current,
      workInProgress,
      null,
      nextProps,
      null,
      renderPriority,
    );
  }

  function beginIndeterminateComponent(
    current,
    workInProgress,
    renderPriority,
  ) {
    invariant(
      current === null,
      'An indeterminate component should never have mounted. This error is ' +
        'likely caused by a bug in React. Please file an issue.',
    );

    const fn = workInProgress.type;
    const nextProps = workInProgress.pendingProps;
    const unmaskedContext = getUnmaskedContext(workInProgress);
    const nextContext = getMaskedContext(workInProgress, unmaskedContext);

    invariant(nextProps !== null, 'Must have pending props.');

    // This is either a functional component or a module-style class component.
    let value;
    if (__DEV__) {
      ReactCurrentOwner.current = workInProgress;
      value = fn(nextProps, nextContext);
    } else {
      value = fn(nextProps, nextContext);
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      typeof value.render === 'function'
    ) {
      // Proceed under the assumption that this is a class instance.
      workInProgress.tag = ClassComponent;
      const instance = value;
      const initialState = instance.state;
      instance.updater = classUpdater;
      instance.context = nextContext;
      ReactInstanceMap.set(instance, workInProgress);
      return beginClassComponentImpl(
        current,
        workInProgress,
        instance,
        nextProps,
        nextContext,
        initialState,
        renderPriority,
      );
    } else {
      // Proceed under the assumption that this is a functional component
      workInProgress.tag = FunctionalComponent;
      const nextChildren = value;

      if (__DEV__) {
        // Mount warnings for functional components
        const Component = workInProgress.type;

        if (Component) {
          warning(
            !Component.childContextTypes,
            '%s(...): childContextTypes cannot be defined on a functional component.',
            Component.displayName || Component.name || 'Component',
          );
        }
        if (workInProgress.ref !== null) {
          let info = '';
          const ownerName = ReactDebugCurrentFiber.getCurrentFiberOwnerName();
          if (ownerName) {
            info += '\n\nCheck the render method of `' + ownerName + '`.';
          }

          let warningKey = ownerName || workInProgress._debugID || '';
          const debugSource = workInProgress._debugSource;
          if (debugSource) {
            warningKey = debugSource.fileName + ':' + debugSource.lineNumber;
          }
          if (!warnedAboutStatelessRefs[warningKey]) {
            warnedAboutStatelessRefs[warningKey] = true;
            warning(
              false,
              'Stateless function components cannot be given refs. ' +
                'Attempts to access this ref will fail.%s%s',
              info,
              ReactDebugCurrentFiber.getCurrentFiberStackAddendum(),
            );
          }
        }
      }
      // Reconcile the children.
      return reconcile(
        current,
        workInProgress,
        nextChildren,
        nextProps,
        null,
        renderPriority,
      );
    }
  }

  function beginFunctionalComponent(current, workInProgress, renderPriority) {
    const fn = workInProgress.type;

    const memoizedProps = workInProgress.memoizedProps;
    let nextProps = workInProgress.pendingProps;
    if (nextProps === null) {
      nextProps = memoizedProps;
      invariant(nextProps !== null, 'Must have pending or memoized props.');
    }

    if (
      (nextProps === memoizedProps && !hasContextChanged()) ||
      // TODO: Disable this before release, since it is not part of the public
      // API. I use this for testing to compare the relative overhead
      // of classes.
      (typeof fn.shouldComponentUpdate === 'function' &&
        !fn.shouldComponentUpdate(memoizedProps, nextProps))
    ) {
      // No changes to props or context. Bailout.
      return bailout(current, workInProgress, nextProps, null, renderPriority);
    }

    const unmaskedContext = getUnmaskedContext(workInProgress);
    const nextContext = getMaskedContext(workInProgress, unmaskedContext);

    // Compute the next children.
    let nextChildren;
    if (__DEV__) {
      // In DEV, track the current owner for better stack traces
      ReactCurrentOwner.current = workInProgress;
      ReactDebugCurrentFiber.phase = 'render';
      nextChildren = fn(nextProps, nextContext);
      ReactDebugCurrentFiber.phase = null;
    } else {
      nextChildren = fn(nextProps, nextContext);
    }

    // Reconcile the children.
    return reconcile(
      current,
      workInProgress,
      nextChildren,
      nextProps,
      null,
      renderPriority,
    );
  }

  // ----------------- The Life-Cycle of a Composite Component -----------------
  // The begin phase (or render phase) of a composite component is when we call
  // the render method to compute the next set of children. Some lifecycle
  // methods are also called during this phase. These methods make up the bulk
  // of a React app's total execution time.
  //
  // The begin phase is the part of the React update cycle that is asynchronous
  // and time-sliced. Ideally, methods in this phase contain no side-effects
  // (other than scheduling updates with setState, which is fine because the
  // update queue is managed by React). At the very least, lifecycles in the
  // begin phase should be resilient to renders that are interrupted, restarted,
  // or aborted. E.g. componentWillMount may fire twice before its children
  // are inserted.
  //
  // Overview of the composite component begin phase algorithm:
  //   - Do we have new props or context since the last render?
  //     -> componentWillReceiveProps(nextProps, nextContext).
  //   - Process the update queue to compute the next state.
  //   - Do we have new props, context, or state since the last render?
  //     - If they are unchanged -> bailout. Stop working and don't re-render.
  //     - If something did change, we may be able to bailout anyway:
  //       - Is this a forced update (caused by this.forceUpdate())?
  //         -> Can't bailout. Skip subsequent checks and continue rendering.
  //       - Is shouldComponentUpdate defined?
  //         -> shouldComponentUpdate(nextProps, nextState, nextContext)
  //           - If it returns false -> bailout.
  //       - Is this a PureComponent?
  //         -> Shallow compare props and state.
  //           - If they are the same -> bailout.
  //   - Proceed with rendering. Are we mounting a new component, or updating
  //     an existing one?
  //     - Mount -> componentWillMount()
  //     - Update -> componentWillUpdate(nextProps, nextState, nextContext)
  //   - Call render method to compute next children.
  //   - Reconcile next children against the previous set.
  //   - Enter begin phase for children.
  //
  // componentDidMount, componentDidUpdate, and componentWillUnount are called
  // during the commit phase, along with other side-effects like refs,
  // callbacks, and host mutations (e.g. updating the DOM).
  // ---------------------------------------------------------------------------
  function beginClassComponent(
    current: Fiber | null,
    workInProgress: Fiber,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    const ctor = workInProgress.type;

    const memoizedProps = workInProgress.memoizedProps;
    let nextProps = workInProgress.pendingProps;
    if (nextProps === null) {
      nextProps = memoizedProps;
      invariant(nextProps !== null, 'Must have pending or memoized props.');
    }
    const unmaskedContext = getUnmaskedContext(workInProgress);
    const nextContext = getMaskedContext(workInProgress, unmaskedContext);

    let instance = workInProgress.stateNode;
    let previousState;
    if (instance === null) {
      // This is a fresh component. Construct the public component instance.
      instance = workInProgress.stateNode = new ctor(nextProps, nextContext);
      const initialState = previousState = instance.state;
      instance.updater = classUpdater;
      instance.context = nextContext;
      ReactInstanceMap.set(instance, workInProgress);
      validateClassInstance(workInProgress, nextProps, initialState);

      if (
        ReactFeatureFlags.enableAsyncSubtreeAPI &&
        ctor.unstable_asyncUpdates === true
      ) {
        // This is a special async wrapper component. Enable async scheduling
        // for this component and all of its children.
        workInProgress.internalContextTag |= AsyncUpdates;
      }
    } else {
      previousState = workInProgress.memoizedState;
    }

    return beginClassComponentImpl(
      current,
      workInProgress,
      instance,
      nextProps,
      nextContext,
      previousState,
      renderPriority,
    );
  }

  // Split this out so that it can be shared between beginClassComponent and
  // beginIndeterminateComponent, which have different ways of constructing
  // the class instance. By the time this method is called, we already have a
  // class instance.
  function beginClassComponentImpl(
    current: Fiber | null,
    workInProgress: Fiber,
    instance: any,
    nextProps: mixed,
    nextContext: mixed,
    // The memoized state, or the initial state for new components
    previousState: mixed,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    const ctor = workInProgress.type;
    const contextDidChange = hasContextChanged();
    // TODO: Is there a better way to get the memoized context besides reading
    // from the instance?
    const memoizedContext = instance.context;
    const memoizedProps = workInProgress.memoizedProps;
    // Don't process the update queue until after componentWillReceiveProps
    const memoizedState = previousState;
    let nextState = previousState;

    // Is this the initial render? (Note: different from whether this is initial
    // mount, since a component may render multiple times before mounting.)
    const isInitialRender = workInProgress.memoizedProps === null;

    // Push context providers early to prevent context stack mismatches. During
    // mounting we don't know the child context yet as the instance doesn't
    // exist. We will invalidate the child context right after rendering.
    const hasChildContext = pushContextProvider(workInProgress);

    // Check if this is a new component or an update.
    if ((nextProps !== memoizedProps && !isInitialRender) || contextDidChange) {
      // This component has been rendered before, and it has received new props
      // or context since the last render. Call componentWillReceiveProps, if
      // it exists. This should be called even if the component hasn't mounted
      // yet (current === null) so that state derived from props stays in sync.
      const cWRP = instance.componentWillReceiveProps;
      if (typeof cWRP === 'function') {
        if (__DEV__) {
          startPhaseTimer(workInProgress, 'componentWillReceiveProps');
        }
        callClassInstanceMethod(
          instance,
          cWRP,
          // this.props, this.context, this.state
          memoizedProps,
          memoizedContext,
          memoizedState,
          // Arguments
          nextProps,
          nextContext,
        );
        if (__DEV__) {
          stopPhaseTimer();
        }
        // Detect direct assignment to this.state.
        // TODO: Ideally, we should never reference read from the public
        // instance. It'd be nice to remove support for this eventually.
        if (instance.state !== memoizedState) {
          if (__DEV__) {
            warning(
              false,
              '%s.componentWillReceiveProps(): Assigning directly to ' +
                "this.state is deprecated (except inside a component's " +
                'constructor). Use setState instead.',
              getComponentName(workInProgress),
            );
          }
          classUpdater.enqueueReplaceState(instance, instance.state, null);
        }
      }
    }

    // Process all the updates in the update queue that satisfy our current
    // render priority. This will produce a new state object that we can compare
    // to the memoized state.
    if (workInProgress.updateQueue !== null) {
      nextState = beginUpdateQueue(
        current,
        workInProgress,
        workInProgress.updateQueue,
        instance,
        nextState,
        nextProps,
        renderPriority,
      );
    }

    // Compare the next inputs (props, context, state) to the memoized inputs
    // to determine if we should re-render the children or bailout.
    let shouldUpdate;
    if (isInitialRender) {
      shouldUpdate = true;
    } else if (nextProps === memoizedProps && nextState === memoizedState && !contextDidChange) {
      // None of the inputs have changed. Bailout.
      shouldUpdate = false;
    } else if (workInProgress.updateQueue !== null && workInProgress.updateQueue.hasForceUpdate) {
      // This is a forced update. Re-render regardless of shouldComponentUpdate.
      shouldUpdate = true;
    } else if (typeof instance.shouldComponentUpdate === 'function') {
      // There was a change in props, state, or context. But we may be able to
      // bailout anyway if shouldComponentUpdate -> false.
      if (__DEV__) {
        startPhaseTimer(workInProgress, 'shouldComponentUpdate');
      }
      shouldUpdate = callClassInstanceMethod(
        instance,
        instance.shouldComponentUpdate,
        // this.props, this.context, this.state
        memoizedProps,
        memoizedContext,
        memoizedState,
        // Arguments
        nextProps,
        nextState,
        nextContext,
      );
      if (__DEV__) {
        stopPhaseTimer();
      }
    } else if (ctor.prototype && ctor.prototype.isPureReactComponent) {
      // This is a PureComponent. Do a shallow comparison of props and state.
      shouldUpdate = !shallowEqual(memoizedProps, nextProps) || !shallowEqual(memoizedState, nextState);
    } else {
      // The inputs changed and we can't bail out. Re-render.
      shouldUpdate = true;
    }

    // Determine if any effects need to be scheduled. These should all happen
    // before bailing out because the effectTag gets reset during reconcilation.

    // Check if the ref has changed and schedule an effect.
    checkForUpdatedRef(current, workInProgress);

    // Schedule a callback effect if needed.
    if (workInProgress.updateQueue !== null && workInProgress.updateQueue.callbackList !== null) {
      workInProgress.effectTag |= Callback;
    }

    // If we have new props or state since the last commit (includes the
    // initial mount), we need to schedule an Update effect. This could be
    // true even if we're about to bailout (shouldUpdate === false), because
    // a bailout only means that the work-in-progress is up-to-date; it may not
    // have ever committed. Instead, we need to compare to current to see if
    // anything changed.
    if (
      // For updates, compare the next props and state to the current props
      // and state. Also check that componentDidUpdate is a function, because
      // otherwise scheduling an effect is pointless.
      (
        current !== null &&
        (current.memoizedProps !== nextProps || current.memoizedState !== nextState) &&
        typeof instance.componentDidUpdate === 'function'
      ) ||
      // For mounts, there is no current, so just check that componentDidMount
      // is a function.
      (current === null && typeof instance.componentDidMount === 'function')
    ) {
      workInProgress.effectTag |= Update;
    }

    // By now, all effects should have been scheduled. It's safe to bailout.
    if (!shouldUpdate) {
      // This is a bailout. Reuse the work without re-rendering.
      return bailout(current, workInProgress, nextProps, nextState, renderPriority);
    }
    // No bailout. We'll continue rendering.

    // First, call componentWillMount (if this is a mount) or
    // componentWillUpdate (if this is an update).
    if (current === null) {
      // This is a mount. That doesn't mean we haven't rendered this component
      // before — a previous mount may have been interrupted. Regardless, call
      // componentWillMount, if it exists.
      const cWM = instance.componentWillMount;
      if (typeof cWM === 'function') {
        if (__DEV__) {
          startPhaseTimer(workInProgress, 'componentWillMount');
        }
        callClassInstanceMethod(
          instance,
          cWM,
          // this.props, this.context, this.state
          nextProps,
          nextContext,
          nextState,
          // No arguments
        );
        if (__DEV__) {
          stopPhaseTimer();
        }
        // Detect direct assignment to this.state.
        // TODO: Ideally, we should never reference read from the public
        // instance. It'd be nice to remove support for this eventually.
        if (instance.state !== nextState) {
          if (__DEV__) {
            warning(
              false,
              '%s.componentWillMount(): Assigning directly to this.state ' +
                "is deprecated (except inside a component's constructor). " +
                'Use setState instead.',
              getComponentName(workInProgress),
            );
          }
          classUpdater.enqueueReplaceState(instance, instance.state, null);
        }
      }
    } else {
      // This is an update. Call componentWillUpdate, if it exists.
      const cWU = instance.componentWillUpdate;
      if (typeof cWU === 'function') {
        if (__DEV__) {
          startPhaseTimer(workInProgress, 'componentWillUpdate');
        }
        callClassInstanceMethod(
          instance,
          cWU,
          // this.props, this.context, this.state
          nextProps,
          nextContext,
          nextState,
          // Arguments
          // (The asymmetry between the signatures for componentWillMount and
          // componentWillUpdate is confusing. Oh well, can't change it now.)
          memoizedProps,
          memoizedState,
        );
        if (__DEV__) {
          stopPhaseTimer();
        }
        // Unlike cWRP and cWM, we don't support direct assignment to
        // this.state inside cWU. We only support it (with a warning) in those
        // other methods because it happened to work in Stack, and we don't
        // want to break existing product code.
      }
    }

    // Process the update queue again in case cWM or cWU contained updates.
    if (workInProgress.updateQueue !== null) {
      nextState = beginUpdateQueue(
        current,
        workInProgress,
        workInProgress.updateQueue,
        instance,
        nextState,
        nextProps,
        renderPriority,
      );
    }

    // Now call the render method to get the next set of children.
    if (__DEV__) {
      ReactDebugCurrentFiber.phase = 'render';
    }
    const nextChildren = callClassInstanceMethod(
      instance,
      instance.render,
      // this.props, this.context, this.state
      nextProps,
      nextContext,
      nextState,
      // No arguments
    );
    if (__DEV__) {
      ReactDebugCurrentFiber.phase = null;
    }

    // If this component provides context to its children, we need to
    // recalcuate it before we start working on them.
    if (hasChildContext) {
      invalidateContextProvider(workInProgress);
    }

    // Reconcile the children.
    return reconcile(
      current,
      workInProgress,
      nextChildren,
      nextProps,
      nextState,
      renderPriority,
    );
  }

  function beginFragment(
    current: Fiber | null,
    workInProgress: Fiber,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    const memoizedProps = workInProgress.memoizedProps;
    let nextProps = workInProgress.pendingProps;
    if (nextProps === null) {
      nextProps = memoizedProps;
      invariant(nextProps !== null, 'Must have pending or memoized props.');
    }

    if (nextProps === memoizedProps && !hasContextChanged()) {
      // No changes to props or context. Bailout.
      return bailout(current, workInProgress, nextProps, null, renderPriority);
    }

    // Compute the next children.
    const nextChildren = nextProps;
    return reconcile(
      current,
      workInProgress,
      nextChildren,
      nextProps,
      null,
      renderPriority,
    );
  }

  function bailoutHiddenChildren(
    current: Fiber | null,
    workInProgress: Fiber,
    nextProps: mixed | null,
    nextState: mixed | null,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    // We didn't reconcile, but before bailing out, we still need to override
    // the priority of the children in case it's higher than
    // OffscreenPriority. This can happen when we switch from visible to
    // hidden, or if setState is called somewhere in the tree.
    // TODO: It would be better if this tree got its correct priority set
    // during scheduleUpdate instead because otherwise we'll start a higher
    // priority reconciliation first before we can get down here. However,
    // that is a bit tricky since workInProgress and current can have
    // different "hidden" settings.
    workInProgress.progressedPriority = OffscreenPriority;
    return bailout(current, workInProgress, nextProps, null, renderPriority);
  }

  function reconcileHiddenChildren(
    current: Fiber | null,
    workInProgress: Fiber,
    nextChildren: any,
    nextProps: mixed | null,
    nextState: mixed | null,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    if (renderPriority !== OffscreenPriority) {
      // This is a special case where we're about to reconcile at a lower
      // priority than the render priority. We already called forkOrResumeChild
      // at the start of the begin phase, but we need to call it again with
      // OffscreenPriority so that if we have an offscreen child, we can
      // reuse it.
      forkOrResumeChild(current, workInProgress, OffscreenPriority);
    }

    // Reconcile the children at OffscreenPriority. This may be lower than
    // the priority at which we're currently reconciling. This will store
    // the children on the progressed work so that we can come back to them
    // later if needed.
    reconcile(
      current,
      workInProgress,
      nextChildren,
      nextProps,
      nextState,
      OffscreenPriority,
    );

    // If we're rendering at OffscreenPriority, start working on the child.
    if (renderPriority === OffscreenPriority) {
      return workInProgress.child;
    }

    // Otherwise, bailout.
    if (current === null) {
      // If this doesn't have a current we won't track it for placement
      // effects. However, when we come back around to this we have already
      // inserted the parent which means that we'll infact need to make this a
      // placement.
      // TODO: There has to be a better solution to this problem.
      let child = workInProgress.child;
      while (child !== null) {
        child.effectTag = Placement;
        child = child.sibling;
      }
    }

    // This will stash the child on a progressed work fork and reset to current.
    bailout(current, workInProgress, nextProps, nextState, renderPriority);

    // Even though we're bailing out, we actually did complete the work at this
    // priority. Update the memoized inputs so we can reuse it later.
    // TODO: Is there a better way to model this? A bit confusing. Or maybe
    // just a better explanation here would suffice.
    workInProgress.memoizedProps = nextProps;
    workInProgress.memoizedState = nextState;

    return null;
  }

  function bailout(
    current: Fiber | null,
    workInProgress: Fiber,
    nextProps: mixed | null,
    nextState: mixed | null,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    // Reset the pending props. We don't need them anymore.
    workInProgress.pendingProps = null;

    // A bailout implies that the memoized props and state are equal to the next
    // props and state, but we should update them anyway because they might not
    // be referentially equal (shouldComponentUpdate -> false)
    workInProgress.memoizedProps = nextProps;
    workInProgress.memoizedState = nextState;

    // If the child is null, this is terminal. The work is done.
    if (workInProgress.child === null) {
      return null;
    }

    const progressedWork = workInProgress.progressedWork;

    // Should we continue working on the children? Check if the children have
    // work that matches the priority at which we're currently rendering.
    if (
      workInProgress.pendingWorkPriority === NoWork ||
      workInProgress.pendingWorkPriority > renderPriority
    ) {
      // The children do not have sufficient priority. We should skip the
      // children. If they have low-pri work, we'll come back to them later.

      // Before exiting, we need to check if we have progressed work.
      if (current === null || workInProgress.child !== current.child) {
        if (workInProgress.progressedPriority === renderPriority) {
          // We have progressed work that completed at this level. Because the
          // remaining priority (pendingWorkPriority) is less than the priority
          // at which it last rendered (progressedPriority), we know that it
          // must have completed at the progressedPriority. That means we can
          // use the progressed child during this commit.

          // We need to bubble up effects from the progressed children so that
          // they don't get dropped. Usually effects are transferred to the
          // parent during the complete phase, but we won't be completing these
          // children again.
          let child = workInProgress.child;
          while (child !== null) {
            transferEffectsToParent(workInProgress, child);
            child = child.sibling;
          }
        } else {
          invariant(
            workInProgress.progressedPriority === OffscreenPriority,
            'Progressed priority should only be less than work priority in ' +
              'case of an offscreen/hidden subtree.',
          );
          // Reset child to current. If we have progressed work, this will stash
          // it for later.
          forkCurrentChild(current, workInProgress);
        }
      }

      // Return null to skip the children and continue on the sibling. If
      // there's still work in the children, we'll come back to it later at a
      // lower priority.
      return null;
    }

    // The priority of the children matches the render priority. We'll
    // continue working on it.

    // Check to see if we have progressed work since the last commit.
    if (current === null || progressedWork.child !== current.child) {
      // We already have progressed work. We can reuse the children. But we
      // need to reset the return fiber since we'll traverse down into them.
      let child = workInProgress.child;
      while (child !== null) {
        child.return = workInProgress;
        child = child.sibling;
      }
    } else {
      // There is no progressed work. We need to create a new work in progress
      // for each child.
      let currentChild = workInProgress.child;
      let newChild = createWorkInProgress(currentChild, renderPriority);
      workInProgress.child = newChild;

      newChild.return = workInProgress;
      while (currentChild.sibling !== null) {
        currentChild = currentChild.sibling;
        newChild = newChild.sibling = createWorkInProgress(
          currentChild,
          renderPriority,
        );
        // Set the pending props to null, since this is a bailout and any
        // existing pending props are now invalid.
        // TODO: We should really pass the pending props as an argument so that
        // we don't forget to set them.
        newChild.pendingProps = null;
        newChild.return = workInProgress;
      }
      newChild.sibling = null;

      // We mutated the child fiber. Mark it as progressed. If we had lower-
      // priority progressed work, it will be thrown out.
      markWorkAsProgressed(current, workInProgress, renderPriority);
    }
    // Continue working on child
    return workInProgress.child;
  }

  function reconcile(
    current: Fiber | null,
    workInProgress: Fiber,
    nextChildren: any,
    nextProps: mixed | null,
    nextState: mixed | null,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    // Reset the pending props. We don't need them anymore.
    workInProgress.pendingProps = null;

    // We have new children. Update the child set.
    if (current === null) {
      // If this is a fresh new component that hasn't been rendered yet, we
      // won't update its child set by applying minimal side-effects. Instead,
      // we will add them all to the child before it gets rendered. That means
      // we can optimize this reconciliation pass by not tracking side-effects.
      workInProgress.child = mountChildFibersInPlace(
        workInProgress,
        workInProgress.child,
        nextChildren,
        renderPriority,
      );
    } else if (workInProgress.child === current.child) {
      // If the child is the same as the current child, it means that we haven't
      // yet started any work on these children. Therefore, we use the clone
      // algorithm to create a copy of all the current children.
      workInProgress.child = reconcileChildFibers(
        workInProgress,
        workInProgress.child,
        nextChildren,
        renderPriority,
      );
    } else {
      // If, on the other hand, it is already using a clone, that means we've
      // already begun some work on this tree and we can continue where we left
      // off by reconciling against the existing children.
      workInProgress.child = reconcileChildFibersInPlace(
        workInProgress,
        workInProgress.child,
        nextChildren,
        renderPriority,
      );
    }

    // Memoize this work.
    workInProgress.memoizedProps = nextProps;
    workInProgress.memoizedState = nextState;

    // The child is now the progressed child. Update the progressed work.
    markWorkAsProgressed(current, workInProgress, renderPriority);

    // We reconciled the children set. They now have pending work at whatever
    // priority we're currently rendering. This is true even if the render
    // priority is less than the existing work priority, since that should only
    // happen in the case of an intentional down-prioritization.
    workInProgress.pendingWorkPriority = renderPriority;
    if (current !== null) {
      // When searching for work to perform, we always look in the current tree.
      // So, work priority on the current fiber should always be greater than or
      // equal to the work priority of the work-in-progress, to ensure we don't
      // stop working while there's still work to be done. Priority is cleared
      // from the current tree whenever we commit the work-in-progress.
      //
      // In practice, this only makes a difference for the host root because
      // we always start from the root. So alternatively, we could just special
      // case that type.
      current.pendingWorkPriority = largerPriority(
        current.pendingWorkPriority,
        renderPriority
      );
    }

    // Continue working on the child.
    return workInProgress.child;
  }

  function markWorkAsProgressed(current, workInProgress, renderPriority) {
    // Keep track of the priority at which this work was performed.
    workInProgress.progressedPriority = renderPriority;
    workInProgress.progressedWork = workInProgress;
    if (current !== null) {
      // Set the progressed work on both fibers
      current.progressedPriority = renderPriority;
      current.progressedWork = workInProgress;
    }
  }

  function resumeProgressedChild(
    workInProgress: Fiber,
    progressedWork: ProgressedWork,
  ) {
    // Reuse the progressed work.
    if (progressedWork === workInProgress) {
      return;
    }
    workInProgress.child = progressedWork.child;
    workInProgress.firstDeletion = progressedWork.firstDeletion;
    workInProgress.lastDeletion = progressedWork.lastDeletion;
    workInProgress.memoizedProps = progressedWork.memoizedProps;
    workInProgress.memoizedState = progressedWork.memoizedState;
    workInProgress.updateQueue = progressedWork.updateQueue;
  }

  function forkCurrentChild(current: Fiber | null, workInProgress: Fiber) {
    let progressedWork = workInProgress.progressedWork;

    if (progressedWork === workInProgress) {
      // We already performed work on this fiber. We don't want to lose it.
      // Stash it on the progressedWork so that we can come back to it later
      // at a lower priority. Conceptually, we're "forking" the child.

      // The progressedWork points either to current, workInProgress, or a
      // ProgressedWork object.
      progressedWork = createProgressedWork(workInProgress);
      workInProgress.progressedWork = progressedWork;
      if (current !== null) {
        // Set it on both fibers
        current.progressedWork = progressedWork;
      }
    }

    if (current !== null) {
      // Clone child from current.
      workInProgress.child = current.child;
      // The deletion list on current is no longer valid.
      workInProgress.firstDeletion = null;
      workInProgress.lastDeletion = null;
      workInProgress.memoizedProps = current.memoizedProps;
      workInProgress.memoizedState = current.memoizedState;
      workInProgress.updateQueue = current.updateQueue;
    } else {
      // There is no current, so conceptually, the current fiber is null.
      workInProgress.child = null;
      workInProgress.firstDeletion = null;
      workInProgress.lastDeletion = null;
      workInProgress.memoizedProps = null;
      workInProgress.memoizedState = null;
      workInProgress.updateQueue = null;
    }
  }

  function forkOrResumeChild(
    current: Fiber | null,
    workInProgress: Fiber,
    renderPriority: PriorityLevel,
  ): void {
    const progressedPriority = workInProgress.progressedPriority;
    const progressedWork = workInProgress.progressedWork;
    if (
      progressedPriority === renderPriority &&
      (current === null || progressedWork.child !== current.child)
    ) {
      // We have progressed work at this priority. Reuse it.
      return resumeProgressedChild(workInProgress, progressedWork);
    }
    return forkCurrentChild(current, workInProgress);
  }

  function beginWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderPriority: PriorityLevel,
  ): Fiber | null {
    if (__DEV__) {
      // Keep track of the fiber we're currently working on.
      ReactDebugCurrentFiber.current = workInProgress;
    }

    forkOrResumeChild(current, workInProgress, renderPriority);

    // Clear the effect list, as it's no longer valid.
    workInProgress.firstEffect = null;
    workInProgress.lastEffect = null;

    switch (workInProgress.tag) {
      case HostRoot:
        return beginHostRoot(current, workInProgress, renderPriority);
      case HostComponent:
        return beginHostComponent(current, workInProgress, renderPriority);
      case HostText:
        return beginHostText(current, workInProgress, renderPriority);
      case IndeterminateComponent:
        return beginIndeterminateComponent(
          current,
          workInProgress,
          renderPriority,
        );
      case FunctionalComponent:
        return beginFunctionalComponent(
          current,
          workInProgress,
          renderPriority,
        );
      case ClassComponent:
        return beginClassComponent(current, workInProgress, renderPriority);
      case Fragment:
        return beginFragment(current, workInProgress, renderPriority);
      default:
        invariant(
          false,
          'Unknown unit of work tag. This error is likely caused by a bug in ' +
            'React. Please file an issue.',
        );
    }
  }

  function beginFailedWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderPriority: PriorityLevel,
  ) {
    invariant(
      workInProgress.tag === ClassComponent || workInProgress.tag === HostRoot,
      'Invalid type of work. This error is likely caused by a bug in React. ' +
        'Please file an issue.',
    );

    // Clear the effect list, as it's no longer valid.
    workInProgress.firstEffect = null;
    workInProgress.lastEffect = null;

    // Add an error effect so we can handle the error during the commit phase
    workInProgress.effectTag |= Err;

    // Unmount the children
    const nextChildren = null;
    return reconcile(
      current,
      workInProgress,
      nextChildren,
      workInProgress.memoizedProps,
      workInProgress.memoizedState,
      renderPriority,
    );
  }

  return {
    beginWork,
    beginFailedWork,
  };
};
