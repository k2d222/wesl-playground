import { compile, WeslOptions, ManglerKind, NcthOptions, compile_ncth } from "./wesl-web/wesl_web"

// import * as monaco from 'monaco-editor';
// more barebones version below:
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/browser/coreCommands'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'
import 'monaco-editor/esm/vs/editor/common/standaloneStrings'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles'; // The codicons are defined here and must be loaded
import 'monaco-editor/esm/vs/basic-languages/wgsl/wgsl.contribution'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

import { For, type Component, createSignal, createEffect, Show, onMount, onCleanup, on } from 'solid-js'
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
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
  mangler: 'escape' as ManglerKind,
  eval: '',
  features: '',
}
const DEFAULT_OPTIONS_NCTH = {
    root: 'main.wgsl',
    resolve: true,
    normalize: true,
    specialize: true,
    dealias: true,
    mangle: true,
    flatten: true,
}
const DEFAULT_MESSAGE =
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

function getHashFromUrl() {
  const match = window.location.pathname.match(/^\/s\/([a-f0-9]+)$/)
  if (match) {
    return match[1]
  }
  else {
    return null
  }
}

function onPopState(e: PopStateEvent) {
  const hash = getHashFromUrl()
  if (hash) {
    console.log(`share hash: ${hash}`)
    setShare(hash)
  }
}

let hasHash = false

onMount(() => {
  const hash = getHashFromUrl()
  if (hash) {
    setShare(hash)
  }
  window.addEventListener('popstate', onPopState);
});

onCleanup(() => {
  window.removeEventListener('popstate', onPopState);
})

function createLocalStore<T extends object>(name: string, init: T): [Store<T>, SetStoreFunction<T>] {
  if (localStorage.getItem(name) !== null) {
    init = JSON.parse(localStorage.getItem(name))
  }
  const [state, setState] = createStore<T>(init);
  createEffect(() => {
    if (hasHash) {
      window.history.pushState({}, "", "/")
      hasHash = false
    }

    localStorage.setItem(name, JSON.stringify(state))
  });
  return [state, setState];
}

function removeIndex<T>(array: readonly T[], index: number): T[] {
  return [...array.slice(0, index), ...array.slice(index + 1)];
}

const newFile = () => {
  setFiles(files.length, { name: `tab${files.length}.wgsl`, source: "" })
}

const delFile = (i: number) => {
  setTab(0)
  setFiles(files => removeIndex(files, i))
}

const renameFile = (i: number, name: string) => {
  setFiles(i, (old) => ({ name, source: old.source }))
}

const initialLinker = URL_PARAMS.get('linker') ?? 'k2d222'
const initialOptions = { ...DEFAULT_OPTIONS }
const initialOptionsNcth = { ...DEFAULT_OPTIONS_NCTH }
for (const key in DEFAULT_OPTIONS)
  if (URL_PARAMS.has(key))
    initialOptions[key] = URL_PARAMS.get(key)
for (const key in DEFAULT_OPTIONS_NCTH)
  if (URL_PARAMS.has(key))
    initialOptionsNcth[key] = URL_PARAMS.get(key)

const [files, setFiles] = createLocalStore('files', DEFAULT_FILES)
const [options, setOptions] = createLocalStore('options', initialOptions)
const [optionsNcth, setOptionsNcth] = createLocalStore('optionsNcth', initialOptionsNcth)
const [linker, setLinker] = createSignal(initialLinker)
const [tab, setTab] = createSignal(0)

const setSource = (source: string) => setFiles(tab(), { name: files[tab()].name, source })
const source = () => files[tab()]?.source ?? ''
const [output, setOutput] = createSignal('')
const [message, setMessage] = createSignal(DEFAULT_MESSAGE)

// this effect ensures that there is always at least 1 tab open.
createEffect(() => {
  if (files.length == 0) {
    setFiles([{ name: 'main.wgsl', source: 'fn main() -> u32 {\n    return 0u;\n}\n' }])
  }
})

let runTimeout = 0
function toggleAutoRun(toggle: boolean) {
  function loop() {
    run()
    runTimeout = setTimeout(loop, 1000)
  }
  loop()
}

function run() {
  if (linker() === 'k2d222') {
    return run_k2d222()
  }
  else if (linker() === 'ncthbrt') {
    run_ncth()
  }
}

function run_k2d222() {
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
    setMessage('')
    setOutput(res)
  } catch (e) {
    setOutput('')
    setMessage(e)
  }
}

function run_ncth() {
  const comp: NcthOptions = {
      ...optionsNcth,
      files: Object.fromEntries(files.map(f => [f.name, f.source])),
  }

  console.log('compiling', comp)

  try {
    const res = compile_ncth(comp)
    setOutput(res)
  } catch (e) {
    setOutput(e)
  }
}

function reset() {
  setFiles(DEFAULT_FILES)
  setOptions(DEFAULT_OPTIONS)
  setOutput('')
}

async function share() {
  const data = JSON.stringify({
    files: files,
    linker: linker(),
    options: options,
  })
  try {
    const response = await fetch('/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ data }),
    });

    if (!response.ok) {
      alert(`failed to share sandbox: ${response.status}`)
      throw new Error(`POST to sharing server error: ${response.status}`)
    }

    const hash = await response.text()
    const url = new URL(`${window.location.origin}/s/${hash}`)
    window.history.pushState(hash, "", url)
    setOutput('copy the URL below share this playground.\n' + url.toString())
    hasHash = true
  }
  catch (error) {
    console.error(error)
  }
}

