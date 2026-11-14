import { describe, expect, it } from "vitest";
import {
  closedJobStatus,
  elapsedLabel,
  invoiceDisplayStatus,
  invoiceTotals,
  jobBillable,
  parseQuestions,
  planFor,
  refLabel,
  responseSla,
  scoreQuiz,
  sopFor,
} from "@/lib/ops";

const T0 = new Date("2026-06-15T10:00:00Z");
const mins = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("responseSla", () => {
  it("uses the target for the alarm's priority", () => {
    expect(responseSla({ priority: "CRITICAL", triggeredAt: T0 }, mins(1)).targetMs).toBe(5 * 60_000);
    expect(responseSla({ priority: "LOW", triggeredAt: T0 }, mins(1)).targetMs).toBe(30 * 60_000);
  });
  it("moves ok → warning → breached as the clock runs", () => {
    expect(responseSla({ priority: "HIGH", triggeredAt: T0 }, mins(2)).state).toBe("ok");
    expect(responseSla({ priority: "HIGH", triggeredAt: T0 }, mins(6)).state).toBe("warning");
    expect(responseSla({ priority: "HIGH", triggeredAt: T0 }, mins(9)).state).toBe("breached");
  });
  it("stops the clock when the guard is on scene", () => {
    const r = responseSla({ priority: "HIGH", triggeredAt: T0, onSceneAt: mins(4) }, mins(60));
    expect(r.state).toBe("ok");
    expect(r.elapsedMs).toBe(4 * 60_000);
  });
  it("falls back to resolution time when nobody attended", () => {
    expect(responseSla({ priority: "MEDIUM", triggeredAt: T0, resolvedAt: mins(20) }, mins(90)).state).toBe("breached");
  });
});

describe("sopFor", () => {
  it("has a specific procedure for duress alarms that forbids calling the site", () => {
    expect(sopFor("Duress/Panic Button")[0]).toMatch(/Do NOT call the site/);
  });
  it("falls back to the general procedure", () => {
    expect(sopFor("Temperature Alert").length).toBeGreaterThan(2);
  });
});

describe("patrol job billing", () => {
  it("closes a job by how many stops were attended", () => {
    expect(closedJobStatus(12, 12)).toBe("COMPLETED");
    expect(closedJobStatus(7, 12)).toBe("PARTIAL");
    expect(closedJobStatus(0, 12)).toBe("MISSED");
  });
  it("bills the full rate, a pro-rata share, or nothing", () => {
    expect(jobBillable({ status: "COMPLETED", rate: 280, stopCount: 12, scanned: 12 })).toBe(280);
    expect(jobBillable({ status: "PARTIAL", rate: 280, stopCount: 12, scanned: 9 })).toBe(210);
    expect(jobBillable({ status: "MISSED", rate: 280, stopCount: 12, scanned: 0 })).toBe(0);
  });
  it("never bills work that is still in progress", () => {
    expect(jobBillable({ status: "ACTIVE", rate: 280, stopCount: 12, scanned: 11 })).toBe(0);
    expect(jobBillable({ status: "SCHEDULED", rate: 280, stopCount: 12, scanned: 0 })).toBe(0);
  });
  it("rounds to cents", () => {
    expect(jobBillable({ status: "PARTIAL", rate: 100, stopCount: 3, scanned: 1 })).toBe(33.33);
  });
});

describe("invoices", () => {
  it("adds GST to the subtotal", () => {
    expect(invoiceTotals([{ quantity: 1, unitPrice: 280 }, { quantity: 2, unitPrice: 45.5 }], 10)).toEqual({ subtotal: 371, gst: 37.1, total: 408.1 });
  });
  it("lets a credit line reduce the total", () => {
    expect(invoiceTotals([{ quantity: 1, unitPrice: 280 }, { quantity: 1, unitPrice: -30 }], 10).total).toBe(275);
  });
  it("shows a sent invoice as overdue only after its due date", () => {
    expect(invoiceDisplayStatus({ status: "SENT", dueAt: mins(-1) }, T0)).toBe("OVERDUE");
    expect(invoiceDisplayStatus({ status: "SENT", dueAt: mins(1) }, T0)).toBe("SENT");
    expect(invoiceDisplayStatus({ status: "PAID", dueAt: mins(-1) }, T0)).toBe("PAID");
    expect(invoiceDisplayStatus({ status: "DRAFT", dueAt: null }, T0)).toBe("DRAFT");
  });
});

describe("quizzes", () => {
  const qs = [
    { q: "a", options: ["x", "y"], answer: 1 },
    { q: "b", options: ["x", "y", "z"], answer: 0 },
    { q: "c", options: ["x", "y"], answer: 0 },
  ];
  it("scores as a percentage of correct answers", () => {
    expect(scoreQuiz(qs, [1, 0, 0])).toBe(100);
    expect(scoreQuiz(qs, [1, 0, 1])).toBe(67);
    expect(scoreQuiz(qs, [-1, -1, -1])).toBe(0);
  });
  it("treats a course with no questions as passed on reading", () => {
    expect(scoreQuiz([], [])).toBe(100);
  });
  it("drops malformed stored questions", () => {
    expect(parseQuestions([{ q: "ok", options: ["a", "b"], answer: 0 }, { q: "bad", options: ["only one"], answer: 0 }, null, "x"])).toHaveLength(1);
    expect(parseQuestions("nope")).toEqual([]);
  });
});

describe("helpers", () => {
  it("formats references and durations", () => {
    expect(refLabel("ALM", 4001)).toBe("ALM-4001");
    expect(refLabel("INC", 7)).toBe("INC-0007");
    expect(elapsedLabel(272_000)).toBe("4m 32s");
    expect(elapsedLabel(3_900_000)).toBe("1h 05m");
  });
  it("falls back to the Professional plan for an unknown tier", () => {
    expect(planFor("???").key).toBe("PROFESSIONAL");
    expect(planFor("ENTERPRISE").guards).toBeNull();
  });
});
