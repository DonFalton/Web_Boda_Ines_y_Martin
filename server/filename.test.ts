import { createStoredName, sanitizeOriginalName } from "./filename.js";

describe("OneDrive filenames", () => {
  it("removes traversal and OneDrive-invalid characters", () => {
    expect(sanitizeOriginalName("../../foto: boda?.HEIC")).toBe("foto- boda-.HEIC");
    expect(sanitizeOriginalName("CON")).toBe("file-CON");
  });

  it("keeps the original extension while adding collision-resistant identity", () => {
    expect(createStoredName("12345678-aaaa-bbbb-cccc-123456789012", "Mi foto.JPG", 1234)).toBe("1234-12345678aaaa-Mi foto.JPG");
  });
});

