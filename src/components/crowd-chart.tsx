"use client";
// Kept in its own file so the charting library (about 100 kB) is downloaded only on pages that actually draw a chart,
// not on every page that shows a crowd badge.
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtTime, Level } from "@/lib/utils";
import { LEVEL_COLOR } from "./crowd";

/** Expected visitors per slot (coloured by level) against slot capacity. */
export default function SlotChartImpl({ slots }: { slots: { start: string; expected: number; capacity: number; level: Level; densityPct: number }[] }) {
  const data = slots.map((s) => ({ ...s, label: fmtTime(s.start).replace(":00", "") }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Chart of expected visitors per time slot compared with capacity">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F4D3A22" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: any, n: any) => [v, n === "expected" ? "Expected visitors" : "Capacity"]} />
          <Bar dataKey="expected" radius={[4, 4, 0, 0]}>{data.map((d) => <Cell key={d.start} fill={LEVEL_COLOR[d.level]} />)}</Bar>
          <Line dataKey="capacity" stroke="#26261F" strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

