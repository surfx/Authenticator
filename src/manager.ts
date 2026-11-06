import { Encryption } from "./models/encryption";
import { EntryStorage } from "./models/storage";
import { CodeState, OTPAlgorithm, OTPEntry, OTPType } from "./models/otp";
import { UserSettings } from "./models/settings";
import { accountsToCsv, CsvAccount, parseAccounts } from "./models/csv";

interface Row extends CsvAccount {
  hash?: string;
  pinned: boolean;
}

const TYPES = Object.keys(OTPType).filter((k) => isNaN(Number(k)));
const ALGORITHMS = Object.keys(OTPAlgorithm).filter((k) => isNaN(Number(k)));

let rows: Row[] = [];
let originalHashes: string[] = [];
let encryption: Encryption;
let lockedCount = 0;
let dirty = false;
let showSecrets = false;

const SVG_ATTRS =
  'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const EYE_ON = `<svg ${SVG_ATTRS}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg ${SVG_ATTRS}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function setEye(button: HTMLElement, visible: boolean) {
  button.innerHTML = visible ? EYE_OFF : EYE_ON;
  button.title = visible ? "Ocultar segredo" : "Mostrar segredo";
}

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function setStatus(message: string, kind: "ok" | "error" | "" = "") {
  const el = $("status");
  el.textContent = message;
  el.className = kind;
}

function markDirty(value = true) {
  dirty = value;
  $("dirty").style.display = value ? "inline" : "none";
  $<HTMLButtonElement>("save").disabled = !value;
}

function applyFilter() {
  const term = $<HTMLInputElement>("search").value.trim().toLowerCase();
  let visible = 0;
  Array.from($("rows").children).forEach((tr, i) => {
    const row = rows[i];
    const match =
      !term || `${row.issuer} ${row.account}`.toLowerCase().includes(term);
    tr.classList.toggle("hidden", !match);
    if (match) {
      visible++;
    }
  });
  $("count").textContent = term
    ? `${visible} de ${rows.length}`
    : String(rows.length);
  $("no-match").style.display =
    term && !visible && rows.length ? "block" : "none";
}

function toggleSecrets() {
  showSecrets = !showSecrets;
  setEye($("toggle-all-eye"), showSecrets);
  $("toggle-all-eye").title = showSecrets
    ? "Ocultar todos os segredos"
    : "Mostrar todos os segredos";
  render();
}

function normalizeSecret(secret: string, type: string) {
  const clean = secret.replace(/\s+/g, "");
  if (/^[a-z2-7]+=*$/i.test(clean) && type !== "hex" && type !== "hhex") {
    return clean.toUpperCase();
  }
  return clean;
}

function toRow(a: CsvAccount, base?: Partial<Row>): Row {
  const type = TYPES.includes(a.type) ? a.type : "totp";
  return {
    ...a,
    type,
    algorithm: ALGORITHMS.includes(a.algorithm) ? a.algorithm : "SHA1",
    secret: normalizeSecret(a.secret, type),
    hash: base?.hash,
    pinned: base?.pinned || false,
  };
}

function buildEntry(row: Row, index: number) {
  return new OTPEntry(
    {
      encrypted: false,
      index,
      issuer: row.issuer,
      account: row.account,
      secret: row.secret,
      type: OTPType[row.type as keyof typeof OTPType],
      counter: row.counter,
      period: row.period,
      digits: row.digits,
      algorithm: OTPAlgorithm[row.algorithm as keyof typeof OTPAlgorithm],
      hash: row.hash,
      pinned: row.pinned,
    },
    encryption
  );
}

function isRowValid(row: Row, index: number) {
  if (!row.secret) {
    return false;
  }
  if (row.type === "hotp" || row.type === "hhex") {
    return true;
  }
  return buildEntry(row, index).code !== CodeState.Invalid;
}

function option(values: string[], selected: string) {
  return values
    .map(
      (v) =>
        `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`
    )
    .join("");
}

