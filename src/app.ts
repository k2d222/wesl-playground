import wesl from "./wesl-web/wesl_web";
import { compile, CompileOptions } from "./wesl-web/wesl_web"
import ansiHTML from "ansi-html"

const $run = document.querySelector("#btn-run")
const $input = document.querySelector("#input")
const $output = document.querySelector("#output")
let selected = "main.wgsl"

const options: CompileOptions = {
    files: {
      "main.wgsl": "import util/my_fn;\nfn main() -> u32 {\n    return my_fn();\n}\n",
      "util.wgsl": "fn my_fn() -> u32 { return 42; }",
    },
    entrypoint: "main.wgsl",
    imports: true,
    condcomp: true,
    strip: false,
    entrypoints: null,
    features: {},
}

function onRun() {
  options.files[selected] = $input.textContent
  console.log("compiling with options", options)
  const res = compile(options)
  $output.innerHTML = ansiHTML(res)
}

function select(sel: string) {
  options.files[selected] = $input.textContent
  selected = sel
  $input.textContent = options.files[selected]
}

function main() {
  $run.addEventListener('click', onRun)
  $input.textContent = options.files[selected]
}

wesl().then(main)
