/** Presentation-only preference; never serialized into financial data. */
export const APP_LAYOUT_KEY="portfoliopilot:layout";
export const APP_LAYOUT_MODES=["classic","workbench"] as const;
export type AppLayout=(typeof APP_LAYOUT_MODES)[number];
export const APP_LAYOUT_LABELS:Record<AppLayout,string>={classic:"經典版",workbench:"工作台版"};
export function parseAppLayout(value:unknown):AppLayout{return value==="workbench"?"workbench":"classic";}
export type WorkbenchPage="today"|"assets"|"explore"|"watch"|"records";
export type LayoutSection="home"|"portfolio"|"research"|"lab"|"settings";
export function workbenchPage(section:LayoutSection,portfolioTab?:string,researchTab?:string):WorkbenchPage|null{
  if(section==="home")return "today";
  if(section==="portfolio")return portfolioTab==="activity"||portfolioTab==="dividends"?"records":"assets";
  if(section==="research")return researchTab==="watchlist"?"watch":researchTab==="journal"?"records":"explore";
  return section==="lab"?"explore":null;
}
