src_p = "/Users/brianshrader/Documents/Games/Cursor/Frequencies/src/legacy.js"
dist_p = "/Users/brianshrader/Documents/Games/Cursor/Frequencies/dist/src/legacy.js"
start_mark = "/** Deduped combined simulcast share for a past book (financials cluster rows). */"
end_mark = "\nfunction openFinancials(){"
with open(src_p) as f:
    src = f.read()
with open(dist_p) as f:
    dist = f.read()
i0 = src.find(start_mark)
i1 = src.find(end_mark, i0)
if i0 < 0 or i1 < 0:
    raise SystemExit("src markers missing")
chunk = src[i0:i1]
d0 = dist.find(start_mark)
d1 = dist.find(end_mark, d0)
if d0 < 0 or d1 < 0:
    raise SystemExit("dist markers missing")
dist = dist[:d0] + chunk + dist[d1:]
with open(dist_p, "w") as f:
    f.write(dist)
print("synced", len(chunk), "chars")
