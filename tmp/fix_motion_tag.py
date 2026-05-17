p = "/Users/brianshrader/Documents/Games/Cursor/Frequencies/src/legacy.js"
with open(p) as f:
    s = f.read()
old = 'const stationCell=`<motion class="mt-station-inner"'
new = 'const stationCell=`<div class="mt-station-inner"'
if old not in s:
    idx = s.find("mt-stream-row")
    print("no change", repr(s[idx - 120 : idx + 20]) if idx >= 0 else "missing")
else:
    with open(p, "w") as f:
        f.write(s.replace(old, new, 1))
    print("fixed")
