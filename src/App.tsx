import { compile, WeslOptions, ManglerKind } from "./wesl-web/wesl_web"

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

import { For, type Component, createSignal, createEffect } from 'solid-js';
import { createStore, type SetStoreFunction, type Store } from "solid-js/store";
import './style.scss'

const DEFAULT_FILES = [
  { name: 'main.wgsl', source: 'import util/my_fn;\nfn main() -> u32 {\n    return my_fn();\n}\n' },
  { name: 'util.wgsl', source: 'fn my_fn() -> u32 { return 42; }' },
]
const DEFAULT_OPTIONS = {
  root: 'main.wgsl',
  imports: true,
  condcomp: true,
  strip: false,
  entrypoints: '',
  mangler: 'Escape' as ManglerKind,
  eval: '',
  features: '',
}
const DEFAULT_OUTPUT =
`Visit the <a href="https://github.com/wgsl-tooling-wg/wesl-spec">WESL reference</a> to learn about WESL.<br/>
<br/>
Options:
<ul>
  <li>imports — enable/disable the <a href="https://github.com/wgsl-tooling-wg/wesl-spec/blob/main/Imports.md">import extension</a></li>
  <li>conditionals — enable/disable the <a href="https://github.com/wgsl-tooling-wg/wesl-spec/blob/main/ConditionalTranslation.md">conditional translation extension</a>
    <ul>
      <li>features — comma-separated list of features to enable/disable. Syntax: feat1=true,feat2=false,...</li>
    </ul>
  </li>
  <li>mangler — choose the <a href="https://github.com/wgsl-tooling-wg/wesl-spec/blob/main/NameMangling.md">name mangling scheme</a>
    <ul>
      <li>None — no mangling is performed. Name collisions can happen</li>
      <li>Hash — mangling based on a hash of the fully-qualified name</li>
      <li>Escape — fully-qualified name, with underscores escaped (recommended)</li>
    </ul>
  </li>
  <li>root — select the root file</li>
  <li>strip — remove unused declarations
    <ul>
      <li>keep — comma-separated list of declarations in the root to keep when strip is enabled</li>
    </ul>
  </li>
  <li>eval — if set, evaluate a const-expression and output the result</a>
  <ly
</ul>
`.replaceAll(/\s*\n\s*/g, '')

const URL_PARAMS = new URLSearchParams(window.location.search);

function createLocalStore<T extends object>(name: string, init: T): [Store<T>, SetStoreFunction<T>] {
  if (URL_PARAMS.has(name)) {
    try {
      init = JSON.parse(decodeURIComponent(URL_PARAMS.get(name)))
      console.log(init)
    }
    catch (e) {
      console.error(`failed to parse URI component '${name}'`, e)
    }
  }
  else if (localStorage.getItem(name) !== null) {
    init = JSON.parse(localStorage.getItem(name))
  }
  const [state, setState] = createStore<T>(init);
  createEffect(() => localStorage.setItem(name, JSON.stringify(state)));
  return [state, setState];
}

function removeIndex<T>(array: readonly T[], index: number): T[] {
  return [...array.slice(0, index), ...array.slice(index + 1)];
}

const newFile = () => setFiles(files.length, { name: `tab${files.length}.wgsl`, source: "" })
const delFile = (i: number) => setFiles(files => removeIndex(files, i))
const renameFile = (i: number, name: string) => setFiles(i, (old) => ({ name, source: old.source }))

const [files, setFiles] = createLocalStore('files', DEFAULT_FILES);
const [options, setOptions] = createLocalStore('options', DEFAULT_OPTIONS);
const [tab, setTab] = createSignal(0)

const input = () => {
  if (files.length == 0) {
    setFiles([{ name: 'main.wgsl', source: 'fn main() -> u32 {\n    return 0u;\n}\n' }])
  }
  if (tab() >= files.length) {
    setTab(files.length - 1)
  }
  return files[tab()]
}
const setSource = (source) => setFiles(tab(), { name: input().name, source })
const [output, setOutput] = createSignal(DEFAULT_OUTPUT)

function run() {
  const entrypoints = options.entrypoints === '' ? null : options.entrypoints.split(',').map(e => e.trim())
  const features = Object.fromEntries(
    options.features
      .split(',')
      .map(f => f.split('=', 2).map(x => x.trim()))
      .map(f => f.length === 1 ? [f[0], true] : [f[0], !!f[1] && f[1] !== 'false'])
    )
  const eval_ = options.eval === '' ? null : options.eval
  const comp: WeslOptions = {
      ...options,
      files: Object.fromEntries(files.map(f => [f.name, f.source])),
      features,
      entrypoints,
      eval: eval_,
  }

  console.log('compiling', comp)

  try {
    const res = compile(comp)
    setOutput(res)
  } catch (e) {
    setOutput(e)
  }
}

