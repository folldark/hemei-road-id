// 路的身分證 — 純函式（瀏覽器與 node 測試共用，不碰 DOM）

// 《公路法》上的公路類別。class 不在這裡面（none／null）就不是公路。
export const HIGHWAY_CLASSES = ['國道', '省道', '市道', '縣道', '區道', '鄉道', '專用公路'];

// 設計標準第2條第6款：都市內之省道、市道、縣道、區道及鄉道，直接就是「主要道路」。
const HIGHWAY_AS_ARTERIAL = ['省道', '市道', '縣道', '區道', '鄉道'];

// 計畫書用語 → 設計標準用語的對應表。
// 兩套用語沒有官方對應表，這是依設計標準第2條定義所做的推論，可以在這裡調整。
// 對應到多個候選，代表「計畫書沒寫清楚是哪一種」，相關規則會被標成「視分類而定」。
export const ROLE_MAP = {
  '聯外道路': ['主要道路'],
  '主要道路': ['主要道路', '次要道路'],
  '次要道路': ['次要道路'],
  '出入道路': ['服務道路'],
  '次要及出入道路': ['次要道路', '服務道路'],
};
export const ALL_DESIGN_ROLES = ['主要道路', '次要道路', '服務道路'];

export function isHighway(segment) {
  const c = segment && segment.highway && segment.highway.class;
  return !!c && HIGHWAY_CLASSES.includes(c);
}

// 把一個路段換算成設計標準的分類候選。
// 回傳 { roles: [...], basis: 'highway' | 'map' | 'unknown' }
export function designRoles(segment) {
  const c = segment && segment.highway && segment.highway.class;
  if (c && HIGHWAY_AS_ARTERIAL.includes(c)) return { roles: ['主要道路'], basis: 'highway' };
  const role = segment && segment.urbanPlan && segment.urbanPlan.role;
  if (role && ROLE_MAP[role]) return { roles: ROLE_MAP[role], basis: 'map' };
  return { roles: ALL_DESIGN_ROLES, basis: 'unknown' };
}

// 寬度條件：'ok' 符合、'no' 不符合、'unknown' 沒有寬度資料無法判斷
function widthCheck(applies, width) {
  const hasMin = applies.minWidth_m != null;
  const hasMax = applies.maxWidth_m != null;
  if (!hasMin && !hasMax) return 'ok';
  if (width == null) return 'unknown';
  if (hasMin && width < applies.minWidth_m) return 'no';
  if (hasMax && width > applies.maxWidth_m) return 'no';
  return 'ok';
}

// 依路段篩出適用的規則。
// highway：公路法體系的規則；urban：市區道路體系的規則；
// needWidth：要先知道計畫寬度才能判斷的規則 id；
// roleUncertain：是否適用取決於這條路算哪一種道路的規則 id。
export function matchRules(segment, rules) {
  const out = { highway: [], urban: [], needWidth: [], roleUncertain: [] };
  const hw = isHighway(segment);
  const plan = segment && segment.urbanPlan;
  const inPlan = !!(plan && plan.inPlan);
  const dr = designRoles(segment);

  for (const rule of rules || []) {
    const a = rule.applies || {};
    const system = a.system || 'both';

    let hwOk = false;
    if (hw && (system === 'highway' || system === 'both')) {
      hwOk = !Array.isArray(a.highwayClass) || a.highwayClass.length === 0
        || a.highwayClass.includes(segment.highway.class);
    }

    let urbanOk = false;
    let uncertain = false;
    let needWidth = false;
    if (inPlan && (system === 'urban' || system === 'both')) {
      urbanOk = true;
      if (Array.isArray(a.roles) && a.roles.length) {
        const hit = dr.roles.filter((r) => a.roles.includes(r));
        if (hit.length === 0) urbanOk = false;
        else if (hit.length < dr.roles.length) uncertain = true;
      }
      if (urbanOk) {
        const w = widthCheck(a, plan.width_m);
        if (w === 'no') urbanOk = false;
        else if (w === 'unknown') needWidth = true;
      }
    }

    if (system === 'highway') {
      if (hwOk) out.highway.push(rule);
    } else if (urbanOk || (system === 'both' && hwOk)) {
      out.urban.push(rule);
      if (urbanOk && uncertain) out.roleUncertain.push(rule.id);
      if (urbanOk && needWidth) out.needWidth.push(rule.id);
    }
  }
  return out;
}

