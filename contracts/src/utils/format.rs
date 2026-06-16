//! No-std compatible hex and string formatting helpers
use soroban_sdk::{Env, String};

/// Write a u64 as lowercase hex digits (up to 16 chars) into `out`.
/// Returns the number of bytes written; `out` must have length >= 16.
/// Leading zeros are kept so the total length is fixed at 16.
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
    // Skip leading zeros from the LEFT so printed length matches the value.
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
pub fn hash_to_hex_string(env: &Env, hash: u64) -> String {
    let mut buf = [0u8; 16];
    let n = write_u64_hex(hash, &mut buf);
    let s = core::str::from_utf8(&buf[..n]).unwrap_or("0");
    String::from_str(env, s)
}

/// Build a soroban `String` by concatenating string slices.
pub fn build_string(env: &Env, parts: &[&str]) -> String {
    let mut buf = [0u8; 512];
    let mut idx = 0;
    for part in parts {
        for b in part.bytes() {
            if idx >= buf.len() {
                break;
            }
            buf[idx] = b;
            idx += 1;
        }
    }
    let s = core::str::from_utf8(&buf[..idx]).unwrap_or("");
    String::from_str(env, s)
}

/// Convert a u64 to a decimal ascii byte slice written into `out`.
pub fn write_u64_decimal(mut value: u64, out: &mut [u8]) -> usize {
    if out.is_empty() {
        return 0;
    }
    if value == 0 {
        out[0] = b'0';
        return 1;
    }
    let mut tmp = [0u8; 20];
    let mut idx = 20;
    while value > 0 {
        idx -= 1;
        tmp[idx] = b'0' + (value % 10) as u8;
        value /= 10;
    }
    let written = 20 - idx;
    if written > out.len() {
        return 0;
    }
    for i in 0..written {
        out[i] = tmp[idx + i];
    }
    written
}

/// Build "{prefix}{index}" string.
pub fn build_indexed_string(env: &Env, prefix: &str, index: u64) -> String {
    let mut out = [0u8; 64];
    let mut len = 0;
    for b in prefix.bytes() {
        if len >= out.len() {
            break;
        }
        out[len] = b;
        len += 1;
    }
    let n = write_u64_decimal(index, &mut out[len..]);
    len += n;
    let s = core::str::from_utf8(&out[..len]).unwrap_or("");
    String::from_str(env, s)
}

/// Concatenate two strings.
pub fn concat_two(env: &Env, left: &str, right: &str) -> String {
    build_string(env, &[left, right])
}

/// Concatenate three strings.
pub fn concat_three(env: &Env, a: &str, b: &str, c: &str) -> String {
    build_string(env, &[a, b, c])
}
