import { describe, it, expect } from "vitest";
import { formatDate, readable } from "./api";
import { demoRequest } from "./demo";
import type { ListData } from "./api";
describe("admin preview", () => {
  it("keeps preview actions read-only", async () => {
    await expect(demoRequest("retry", { id: "demo-item-0" })).rejects.toThrow(
      "disabled",
    );
  });
  it("searches and paginates sample data without inventing matches", async () => {
    const users = await demoRequest<ListData>("users", { q: "alex" });
    expect(users.total).toBe(1);
    expect(users.rows[0]?.name).toBe("Alex Morgan");
    const absent = await demoRequest<ListData>("users", { q: "not-a-user" });
    expect(absent.total).toBe(0);
    const page1 = await demoRequest<ListData>("activity", { page: 1 });
    const page2 = await demoRequest<ListData>("activity", { page: 2 });
    expect(page1.rows).toHaveLength(25);
    expect(page2.rows).toHaveLength(7);
    expect(page1.rows.map((r) => r.id)).not.toContain(page2.rows[0]?.id);
  });
  it("renders absent timestamps safely", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("invalid")).toBe("—");
    expect(readable("retry_wait")).toBe("retry wait");
  });
});