async function setShare(hash: String) {
  try {
    console.log(`loading hash ${hash}`)
    const response = await fetch(`/share/${hash}`, {
      method: 'GET',
    });

    if (!response.ok) {
      alert(`failed to load shared sandbox: ${response.status}`)
      throw new Error(`POST to sharing server error: ${response.status}`)
    }

    const data = JSON.parse(await response.text())
    console.log('data:', data)
    hasHash = false

    if (Array.isArray(data.files)) {
      const files = []
      for (const file of data.files) {
        if (typeof file.name === 'string' && typeof file.source === 'string') {
          files.push({ name: file.name, source: file.source })
        }
      }
      setFiles(files)
    }
    if (typeof data.linker === 'string') {
      setLinker(data.linker)
    }
    if (typeof data.options === 'object') {
      const curOptions = linker() === 'k2d222' ? {...options} : linker() === 'ncthbrt' ? {...optionsNcth} : {}
      for (const key in data.options) {
        if (key in curOptions && typeof data.options[key] === typeof curOptions[key]) {
          curOptions[key] = data.options[key]
        }
      }
      if (linker() === 'k2d222')
        setOptions(curOptions)
      else if (linker() === 'ncthbrt')
        setOptionsNcth(optionsNcth)
    }

    const url = new URL(`${window.location.origin}/s/${hash}`)
    setOutput('loaded shared playground.\n' + url.toString())
    hasHash = true
  }
  catch (error) {
    console.error(error)
  }
}

function setupMonacoInput(elt: HTMLElement) {
  self.MonacoEnvironment = {
    getWorker: function (_workerId, _label) {
        return new editorWorker();
    }
  };
  const editor = monaco.editor.create(elt, {
    value: source(),
    language: 'wgsl',
    automaticLayout: true,
    theme: 'vs',
  });

  editor.getModel().onDidChangeContent(() => setSource(editor.getValue()))
  createEffect(on(tab, () => {
    editor.setValue(source())
  }))
}

function setupMonacoOutput(elt: HTMLElement) {
  self.MonacoEnvironment = {
    getWorker: function (_workerId, _label) {
        return new editorWorker();
    }
  };
  const editor = monaco.editor.create(elt, {
    value: output(),
    language: 'wgsl',
    automaticLayout: true,
    theme: 'vs',
    readOnly: true,
  });

  createEffect(() => {
    editor.setValue(output())
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
    if (["Enter", "Escape", "Tab"].includes(e.key)) {
      e.preventDefault()
      endEditable(e)
    }
  }

  return (
    <div class="tab-btn text" classList={{selected: props.selected}} role="button" tabindex="0" onclick={props.onselect}>
      <div ondblclick={setEditable} onblur={endEditable} onkeydown={onKeyDown} contenteditable={false}>{props.name}</div>
      <button onclick={e => { e.stopPropagation(); props.ondelete() }}>
        <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
  )
}

const App: Component = () => {
  return (
    <div id="app">
      <div id="header">
        <h3>WESL Playground</h3>
        <button id="btn-run" onclick={run}>compile</button>
        <button id="btn-reset" onclick={reset}>reset</button>
        <button id="btn-share" onclick={share}>share</button>
        <label>
          <span>auto recompile</span>
          <input type="checkbox" name="linker" value="k2d222" onChange={e => toggleAutoRun(e.currentTarget.checked)} />
        </label>
        <label>
          <span>k2d222's linker</span>
          <input type="radio" name="linker" value="k2d222" checked={linker() === "k2d222"} onchange={e => setLinker(e.currentTarget.value)} />
        </label>
        <label>
          <span>ncthbrt's linker</span>
          <input type="radio" name="linker" value="ncthbrt" checked={linker() === "ncthbrt"} onchange={e => setLinker(e.currentTarget.value)} />
        </label>
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
          <div id="input" ref={elt => setupMonacoInput(elt)}></div>
        </div>
      </div>
      <div id="right">
        <div class="wrap">
          <div id="options" class="head">
            <Show when={linker() === 'k2d222'}>
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
                  <option value="none">None</option>
                  <option value="hash">Hash</option>
                  <option value="escape">Escape</option>
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
            </Show>
            <Show when={linker() === 'ncthbrt'}>
              <label>
                <span>root</span>
                <select value={optionsNcth.root} onchange={e => setOptionsNcth("root", e.currentTarget.value)}>
                  <For each={files}>{file => 
                    <option value={file.name}>{file.name}</option>
                  }</For>
                </select>
              </label>
              <label>
                <span>resolve</span>
                <input type="checkbox" checked={optionsNcth.resolve} onchange={e => setOptionsNcth("resolve", e.currentTarget.checked)} />
              </label>
              <label>
                <span>normalize</span>
                <input type="checkbox" checked={optionsNcth.normalize} onchange={e => setOptionsNcth("normalize", e.currentTarget.checked)} />
              </label>
              <label>
                <span>specialize</span>
                <input type="checkbox" checked={optionsNcth.specialize} onchange={e => setOptionsNcth("specialize", e.currentTarget.checked)} />
              </label>
              <label>
                <span>dealias</span>
                <input type="checkbox" checked={optionsNcth.dealias} onchange={e => setOptionsNcth("dealias", e.currentTarget.checked)} />
              </label>
              <label>
                <span>mangle</span>
                <input type="checkbox" checked={optionsNcth.mangle} onchange={e => setOptionsNcth("mangle", e.currentTarget.checked)} />
              </label>
              <label>
                <span>flatten</span>
                <input type="checkbox" checked={optionsNcth.flatten} onchange={e => setOptionsNcth("flatten", e.currentTarget.checked)} />
              </label>
            </Show>
          </div>
          <div id="message" style={{ display: message() ? 'initial' : 'none' }}><pre innerHTML={message()}></pre></div>
          <div id="output" style={{ display: output() ? 'initial' : 'none' }} ref={elt => setupMonacoOutput(elt)}></div>
        </div>
      </div>
    </div>
  );
};

export default App;
