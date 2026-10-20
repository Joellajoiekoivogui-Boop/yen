"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Palette catégorielle validée (validate_palette.js : contraste, daltonisme) — ordre fixe. */
export const SERIES = ["#3565dd", "#b08209"] as const;
const AXIS = { stroke: "#94a3b8", fontSize: 12, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />;
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #dfe6f0", fontSize: 12, boxShadow: "0 4px 12px rgb(10 23 48 / 0.08)" };

export function SingleLineChart({ data, xKey, yKey, label, height = 220 }: { data: Record<string, string | number>[]; xKey: string; yKey: string; label: string; height?: number }) {
  return (
    <figure aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          {GRID}
          <XAxis dataKey={xKey} {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
          <Line type="monotone" dataKey={yKey} name={label} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
      <DataTable data={data} columns={[xKey, yKey]} headers={["Période", label]} />
    </figure>
  );
}

export function SimpleBarChart({
  data, xKey, series, label, height = 260, layout = "horizontal",
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: { key: string; label: string }[];
  label: string;
  height?: number;
  layout?: "horizontal" | "vertical";
}) {
  const vertical = layout === "vertical";
  return (
    <figure aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} barGap={2} margin={{ top: 8, right: 12, bottom: 0, left: vertical ? 8 : -16 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={!vertical} vertical={vertical} />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} {...AXIS} />
              <YAxis type="category" dataKey={xKey} width={170} {...AXIS} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
            </>
          )}
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgb(47 111 255 / 0.06)" }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#334155" }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i % SERIES.length]} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} stroke="#fff" strokeWidth={1} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <DataTable data={data} columns={[xKey, ...series.map((s) => s.key)]} headers={["", ...series.map((s) => s.label)]} />
    </figure>
  );
}

/** Vue tabulaire accessible des données d'un graphique. */
function DataTable({ data, columns, headers }: { data: Record<string, string | number>[]; columns: string[]; headers: string[] }) {
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="cursor-pointer select-none">Voir les données sous forme de tableau</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>{headers.map((h, i) => <th key={i} className="border-b border-border py-1 pr-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>{columns.map((c) => <td key={c} className="border-b border-border/60 py-1 pr-3 tabular-nums">{row[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
