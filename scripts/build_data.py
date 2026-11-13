#!/usr/bin/env python3
"""把 data/research/ 的三份研究資料合併成網站讀的 data/roads.json 與 data/rules.json。

為什麼需要人工對照表（ALIGN）：
公路資料是依「公路編號在哪個路口變換」分段，都市計畫資料是依「計畫道路編號」分段，
兩邊的分段點不一樣，程式無法自動對齊。同時出現在兩份資料的路只有 13 條，
所以用一張人工對照表處理；對不準的路段不硬湊，改列出「各段公路身分」讓學生自己對位置。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / 'data' / 'research'
TODAY = '2026-11-13'

plan = json.loads((R / 'hemei-plan.json').read_text())
hwy = json.loads((R / 'highway.json').read_text())
law = json.loads((R / 'urban-law.json').read_text())

OLD_NUMBER_NOTE = ('注意：計畫書內文寫的公路編號（綠園道1為縣道134、鹿和路為縣道135）是舊的說法；'
                   '依交通部113年1月公告的現行路線，縣道134已改走德美路，這裡的公路身分以現行公告為準。')

hw_by_name = {r['name']: r for r in hwy['roads']}

# 每條路：[(路段標籤, 計畫編號或 None, 公路路段索引或 None 或 'all', 補充說明)]
# 公路路段索引對應 highway.json 中該路 segments 的順序。'all' 代表對不準，列出全部公路路段。
ALIGN = {
    '西園路': [
        ('東段：五岔路口—道周路口（和美高中旁）', '31-8M', 0, None),
        ('西段：道周路口以西', '55-10M', 1,
         '過了道周路口，路名還是西園路，但身分變成鄉道彰209。計畫編號55-10M只到都市計畫區西側邊界（約414公尺），再往西仍是彰209，但已不在都市計畫範圍內。'),
    ],
    '道周路': [
        ('北段：彰美路六段口—和線路口', '綠園道1-25M', 0, None),
        ('中段：和線路口—西園路口—彰和路三段口（和美高中前）', '綠園道1-25M', 1, None),
        ('東南端：彰和路三段口—彰美路五段口', '綠園道1-25M', 2, None),
    ],
    '和線路': [
        ('東段：五岔路口—道周路口', '22-10M', 0, None),
        ('西段：道周路口以西', '11-16M', 1, None),
    ],
    '中正路': [(None, '22-10M', 0, None)],
    '永樂路': [(None, '20-10M', 0, None)],
    '和卿路': [(None, '20-10M', 0, None)],
    '和光路': [(None, '23-10M', 0, None)],
    '德美路': [(None, '10-16M', 0, None)],
    '西美路': [(None, '95-15M', 0, None)],
    '彰美路': [
        ('綠園道1-25M 的範圍（與道周路共用編號）', '綠園道1-25M', 'all', None),
        ('6-16M 的範圍', '6-16M', 'all', None),
        ('7-14M 的範圍', '7-14M', 'all', None),
    ],
    '鹿和路': [
        ('六段市區段：中正路口—道周路口', None, 0,
         '這一段在計畫書道路編號表裡找不到對應「鹿和路」的編號，可能列在其他編號之下，尚待查證。'),
        ('道周路口以南（綠園道2）', '綠園道2-25M', 1, None),
        ('再往南到計畫區南側（綠園道3）', '綠園道3-25M', 1, None),
    ],
    '和頭路': [('64-10M 的範圍（美寮路口—計畫區北側）', '64-10M', 'all', None)],
    '美寮路': [
        ('二段西端：彰美路／中山路口—德美路口', '67-10M', 0, None),
        ('德美路口以東', '9-16M', 1, None),
    ],
}
# 以上對照中，依位置描述推定、尚未現場或圖面確認的組合
ALIGN_LIKELY = {('鹿和路', '綠園道2-25M'), ('鹿和路', '綠園道3-25M'), ('美寮路', '9-16M'), ('美寮路', '67-10M')}


def plan_seg(road, code):
    for s in road['segments']:
        if s['urbanPlan']['code'] == code:
            return s
    raise KeyError((road['name'], code))


def clean_hw(h):
    h = dict(h)
    if h.get('class') == 'none':
        h['authority'] = None
    return h


roads = []
used_hw = set()
for road in plan['roads']:
    name = road['name']
    out = {'id': road['id'], 'name': name, 'aliases': list(road.get('aliases') or []), 'segments': []}
    if name in ALIGN:
        hroad = hw_by_name[name]
        used_hw.add(name)
        out['aliases'] += [a for a in hroad.get('aliases', []) if a not in out['aliases']]
        for label, code, hidx, extra in ALIGN[name]:
            ps = plan_seg(road, code) if code else None
            up = dict(ps['urbanPlan']) if ps else None
            notes = [ps.get('notes')] if ps and ps.get('notes') else []
            seg = {'label': label or (ps['label'] if ps else None)}
            if hidx == 'all':
                seg['highway'] = None
                seg['highwayCandidates'] = [
                    {'label': s['label'], **clean_hw(s['highway'])} for s in hroad['segments']]
            else:
                seg['highway'] = clean_hw(hroad['segments'][hidx]['highway'])
                seg['highwayWhere'] = hroad['segments'][hidx]['label']
            if up and (name, code) in ALIGN_LIKELY and up.get('confidence') == 'verified':
                up['confidence'] = 'likely'
            seg['urbanPlan'] = up
            if extra:
                notes.append(extra)
            seg['notes'] = '\n'.join(notes) or None
            out['segments'].append(seg)
    else:
        for s in road['segments']:
            out['segments'].append({
                'label': s.get('label'),
                # 公路資料以交通部公告路線套疊路名而得，這條路沿線沒有任何公路路線
                'highway': {'class': 'none', 'number': None, 'authority': None,
                            'source': '交通部113年1月24日公告之彰化縣公路路線（公路局圖說公路平台）套疊比對，沿線無公路路線',
                            'confidence': 'likely'},
                'urbanPlan': s['urbanPlan'],
                'notes': s.get('notes'),
            })
    roads.append(out)

ids = {r['id'] for r in roads}
for hroad in hwy['roads']:
    if hroad['name'] in used_hw:
        continue
    rid = hroad['id'] if hroad['id'] not in ids else hroad['id'] + '-hw'
    ids.add(rid)
    roads.append({
        'id': rid, 'name': hroad['name'], 'aliases': hroad.get('aliases', []),
        'segments': [{
            'label': s['label'], 'highway': clean_hw(s['highway']), 'urbanPlan': None,
            'notes': '這條路不在和美主要計畫的道路編號表內：可能位於都市計畫範圍外，或屬於交流道特定區等其他計畫。',
        } for s in hroad['segments']],
    })

for r in roads:
    for s in r['segments']:
        n = s.get('notes') or ''
        if '縣道134線' in n or '縣道135線' in n:
            s['notes'] = n + '\n' + OLD_NUMBER_NOTE

rules = []
for r in hwy['rules']:
    r = dict(r)
    a = dict(r.get('applies') or {})
    a['system'] = 'highway'  # 公路法體系的條文只在「這一段是公路」時顯示，含與市區道路共線的規定
    r['applies'] = a
    rules.append(r)
# 沒拿到官方原文的那一筆不放上網站，避免學生引用
rules += [r for r in law['rules'] if r['id'] != 'chc-road-rule']

sources = [
    {'title': plan['plan'].get('sourceTitle') or '和美主要計畫計畫書', 'url': plan['plan'].get('sourceUrl')},
    {'title': '交通部公路局 圖說公路（公路路線公告）', 'url': 'https://www.thb.gov.tw/'},
]
(ROOT / 'data' / 'roads.json').write_text(json.dumps(
    {'updated': TODAY, 'plan': plan['plan'], 'sources': sources, 'roads': roads}, ensure_ascii=False, indent=1))
(ROOT / 'data' / 'rules.json').write_text(json.dumps(
    {'updated': TODAY, 'sources': [{'title': '全國法規資料庫', 'url': 'https://law.moj.gov.tw/'}], 'rules': rules},
    ensure_ascii=False, indent=1))
print(f'roads {len(roads)}  segments {sum(len(r["segments"]) for r in roads)}  rules {len(rules)}')
