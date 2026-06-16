//! Alias module: `eventLogger` mirrors `event_logger`.
//! Both names are declared in `lib.rs`, so this file simply re-exports
//! the contents of `event_logger` under the `eventLogger` path used by
//! some submodules (e.g. `consciousness.rs`).

pub use crate::event_logger::*;
