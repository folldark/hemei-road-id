# 路的身分證 — 資料格式（所有研究與前端共用，欄位名不可自行更改）

用途：高中生輸入和美鎮的路名或道路編號，網站回答這條路在《公路法》體系、和美都市計畫、
《市區道路條例》及其設計標準／規範下的身分與法定要求。純靜態網站，資料全部在 data/*.json。

## data/roads.json
```json
{
  "updated": "2026-11-13",
  "roads": [
    {
      "id": "xiyuan-rd",
      "name": "西園路",
      "aliases": ["31-8M"],
      "segments": [
        {
          "label": "全線（和美高中北側，道周路—彰209）",
          "highway": {
            "class": "none | 國道 | 省道 | 市道 | 縣道 | 區道 | 鄉道 | 專用公路",
            "number": "例：縣道134、彰12；非公路填 null",
            "authority": "公路主管／養護機關",
            "source": "來源網址或文件名",
            "confidence": "verified | likely | unverified"
          },
          "urbanPlan": {
            "inPlan": true,
            "planName": "和美都市計畫",
            "code": "31-8M",
            "width_m": 8,
            "length_m": 295,
            "role": "聯外道路 | 主要道路 | 次要道路 | 出入道路 | 其他原文用語",
            "fromTo": "起迄點原文",
            "source": "計畫書名稱、頁碼、網址",
            "confidence": "verified | likely | unverified"
          },
          "notes": "給學生看的補充，可空"
        }
      ]
    }
  ]
}
```

## data/rules.json
```json
{
  "updated": "2026-11-13",
  "rules": [
    {
      "id": "sqdl-std-16",
      "law": "市區道路及附屬工程設計標準",
      "article": "第16條",
      "topic": "人行道 | 車道寬 | 分類定義 | 管理機關 | 無障礙 | 自行車道 | 路口 | 停車 | 其他",
      "text": "條文原文（逐字，不可改寫；過長時只取相關項款並標明）",
      "plain": "一句高中生看得懂的白話說明",
      "applies": {
        "system": "highway | urban | both",
        "highwayClass": ["縣道", "鄉道"],
        "roles": ["主要道路"],
        "minWidth_m": 12,
        "maxWidth_m": null
      },
      "url": "全國法規資料庫或主管機關的條文網址",
      "lawDate": "該法規最後修正日期",
      "confidence": "verified | unverified"
    }
  ]
}
```
applies 內各欄位皆可省略；省略代表不限制。全部省略代表該體系下一律適用。

## 研究產出放置處
- data/research/highway.json、highway.md（公路法體系＋和美鎮公路路線）
- data/research/urban-law.json、urban-law.md（市區道路條例、設計標準、設計規範）
- data/research/hemei-plan.json、hemei-plan.md（和美都市計畫道路編號表）
.md 檔記錄：查了哪些網址、哪些查不到、哪些是推測。
