p = "/Users/brianshrader/Documents/Games/Cursor/Frequencies/src/legacy.js"
with open(p) as f:
    s = f.read()
needle = "function buildFinancialsStationHistoryBlock(title,entries,opts){"
i = s.find(needle)
if i < 0:
    raise SystemExit("function not found")
j = s.find("\nfunction buildFinancialsStationHistoryBlocksHtml", i)
block = s[i:j]
new_body = """function buildFinancialsStationHistoryBlock(title,entries,opts){
  if(!entries||!entries.length)return '';
  const rev=[...entries].reverse();
  const rows=buildFinancialsHistoryTableRows(rev,opts);
  const subtitle=opts&&opts.subtitle?`<p class="di" style="margin:6px 0 8px;font-size:13px;line-height:1.45">${opts.subtitle}</p>`:'';
  const shareCol=opts&&opts.shareColLabel;
  return `<div class="ms2" style="margin-top:14px"><div class="msh">${title}</div>${subtitle}
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
      ${buildFinancialsHistoryTableHead(!!(opts&&opts.includeCash),shareCol)}
      <tbody>${rows}</tbody>
    </table></div></motion>`;
}"""
new_body = new_body.replace("</motion>`", "</div>`")
s = s[:i] + new_body + s[j:]
with open(p, "w") as f:
    f.write(s)
print("patched buildFinancialsStationHistoryBlock")
