#!/usr/bin/env python3
"""Fix Soroban SDK v20 -> v21 API changes across all contract source files."""
import os, re

SRC = "src"
files = [os.path.join(SRC, f) for f in os.listdir(SRC) if f.endswith(".rs")]
files.append(os.path.join(SRC, "utils/storage.rs"))

total_fixes = 0

for filepath in files:
    if not os.path.exists(filepath):
        continue
    with open(filepath, "r") as f:
        content = f.read()
    original = content
    fixes = 0

    # 1. Fix .to_string() on &str literals -> String::from_str(&env, "...")
    # Pattern: "some text".to_string() used in function contexts where &env or env is available
    content, n = re.subn(r'"([^"]+)"\.to_string\(\)', r'String::from_str(&env, "\1")', content)
    fixes += n

    # 2. Fix .into_bytes() on String. SDK v21: use .to_alloc_string().into_bytes()
    # But soroban_sdk::String might not have to_alloc_string. Let's use .as_bytes()
    # Actually in SDK v21, String can be converted to Bytes via to_val() or similar.
    # For now, wrap in alloc approach: the String needs to go through alloc
    # The best approach: since we have extern crate alloc, we need the string content
    # Use: <String as AsRef<[u8]>> not available. 
    # Simplest: convert via format! to alloc string first
    # Pattern: variable.into_bytes() where variable is soroban_sdk::String
    content, n = re.subn(r'(\w+)\.into_bytes\(\)\.iter\(\)', r'\1.to_alloc_string().as_bytes().iter()', content)
    fixes += n
    content, n = re.subn(r'(\w+)\.into_bytes\(\)', r'\1.to_alloc_string().into_bytes()', content)
    fixes += n

    # 3. Fix .as_slice() on BytesN<N> - SDK v21 uses as_array() or direct slice via Deref
    # BytesN<N> in v21 derefs to [u8; N], so .as_slice() should still work... 
    # But if it doesn't: convert to &[..]
    content, n = re.subn(r'(\w+)\.as_slice\(\)', r'&\1[..]', content)
    fixes += n

    # 4. Fix .starts_with() on soroban_sdk::String
    content, n = re.subn(r'(\w+)\.starts_with\("([^"]+)"\)', r'\1.to_alloc_string().starts_with("\2")', content)
    fixes += n

    # 5. Fix .invoker() on Env - removed in SDK v21
    # Pattern: if env.invoker() != some_addr { return Err("message".to_string()); }
    # Replace with: some_addr.require_auth();
    content, n = re.subn(
        r'if env\.invoker\(\) != (\S+) \{\s*return Err\([^)]+\);\s*\}',
        r'\1.require_auth();',
        content
    )
    fixes += n

    # 6. Fix .into_val() on &str -> String::from_str(&env, "...") 
    content, n = re.subn(r'"([^"]+)"\.into_val\(&?env\)', r'String::from_str(&env, "\1")', content)
    fixes += n
    content, n = re.subn(r'"([^"]+)"\.into_val\(env\)', r'String::from_str(&env, "\1")', content)
    fixes += n

    # 7. Fix .into_val() on &str with no env arg - general pattern
    content, n = re.subn(r'"([^"]+)"\.into_val\((\w+)\)', r'String::from_str(&\2, "\1")', content)
    fixes += n

    # 8. Fix .into_str() on String -> SDK v21: use as_str() or to_alloc_string()
    content, n = re.subn(r'(\w+)\.into_str\(&?env\)', r'\1.to_alloc_string().as_str()', content)
    fixes += n

    # 9. Add Copy/Eq/PartialEq to storage key enums that lack them
    # Pattern: #[contracttype] followed by pub enum with variants containing data
    content, n = re.subn(
        r'(#\[contracttype\])\n(pub enum (\w+))',
        r'\1\n#[derive(Clone, Debug, Eq, PartialEq)]\n\2',
        content
    )
    # Don't count these as they might already have derives
    # fixes += n

    # 10. Fix format!() returning alloc::string::String where soroban_sdk::String expected
    # This is trickier - only in return position or assignment to String fields
    # Wrap format!(...) with String::from_str(&env, &format!(...))
    # Only do this in obvious cases where format! is being returned or assigned to soroban String
    # Pattern: format!("...", args) on its own line returning from function -> wrap
    content, n = re.subn(
        r'(\s+)(format!\("([^"]*)"(?:,\s*[^)]+)?\))',
        r'\1String::from_str(&env, &\2)',
        content
    )
    fixes += n

    # 11. Fix Address::from_string that no longer takes &str with into_val
    content, n = re.subn(r'Address::from_string\(&env, ([^\)]+)\)', r'Address::from_string(&env, \1)', content)
    fixes += n

    # 12. Fix into_val on non-string types: &env.into_val(...) pattern
    # This is already handled for strings above

    # 13. Fix U256::from_u32 shift patterns - ensure correct types
    content, n = re.subn(r'U256::from_u32\((\w+) as u32\)', r'U256::from_u32(\1)', content)
    fixes += n

    # 14. Fix u64 to u32 casts where needed
    content, n = re.subn(r'\.len\(\) as u32', r'.len() as u32', content)
    fixes += n

    if content != original:
        print(f"Fixed {filepath}: {fixes} changes")
        total_fixes += fixes
        with open(filepath, "w") as f:
            f.write(content)

print(f"\nTotal fixes applied: {total_fixes}")
