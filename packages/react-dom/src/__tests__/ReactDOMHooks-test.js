/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let React;
let ReactDOM;
let ReactDOMClient;
let Scheduler;
let act;
let ReactFeatureFlags;

describe('ReactDOMHooks', () => {
  let container;

  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMClient = require('react-dom/client');
    Scheduler = require('scheduler');
    act = require('jest-react').act;
    ReactFeatureFlags = require('shared/ReactFeatureFlags');

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('can ReactDOM.render() from useEffect', () => {
    const container2 = document.createElement('div');
    const container3 = document.createElement('div');

    function Example1({n}) {
      React.useEffect(() => {
        ReactDOM.render(<Example2 n={n} />, container2);
      });
      return 1 * n;
    }

    function Example2({n}) {
      React.useEffect(() => {
        ReactDOM.render(<Example3 n={n} />, container3);
      });
      return 2 * n;
    }

    function Example3({n}) {
      return 3 * n;
    }

    ReactDOM.render(<Example1 n={1} />, container);
    expect(container.textContent).toBe('1');
    expect(container2.textContent).toBe('');
    expect(container3.textContent).toBe('');
    Scheduler.unstable_flushAll();
    expect(container.textContent).toBe('1');
    expect(container2.textContent).toBe('2');
    expect(container3.textContent).toBe('3');

    ReactDOM.render(<Example1 n={2} />, container);
    expect(container.textContent).toBe('2');
    expect(container2.textContent).toBe('2'); // Not flushed yet
    expect(container3.textContent).toBe('3'); // Not flushed yet
    Scheduler.unstable_flushAll();
    expect(container.textContent).toBe('2');
    expect(container2.textContent).toBe('4');
    expect(container3.textContent).toBe('6');
  });

  it('should not bail out when an update is scheduled from within an event handler', () => {
    const {createRef, useCallback, useState} = React;

    const Example = ({inputRef, labelRef}) => {
      const [text, setText] = useState('');
      const handleInput = useCallback(event => {
        setText(event.target.value);
      });

      return (
        <>
          <input ref={inputRef} onInput={handleInput} />
          <label ref={labelRef}>{text}</label>
        </>
      );
    };

    const inputRef = createRef();
    const labelRef = createRef();

    ReactDOM.render(
      <Example inputRef={inputRef} labelRef={labelRef} />,
      container,
    );

    inputRef.current.value = 'abc';
    inputRef.current.dispatchEvent(
      new Event('input', {bubbles: true, cancelable: true}),
    );

    expect(labelRef.current.innerHTML).toBe('abc');
  });

  it('should not bail out when an update is scheduled from within an event handler in Concurrent Mode', async () => {
    const {createRef, useCallback, useState} = React;

    const Example = ({inputRef, labelRef}) => {
      const [text, setText] = useState('');
      const handleInput = useCallback(event => {
        setText(event.target.value);
      });

      return (
        <>
          <input ref={inputRef} onInput={handleInput} />
          <label ref={labelRef}>{text}</label>
        </>
      );
    };

    const inputRef = createRef();
    const labelRef = createRef();

    const root = ReactDOMClient.createRoot(container);
    root.render(<Example inputRef={inputRef} labelRef={labelRef} />);

    Scheduler.unstable_flushAll();

    inputRef.current.value = 'abc';
    await act(async () => {
      inputRef.current.dispatchEvent(
        new Event('input', {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(labelRef.current.innerHTML).toBe('abc');
  });

  fit('StrictMode + Suspense + subsequent layout StateUpdates causes infinite re-render when another passive effect sets state', () => {
    ReactFeatureFlags.enableStrictEffects = __DEV__;
    const root = ReactDOMClient.createRoot(container);

    function App() {
      const [state1, setState1] = React.useState(false);
      const [state2, setState2] = React.useState(false);
      React.useLayoutEffect(() => {
        setState1(true);
      }, []);
      React.useLayoutEffect(() => {
        if (state1) {
          setState2(true);
        }
      }, [state1]);

      const [state3, setState3] = React.useState(false);
      React.useEffect(() => {
        setState3(true);
      }, []);
      return state3;
    }

    root.render(
      <React.StrictMode>
        <React.Suspense>
          <App />
        </React.Suspense>
      </React.StrictMode>,
    );
    expect(Scheduler).toFlushWithoutYielding();
  });
});
