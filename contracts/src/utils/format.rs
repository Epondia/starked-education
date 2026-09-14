//! No-std compatible hex formatting helpers
//! Only the functions actually used by the contract modules are kept
//! to minimize WASM binary size.
use soroban_sdk::{Env, String};

/// Write a u64 as lowercase hex digits into `out`.
/// Returns the number of bytes written.
///
/// # Parameters
///
/// - `value` – The `u64` value to format.
/// - `out` – The output buffer slice. Must be at least 16 bytes.
///
/// # Returns
///
/// The number of bytes written (`usize`).
pub fn write_u64_hex(value: u64, out: &mut [u8]) -> usize {
    if out.len() < 16 {
        return 0;
    }
    let hex_chars = b"0123456789abcdef";
    let mut buf = [0u8; 16];
    for i in 0..16 {
        let shift = (15 - i) * 4;
        let nibble = ((value >> shift) & 0xF) as usize;
        buf[i] = hex_chars[nibble];
    }
    // Skip leading zeros from the LEFT
    let mut start = 16;
    for i in 0..16 {
        if buf[i] != b'0' {
            start = i;
            break;
        }
    }
    if start == 16 {
        // value was zero
        out[0] = b'0';
        return 1;
    }
    let written = 16 - start;
    for i in 0..written {
        out[i] = buf[start + i];
    }
    written
}

/// Convert a u64 hash value into a hex soroban String (no std::format).
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
/// - `hash` – The `u64` value to convert.
///
/// # Returns
///
/// A Soroban [`String`] representing the hex value.
pub fn hash_to_hex_string(env: &Env, hash: u64) -> String {
    let mut buf = [0u8; 16];
    let n = write_u64_hex(hash, &mut buf);
    let s = core::str::from_utf8(&buf[..n]).unwrap_or("0");
    String::from_str(env, s)
}