function render() {
  const body = $("rows");
  body.textContent = "";
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(index);
    const isCounter = row.type === "hotp" || row.type === "hhex";
    tr.innerHTML = `
      <td class="num">${index + 1}</td>
      <td><input data-f="issuer" placeholder="Sistema / emissor" aria-label="Emissor" /></td>
      <td><input data-f="account" placeholder="Usuário / CPF" aria-label="Conta" /></td>
      <td class="secret-cell"><div class="secret-wrap"><input data-f="secret" class="secret" placeholder="Segredo (base32)" aria-label="Segredo" autocomplete="off" spellcheck="false" /><button type="button" data-action="eye" class="eye" title="Mostrar segredo" aria-label="Mostrar ou ocultar segredo">${EYE_ON}</button></div></td>
      <td><select data-f="type" aria-label="Tipo">${option(
        TYPES,
        row.type
      )}</select></td>
      <td><input data-f="period" type="number" min="1" class="small" aria-label="Período" ${
        isCounter ? "disabled" : ""
      } /></td>
      <td><input data-f="counter" type="number" min="0" class="small" aria-label="Contador" ${
        isCounter ? "" : "disabled"
      } /></td>
      <td><input data-f="digits" type="number" min="1" max="10" class="small" aria-label="Dígitos" /></td>
      <td><select data-f="algorithm" aria-label="Algoritmo">${option(
        ALGORITHMS,
        row.algorithm
      )}</select></td>
      <td class="actions"><button type="button" data-action="up" title="Subir" aria-label="Subir" ${
        index === 0 ? "disabled" : ""
      }>↑</button><button type="button" data-action="down" title="Descer" aria-label="Descer" ${
      index === rows.length - 1 ? "disabled" : ""
    }>↓</button><button type="button" data-action="del" class="danger" title="Remover linha" aria-label="Remover linha">✕</button></td>`;
    for (const input of Array.from(tr.querySelectorAll("input"))) {
      const field = input.dataset.f as keyof Row;
      input.value = String(row[field] ?? "");
      if (field === "secret") {
        input.type = showSecrets ? "text" : "password";
        const eye = tr.querySelector<HTMLElement>("button.eye");
        if (eye) {
          setEye(eye, showSecrets);
        }
      }
    }
    body.appendChild(tr);
  });
  $("empty").style.display = rows.length ? "none" : "block";
  validateAll();
  applyFilter();
}

function validateAll() {
  let invalid = 0;
  const trs = Array.from($("rows").children) as HTMLElement[];
  rows.forEach((row, index) => {
    const ok = isRowValid(row, index);
    trs[index]?.classList.toggle("invalid", !ok);
    if (trs[index]) {
      trs[index].title = ok ? "" : "Segredo ausente ou inválido";
    }
    if (!ok) {
      invalid++;
    }
  });
  return invalid;
}

function addRows(accounts: CsvAccount[], replace: boolean) {
  const newRows = accounts.map((a) => toRow(a));
  if (replace) {
    // keep hashes of rows that match (same issuer+account) so ids are stable
    const byKey = new Map(
      rows.map((r) => [`${r.issuer}\u0000${r.account}`, r])
    );
    for (const r of newRows) {
      const old = byKey.get(`${r.issuer}\u0000${r.account}`);
      if (old) {
        r.hash = old.hash;
        r.pinned = old.pinned;
      }
    }
    rows = newRows;
  } else {
    rows = rows.concat(newRows);
  }
  markDirty();
  render();
}

async function save() {
  if (lockedCount > 0 && !encryption.getEncryptionStatus()) {
    setStatus(
      "Existem contas criptografadas. Desbloqueie a extensão no popup (senha) e recarregue esta página.",
      "error"
    );
    return;
  }
  const invalid = validateAll();
  if (invalid > 0) {
    setStatus(
      `${invalid} linha(s) com segredo ausente ou inválido (em vermelho). Corrija antes de salvar.`,
      "error"
    );
    return;
  }

  const entries = rows.map((row, index) => buildEntry(row, index));
  await EntryStorage.set(entries);
  const kept = new Set(entries.map((e) => e.hash));
  for (const hash of originalHashes) {
    if (!kept.has(hash)) {
      await EntryStorage.remove(hash);
    }
  }
  rows.forEach((row, i) => (row.hash = entries[i].hash));
  originalHashes = entries.map((e) => e.hash);
  markDirty(false);
  setStatus(`${entries.length} conta(s) salva(s) com sucesso.`, "ok");
}

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const accounts = rows
    .filter((r) => r.secret)
    .map((r) => ({
      issuer: r.issuer,
      account: r.account,
      secret: r.secret,
      type: r.type,
      period: r.period,
      digits: r.digits,
      algorithm: r.algorithm,
      counter: r.counter,
    }));
  download(
    "authenticator.csv",
    accountsToCsv(accounts),
    "text/csv;charset=utf-8"
  );
  setStatus(
    `${accounts.length} conta(s) exportada(s) para CSV (separador ;).`,
    "ok"
  );
}

function removeDuplicates() {
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = [r.issuer, r.account, r.secret, r.type].join("\u0000");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const removed = rows.length - unique.length;
  if (removed) {
    rows = unique;
    markDirty();
    render();
  }
  return removed;
}

