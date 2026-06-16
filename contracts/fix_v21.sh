#!/bin/bash
# Comprehensive SDK v20 -> v21 fix script for Soroban contracts
set -e

SRC="/workspaces/starked-education/contracts/src"
cd "$SRC"

echo "=== Fix 1: Replace env.invoker() with require_auth() ==="
sed -i 's/if env\.invoker() != source\.provider {/source.provider.require_auth();\n    if false {/' vrf_system.rs

echo "=== Fix 2: Fix event API - convert all env.events().publish calls ==="
# The old format: env.events().publish((......),); 
# The new format: env.events().publish(vec![&env, ......], ());

# First handle the files that use Symbol::new already (correct format, just need fixing)
# Files with Symbol::new in events: dynamic_nft, dna_storage, credential_registry
# Their format: env.events().publish((Symbol::new(env, "x"),), (y, z))
# This is already close to correct for v21, just need minor tweaks

# For files with string topics (time_lock_credential, vrf_system), 
# convert "topic" to Symbol::new(&env, "topic")

# Replace string topic events - multi-line pattern
for f in time_lock_credential.rs vrf_system.rs tokenomics.rs proctoring.rs marketplace.rs dna_services.rs event_logger.rs user_profile.rs; do
    if [ -f "$f" ]; then
        echo "  Processing $f events..."
        # Replace multi-line event string topics with Symbol
        perl -i -pe 's/(\s+)"([a-z_]+)",\s*\n/\1Symbol::new(\&env, "$2"),\n/g' "$f"
    fi
done

# Fix trailing comma-no-data pattern: ,); -> , ());
for f in *.rs; do
    if [ -f "$f" ]; then
        # Single-line: ),); -> ), ());
        sed -i 's/\(env\.events()\.publish([^)]*)\),);/\1, ());/g' "$f"
        # Multi-line: ),\n); -> ),\n    ());
        perl -i -pe 's/\),\s*\);$/\), ());/' "$f"
    fi
done

echo "=== Fix 3: Fix String.into_bytes() → to_alloc_string().into_bytes() ==="
# Only fix in courseMetadata.rs where it's used without to_alloc_string
sed -i 's/item\.clone()\.into_bytes()/item.clone().to_alloc_string().into_bytes()/g' courseMetadata.rs
sed -i 's/string\.clone()\.into_bytes()/string.clone().to_alloc_string().into_bytes()/g' courseMetadata.rs

echo "=== Fix 4: Fix Vec<u8> in structs that need to work with SDK v21 ==="
# In dynamic_nft.rs: special_effects: Vec<u8> → use Vec<u32> or just comment out
# In dna_storage.rs: DNASequence contains Vec<u8> → need Bytes wrapper
# This is complex - let's skip for now and see remaining errors

echo "=== Fix 5: Remove #![no_std] from individual modules ==="
# lib.rs already has #![no_std] + extern crate alloc
# Individual modules shouldn't have #![no_std]
for f in *.rs; do
    if [ -f "$f" ] && [ "$f" != "lib.rs" ]; then
        sed -i '1s/^#!\[no_std\]\n//' "$f" 2>/dev/null || true
    fi
done

echo "=== Done with bash fixes ==="
echo "Fixed: env.invoker(), event API strings, into_bytes(), no_std in modules"
