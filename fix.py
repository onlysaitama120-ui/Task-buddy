f = "C:/Users/tk620/task-buddy/src/index.ts"
d = open(f, "rb").read()
# Fix the regex: /d+ -> /d+
old = b"/d+"
new = b"/d+"
# Wait - the issue is /d+ (forward slash) should be /d+ (backslash)
# In bytes: 0x2F 0x64 0x2B should be 0x5C 0x64 0x2B
old_bytes = bytes([0x2F, 0x64, 0x2B])
new_bytes = bytes([0x5C, 0x64, 0x2B])
if old_bytes in d:
    d = d.replace(old_bytes, new_bytes)
    open(f, "wb").write(d)
    print("Fixed regex")
else:
    print("Pattern not found")
    # Find all occurrences of /d
    idx = 0
    while True:
        idx = d.find(b"/d", idx)
        if idx == -1:
            break
        print(f"Found at {idx}: {d[idx:idx+10]}")
        idx += 2