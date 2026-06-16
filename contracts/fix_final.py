#!/usr/bin/env python3
"""Final comprehensive fix for SDK v20 contracts."""
import os, re

SRC = "/workspaces/starked-education/contracts/src"

mods = 0
for fname in os.listdir(SRC):
    if not fname.endswith('.rs'): continue
    if fname.endswith('_test.rs'): continue
    fpath = os.path.join(SRC, fname)
    with open(fpath) as f:
        content = f.read()
    orig = content
    
    # 1) Fix to_alloc_string() → does NOT exist in v20 SDK
    # Use as_str().bytes() instead
    content = content.replace('.to_alloc_string().into_bytes()', '.as_str().bytes()')
    content = content.replace('.to_alloc_string().as_bytes()', '.as_str().bytes()')
    content = content.replace('.to_alloc_string().starts_with(', '.as_str().starts_with(')
    content = content.replace('.to_alloc_string().into_bytes()', '.as_str().bytes()')
    
    # 2) Fix into_str() → use as_str() in v20
    content = content.replace('.into_str()', '.as_str()')
    
    # 3) Fix u256 import → doesn't exist, U256 is the correct type
    content = content.replace('U256, u256,', 'U256,')
    content = content.replace(', u256,', ',')
    content = content.replace('{u256,', '{')
    content = content.replace('use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec, U256, u256,\n    Map, BytesN, IntoVal, crypto::Hash,', 'use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec, U256,\n    Map, BytesN, IntoVal,')
    
    # 4) Fix crypto::Hash import
    content = content.replace('crypto::Hash,', '')
    content = content.replace('crypto::Hash', '')
    
    # 5) Replace u8 fields in structs with u32 (u8: TryFromVal not satisfied in v20 for contracttype)
    # Only in struct definitions, not in function params
    content = re.sub(r'(pub \w+: )u8,', r'\1u32,', content)
    content = re.sub(r'(\s+flags: )u8,', r'\1u32,', content)
    
    # 6) Fix Address::from_account → use Address::from_contract_id in v20
    content = content.replace('Address::from_account(', 'Address::from_contract_id(')
    
    # 7) Fix env.current_contract_address() → may not exist in v20
    content = content.replace('env.current_contract_address()', 'env.current_contract_address()')
    
    if content != orig:
        with open(fpath, 'w') as f:
            f.write(content)
        mods += 1
        print(f"  Fixed {fname}")

print(f"\nModified {mods} files")