function reset() {
  setFiles(DEFAULT_FILES)
  setOptions(DEFAULT_OPTIONS)
  setOutput(DEFAULT_OUTPUT)
}

function share() {
  const codedFiles = encodeURIComponent(JSON.stringify(files))
  const codedOptions = encodeURIComponent(JSON.stringify(options))
  const url = new URL(window.location.origin + window.location.pathname)
  url.search = `?files=${codedFiles}&options=${codedOptions}`
  // window.location.search = url.search
  setOutput('copy the URL below share this sandbox.\n' + url.toString())
}

function setupMonaco(elt: HTMLElement) {
  self.MonacoEnvironment = {
    getWorker: function (_workerId, _label) {
        return new editorWorker();
    }
  };
  let editor = monaco.editor.create(elt, {
    value: input().source,
    language: 'wgsl',
    automaticLayout: true,
    theme: 'vs',
  });

  editor.getModel().onDidChangeContent(() => setSource(editor.getValue()))
  createEffect(() => {
    editor.setValue(input().source)
  })
}

interface TabBtnProps {
  name: string,
  selected: boolean,
  onselect: () => void,
  onrename: (name: string) => void,
  ondelete: () => void
}

function TabBtn(props: TabBtnProps) {
  const setEditable = (e: { currentTarget: HTMLElement }) => {
    e.currentTarget.contentEditable = 'true'
    e.currentTarget.focus()
  }

  const endEditable = (e: { currentTarget: HTMLElement }) => {
    e.currentTarget.contentEditable = 'false'
    props.onrename(e.currentTarget.textContent)
    e.currentTarget.blur()
  }

  const onKeyDown = (e: KeyboardEvent & { currentTarget: HTMLElement }) => {
    if (!/^[\w\.]$/.test(e.key)) {
      e.preventDefault()
      endEditable(e)
    }
  }

  return (
    <div class="tab-btn text" classList={{selected: props.selected}} role="button" tabindex="0" onclick={props.onselect}>
      <div ondblclick={setEditable} onblur={endEditable} onkeydown={onKeyDown} contenteditable={false}>{props.name}</div>
      <button onclick={props.ondelete}>
        <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
  )
}

const App: Component = () => {
  return (
    <div id="app">
      <div id="header">
        <h3>WESL Sandbox</h3>
        <button id="btn-run" onclick={run}>run</button>
        <button id="btn-reset" onclick={reset}>reset</button>
        <button id="btn-share" onclick={share}>share</button>
      </div>
      <div id="left">
        <div class="wrap">
          <div class="head tabs">
            <For each={files}>{(file, i) => 
              <TabBtn name={file.name}
                selected={i() == tab()}
                onselect={() => setTab(i)}
                onrename={name => renameFile(i(), name)}
                ondelete={() => delFile(i())} />
            }</For>
            <div class="tab-btn" role="button" tabindex="0" onclick={newFile}>
              <button tabindex="0">
                <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12L20 12M12 4L12 20"></path></svg>
              </button>
            </div>
          </div>
          <div id="input" ref={elt => setupMonaco(elt)}></div>
        </div>
      </div>
      <div id="right">
        <div class="wrap">
          <div id="options" class="head">
            <label>
              <span>imports</span>
              <input type="checkbox" checked={options.imports} onchange={e => setOptions("imports", e.currentTarget.checked)} />
            </label>
            <label>
              <span>conditionals</span>
              <input type="checkbox" checked={options.condcomp} onchange={e => setOptions("condcomp", e.currentTarget.checked)} />
            </label>
            <label>
              <span>features</span>
              <input type="text" disabled={!options.condcomp} value={options.features} onchange={e => setOptions("features", e.currentTarget.value)} />
            </label>
            <label>
              <span>mangler</span>
              <select value={options.mangler} onchange={e => setOptions("mangler", e.currentTarget.value as ManglerKind)}>
                <option value="None">None</option>
                <option value="Hash">Hash</option>
                <option value="Escape">Escape</option>
              </select>
            </label>
            <label>
              <span>root</span>
              <select value={options.root} onchange={e => setOptions("root", e.currentTarget.value)}>
                <For each={files}>{file => 
                  <option value={file.name}>{file.name}</option>
                }</For>
              </select>
            </label>
            <label>
              <span>strip</span>
              <input type="checkbox" checked={options.strip} onchange={e => setOptions("strip", e.currentTarget.checked)} />
            </label>
            <label>
              <span>keep</span>
              <input type="text" disabled={!options.strip} value={options.entrypoints} onchange={e => setOptions("entrypoints", e.currentTarget.value)} />
            </label>
            <label>
              <span>eval</span>
              <input type="text" value={options.eval} onchange={e => setOptions("eval", e.currentTarget.value)} />
            </label>
          </div>
          <div id="output"><pre><code innerHTML={output()}></code></pre></div>
        </div>
      </div>
    </div>
  );
};

export default App;
