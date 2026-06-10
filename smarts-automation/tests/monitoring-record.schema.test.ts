import { describe, it, expect } from "vitest";
import { MonitoringRowSchema } from "../src/csv/monitoring-record.schema.js";

const goodRow = {
  monitoring_location_id: "ML-001",
  monitoring_location_name: "North",
  sample_datetime: "2026-05-20T09:15:00Z",
  discharge_point: "DP-1",
  ph_value: "7.2",
  turbidity_ntu: "12.4",
};

describe("MonitoringRowSchema", () => {
  it("parses a valid row into a typed MonitoringRecord", () => {
    const r = MonitoringRowSchema.safeParse(goodRow);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.monitoringLocationId).toBe("ML-001");
    expect(r.data.dischargePoint).toBe("DP-1");
    expect(r.data.phValue).toBe(7.2);
    expect(r.data.turbidityNtu).toBe(12.4);
    expect(r.data.sampleDateTime.toISOString()).toBe(
      "2026-05-20T09:15:00.000Z",
    );
    expect(r.data.qualifierCode).toBeNull();
  });

  it("treats blank optional fields as null", () => {
    const r = MonitoringRowSchema.safeParse({
      ...goodRow,
      turbidity_ntu: "",
      lab_name: "  ",
      qualifier_code: "U",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.turbidityNtu).toBeNull();
    expect(r.data.labName).toBeNull();
    expect(r.data.qualifierCode).toBe("U");
  });

  it("rejects a row missing a required column with that field name", () => {
    const { discharge_point: _drop, ...rest } = goodRow;
    void _drop;
    const r = MonitoringRowSchema.safeParse(rest);
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = r.error.issues.map((i) => i.path[0]);
    expect(fields).toContain("discharge_point");
  });

  it("rejects an unparseable sample_datetime with the field name", () => {
    const r = MonitoringRowSchema.safeParse({
      ...goodRow,
      sample_datetime: "not-a-date",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = r.error.issues.map((i) => i.path[0]);
    expect(fields).toContain("sample_datetime");
  });

  it("rejects a non-numeric ph_value with the field name", () => {
    const r = MonitoringRowSchema.safeParse({
      ...goodRow,
      ph_value: "not-a-number",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = r.error.issues.map((i) => i.path[0]);
    expect(fields).toContain("ph_value");
  });
});
