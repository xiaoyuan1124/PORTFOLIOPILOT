/** PilotQuant Lab v0.2 smoke tests: bundle syntax, exact historical semantics and holdout. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/quant-lab/index.html','utf8');
assert.match(html,/模擬資料/);
assert.match(html,/不自動下單/);
assert.match(html,/\.\.\/data\/tw-price-history\//);
assert.match(html,/官方台股收盤價快取/);
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.equal(scripts.length,2,'self-contained engine and UI scripts');
for(const code of scripts) new vm.Script(code,{timeout:5000});
const context={};vm.runInNewContext(scripts[0],context,{timeout:5000});
const Q=context.QuantEngine;assert.ok(Q);
const demo=Q.demoData();assert.equal(Object.keys(demo).length,3);
const bars=demo['DEMO-TREND'];assert.equal(bars.length,390);
const a=Q.backtest(bars,{strategy:'ma',fast:10,slow:30});
assert.equal(a.equity.length,390);assert.ok(a.metrics.maxDrawdown<=0);
const free=Q.backtest(bars,{strategy:'ma',fast:10,slow:30,fee:0,tax:0,slippage:0});
assert.ok(a.metrics.endEquity<free.metrics.endEquity);
for(const event of a.events.filter(x=>x.action==='買入')){
 const i=bars.findIndex(x=>x.date===event.date);
 assert.ok(i>0);assert.equal(a.indicators.signals[i-1],'buy');
}
assert.throws(()=>Q.normalizeBars([...bars,bars[0]]),/重複/);
assert.throws(()=>Q.validateConfig({fast:60,slow:20}),/參數/);
const points=bars.map(x=>({date:x.date,close:x.close}));
const clean=Q.normalizeCloseSeries(points);
assert.equal(clean[0].open,undefined,'never synthesize open for close-only');
const csv='date,symbol,close\n'+points.map(x=>x.date+',TEST,'+x.close).join('\n');
const imported=Q.parseCSV(csv);assert.equal(imported.closeOnly,true);
assert.equal(imported.symbols.TEST[0].high,undefined,'no fabricated intraday bar');
const close=Q.backtestCloseOnly(points,{strategy:'ma',fast:10,slow:30,stop:0,take:0,fee:0,tax:0,slippage:0});
assert.equal(close.execution,'NEXT_CLOSE_ONLY');
for(const event of close.events.filter(x=>x.action==='買入')){
 const i=points.findIndex(x=>x.date===event.date);
 assert.ok(i>0);assert.equal(close.indicators.signals[i-1],'buy');
 assert.equal(event.price,points[i].close);
}
const h=Q.holdout(points,{strategy:'ma',fast:10,slow:30},true);
assert.equal(h.train.bars,273);assert.equal(h.test.bars,117);
assert.ok(h.train.end<h.test.start);
assert.ok(Number.isFinite(h.test.metrics.totalReturn));
const index={version:1,generatedAt:'2026-11-10T00:00:00Z',endDate:points.at(-1).date,failed:[]};
const bucket={version:1,generatedAt:index.generatedAt,market:'TWSE',prefix:'23',securities:{2330:{name:'Test fixture',points:points.map(x=>[x.date,x.close])}}};
assert.equal(Q.validateOfficialCache(index,bucket,'TWSE','2330').bars.length,390);
assert.throws(()=>Q.validateOfficialCache(index,{...bucket,generatedAt:'invalid'},'TWSE','2330'),/版本不一致/);
console.log('PASS: PilotQuant v0.2 static, chronological, close-only, source and holdout smoke tests.');
