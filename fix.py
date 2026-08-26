f = "C:/Users/tk620/task-buddy/src/index.ts"
d = open(f, "rb").read()

# Use RegExp constructor to avoid escaping issues
old = b"const usernameMatch = redditProfile.match(/reddit////.com/////u/////([^/?]+)/i);"
new = b"const usernameMatch = redditProfile.match(new RegExp('reddit////.com/u/([^/?]+)', 'i'));"
if old in d:
    d = d.replace(old, new)
    open(f, "wb").write(d)
    print("Fixed!")
else:
    print("Not found")
    idx = d.find(b"usernameMatch")
    if idx >= 0:
        print(d[idx:idx+100].decode('utf-8', errors='replace'))