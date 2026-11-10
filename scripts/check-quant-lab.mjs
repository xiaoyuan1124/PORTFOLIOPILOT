/** PilotQuant Lab smoke check. No npm packages, no network and no browser required. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const filename=path.join(process.cwd(),'public/quant-lab/index.html');
const html=fs.readFileSync(filename,'utf8');
assert.match(html, /模擬資料/);
assert.match(html, /不自動下單/);
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.equal(scripts.length,2,'expect self-contained engine and app');
const sandbox={};vm.runInNewContext(scripts[0],sandbox,{timeout:5000});
const Q=sandbox.QuantEngine;
assert.ok(Q,'engine must be exported');
const data=Q.demoData();
assert.equal(Object.keys(data).length,3);
assert.equal(data['DEMO-TREND'].length,390);
const a=Q.backtest(data['DEMO-TREND'],{strategy:'ma',fast:10,slow:30});
assert.equal(a.bars,390);
assert.ok(Number.isFinite(a.metrics.totalReturn));
assert.ok(a.metrics.maxDrawdown<=0);
assert.equal(a.equity.length,390);
const b=Q.backtest(data['DEMO-TREND'],{strategy:'ma',fast:10,slow:30,fee:0,tax:0,slippage:0});
assert.ok(a.metrics.endEquity<b.metrics.endEquity,'costs must reduce PnL');
for(const e of a.events.filter(x=>x.action==='買入')){
  const idx=data['DEMO-TREND'].findIndex(x=>x.date===e.date);
  assert.ok(idx>0);
  assert.equal(a.indicators.signals[idx-1],'buy','buy orders must use prior bar signals');
}
assert.throws(()=>Q.normalizeBars(data['DEMO-TREND'].concat(data['DEMO-TREND'][0])),/重複/);
assert.throws(()=>Q.validateConfig({fast:60,slow:20}),/參數/);
console.log('PASS: PilotQuant static bundle and engine smoke tests (10 checks).');
