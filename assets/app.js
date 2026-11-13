import { matchRules, searchRoads, isHighway, designRoles, summaryText, fmt } from './core.js';

const TOPIC_ORDER = ['人行道', '分類定義', '管理機關', '車道寬', '無障礙', '路口', '自行車道', '停車', '其他'];
const $ = (id) => document.getElementById(id);

// 建立元素的小工具：資料一律走 textContent，不拼 HTML 字串
function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function badge(confidence) {
  if (!confidence || confidence === 'verified') return null;
  return el('span', { class: 'badge', text: confidence === 'likely' ? '可能，尚待確認' : '待查證' });
}

function isUrl(s) { return /^https?:\/\//.test(s || ''); }

function sourceNode(src) {
  if (!src) return null;
  const m = String(src).match(/https?:\/\/\S+/);
  if (!m) return el('span', { text: src });
  const rest = String(src).replace(m[0], '').trim();
  return el('span', {}, rest ? rest + ' ' : '', el('a', { href: m[0], target: '_blank', rel: 'noopener', text: '來源連結' }));
}

function row(label, value, extra) {
  return el('div', { class: 'row' }, el('dt', { text: label }), el('dd', {}, value, extra));
}

function ruleCard(rule, flags) {
  const card = el('article', { class: 'rule' });
  card.append(el('h4', {}, `《${rule.law}》${rule.article || ''}`, badge(rule.confidence)));
  if (flags.uncertain) {
    card.append(el('p', { class: 'note warn', text: '這條規則是否適用，取決於這條路算哪一種道路；計畫書沒有寫明，要由你們判斷並說明理由。' }));
  }
  if (flags.needWidth) {
    card.append(el('p', { class: 'note warn', text: '這條規則和道路寬度有關，但資料裡沒有這一段的計畫寬度，要先查到寬度才能判斷。' }));
  }
  if (rule.plain) card.append(el('p', { class: 'plain', text: rule.plain }));
  if (rule.text) {
    card.append(el('details', {}, el('summary', { text: '看條文原文' }), el('p', { class: 'lawtext', text: rule.text })));
  }
  const meta = el('p', { class: 'meta' });
  if (isUrl(rule.url)) meta.append(el('a', { href: rule.url, target: '_blank', rel: 'noopener', text: '看原始條文' }));
  if (rule.lawDate) meta.append(el('span', { text: `　版本：${rule.lawDate}` }));
  card.append(meta);
  return card;
}

function ruleGroups(list, match, openTopics) {
  if (!list.length) return [el('p', { class: 'empty', text: '沒有適用的條文資料。' })];
  const groups = new Map();
  for (const r of list) {
    const t = r.topic || '其他';
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(r);
  }
  const topics = [...groups.keys()].sort((a, b) => {
    const ia = TOPIC_ORDER.indexOf(a), ib = TOPIC_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return topics.map((t) => {
    const d = el('details', { class: 'group', open: openTopics.includes(t) },
      el('summary', {}, t, el('span', { class: 'count', text: `${groups.get(t).length} 條` })));
    for (const r of groups.get(t)) {
      d.append(ruleCard(r, {
        uncertain: match.roleUncertain.includes(r.id),
        needWidth: match.needWidth.includes(r.id),
      }));
    }
    return d;
  });
}

function renderCard(state, road, segIndex) {
  const seg = road.segments[segIndex];
  const match = matchRules(seg, state.rules);
  const h = seg.highway;
  const u = seg.urbanPlan;
  const box = $('card');
  box.replaceChildren();

  const head = el('div', { class: 'id-head' },
    el('p', { class: 'eyebrow', text: '道路身分證' }),
    el('h1', { text: road.name }));
  if (road.segments.length > 1) {
    const tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': '選擇路段' });
    road.segments.forEach((s, i) => {
      const code = s.urbanPlan && s.urbanPlan.code;
      tabs.append(el('a', {
        class: 'tab' + (i === segIndex ? ' on' : ''),
        href: `#${road.id}/${i}`,
        'aria-current': i === segIndex ? 'true' : null,
        text: s.label || code || `路段 ${i + 1}`,
      }));
    });
    head.append(el('p', { class: 'note', text: `這條路在資料裡分成 ${road.segments.length} 段，身分不一樣。先確認你們調查的是哪一段：` }), tabs);
  } else if (seg.label) {
    head.append(el('p', { class: 'seg-label', text: seg.label }));
  }
  box.append(head);

  // 一、公路法
  const s1 = el('section', { class: 'block b-highway' }, el('h2', { text: '一、《公路法》上的身分' }));
  const cands = seg.highwayCandidates;
  if (!h && cands && cands.length) {
    s1.append(el('p', { class: 'verdict', text: '要看你調查的是哪一小段。' }),
      el('p', { class: 'note warn', text: '這條路的公路身分會在路口變換，而且變換的位置和都市計畫編號的分段對不起來。請對照下面的位置，找出你們調查的地點屬於哪一種：' }));
    const ul = el('ul', { class: 'cands' });
    for (const c of cands) {
      const isHw = isHighway({ highway: c });
      ul.append(el('li', {}, el('strong', { text: isHw ? `${c.class} ${c.number || ''}` : '不是公路' }),
        `　${c.label || ''}`, badge(c.confidence)));
    }
    s1.append(ul);
    const firstHw = cands.find((c) => isHighway({ highway: c }));
    if (firstHw) {
      const hm = matchRules({ highway: firstHw, urbanPlan: null }, state.rules);
      s1.append(el('h3', { text: '如果你調查的位置是公路，適用的公路法規' }),
        ...ruleGroups(hm.highway, hm, []));
    }
  } else if (!h) {
    s1.append(el('p', { class: 'verdict', text: '公路身分資料尚未建立。' }));
  } else if (!isHighway(seg)) {
    s1.append(el('p', { class: 'verdict' }, '這一段不是《公路法》上的公路。', badge(h.confidence)),
      el('p', { class: 'note', text: '也就是說，它不是國道、省道、縣道或鄉道，沒有公路編號，改由市區道路體系（下面第三部分）來管。' }));
    if (h.source) s1.append(el('p', { class: 'meta' }, '依據：', sourceNode(h.source)));
  } else {
    s1.append(el('p', { class: 'verdict' }, `${h.class}${h.number ? '　' + h.number : ''}`, badge(h.confidence)));
    s1.append(el('dl', {},
      seg.highwayWhere ? row('公路路段', seg.highwayWhere) : null,
      row('公路類別', fmt(h.class)),
      row('路線編號', fmt(h.number)),
      row('管理機關', fmt(h.authority)),
      h.source ? row('資料來源', sourceNode(h.source)) : null));
    s1.append(el('h3', { text: '適用的公路法規' }), ...ruleGroups(match.highway, match, ['分類定義', '管理機關', '人行道']));
  }
  box.append(s1);

  // 二、都市計畫
  const s2 = el('section', { class: 'block b-plan' }, el('h2', { text: '二、都市計畫裡的身分' }));
  if (!u || !u.inPlan) {
    s2.append(el('p', { class: 'verdict', text: '這一段不在和美主要計畫的道路編號表內（或資料尚未建立）。' }),
      el('p', { class: 'note', text: '可能是在都市計畫範圍外，也可能是細部計畫道路或巷弄。可以到彰化縣都市計畫圖台確認。' }));
  } else {
    s2.append(el('p', { class: 'verdict' }, `${fmt(u.code)}　${fmt(u.role)}`, badge(u.confidence)));
    s2.append(el('dl', {},
      row('計畫名稱', fmt(u.planName)),
      row('道路編號', fmt(u.code)),
      row('計畫寬度', fmt(u.width_m, ' 公尺')),
      row('計畫長度', fmt(u.length_m, ' 公尺')),
      row('定位', fmt(u.role)),
      row('起迄', fmt(u.fromTo)),
      u.source ? row('資料來源', sourceNode(u.source)) : null));
    s2.append(el('p', { class: 'note', text: '計畫寬度是都市計畫「預定」的寬度，不等於現在路面的實際寬度。差多少，要你們自己去量。' }));
  }
  if (seg.notes) s2.append(el('p', { class: 'note', text: seg.notes }));
  box.append(s2);

  // 三、市區道路體系
  const s3 = el('section', { class: 'block b-urban' }, el('h2', { text: '三、《市區道路條例》體系對它的要求' }));
  if (!match.urban.length) {
    s3.append(el('p', { class: 'empty', text: '這一段不在都市計畫道路表內，無法依計畫寬度與定位判斷適用哪些市區道路規定。' }));
  } else {
    const dr = designRoles(seg);
    const why = dr.basis === 'highway'
      ? `因為它是${h.class}，依設計標準第2條第6款，屬於「主要道路」。`
      : dr.basis === 'map'
        ? `計畫書把它定位為「${u.role}」。設計標準用的是另一套分類（主要道路／次要道路／服務道路），兩套沒有官方對照表；這裡推定它可能是「${dr.roles.join('」或「')}」。`
        : '計畫書沒有寫明它的定位，所以三種分類的規定都列出來，由你們判斷。';
    s3.append(el('p', { class: 'note', text: why }));
    if (match.roleUncertain.length) {
      s3.append(el('p', { class: 'note warn', text: `有 ${match.roleUncertain.length} 條規定標了「視道路分類而定」。你們認為它比較像哪一種道路？理由是什麼？這本身就是第一章可以寫的內容。` }));
    }
    s3.append(...ruleGroups(match.urban, match, ['人行道']));
  }
  box.append(s3);

  // 換你去現場查
  const s4 = el('section', { class: 'block b-field' }, el('h2', { text: '換你去現場查' }),
    el('p', { class: 'note', text: '上面是這條路「依規定應該是」的樣子。它「實際上」是什麼樣子，工具不知道，要你們去量、去拍。' }),
    el('ul', { class: 'checklist' },
      el('li', { text: `實際量到的路寬：＿＿公尺（計畫寬度 ${u && u.width_m != null ? u.width_m + ' 公尺' : '＿＿'}，差＿＿公尺）` }),
      el('li', { text: '有沒有人行道？是實體還是標線型？扣掉電桿、機車、店面外推後的淨寬：＿＿公尺' }),
      el('li', { text: '路旁有沒有平整、走得通的騎樓？' }),
      el('li', { text: '里程牌或路名牌的照片（證明它的身分）' }),
      el('li', { text: '誰負責管這條路？和你們查到的管理機關一致嗎？' })));
  const status = el('span', { class: 'copy-status', role: 'status', 'aria-live': 'polite' });
  s4.append(el('p', { class: 'actions' },
    el('button', {
      type: 'button',
      onclick: async () => {
        const text = summaryText(road, segIndex, state.rules);
        try {
          await navigator.clipboard.writeText(text);
          status.textContent = '已複製，可以貼到共編文件。';
        } catch (e) {
          status.textContent = '無法自動複製，請改用列印或手動抄寫。';
        }
      },
    }, '複製成文字'),
    el('button', { type: 'button', class: 'ghost', onclick: () => window.print() }, '列印'),
    status));
  box.append(s4);
}

function renderList(state, query) {
  const list = $('results');
  const found = searchRoads(query, state.roads);
  const status = $('search-status');
  let show = found;
  if (query.trim() && !found.length) {
    status.textContent = '找不到。這條路可能不在資料內（只收錄和美主要計畫的計畫道路與境內公路，巷弄與細部計畫道路沒有收錄）。下面是全部道路：';
    show = state.roads;
  } else if (query.trim()) {
    status.textContent = `找到 ${found.length} 條`;
  } else {
    status.textContent = `共收錄 ${state.roads.length} 條道路，可以直接點選`;
  }
  list.replaceChildren(...show.map((road) => {
    const codes = [...new Set(road.segments.flatMap((s) => [
      s.highway && isHighway(s) ? s.highway.number || s.highway.class : null,
      s.urbanPlan && s.urbanPlan.code,
    ]).filter(Boolean))];
    return el('li', {}, el('a', { href: `#${road.id}/0` },
      el('span', { class: 'rname', text: road.name }),
      el('span', { class: 'rcode', text: codes.join('・') })));
  }));
}

function route(state) {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [id, idx] = hash.split('/');
  const road = id && state.roads.find((r) => r.id === id);
  if (!road) {
    $('card-view').hidden = true;
    $('search-view').hidden = false;
    document.title = '路的身分證｜和美道路法定身分查詢';
    return;
  }
  const i = Math.min(Math.max(parseInt(idx, 10) || 0, 0), road.segments.length - 1);
  renderCard(state, road, i);
  $('search-view').hidden = true;
  $('card-view').hidden = false;
  document.title = `${road.name}｜路的身分證`;
  window.scrollTo(0, 0);
}

async function main() {
  const banner = $('banner');
  let roadsData, rulesData;
  try {
    [roadsData, rulesData] = await Promise.all(
      ['data/roads.json', 'data/rules.json'].map((p) => fetch(p).then((r) => {
        if (!r.ok) throw new Error(p);
        return r.json();
      })));
  } catch (e) {
    banner.hidden = false;
    banner.textContent = '資料載入失敗，請重新整理頁面。';
    return;
  }
  const state = {
    roads: (roadsData.roads || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
    rules: rulesData.rules || [],
  };
  if (roadsData.sample || rulesData.sample) {
    banner.hidden = false;
    banner.textContent = '目前為範例資料，不可作為作業依據。';
  }
  $('updated').textContent = `資料更新：道路 ${roadsData.updated || '未標示'}；法規 ${rulesData.updated || '未標示'}`;
  const srcs = [...(roadsData.sources || []), ...(rulesData.sources || [])];
  $('sources').replaceChildren(...srcs.map((s) => el('li', {},
    isUrl(s.url) ? el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.title || s.url }) : (s.title || ''))));

  const q = $('q');
  q.addEventListener('input', () => renderList(state, q.value));
  renderList(state, '');
  window.addEventListener('hashchange', () => route(state));
  route(state);
}

main();
