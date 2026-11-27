import {describe,it,expect} from "vitest";
import {RADAR,TECHNICAL,flowIndex,scanTechnical,validateRule,type Candidate} from "./market-research-scan";
import type {TwPriceHistorySeries} from "./price-history-data";
const dates=Array.from({length:65},(_,i)=>new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10));
const c:Candidate={market:"TWSE",code:"2330",name:"fixture",industry:"fixture",close:100,date:dates.at(-1)!,revenueYoy:null};
const h:TwPriceHistorySeries={market:"TWSE",symbol:"2330",name:"fixture",generatedAt:"g",startDate:dates[0]!,endDate:c.date,points:dates.map(d=>[d,100]),candles:dates.map(d=>[d,100,101,99,100,1000])};
const data={version:1 as const,generatedAt:"g",sources:[],days:dates.slice(-20).map(date=>({date,rows:[["TWSE","2330",150,0] as ["TWSE",string,number,number]]}))};
describe("market research scan",()=>{
 it("requires consecutive verified sessions and real volume",()=>{const f=flowIndex(data,dates);const x=scanTechnical(c,h,dates,f,RADAR,"radar");expect(x.status).toBe("match");expect(x.buyDays).toBe(20);expect(x.streak).toBe(20);expect(x.flowPct).toBe(15);expect(scanTechnical(c,{...h,candles:[]},dates,f,RADAR,"radar").status).toBe("missing");expect(scanTechnical(c,h,dates,f,RADAR,"radar",[c.date]).status).toBe("missing");});
 it("never treats missing or duplicate institutional records as zero",()=>{const f=flowIndex({...data,days:data.days.slice(1)},dates);expect(scanTechnical(c,h,dates,f,RADAR,"radar").status).toBe("missing");const d={...data,days:data.days.map(x=>({...x,rows:[...x.rows,...x.rows]}))};expect(scanTechnical(c,h,dates,flowIndex(d,dates),RADAR,"radar").status).toBe("missing");});
 it("technical scan does not require corporate flow or fundamentals",()=>{expect(scanTechnical(c,h,dates,new Map(),TECHNICAL,"technical").status).toBe("match");expect(scanTechnical(c,{...h,points:h.points.slice(0,-1)},dates,new Map(),TECHNICAL,"technical").status).toBe("missing");});
 it("rejects inconsistent volume and net flow units",()=>{const exaggerated={...data,days:data.days.map(x=>({...x,rows:[["TWSE","2330",2000,0] as ["TWSE",string,number,number]]}))};expect(scanTechnical(c,h,dates,flowIndex(exaggerated,dates),RADAR,"radar").status).toBe("missing");});
 it("rejects invalid rule parameters",()=>{expect(validateRule({...RADAR,minBuyDays:21})).toBe(false);expect(validateRule({...RADAR,maxBias:NaN})).toBe(false);});
});
