with open('src/index.ts', 'rb') as f:
    data = f.read()

old = b'placeholder: /'Great post! | https://reddit.com/...//nThanks! | https://reddit.com/.../def456//n/nOne per line: comment | reddit_url/'
new = b'placeholder: /'Great post! | https://r/.../nThanks! | https://r/.../def456/'

if old in data:
    data = data.replace(old, new)
    with open('src/index.ts', 'wb') as f:
        f.write(data)
    print('Fixed!')
else:
    print('Not found')