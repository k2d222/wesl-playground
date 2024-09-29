mod utils;

use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;
use wesl::*;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[derive(Serialize, Deserialize, Default)]
pub enum ManglerKind {
    #[default]
    Escape,
    Hash,
    None,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct CompileOptions {
    pub files: HashMap<String, String>,
    pub entrypoint: String,
    #[serde(default)]
    pub mangler: ManglerKind,
    pub imports: bool,
    pub condcomp: bool,
    pub strip: bool,
    #[serde(default)]
    pub entrypoints: Option<Vec<String>>,
    pub features: HashMap<String, bool>,
}

fn make_mangler(kind: ManglerKind) -> Box<dyn Mangler> {
    match kind {
        ManglerKind::Escape => Box::new(MANGLER_ESCAPE),
        ManglerKind::Hash => Box::new(MANGLER_HASH),
        ManglerKind::None => Box::new(MANGLER_NONE),
    }
}

fn compile_impl(args: CompileOptions) -> Result<String, Error> {
    let mut resolver = VirtualFileResolver::new();

    for (name, source) in args.files {
        let resource = PathBuf::from(name).into();
        resolver.add_file(resource, source).unwrap();
    }

    let entrypoint: Resource = PathBuf::from(args.entrypoint).into();

    let mangler = make_mangler(args.mangler);

    let compile_options = wesl::CompileOptions {
        use_imports: args.imports,
        use_condcomp: args.condcomp,
        strip: args.strip,
        entry_points: args.entrypoints,
        features: args.features,
    };

    let wgsl = wesl::compile(&entrypoint, &resolver, &mangler, &compile_options)?;
    Ok(wgsl.to_string())
}

#[wasm_bindgen]
pub fn compile(args: CompileOptions) -> Result<String, String> {
    compile_impl(args).map_err(|e| Diagnostic::new(e).to_string())
}
