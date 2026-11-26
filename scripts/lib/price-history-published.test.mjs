import { readFileSync,readdirSync } from "node:fs";
import { join } from "node:path";
import {describe,it,expect} from "vitest";
import {bucketPrefix} from "./price-history.mjs";
const root="public/data/tw-price-history";
const read=file=>JSON.parse(readFileSync(join(root,file),"utf8"));
describe("published real price history regression",()=>{
  it("reconciles every bucket and all OHLCV records with the index, no network",()=>{
    const index=read("index.json");
    const stats={TWSE:{symbols:0,points:0,buckets:0,candles:0},TPEx:{symbols:0,points:0,buckets:0,candles:0}};
    const problems=[];let earliest=null,latest=null;
    const check=(ok,message)=>{if(!ok&&problems.length<20)problems.push(message);};
    const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
    for(const file of readdirSync(root).filter(f=>/^(twse|tpex)-[A-Z0-9_]{2}\.json$/i.test(f))){
      const b=read(file),s=stats[b.market];
      check(!!s,file+" invalid market");if(!s)continue;
      check(b.generatedAt===index.generatedAt,file+" mixed generation");
      check(file===b.market.toLowerCase()+"-"+b.prefix+".json",file+" wrong prefix");
      s.buckets++;
      for(const [code,series] of Object.entries(b.securities)){
        s.symbols++;s.points+=series.points.length;s.candles+=(series.candles??[]).length;
        check(bucketPrefix(code)===b.prefix,code+" wrong bucket");
        let prior="";
        const closes=new Map();
        for(const [date,close] of series.points){
          check(validDate(date)&&date>prior&&Number.isFinite(close)&&close>0,code+" invalid/duplicate close "+date);
          closes.set(date,close);prior=date;
          if(!earliest||date<earliest)earliest=date;
          if(!latest||date>latest)latest=date;
        }
        prior="";
        for(const [date,o,h,l,c,v] of series.candles??[]){
          check(date>prior&&closes.get(date)===c&&[o,h,l,c].every(n=>Number.isFinite(n)&&n>0)&&h>=Math.max(o,c)&&l<=Math.min(o,c)&&Number.isSafeInteger(v)&&v>0,code+" invalid/duplicate candle "+date);
          prior=date;
        }
      }
    }
    expect(problems).toEqual([]);
    for(const market of ["TWSE","TPEx"]){
      expect(stats[market].symbols).toBe(index.markets[market].symbols);
      expect(stats[market].points).toBe(index.markets[market].points);
      expect(stats[market].buckets).toBe(index.markets[market].buckets);
      if(index.markets[market].candles!==undefined)expect(stats[market].candles).toBe(index.markets[market].candles);
    }
    expect(earliest).toBe(index.startDate);expect(latest).toBe(index.endDate);
  },20000);
});
