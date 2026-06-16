#!/usr/bin/env python3
"""Apply targeted SDK v20 fixes to contract files."""
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
    
    # 1) .to_string() on &str/"literal" → String::from_str(env, ...)  
    content = re.sub(r'"([^"]+)"\.to_string\(\)', r'String::from_str(&env, "\1")', content)
    
    # 2) .into_bytes() on String → .to_alloc_string().into_bytes()
    content = re.sub(r'(\w+)\.into_bytes\(\)', r'\1.to_alloc_string().into_bytes()', content)
    
    # 3) .as_slice() on BytesN → just remove (v20 doesn't have it)
    content = re.sub(r'\.as_slice\(\)', r'', content)
    
    # 4) .starts_with( → .to_alloc_string().starts_with(
    content = re.sub(r'(\w+)\.starts_with\(', r'\1.to_alloc_string().starts_with(', content)
    
    # 5) env.invoker() → env.current_contract_address() (v20 fallback)
    content = content.replace('env.invoker()', 'env.current_contract_address()')
    
    # 6) .into_str() on String → just remove
    content = re.sub(r'(\w+)\.into_str\(\)', r'\1', content)
    
    if content != orig:
        with open(fpath, 'w') as f:
            f.write(content)
        mods += 1
        print(f"  Fixed {fname}")

print(f"\nModified {mods} files")
