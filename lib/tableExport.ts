export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

export function downloadCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const csvRows = [
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(formatExportValue(column.value(row)))).join(",")
    )
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function printTable<T>(title: string, columns: ExportColumn<T>[], rows: T[]) {
  const printWindow = window.open("", "_blank", "width=1100,height=800");

  if (!printWindow) {
    window.print();
    return;
  }

  const tableHeaders = columns
    .map((column) => `<th>${escapeHtml(column.header)}</th>`)
    .join("");
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(formatExportValue(column.value(row)))}</td>`)
          .join("")}</tr>`
    )
    .join("");

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        color: #1f2937;
        font-family: Arial, sans-serif;
        margin: 24px;
      }

      h1 {
        color: #3d2115;
        font-size: 20px;
        margin: 0 0 16px;
      }

      table {
        border-collapse: collapse;
        font-size: 11px;
        width: 100%;
      }

      th,
      td {
        border: 1px solid #d1d5db;
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #fff1e6;
        color: #7c2d12;
        font-size: 10px;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <table>
      <thead><tr>${tableHeaders}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function formatExportValue(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function escapeCsvValue(value: string) {
  const shouldQuote = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');

  return shouldQuote ? `"${escaped}"` : escaped;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