function bindEvents() {
  $("rows").addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const tr = target.closest("tr") as HTMLElement;
    const field = target.dataset.f as string;
    if (!tr || !field) {
      return;
    }
    const row = (rows[Number(tr.dataset.index)] as unknown) as {
      [k: string]: string | number | boolean;
    };
    const numeric =
      field === "period" || field === "digits" || field === "counter";
    row[field] = numeric ? Number(target.value) || 0 : target.value;
    if (field === "secret" || field === "type") {
      row.secret = normalizeSecret(String(row.secret), String(row.type));
    }
    markDirty();
    const index = Number(tr.dataset.index);
    const valid = isRowValid(rows[index], index);
    tr.classList.toggle("invalid", !valid);
    tr.title = valid ? "" : "Segredo ausente ou inválido";
  });

  $("rows").addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.f === "secret" || target.dataset.f === "type") {
      render();
    }
  });

  $("rows").addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest("button");
    const tr = button?.closest("tr") as HTMLElement | null;
    if (!button || !tr) {
      return;
    }
    const i = Number(tr.dataset.index);
    const action = button.dataset.action;
    if (action === "eye") {
      const input = tr.querySelector<HTMLInputElement>("input.secret");
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
        setEye(button, input.type === "text");
      }
      return;
    }
    if (action === "del") {
      rows.splice(i, 1);
    } else if (action === "up" && i > 0) {
      [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
    } else if (action === "down" && i < rows.length - 1) {
      [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
    } else {
      return;
    }
    markDirty();
    render();
  });

  $("add").addEventListener("click", () => {
    rows.push(
      toRow({
        issuer: "",
        account: "",
        secret: "",
        type: "totp",
        period: 30,
        digits: 6,
        algorithm: "SHA1",
        counter: 0,
      })
    );
    $<HTMLInputElement>("search").value = "";
    markDirty();
    render();
    const inputs = $("rows").querySelectorAll("tr:last-child input");
    (inputs[0] as HTMLInputElement)?.focus();
  });

  $("dedupe").addEventListener("click", () => removeDuplicates());

  $("save").addEventListener("click", () => save());
  $("export").addEventListener("click", exportCsv);

  setEye($("toggle-all-eye"), showSecrets);
  $("toggle-all-eye").addEventListener("click", toggleSecrets);
  $("search").addEventListener("input", applyFilter);

  const pasteBox = $<HTMLTextAreaElement>("paste");
  const applyPaste = (replace: boolean) => {
    const accounts = parseAccounts(pasteBox.value);
    if (!accounts.length) {
      setStatus("Nenhuma conta reconhecida no texto colado.", "error");
      return;
    }
    addRows(accounts, replace);
    pasteBox.value = "";
    setStatus(
      `${accounts.length} conta(s) ${
        replace ? "carregada(s) (substituindo a lista)" : "adicionada(s)"
      }. Clique em Salvar para gravar.`,
      "ok"
    );
  };
  $("paste-append").addEventListener("click", () => applyPaste(false));
  $("paste-replace").addEventListener("click", () => {
    if (!rows.length || confirm("Substituir todas as contas da lista atual?")) {
      applyPaste(true);
    }
  });

  const fileInput = $<HTMLInputElement>("file");
  $("import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) {
      return;
    }
    const accounts = parseAccounts(await file.text());
    if (!accounts.length) {
      setStatus("Nenhuma conta reconhecida no arquivo.", "error");
      return;
    }
    const replace =
      rows.length > 0 &&
      confirm(
        `${accounts.length} conta(s) encontradas.\nOK = substituir a lista atual\nCancelar = adicionar ao final`
      );
    addRows(accounts, replace);
    setStatus(
      `${accounts.length} conta(s) importada(s) de ${file.name}. Clique em Salvar para gravar.`,
      "ok"
    );
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
    }
  });
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  });
}

async function init() {
  await UserSettings.updateItems();
  const { cachedPassphrase, cachedKeyId } = await chrome.storage.session.get();
  encryption = new Encryption(cachedPassphrase, cachedKeyId);

  const entries = await EntryStorage.get();
  if (encryption.getEncryptionStatus()) {
    for (const entry of entries) {
      await entry.applyEncryption(encryption);
    }
  }

  const unlocked = entries.filter((e) => e.secret);
  lockedCount = entries.length - unlocked.length;
  originalHashes = unlocked.map((e) => e.hash);
  rows = unlocked.map((e) =>
    toRow(
      {
        issuer: e.issuer,
        account: e.account,
        secret: e.secret as string,
        type: OTPType[e.type],
        period: e.period,
        digits: e.digits,
        algorithm: OTPAlgorithm[e.algorithm],
        counter: e.counter,
      },
      { hash: e.hash, pinned: e.pinned }
    )
  );

  if (lockedCount > 0) {
    const warn = $("warn");
    warn.style.display = "block";
    warn.textContent = encryption.getEncryptionStatus()
      ? `${lockedCount} conta(s) não puderam ser descriptografadas e serão mantidas intactas.`
      : `${lockedCount} conta(s) estão criptografadas. Desbloqueie a extensão no popup (informe a senha) e recarregue esta página para editá-las.`;
  }

  bindEvents();
  markDirty(false);
  render();

  // Limpeza automática de duplicadas ao abrir
  const removed = removeDuplicates();
  if (removed) {
    await save();
    setStatus(`${removed} conta(s) duplicada(s) removida(s) e salvas.`, "ok");
  }
}

init();
