export interface CSVExportOptions {
  filename?: string;
  columns?: string[];
}

export function exportToCSV(
  data: Record<string, any>[],
  options: CSVExportOptions = {}
): void {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const {
    filename = `export-${new Date().toISOString().split("T")[0]}.csv`,
    columns,
  } = options;

  // Determine columns to export
  const exportColumns = columns || Object.keys(data[0]);

  // Create CSV header
  const header = exportColumns.map((col) => `"${col}"`).join(",");

  // Create CSV rows
  const rows = data.map((row) =>
    exportColumns
      .map((col) => {
        const value = row[col];
        const stringValue =
          value === null || value === undefined ? "" : String(value);
        // Escape quotes and wrap in quotes if contains comma or newline
        const escaped = stringValue.replace(/"/g, '""');
        return stringValue.includes(",") ||
          stringValue.includes("\n") ||
          stringValue.includes('"')
          ? `"${escaped}"`
          : `"${escaped}"`;
      })
      .join(",")
  );

  // Combine header and rows
  const csv = [header, ...rows].join("\n");

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function formatCellForCSV(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.join("; ");
    if (value instanceof Date) return value.toLocaleDateString();
    return JSON.stringify(value);
  }
  return String(value);
}
