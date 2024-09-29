import { For, type Component, createSignal, createEffect, Index } from 'solid-js';
import { createStore, type SetStoreFunction, type Store } from "solid-js/store";
import './style.scss'

import { compile, CompileOptions } from "./wesl-web/wesl_web"
import ansiHTML from "ansi-html"

export function createLocalStore<T extends object>(
  name: string,
  init: T
): [Store<T>, SetStoreFunction<T>] {
  const localState = localStorage.getItem(name);
  const [state, setState] = createStore<T>(
    localState ? JSON.parse(localState) : init
  );
  createEffect(() => localStorage.setItem(name, JSON.stringify(state)));
  return [state, setState];
}

const [files, setFiles] = createLocalStore("files", [
    { name: "main.wgsl", source: "import util/my_fn;\nfn main() -> u32 {\n    return my_fn();\n}\n" },
    { name: "util.wgsl", source: "fn my_fn() -> u32 { return 42; }" },
]);

const [tab, setTab] = createSignal(0)
const input = () => files[tab()]
const setSource = (source) => setFiles(tab(), { name: input().name, source })
const [output, setOutput] = createSignal("output goes here")

function run() {
  const options: CompileOptions = {
      files: Object.fromEntries(files.map(f => [f.name, f.source])),
      entrypoint: "main.wgsl",
      imports: true,
      condcomp: true,
      strip: false,
      entrypoints: null,
      features: {},
  }

  try {
    const res = compile(options)
    setOutput(res)
  } catch (e) {
    setOutput(ansiHTML(e))
  }
}

const App: Component = () => {
  return (
    <div id="app">
      <div id="header">
        <h3>WESL Sandbox</h3>
        <button id="btn-run" onclick={run}>run</button>
      </div>
      <div id="left">
        <div class="tabs">
          <Index each={files}>{(file, i) => 
            <>
              <button onclick={() => setTab(i)}>{file().name}</button>
              <button onclick={() => setFiles(i, undefined)}>x</button>
            </>
          }</Index>
        </div>
        <textarea id="input" value={input().source} oninput={e => setSource(e.currentTarget.value)} />
      </div>
      <div id="right">
        <pre><code id="output" innerHTML={output()}></code></pre>
      </div>
    </div>
  );
};

export default App;
