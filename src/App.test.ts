import { appRoute } from "./lib/app-route";

describe("application route selection", () => {
  it("keeps the wedding home and album routes independent", () => {
    expect(appRoute("/")).toBe("home");
    expect(appRoute("/album")).toBe("album");
    expect(appRoute("/album/")).toBe("album");
    expect(appRoute("/album/admin")).toBe("admin");
    expect(appRoute("/unknown")).toBe("not-found");
  });
});
