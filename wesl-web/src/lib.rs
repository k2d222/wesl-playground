mod utils;

use std::{collections::HashMap, path::PathBuf};

use cfg_if::cfg_if;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;
use wesl::{syntax::Expression, *};

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[derive(Tsify, Serialize, Deserialize, Default)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ManglerKind {
    #[default]
    Escape,
    Hash,
    None,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct WeslOptions {
    pub files: HashMap<String, String>,
    pub root: String,
    #[serde(default)]
    pub mangler: ManglerKind,
    pub imports: bool,
    pub condcomp: bool,
    pub strip: bool,
    #[serde(default)]
    pub entrypoints: Option<Vec<String>>,
    pub features: HashMap<String, bool>,
    pub eval: Option<String>,
}

fn make_mangler(kind: ManglerKind) -> Box<dyn Mangler> {
    match kind {
        ManglerKind::Escape => Box::new(MANGLER_ESCAPE),
        ManglerKind::Hash => Box::new(MANGLER_HASH),
        ManglerKind::None => Box::new(MANGLER_NONE),
    }
}

fn compile_impl(args: WeslOptions) -> Result<String, Diagnostic> {
    let mut resolver = VirtualFileResolver::new();

    for (name, source) in args.files {
        let resource = PathBuf::from(name).into();
        resolver.add_file(resource, source).unwrap();
    }

    let root: Resource = PathBuf::from(args.root).into();

    let mangler = make_mangler(args.mangler);
    let mangler = CachedMangler::new(&mangler);

    let compile_options = wesl::CompileOptions {
        use_imports: args.imports,
        use_condcomp: args.condcomp,
        strip: args.strip,
        entry_points: args.entrypoints,
        features: args.features,
    };

    let (wgsl, mut sourcemap) =
        wesl::compile_with_sourcemap(&root, &resolver, &mangler, &compile_options)?;

    if let Some(eval) = args.eval {
        sourcemap.set_default_source(eval.clone());
        let inst = wesl::eval_with_sourcemap(&eval, &wgsl, &sourcemap)?;
        Ok(inst.to_string())
    } else {
        Ok(wgsl.to_string())
    }
}

cfg_if! {
    if #[cfg(feature = "debug")] {
        fn init_log() {
            static ONCE: std::sync::Once = std::sync::Once::new();
            ONCE.call_once(|| {
                std::panic::set_hook(Box::new(console_error_panic_hook::hook));
                console_log::init_with_level(log::Level::Trace).expect("error initializing log");
            })
        }
    } else {
        fn init_log() {}
    }
}

#[wasm_bindgen]
pub fn compile(args: WeslOptions) -> Result<String, String> {
    init_log();
    compile_impl(args)
        .map(|d| d.to_string())
        .map_err(|e| ansi_to_html::convert(&e.to_string()).unwrap())
}
