#!/usr/bin/env python3
"""Fix SDK v21 compilation errors across all Soroban contract files."""

import os
import re
import sys

SRC_DIR = "src"

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)
    return True

def fix_event_api(content):
    """Fix env.events().publish(tuple,) -> env.events().publish(Vec, data)"""
    # Pattern: env.events().publish((\n    "topic",\n    ...\n),);
    # Replace with: env.events().publish(vec![&env, ...], ());
    
    def replace_event(match):
        full = match.group(0)
        # Extract the inner content between the outer parentheses
        inner = match.group(1).strip()
        # Split by commas, but be careful of nested parens
        items = []
        depth = 0
        current = ""
        for c in inner:
            if c == '(':
                depth += 1
                current += c
            elif c == ')':
                depth -= 1
                current += c
            elif c == ',' and depth == 0:
                items.append(current.strip())
                current = ""
            else:
                current += c
        if current.strip():
            items.append(current.strip())
        
        # Generate the new event call
        # Convert items to into_val format for vec!
        converted = []
        for item in items:
            # If it's a string literal, wrap in Symbol::new
            if item.startswith('"') and item.endswith('"'):
                converted.append(f'soroban_sdk::Symbol::new(&env, {item})')
            elif item.startswith('Symbol::new'):
                converted.append(item)
            else:
                converted.append(item)
        
        vec_items = ', '.join(converted)
        return f'{{\n    let mut __topics = soroban_sdk::Vec::new(&env);\n    __topics.push_back({converted[0] if converted else "()"});\n    env.events().publish(__topics, ());\n}}'
    
    # Simpler approach: find all env.events().publish((...),); patterns
    # and replace them one by one
    pattern = r'env\.events\(\)\.publish\(\(([^)]*(?:\([^)]*\)[^)]*)*)\),\);'
    
    # Actually, let me just find and replace individual instances
    lines = content.split('\n')
    result = []
    i = 0
    in_event = False
    event_lines = []
    event_indent = ""
    
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        if not in_event:
            if stripped.startswith('env.events().publish(('):
                in_event = True
                event_indent = line[:len(line) - len(line.lstrip())]
                event_lines = [line]
                # Check if this is a single-line event
                if '),);' in stripped or '), ));' in stripped or '), );' in stripped:
                    # Single-line event - extract topics
                    in_event = False
                    result.append(fix_single_line_event(line))
                i += 1
            else:
                result.append(line)
                i += 1
        else:
            event_lines.append(line)
            if '),);' in stripped or '), ));' in stripped or '), );' in stripped:
                # End of event
                in_event = False
                result.append(f'// FIXME_EVENT: env.events().publish API changed in SDK v21')
                result.append(f'{event_indent}// Original: env.events().publish(...)')
                for el in event_lines:
                    result.append(f'{event_indent}// {el.strip()}')
            
            i += 1
    
    return '\n'.join(result)

def fix_single_line_event(line):
    """Fix a single-line event publish call."""
    indent = line[:len(line) - len(line.lstrip())]
    # Extract the inner tuple
    match = re.search(r'env\.events\(\)\.publish\(\((.*)\),\s*\);', line)
    if match:
        topics_str = match.group(1).strip()
        topics = [t.strip() for t in topics_str.split(',')]
        # Generate new-style event
        topic_exprs = []
        for t in topics:
            if t.startswith('"') and t.endswith('"') and not t.startswith('"Symbol'):
                # String literal - wrap in Symbol
                topic_exprs.append(f'soroban_sdk::Symbol::new(&env, {t})')
            else:
                topic_exprs.append(t)
        
        joined = ', '.join(topic_exprs)
        return f'{indent}// FIXME_EVENT: env.events().publish API changed in SDK v21\n{indent}// was: env.events().publish(({topics_str}),);\n{indent}env.events().publish(soroban_sdk::vec![&env, {joined}], ());'
    return line

def fix_env_invoker(content):
    """Replace env.invoker() with proper auth pattern."""
    # Pattern: if env.invoker() != source.provider
    content = re.sub(
        r'if env\.invoker\(\) != (\w+(?:\.\w+)*)',
        r'\1.require_auth();\n    if true',
        content
    )
    return content

def fix_string_into_bytes(content):
    """Replace String.into_bytes() with to_alloc_string().into_bytes()"""
    content = re.sub(
        r'(\w+)\.into_bytes\(\)(?!\s*=)',
        r'\1.to_alloc_string().into_bytes()',
        content
    )
    return content

def fix_display_format(content):
    """Fix places where format! uses soroban_sdk::String directly (no Display)"""
    # Pattern: format!("...{}...", some_sdk_string)
    # Need to convert to alloc string first
    # This is tricky - will mark for manual fix
    return content

def main():
    files = [f for f in os.listdir(SRC_DIR) if f.endswith('.rs')]
    total_fixes = 0
    
    for filename in sorted(files):
        filepath = os.path.join(SRC_DIR, filename)
        content = read_file(filepath)
        original = content
        
        # Skip test files
        if filename.endswith('_test.rs'):
            continue
        
        # Fix env.invoker()
        content = fix_env_invoker(content)
        
        # Skip utils subdir for now
        if 'utils' not in filepath and filename != 'lib.rs':
            # Mark events for manual fix (too complex for regex)
            pass
        
        if content != original:
            write_file(filepath, content)
            changes = len(original.split('\n')) - len(content.split('\n'))
            if changes > 0:
                print(f"  Fixed {filename}: {abs(changes)} changes")
                total_fixes += 1
    
    print(f"\nTotal files modified: {total_fixes}")

if __name__ == '__main__':
    main()
