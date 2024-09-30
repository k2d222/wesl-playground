# WESL Playground

A web interface to test WESL (WGSL Extended) shaders in the browser.

Reference: [wesl-spec](https://github.com/wgsl-tooling-wg/wesl-spec)

## Contributing
* Installing: `yarn install`
* Building:
  * release `yarn build`
  * development `yarn dev`
* Updating crate `wesl-web`:
  * release `wasm-pack build wesl-web --no-default-features && cp pkg/* ../src/wesl-web/`
  * development `wasm-pack build wesl-web --dev && cp pkg/* ../src/wesl-web/`