// ---- 搜尋 ----

// 正規化：全形轉半形、去空白、小寫、臺→台
export function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/臺/g, '台');
}

// 再寬鬆一層：拿掉「路、街、縣道、鄉道、省道、號、線」等字，讓「西園」「134」也找得到
export function loosen(s) {
  return normalize(s).replace(/縣道|鄉道|省道|國道|市道|區道|[路街號线線道]/g, '');
}

export function roadKeys(road) {
  const keys = [road.name, ...(road.aliases || [])];
  for (const seg of road.segments || []) {
    if (seg.urbanPlan && seg.urbanPlan.code) keys.push(seg.urbanPlan.code);
    if (seg.highway && seg.highway.number) keys.push(seg.highway.number);
  }
  return keys.filter(Boolean);
}

export function searchRoads(query, roads) {
  const q = normalize(query);
  if (!q) return roads.slice();
  const ql = loosen(query);
  const scored = [];
  for (const road of roads) {
    let best = 0;
    for (const key of roadKeys(road)) {
      const k = normalize(key);
      if (k === q) best = Math.max(best, 4);
      else if (k.startsWith(q)) best = Math.max(best, 3);
      else if (k.includes(q)) best = Math.max(best, 2);
      else if (ql && loosen(key).includes(ql)) best = Math.max(best, 1);
    }
    if (best) scored.push([best, road]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'zh-Hant'));
  return scored.map((x) => x[1]);
}

// ---- 文字摘要（複製到共編文件用）----

export function fmt(v, unit) {
  return v == null || v === '' ? '（資料未載）' : `${v}${unit || ''}`;
}

export function summaryText(road, segIndex, rules) {
  const seg = road.segments[segIndex];
  const m = matchRules(seg, rules);
  const h = seg.highway;
  const u = seg.urbanPlan;
  const lines = [`【路的身分證】${road.name}`];
  if (seg.label) lines.push(`路段：${seg.label}`);
  lines.push('');
  lines.push('一、公路法身分');
  if (!h && seg.highwayCandidates) lines.push('　公路身分隨位置不同，請查網站上的分段說明後填寫：＿＿');
  else if (!h) lines.push('　資料尚未建立');
  else if (!isHighway(seg)) lines.push('　不是公路法上的公路（屬市區道路體系）');
  else {
    lines.push(`　類別：${h.class}　編號：${fmt(h.number)}`);
    lines.push(`　管理機關：${fmt(h.authority)}`);
  }
  lines.push('二、都市計畫身分');
  if (!u || !u.inPlan) lines.push('　不在都市計畫道路表內（或資料尚未建立）');
  else {
    lines.push(`　${fmt(u.planName)}　編號：${fmt(u.code)}`);
    lines.push(`　計畫寬度：${fmt(u.width_m, ' 公尺')}　長度：${fmt(u.length_m, ' 公尺')}`);
    lines.push(`　定位：${fmt(u.role)}　起迄：${fmt(u.fromTo)}`);
  }
  lines.push('三、適用法規');
  const all = [...m.highway, ...m.urban];
  if (!all.length) lines.push('　（無）');
  for (const r of all) {
    const mark = m.roleUncertain.includes(r.id) ? '（視道路分類而定）' : '';
    lines.push(`　・《${r.law}》${r.article}${mark}`);
  }
  lines.push('四、換我去現場查');
  lines.push('　實際量到的路寬：＿＿公尺（計畫寬度差＿＿公尺）');
  lines.push('　有沒有人行道：＿＿　人行淨寬：＿＿公尺');
  lines.push('　路旁有沒有平整的騎樓：＿＿');
  lines.push('　里程牌或路名牌照片：＿＿');
  return lines.join('\n');
}
