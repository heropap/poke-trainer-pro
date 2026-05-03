describe("Smoke Test", () => {
  it("应用环境正常", () => {
    expect(1 + 1).toBe(2);
  });

  it("TypeScript 类型系统正常", () => {
    const greeting: string = "Poke-Trainer Pro";
    expect(greeting).toContain("Poke-Trainer");
  });
});
