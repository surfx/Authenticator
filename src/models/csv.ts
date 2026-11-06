export const CSV_SEPARATOR = ";";
export const CSV_HEADER = [
  "issuer",
  "account",
  "secret",
  "type",
  "period",
  "digits",
  "algorithm",
  "counter",
];

export interface CsvAccount {
  issuer: string;
  account: string;
  secret: string;
  type: string;
  period: number;
  digits: number;
  algorithm: string;
  counter: number;
}

const HEADER_ALIASES: { [alias: string]: string } = {
  issuer: "issuer",
  emissor: "issuer",
  sistema: "issuer",
  account: "account",
  conta: "account",
  usuario: "account",
  usuário: "account",
  secret: "secret",
  segredo: "secret",
  chave: "secret",
  type: "type",
  tipo: "type",
  period: "period",
  periodo: "period",
  período: "period",
  digits: "digits",
  digitos: "digits",
  dígitos: "digits",
  algorithm: "algorithm",
  algoritmo: "algorithm",
  counter: "counter",
  contador: "counter",
};

export function parseCsvRows(text: string, separator = CSV_SEPARATOR) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function parseOtpauth(uri: string): CsvAccount | null {
  try {
    const url = new URL(uri.trim());
    if (url.protocol !== "otpauth:") {
      return null;
    }
    const label = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const sep = label.indexOf(":");
    const labelIssuer = sep >= 0 ? label.slice(0, sep).trim() : "";
    const account = (sep >= 0 ? label.slice(sep + 1) : label).trim();
    const params = url.searchParams;
    return {
      issuer: params.get("issuer") || labelIssuer,
      account,
      secret: params.get("secret") || "",
      type: url.hostname.toLowerCase() || "totp",
      period: Number(params.get("period")) || 30,
      digits: Number(params.get("digits")) || 6,
      algorithm: (params.get("algorithm") || "SHA1").toUpperCase(),
      counter: Number(params.get("counter")) || 0,
    };
  } catch (e) {
    return null;
  }
}

// Accepts CSV (";" separated) and also legacy lines of otpauth:// URIs.
export function parseAccounts(text: string): CsvAccount[] {
  const accounts: CsvAccount[] = [];
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return accounts;
  }

  if (/^otpauth:\/\//im.test(trimmed)) {
    for (const line of trimmed.split(/\r?\n/)) {
      const account = parseOtpauth(line);
      if (account && account.secret) {
        accounts.push(account);
      }
    }
    return accounts;
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const separator =
    firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";
  const rows = parseCsvRows(trimmed, separator);
  if (!rows.length) {
    return accounts;
  }

  let columns = ["issuer", "account", "secret"].concat(CSV_HEADER.slice(3));
  const headerCells = rows[0].map(
    (c) => HEADER_ALIASES[c.trim().toLowerCase()]
  );
  if (headerCells.includes("secret")) {
    columns = headerCells;
    rows.shift();
  }

  for (const row of rows) {
    const values: { [column: string]: string } = {};
    columns.forEach((column, index) => {
      if (column && row[index] !== undefined) {
        values[column] = row[index].trim();
      }
    });
    if (!values.secret) {
      continue;
    }
    accounts.push({
      issuer: values.issuer || "",
      account: values.account || "",
      secret: values.secret,
      type: (values.type || "totp").toLowerCase(),
      period: Number(values.period) || 30,
      digits: Number(values.digits) || 6,
      algorithm: (values.algorithm || "SHA1").toUpperCase(),
      counter: Number(values.counter) || 0,
    });
  }

  return accounts;
}

function escapeCell(value: string | number) {
  const text = String(value);
  return /["\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function accountsToCsv(accounts: CsvAccount[]) {
  const lines = [CSV_HEADER.join(CSV_SEPARATOR)];
  for (const a of accounts) {
    lines.push(
      [
        a.issuer,
        a.account,
        a.secret,
        a.type,
        a.period,
        a.digits,
        a.algorithm,
        a.counter,
      ]
        .map(escapeCell)
        .join(CSV_SEPARATOR)
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
