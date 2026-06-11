import { hello } from "../src/index";

describe("hello function", () => {
  it("should return greeting with the provided name", () => {
    const result = hello("Test");
    expect(result).toBe("Hello, Test!");
  });
});
