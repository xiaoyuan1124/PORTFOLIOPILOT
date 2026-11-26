import {describe,it,expect} from "vitest";
import {parseAppLayout,workbenchPage,APP_LAYOUT_KEY,APP_LAYOUT_MODES} from "./app-layout";
describe("independent layout preference",()=>{
  it("defaults unknown and legacy values to classic",()=>{
    for(const value of [null,undefined,"dark","light","tradescope","",{},123])expect(parseAppLayout(value)).toBe("classic");
    for(const mode of APP_LAYOUT_MODES)expect(parseAppLayout(mode)).toBe(mode);
    expect(APP_LAYOUT_KEY).not.toBe("portfoliopilot:v1");expect(APP_LAYOUT_KEY).not.toBe("portfoliopilot:theme");
  });
  it("maps both old deep links and workbench destinations",()=>{
    expect(workbenchPage("home")).toBe("today");
    expect(workbenchPage("portfolio","risk")).toBe("assets");
    expect(workbenchPage("portfolio","holdings")).toBe("assets");
    expect(workbenchPage("portfolio","activity")).toBe("records");
    expect(workbenchPage("portfolio","dividends")).toBe("records");
    expect(workbenchPage("research","", "journal")).toBe("records");
    expect(workbenchPage("research","", "watchlist")).toBe("watch");
    expect(workbenchPage("research","", "snapshot")).toBe("explore");
    expect(workbenchPage("lab")).toBe("explore");
    expect(workbenchPage("settings")).toBeNull();
  });
});
