f = "C:/Users/tk620/task-buddy/src/index.ts"
d = open(f, "rb").read()

# Fix the regex - it has ////d+ which should be //d+
old = b"new RegExp('^(////d+)////s*([dwmy])$', 'i')"
new = b"new RegExp('^(//d+)//s*([dwmy])$', 'i')"
if old in d:
    d = d.replace(old, new)
    open(f, "wb").write(d)
    print("Fixed!")
else:
    print("Not found, searching...")
    idx = d.find(b"RegExp")
    if idx >= 0:
        print(d[idx:idx+80].decode('utf-8', errors='replace'))