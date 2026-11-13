import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRules, normalize, searchRoads, designRoles, summaryText } from '../assets/core.js';

const rules = [
  { id: 'hw-any', applies: { system: 'highway' } },
  { id: 'hw-county', applies: { system: 'highway', highwayClass: ['縣道'] } },
  { id: 'u-any', applies: { system: 'urban' } },
  { id: 'u-main', applies: { system: 'urban', roles: ['主要道路', '次要道路'] } },
  { id: 'u-service', applies: { system: 'urban', roles: ['服務道路'] } },
  { id: 'u-wide', applies: { system: 'urban', minWidth_m: 12.01 } },
  { id: 'u-narrow', applies: { system: 'urban', maxWidth_m: 12 } },
];
const ids = (list) => list.map((r) => r.id);
const plan = (role, width) => ({ inPlan: true, role, width_m: width });

test('非公路的計畫道路：只有市區道路規則', () => {
  const m = matchRules({ highway: { class: 'none' }, urbanPlan: plan('次要及出入道路', 8) }, rules);
  assert.deepEqual(m.highway, []);
  assert.deepEqual(ids(m.urban), ['u-any', 'u-main', 'u-service', 'u-narrow']);
  assert.deepEqual(m.roleUncertain.sort(), ['u-main', 'u-service']);
});
test('highway 為 null 不丟例外', () => {
  const m = matchRules({ highway: null, urbanPlan: plan('主要道路', 10) }, rules);
  assert.deepEqual(m.highway, []);
  assert.ok(ids(m.urban).includes('u-main'));
  assert.ok(!ids(m.urban).includes('u-service'));
});
test('縣道一律視為主要道路，且套用公路規則', () => {
  const seg = { highway: { class: '縣道' }, urbanPlan: plan('次要及出入道路', 16) };
  assert.deepEqual(designRoles(seg), { roles: ['主要道路'], basis: 'highway' });
  const m = matchRules(seg, rules);
  assert.deepEqual(ids(m.highway), ['hw-any', 'hw-county']);
  assert.deepEqual(ids(m.urban), ['u-any', 'u-main', 'u-wide']);
  assert.deepEqual(m.roleUncertain, []);
});
test('鄉道不套用限縣道的規則；不在計畫內就沒有市區道路規則', () => {
  const m = matchRules({ highway: { class: '鄉道' }, urbanPlan: null }, rules);
  assert.deepEqual(ids(m.highway), ['hw-any']);
  assert.deepEqual(m.urban, []);
});
test('寬度剛好 12 公尺屬於窄的那一邊', () => {
  const m = matchRules({ highway: { class: 'none' }, urbanPlan: plan('聯外道路', 12) }, rules);
  assert.ok(ids(m.urban).includes('u-narrow'));
  assert.ok(!ids(m.urban).includes('u-wide'));
});
test('寬度缺漏時列入 needWidth 而不是丟掉', () => {
  const m = matchRules({ highway: { class: 'none' }, urbanPlan: plan('聯外道路', null) }, rules);
  assert.deepEqual(m.needWidth.sort(), ['u-narrow', 'u-wide']);
});
test('計畫書未載明定位：全部列出並標為不確定', () => {
  const m = matchRules({ highway: { class: 'none' }, urbanPlan: plan('計畫書未載明（綠園道用地）', 25) }, rules);
  assert.deepEqual(m.roleUncertain.sort(), ['u-main', 'u-service']);
});
test('搜尋正規化', () => {
  assert.equal(normalize(' 臺６１乙 '), '台61乙');
  assert.equal(normalize('３１－８Ｍ'), '31-8m');
});

const roads = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url))).roads;
const realRules = JSON.parse(readFileSync(new URL('../data/rules.json', import.meta.url))).rules;
const first = (q) => searchRoads(q, roads)[0]?.name;

test('真實資料：常見查法都找得到', () => {
  assert.equal(first('西園路'), '西園路');
  assert.equal(first('西園'), '西園路');
  assert.equal(first('31-8M'), '西園路');
  assert.equal(first('３１－８ｍ'), '西園路');
  assert.equal(first('臺61乙'), '美港公路');
  assert.ok(searchRoads('縣道134', roads).some((r) => r.name === '德美路'));
  assert.ok(searchRoads('134', roads).some((r) => r.name === '德美路'));
  assert.ok(searchRoads('南軒路', roads).length > 0);
  assert.deepEqual(searchRoads('不存在的路名', roads), []);
});
test('真實資料：每個路段都能比對規則與產生摘要', () => {
  for (const road of roads) {
    road.segments.forEach((seg, i) => {
      const m = matchRules(seg, realRules);
      assert.ok(Array.isArray(m.urban));
      assert.ok(summaryText(road, i, realRules).includes(road.name));
    });
  }
});
test('真實資料：西園路東段是 8 公尺非公路，西段是鄉道彰209', () => {
  const x = roads.find((r) => r.name === '西園路');
  assert.equal(x.segments[0].urbanPlan.code, '31-8M');
  assert.equal(x.segments[0].highway.class, 'none');
  assert.equal(x.segments[1].highway.number, '彰209');
  const m = matchRules(x.segments[0], realRules);
  const got = m.urban.map((r) => r.id);
  assert.ok(got.includes('sqdl-std-16-1-narrow'));
  assert.ok(!got.includes('sqdl-std-16-1-wide'));
  assert.ok(got.includes('sqdl-std-5') && got.includes('sqdl-std-7'));
  assert.ok(m.roleUncertain.includes('sqdl-std-5'));
});
