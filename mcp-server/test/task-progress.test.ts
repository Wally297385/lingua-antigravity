import { describe, it, expect, beforeEach } from "vitest";
import { AgentTaskProgress } from "../src/task-progress.js";

describe("AgentTaskProgress", () => {
  let tp: AgentTaskProgress;

  beforeEach(() => {
    tp = new AgentTaskProgress();
  });

  it("starts task progress correctly", () => {
    const res = tp.start(["step1", "step2", "step3"]);
    expect(res.status).toBe("running");
    expect(res.current_step).toBe("step1");
    expect(res.total_pending).toBe(3);
    expect(res.total_completed).toBe(0);
  });

  it("advances and adds dynamic steps atomically", () => {
    tp.start(["step1", "step2"]);
    const res1 = tp.advance({ add: ["step2.5"] });
    expect(res1.current_step).toBe("step2");
    expect(res1.completed_tasks).toEqual(["step1"]);
    expect(res1.pending_tasks).toEqual(["step2", "step2.5"]);

    const res2 = tp.advance();
    expect(res2.current_step).toBe("step2.5");
    expect(res2.completed_tasks).toEqual(["step1", "step2"]);
  });

  it("finishes when no pending tasks remain", () => {
    tp.start(["step1"]);
    tp.advance();
    const res = tp.finish();
    expect(res.status).toBe("completed");
    expect(res.total_completed).toBe(1);
    expect(res.total_pending).toBe(0);
  });

  it("throws error if finishing with pending tasks", () => {
    tp.start(["step1", "step2"]);
    expect(() => tp.finish()).toThrow(/pending task/);
  });

  it("cancels task progress cleanly", () => {
    tp.start(["step1", "step2"]);
    const res = tp.cancel();
    expect(res.status).toBe("cancelled");
    expect(res.pending_tasks).toHaveLength(0);
  });
});
