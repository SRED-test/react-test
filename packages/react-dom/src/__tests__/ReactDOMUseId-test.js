/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

let JSDOM;
let React;
let ReactDOM;
let clientAct;
let ReactDOMFizzServer;
let Stream;
let useId;
let document;
let writable;
let container;
let buffer = '';
let hasErrored = false;
let fatalError = undefined;

describe('useId', () => {
  beforeEach(() => {
    jest.resetModules();
    JSDOM = require('jsdom').JSDOM;
    React = require('react');
    ReactDOM = require('react-dom');
    clientAct = require('jest-react').act;
    ReactDOMFizzServer = require('react-dom/server');
    Stream = require('stream');
    useId = React.unstable_useId;

    // Test Environment
    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body><div id="container">',
      {
        runScripts: 'dangerously',
      },
    );
    document = jsdom.window.document;
    container = document.getElementById('container');

    buffer = '';
    hasErrored = false;

    writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    writable.on('data', chunk => {
      buffer += chunk;
    });
    writable.on('error', error => {
      hasErrored = true;
      fatalError = error;
    });
  });

  async function serverAct(callback) {
    await callback();
    // Await one turn around the event loop.
    // This assumes that we'll flush everything we have so far.
    await new Promise(resolve => {
      setImmediate(resolve);
    });
    if (hasErrored) {
      throw fatalError;
    }
    // JSDOM doesn't support stream HTML parser so we need to give it a proper fragment.
    // We also want to execute any scripts that are embedded.
    // We assume that we have now received a proper fragment of HTML.
    const bufferedContent = buffer;
    buffer = '';
    const fakeBody = document.createElement('body');
    fakeBody.innerHTML = bufferedContent;
    while (fakeBody.firstChild) {
      const node = fakeBody.firstChild;
      if (node.nodeName === 'SCRIPT') {
        const script = document.createElement('script');
        script.textContent = node.textContent;
        fakeBody.removeChild(node);
        container.appendChild(script);
      } else {
        container.appendChild(node);
      }
    }
  }

  function normalizeTreeIdForTesting(id) {
    const [serverClientPrefix, base32, hookIndex] = id.split(':');
    if (serverClientPrefix === 'r') {
      // Client ids aren't stable. For testing purposes, strip out the counter.
      return (
        'CLIENT_GENERATED_ID' +
        (hookIndex !== undefined ? ` (${hookIndex})` : '')
      );
    }
    // Formats the tree id as a binary sequence, so it's easier to visualize
    // the structure.
    return (
      parseInt(base32, 32).toString(2) +
      (hookIndex !== undefined ? ` (${hookIndex})` : '')
    );
  }

  function DivWithId({children}) {
    const id = normalizeTreeIdForTesting(useId());
    return <div id={id}>{children}</div>;
  }

  test('basic example', async () => {
    function App() {
      return (
        <div>
          <div>
            <DivWithId />
            <DivWithId />
          </div>
          <DivWithId />
        </div>
      );
    }

    await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(<App />);
      pipe(writable);
    });
    await clientAct(async () => {
      ReactDOM.hydrateRoot(container, <App />);
    });
    expect(container).toMatchInlineSnapshot(`
      <div
        id="container"
      >
        <div>
          <div>
            <div
              id="101"
            />
            <div
              id="1001"
            />
          </div>
          <div
            id="10"
          />
        </div>
      </div>
    `);
  });

  test('indirections', async () => {
    function App() {
      // There are no forks in this tree, but the parent and the child should
      // have different ids.
      return (
        <DivWithId>
          <div>
            <div>
              <div>
                <DivWithId />
              </div>
            </div>
          </div>
        </DivWithId>
      );
    }

    await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(<App />);
      pipe(writable);
    });
    await clientAct(async () => {
      ReactDOM.hydrateRoot(container, <App />);
    });
    expect(container).toMatchInlineSnapshot(`
      <div
        id="container"
      >
        <div
          id="0"
        >
          <div>
            <div>
              <div>
                <div
                  id="1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
  });

  test('empty (null) children', async () => {
    // We don't treat empty children different from non-empty ones, which means
    // they get allocated a slot when generating ids. There's no inherent reason
    // to do this; Fiber happens to allocate a fiber for null children that
    // appear in a list, which is not ideal for performance. For the purposes
    // of id generation, though, what matters is that Fizz and Fiber
    // are consistent.
    function App() {
      return (
        <>
          {null}
          <DivWithId />
          {null}
          <DivWithId />
        </>
      );
    }

    await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(<App />);
      pipe(writable);
    });
    await clientAct(async () => {
      ReactDOM.hydrateRoot(container, <App />);
    });
    expect(container).toMatchInlineSnapshot(`
      <div
        id="container"
      >
        <div
          id="10"
        />
        <div
          id="100"
        />
      </div>
    `);
  });

  test('large ids', async () => {
    // The component in this test outputs a recursive tree of nodes with ids,
    // where the underlying binary representation is an alternating series of 1s
    // and 0s. In other words, they are all of the form 101010101.
    //
    // Because we use base 32 encoding, the resulting id should consist of
    // alternating 'a' (01010) and 'l' (10101) characters, except for the the
    // 'R:' prefix, and the first character after that, which may not correspond
    // to a complete set of 5 bits.
    //
    // Example: R:clalalalalalalala...
    //
    // We can use this pattern to test large ids that exceed the bitwise
    // safe range (32 bits). The algorithm should theoretically support ids
    // of any size.

    function Child({children}) {
      const id = useId();
      return <div id={id}>{children}</div>;
    }

    function App() {
      let tree = <Child />;
      for (let i = 0; i < 50; i++) {
        tree = (
          <>
            <Child />
            {tree}
          </>
        );
      }
      return tree;
    }

    await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(<App />);
      pipe(writable);
    });
    await clientAct(async () => {
      ReactDOM.hydrateRoot(container, <App />);
    });
    const divs = container.querySelectorAll('div');

    // Confirm that every id matches the expected pattern
    for (let i = 0; i < divs.length; i++) {
      // Example: R:clalalalalalalala...
      expect(divs[i].id).toMatch(/^R:.(((al)*a?)((la)*l?))*$/);
    }
  });

  test('multiple ids in a single component', async () => {
    function App() {
      const id1 = useId();
      const id2 = useId();
      const id3 = useId();
      return `${id1}, ${id2}, ${id3}`;
    }

    await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(<App />);
      pipe(writable);
    });
    await clientAct(async () => {
      ReactDOM.hydrateRoot(container, <App />);
    });
    // We append a suffix to the end of the id to distinguish them
    expect(container).toMatchInlineSnapshot(`
      <div
        id="container"
      >
        R:0, R:0:1, R:0:2
        <!-- -->
      </div>
    `);
  });
});
