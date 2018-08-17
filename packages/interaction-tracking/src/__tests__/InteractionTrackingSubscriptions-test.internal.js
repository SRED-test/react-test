/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment node
 */
'use strict';

describe('InteractionTracking', () => {
  let InteractionTracking;
  let InteractionTrackingSubscriptions;
  let ReactFeatureFlags;

  let currentTime;

  let onInteractionScheduledWorkCompleted;
  let onInteractionTracked;
  let onWorkCanceled;
  let onWorkScheduled;
  let onWorkStarted;
  let onWorkStopped;
  let subscriber;
  let throwInOnInteractionScheduledWorkCompleted;
  let throwInOnInteractionTracked;
  let throwInOnWorkCanceled;
  let throwInOnWorkScheduled;
  let throwInOnWorkStarted;
  let throwInOnWorkStopped;

  const firstEvent = {id: 0, name: 'first', timestamp: 0};
  const secondEvent = {id: 1, name: 'second', timestamp: 0};
  const threadID = 123;

  function loadModules({enableInteractionTracking}) {
    jest.resetModules();
    jest.useFakeTimers();

    currentTime = 0;

    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableInteractionTracking = enableInteractionTracking;

    InteractionTracking = require('interaction-tracking');
    InteractionTrackingSubscriptions = require('interaction-tracking/subscriptions');

    throwInOnInteractionScheduledWorkCompleted = false;
    throwInOnInteractionTracked = false;
    throwInOnWorkCanceled = false;
    throwInOnWorkScheduled = false;
    throwInOnWorkStarted = false;
    throwInOnWorkStopped = false;

    onInteractionScheduledWorkCompleted = jest.fn(() => {
      if (throwInOnInteractionScheduledWorkCompleted) {
        throw Error('Expected error onInteractionScheduledWorkCompleted');
      }
    });
    onInteractionTracked = jest.fn(() => {
      if (throwInOnInteractionTracked) {
        throw Error('Expected error onInteractionTracked');
      }
    });
    onWorkCanceled = jest.fn(() => {
      if (throwInOnWorkCanceled) {
        throw Error('Expected error onWorkCanceled');
      }
    });
    onWorkScheduled = jest.fn(() => {
      if (throwInOnWorkScheduled) {
        throw Error('Expected error onWorkScheduled');
      }
    });
    onWorkStarted = jest.fn(() => {
      if (throwInOnWorkStarted) {
        throw Error('Expected error onWorkStarted');
      }
    });
    onWorkStopped = jest.fn(() => {
      if (throwInOnWorkStopped) {
        throw Error('Expected error onWorkStopped');
      }
    });

    subscriber = {
      onInteractionScheduledWorkCompleted,
      onInteractionTracked,
      onWorkCanceled,
      onWorkScheduled,
      onWorkStarted,
      onWorkStopped,
    };

    InteractionTrackingSubscriptions.subscribe(subscriber);
  }

  describe('enabled', () => {
    beforeEach(() => loadModules({enableInteractionTracking: true}));

    describe('error handling', () => {
      it('should cover onInteractionTracked/onWorkStarted within', done => {
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          const mock = jest.fn();

          // It should call the callback before re-throwing
          throwInOnInteractionTracked = true;
          expect(() =>
            InteractionTracking.track(
              secondEvent.name,
              currentTime,
              mock,
              threadID,
            ),
          ).toThrow('Expected error onInteractionTracked');
          throwInOnInteractionTracked = false;
          expect(mock).toHaveBeenCalledTimes(1);

          throwInOnWorkStarted = true;
          expect(() =>
            InteractionTracking.track(
              secondEvent.name,
              currentTime,
              mock,
              threadID,
            ),
          ).toThrow('Expected error onWorkStarted');
          expect(mock).toHaveBeenCalledTimes(2);

          // It should restore the previous/outer interactions
          expect(InteractionTracking.getCurrent()).toMatchInteractions([
            firstEvent,
          ]);

          done();
        });
      });

      it('should cover onWorkStopped within track', done => {
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          let innerInteraction;
          const mock = jest.fn(() => {
            innerInteraction = Array.from(InteractionTracking.getCurrent())[1];
          });

          throwInOnWorkStopped = true;
          expect(() =>
            InteractionTracking.track(secondEvent.name, currentTime, mock),
          ).toThrow('Expected error onWorkStopped');
          throwInOnWorkStopped = false;

          // It should restore the previous/outer interactions
          expect(InteractionTracking.getCurrent()).toMatchInteractions([
            firstEvent,
          ]);

          // It should update the interaction count so as not to interfere with subsequent calls
          expect(innerInteraction.__count).toBe(0);

          done();
        });
      });

      it('should cover the callback within track', done => {
        expect(onWorkStarted).not.toHaveBeenCalled();
        expect(onWorkStopped).not.toHaveBeenCalled();

        expect(() => {
          InteractionTracking.track(firstEvent.name, currentTime, () => {
            throw Error('Expected error callback');
          });
        }).toThrow('Expected error callback');

        expect(onWorkStarted).toHaveBeenCalledTimes(1);
        expect(onWorkStopped).toHaveBeenCalledTimes(1);

        done();
      });

      it('should cover onWorkScheduled within wrap', done => {
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          const interaction = Array.from(InteractionTracking.getCurrent())[0];
          const beforeCount = interaction.__count;

          throwInOnWorkScheduled = true;
          expect(() => InteractionTracking.wrap(() => {})).toThrow(
            'Expected error onWorkScheduled',
          );

          // It should not update the interaction count so as not to interfere with subsequent calls
          expect(interaction.__count).toBe(beforeCount);

          done();
        });
      });

      it('should cover onWorkStarted within wrap', () => {
        const mock = jest.fn();
        let interaction, wrapped;
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          interaction = Array.from(InteractionTracking.getCurrent())[0];
          wrapped = InteractionTracking.wrap(mock);
        });
        expect(interaction.__count).toBe(1);

        throwInOnWorkStarted = true;
        expect(wrapped).toThrow('Expected error onWorkStarted');

        // It should call the callback before re-throwing
        expect(mock).toHaveBeenCalledTimes(1);

        // It should update the interaction count so as not to interfere with subsequent calls
        expect(interaction.__count).toBe(0);
      });

      it('should cover onWorkStopped within wrap', done => {
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          const outerInteraction = Array.from(
            InteractionTracking.getCurrent(),
          )[0];
          expect(outerInteraction.__count).toBe(1);

          let wrapped;
          let innerInteraction;

          InteractionTracking.track(secondEvent.name, currentTime, () => {
            innerInteraction = Array.from(InteractionTracking.getCurrent())[1];
            expect(outerInteraction.__count).toBe(1);
            expect(innerInteraction.__count).toBe(1);

            wrapped = InteractionTracking.wrap(jest.fn());
            expect(outerInteraction.__count).toBe(2);
            expect(innerInteraction.__count).toBe(2);
          });

          expect(outerInteraction.__count).toBe(2);
          expect(innerInteraction.__count).toBe(1);

          throwInOnWorkStopped = true;
          expect(wrapped).toThrow('Expected error onWorkStopped');
          throwInOnWorkStopped = false;

          // It should restore the previous interactions
          expect(InteractionTracking.getCurrent()).toMatchInteractions([
            outerInteraction,
          ]);

          // It should update the interaction count so as not to interfere with subsequent calls
          expect(outerInteraction.__count).toBe(1);
          expect(innerInteraction.__count).toBe(0);

          done();
        });
      });

      it('should cover the callback within wrap', done => {
        expect(onWorkStarted).not.toHaveBeenCalled();
        expect(onWorkStopped).not.toHaveBeenCalled();

        let wrapped;
        let interaction;
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          interaction = Array.from(InteractionTracking.getCurrent())[0];
          wrapped = InteractionTracking.wrap(() => {
            throw Error('Expected error wrap');
          });
        });

        expect(onWorkStarted).toHaveBeenCalledTimes(1);
        expect(onWorkStopped).toHaveBeenCalledTimes(1);

        expect(wrapped).toThrow('Expected error wrap');

        expect(onWorkStarted).toHaveBeenCalledTimes(2);
        expect(onWorkStopped).toHaveBeenCalledTimes(2);
        expect(onWorkStopped).toHaveBeenLastNotifiedOfWork([interaction]);

        done();
      });

      it('should cover onWorkCanceled within wrap', () => {
        let interaction, wrapped;
        InteractionTracking.track(firstEvent.name, currentTime, () => {
          interaction = Array.from(InteractionTracking.getCurrent())[0];
          wrapped = InteractionTracking.wrap(jest.fn());
        });
        expect(interaction.__count).toBe(1);

        throwInOnWorkCanceled = true;
        expect(wrapped.cancel).toThrow('Expected error onWorkCanceled');

        expect(onWorkCanceled).toHaveBeenCalledTimes(1);

        // It should update the interaction count so as not to interfere with subsequent calls
        expect(interaction.__count).toBe(0);
        expect(
          onInteractionScheduledWorkCompleted,
        ).toHaveBeenLastNotifiedOfInteraction(firstEvent);
      });
    });

    it('calls lifecycle methods for track', () => {
      expect(onInteractionTracked).not.toHaveBeenCalled();
      expect(onInteractionScheduledWorkCompleted).not.toHaveBeenCalled();

      InteractionTracking.track(
        firstEvent.name,
        currentTime,
        () => {
          expect(onInteractionTracked).toHaveBeenCalledTimes(1);
          expect(onInteractionTracked).toHaveBeenLastNotifiedOfInteraction(
            firstEvent,
          );
          expect(onInteractionScheduledWorkCompleted).not.toHaveBeenCalled();
          expect(onWorkStarted).toHaveBeenCalledTimes(1);
          expect(onWorkStarted).toHaveBeenLastNotifiedOfWork(
            new Set([firstEvent]),
            threadID,
          );
          expect(onWorkStopped).not.toHaveBeenCalled();

          InteractionTracking.track(
            secondEvent.name,
            currentTime,
            () => {
              expect(onInteractionTracked).toHaveBeenCalledTimes(2);
              expect(onInteractionTracked).toHaveBeenLastNotifiedOfInteraction(
                secondEvent,
              );
              expect(
                onInteractionScheduledWorkCompleted,
              ).not.toHaveBeenCalled();
              expect(onWorkStarted).toHaveBeenCalledTimes(2);
              expect(onWorkStarted).toHaveBeenLastNotifiedOfWork(
                new Set([firstEvent, secondEvent]),
                threadID,
              );
              expect(onWorkStopped).not.toHaveBeenCalled();
            },
            threadID,
          );

          expect(onInteractionScheduledWorkCompleted).toHaveBeenCalledTimes(1);
          expect(
            onInteractionScheduledWorkCompleted,
          ).toHaveBeenLastNotifiedOfInteraction(secondEvent);
          expect(onWorkStopped).toHaveBeenCalledTimes(1);
          expect(onWorkStopped).toHaveBeenLastNotifiedOfWork(
            new Set([firstEvent, secondEvent]),
            threadID,
          );
        },
        threadID,
      );

      expect(onInteractionScheduledWorkCompleted).toHaveBeenCalledTimes(2);
      expect(
        onInteractionScheduledWorkCompleted,
      ).toHaveBeenLastNotifiedOfInteraction(firstEvent);
      expect(onWorkScheduled).not.toHaveBeenCalled();
      expect(onWorkCanceled).not.toHaveBeenCalled();
      expect(onWorkStarted).toHaveBeenCalledTimes(2);
      expect(onWorkStopped).toHaveBeenCalledTimes(2);
      expect(onWorkStopped).toHaveBeenLastNotifiedOfWork(
        new Set([firstEvent]),
        threadID,
      );
    });

    it('calls lifecycle methods for wrap', () => {
      const unwrapped = jest.fn();
      let wrapped;

      InteractionTracking.track(firstEvent.name, currentTime, () => {
        expect(onInteractionTracked).toHaveBeenCalledTimes(1);
        expect(onInteractionTracked).toHaveBeenLastNotifiedOfInteraction(
          firstEvent,
        );

        InteractionTracking.track(secondEvent.name, currentTime, () => {
          expect(onInteractionTracked).toHaveBeenCalledTimes(2);
          expect(onInteractionTracked).toHaveBeenLastNotifiedOfInteraction(
            secondEvent,
          );

          wrapped = InteractionTracking.wrap(unwrapped, threadID);
          expect(onWorkScheduled).toHaveBeenCalledTimes(1);
          expect(onWorkScheduled).toHaveBeenLastNotifiedOfWork(
            new Set([firstEvent, secondEvent]),
            threadID,
          );
        });
      });

      expect(onInteractionTracked).toHaveBeenCalledTimes(2);
      expect(onInteractionScheduledWorkCompleted).not.toHaveBeenCalled();

      wrapped();
      expect(unwrapped).toHaveBeenCalled();

      expect(onWorkScheduled).toHaveBeenCalledTimes(1);
      expect(onWorkCanceled).not.toHaveBeenCalled();
      expect(onWorkStarted).toHaveBeenCalledTimes(3);
      expect(onWorkStarted).toHaveBeenLastNotifiedOfWork(
        new Set([firstEvent, secondEvent]),
        threadID,
      );
      expect(onWorkStopped).toHaveBeenCalledTimes(3);
      expect(onWorkStopped).toHaveBeenLastNotifiedOfWork(
        new Set([firstEvent, secondEvent]),
        threadID,
      );

      expect(
        onInteractionScheduledWorkCompleted.mock.calls[0][0],
      ).toMatchInteraction(firstEvent);
      expect(
        onInteractionScheduledWorkCompleted.mock.calls[1][0],
      ).toMatchInteraction(secondEvent);
    });

    it('should call the correct interaction subscriber methods when a wrapped callback is canceled', () => {
      const fnOne = jest.fn();
      const fnTwo = jest.fn();
      let wrappedOne, wrappedTwo;
      InteractionTracking.track(firstEvent.name, currentTime, () => {
        wrappedOne = InteractionTracking.wrap(fnOne, threadID);
        InteractionTracking.track(secondEvent.name, currentTime, () => {
          wrappedTwo = InteractionTracking.wrap(fnTwo, threadID);
        });
      });

      expect(onInteractionTracked).toHaveBeenCalledTimes(2);
      expect(onInteractionScheduledWorkCompleted).not.toHaveBeenCalled();
      expect(onWorkCanceled).not.toHaveBeenCalled();
      expect(onWorkStarted).toHaveBeenCalledTimes(2);
      expect(onWorkStopped).toHaveBeenCalledTimes(2);

      wrappedTwo.cancel();

      expect(onInteractionScheduledWorkCompleted).toHaveBeenCalledTimes(1);
      expect(
        onInteractionScheduledWorkCompleted,
      ).toHaveBeenLastNotifiedOfInteraction(secondEvent);
      expect(onWorkCanceled).toHaveBeenCalledTimes(1);
      expect(onWorkCanceled).toHaveBeenLastNotifiedOfWork(
        new Set([firstEvent, secondEvent]),
        threadID,
      );

      wrappedOne.cancel();

      expect(onInteractionScheduledWorkCompleted).toHaveBeenCalledTimes(2);
      expect(
        onInteractionScheduledWorkCompleted,
      ).toHaveBeenLastNotifiedOfInteraction(firstEvent);
      expect(onWorkCanceled).toHaveBeenCalledTimes(2);
      expect(onWorkCanceled).toHaveBeenLastNotifiedOfWork(
        new Set([firstEvent]),
        threadID,
      );

      expect(fnOne).not.toHaveBeenCalled();
      expect(fnTwo).not.toHaveBeenCalled();
    });

    it('should not end an interaction twice if wrap is used to schedule follow up work within another wrap', () => {
      const fnOne = jest.fn(() => {
        wrappedTwo = InteractionTracking.wrap(fnTwo, threadID);
      });
      const fnTwo = jest.fn();
      let wrappedOne, wrappedTwo;
      InteractionTracking.track(firstEvent.name, currentTime, () => {
        wrappedOne = InteractionTracking.wrap(fnOne, threadID);
      });

      expect(onInteractionTracked).toHaveBeenCalledTimes(1);
      expect(onInteractionScheduledWorkCompleted).not.toHaveBeenCalled();

      wrappedOne();

      expect(onInteractionTracked).toHaveBeenCalledTimes(1);
      expect(onInteractionScheduledWorkCompleted).not.toHaveBeenCalled();

      wrappedTwo();

      expect(onInteractionTracked).toHaveBeenCalledTimes(1);
      expect(onInteractionScheduledWorkCompleted).toHaveBeenCalledTimes(1);
      expect(
        onInteractionScheduledWorkCompleted,
      ).toHaveBeenLastNotifiedOfInteraction(firstEvent);
    });

    it('should unsubscribe', () => {
      InteractionTrackingSubscriptions.unsubscribe();
      InteractionTracking.track(firstEvent.name, currentTime, () => {});

      expect(onInteractionTracked).not.toHaveBeenCalled();
    });
  });

  describe('disabled', () => {
    beforeEach(() => loadModules({enableInteractionTracking: false}));

    // TODO
  });
});
