with open('src/index.ts', 'rb') as f:
    data = f.read()

idx = data.find(b'placeholder')
while idx != -1:
    if b'Great post' in data[idx:idx+100]:
        print('Found at', idx)
        print(data[idx:idx+200])
        break
    idx = data.find(b'placeholder', idx+1)