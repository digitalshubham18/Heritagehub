import { describe, expect, it } from "vitest";
import { firstResponseHours, slaState } from "../src/lib/sla";

const H = 3_600_000, now = Date.UTC(2026, 9, 31, 12, 0, 0);
const ago = (h: number) => new Date(now - h * H);

describe("support reply targets", () => {
  it("a new ticket is due after the first-response time (24 h by default) and overdue after it", () => {
    const t = { status: "open", lastFrom: "visitor", lastMessageAt: ago(23), messages: [{ from: "visitor" }] };
    expect(slaState(t, {}, now)).toMatchObject({ waiting: true, overdue: false, kind: "first", targetHours: 24 });
    expect(slaState({ ...t, lastMessageAt: ago(30) }, {}, now)).toMatchObject({ overdue: true, overdueByHours: 6 });
  });
  it("after staff have answered, the follow-up target (48 h) applies", () => {
    const t = { status: "in_progress", lastFrom: "visitor", lastMessageAt: ago(30), messages: [{ from: "visitor" }, { from: "staff" }, { from: "visitor" }] };
    expect(slaState(t, {}, now)).toMatchObject({ waiting: true, overdue: false, kind: "followup", targetHours: 48 });
    expect(slaState({ ...t, lastMessageAt: ago(50) }, {}, now).overdue).toBe(true);
  });
  it("uses the operator's own targets", () => {
    const t = { status: "open", lastFrom: "visitor", lastMessageAt: ago(5), messages: [{ from: "visitor" }] };
    expect(slaState(t, { firstResponseHours: 4 }, now).overdue).toBe(true);
    expect(slaState(t, { firstResponseHours: 8 }, now).overdue).toBe(false);
  });
  it("is not waiting when we replied last, or when the ticket is resolved or closed", () => {
    const base = { lastMessageAt: ago(200), messages: [{ from: "visitor" }] };
    expect(slaState({ ...base, status: "open", lastFrom: "staff" }, {}, now).waiting).toBe(false);
    expect(slaState({ ...base, status: "resolved", lastFrom: "visitor" }, {}, now).overdue).toBe(false);
    expect(slaState({ ...base, status: "closed", lastFrom: "visitor" }, {}, now).waiting).toBe(false);
  });
  it("measures time to first staff reply", () => {
    expect(firstResponseHours({ createdAt: ago(10), messages: [{ from: "visitor", at: ago(10) }, { from: "staff", at: ago(7.5) }] })).toBeCloseTo(2.5);
    expect(firstResponseHours({ createdAt: ago(10), messages: [{ from: "visitor", at: ago(10) }] })).toBeNull();
  });
});
