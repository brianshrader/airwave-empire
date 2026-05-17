#!/usr/bin/env python3
p = "src/legacy.js"
t = open(p, encoding="utf-8").read()
t = t.replace(
    '${f$(s.fin.rev)} / ${f$(s.fin.cost)}</span></motion>',
    '${f$(s.fin.rev)} / ${f$(s.fin.cost)}</span></motion>',
)
t = t.replace(
    '${f$(s.fin.rev)} / ${f$(s.fin.cost)}</span></motion>',
    '${f$(s.fin.rev)} / ${f$(s.fin.cost)}</span></div>',
)
t = t.replace('return `<motion class="ms2">', 'return `<div class="ms2">')
t = t.replace(
    '    <motion class="sr"><span class="lb">Quality</span>',
    '    <div class="sr"><span class="lb">Quality</span>',
)
t = t.replace('${ln?`<motion class="sum-stn-narr">', '${ln?`<div class="sum-stn-narr">')
t = t.replace(
    '  </motion>`;\n}\nfunction buildPeriodSummaryStationBlocksHtml',
    '  </div>`;\n}\nfunction buildPeriodSummaryStationBlocksHtml',
)
open(p, "w", encoding="utf-8").write(t)
for i, line in enumerate(t.splitlines(), 1):
    if 36800 < i < 36920 and "motion" in line:
        print(i, line[:100])
