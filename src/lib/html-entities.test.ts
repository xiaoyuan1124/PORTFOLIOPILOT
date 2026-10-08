import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./html-entities";

describe("Taiwan ETF name decoding", () => {
  it("decodes hexadecimal numeric Chinese stock names", () => {
    expect(decodeHtmlEntities("&#x806F;&#x767C;&#x79D1;")).toBe("聯發科");
    expect(decodeHtmlEntities("&#x53F0;&#x7A4D;&#x96FB;")).toBe("台積電");
    expect(decodeHtmlEntities("&#x65E5;&#x6708;&#x5149;&#x6295;&#x63A7;")).toBe("日月光投控");
  });

  it("supports decimals, escaped numeric codes, mixed names and punctuation", () => {
    expect(decodeHtmlEntities("&#21488;&#31309;&#38651;")).toBe("台積電");
    expect(decodeHtmlEntities("2454 &amp;#x806F;&amp;#x767C;&amp;#x79D1;")).toBe("2454 聯發科");
    expect(decodeHtmlEntities("永豐金 &amp; Co.")).toBe("永豐金 & Co.");
  });

  it("preserves plain names, unknown entities and invalid Unicode", () => {
    expect(decodeHtmlEntities("聯發科")).toBe("聯發科");
    expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
    expect(decodeHtmlEntities("&#xD800; &#x110000;")).toBe("&#xD800; &#x110000;");
  });
});
