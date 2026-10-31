const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const { buildWorkbook } = require("./export");
const { searchAddress, addressDetails } = require("./address");
const { autoUpdater } = require("electron-updater");

// Data lives in the app data folder, e.g. %APPDATA%\Simple CRM\crm.json on Windows.
const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "crm.json");
const BACKUPS_KEPT = 10;

// Keep a dated copy of the data each day the app is opened, so mistakes can be undone.
function dailyBackup() {
  if (!fs.existsSync(dataFile())) return;
  const dir = path.join(dataDir(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(dir, `crm-${today}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
  const old = fs.readdirSync(dir).filter(f => f.startsWith("crm-")).sort().slice(0, -BACKUPS_KEPT);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 700,
    minHeight: 500,
    title: "Simple CRM",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "src", "index.html"));
}

ipcMain.handle("crm:load", () => {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), "utf8"));
  } catch {
    return null; // first run
  }
});

ipcMain.handle("crm:save", (_e, data) => {
  // Write to a temp file then rename, so a crash never leaves a half-written file
  const tmp = dataFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, dataFile());
});

async function saveDialog(event, title, defaultPath, filters) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title, defaultPath, filters });
  return canceled ? null : filePath;
}

// Formatted spreadsheet; the user uploads it to Google Sheets (or opens it in Excel)
ipcMain.handle("crm:export-sheet", async (event, data, stats) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = await saveDialog(event, "Export for Google Sheets", `CRM ${stamp}.xlsx`, [{ name: "Spreadsheet", extensions: ["xlsx"] }]);
  if (!file) return false;
  const wb = await buildWorkbook(data, stats);
  await wb.xlsx.writeFile(file);
  shell.showItemInFolder(file);
  return file;
});

ipcMain.handle("crm:open-url", (_e, url) => {
  if (/^https:\/\/(docs|drive)\.google\.com\//.test(url)) shell.openExternal(url);
});

// ---------- Address lookup (address.js; runs here, not in the page, so no browser restrictions apply) ----------
ipcMain.handle("crm:address-search", (_e, query, apiKey) => searchAddress(query, apiKey));
ipcMain.handle("crm:address-details", (_e, placeId, apiKey) => addressDetails(placeId, apiKey));

// ---------- "Remember me" ----------
// The password is encrypted with the operating system (Windows DPAPI), so only this
// Windows user on this computer can decrypt it.
const credsFile = () => path.join(dataDir(), "login.json");

// login.json: { accounts: [{ email, password }], last }, newest first
function readCreds() {
  try {
    const saved = JSON.parse(fs.readFileSync(credsFile(), "utf8"));
    if (saved.accounts) return saved;
    return { accounts: saved.email ? [{ email: saved.email, password: saved.password }] : [], last: saved.email }; // older format
  } catch {
    return { accounts: [], last: "" };
  }
}

const decrypt = value => {
  try {
    return value && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : "";
  } catch {
    return "";
  }
};

ipcMain.handle("creds:load", () => {
  const { accounts, last } = readCreds();
  return { accounts: accounts.map(a => ({ email: a.email, password: decrypt(a.password) })), last };
});

ipcMain.handle("creds:save", (_e, email, password) => {
  const creds = readCreds();
  // Without OS encryption, only remember the email, never a readable password
  const encrypted = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(password).toString("base64") : "";
  const accounts = [{ email, password: encrypted }, ...creds.accounts.filter(a => a.email.toLowerCase() !== email.toLowerCase())];
  fs.writeFileSync(credsFile(), JSON.stringify({ accounts, last: email }));
});

ipcMain.handle("creds:forget", (_e, email) => {
  const creds = readCreds();
  const accounts = creds.accounts.filter(a => a.email.toLowerCase() !== email.toLowerCase());
  fs.writeFileSync(credsFile(), JSON.stringify({ accounts, last: "" }));
});

ipcMain.handle("crm:backup", async (event, data) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = await saveDialog(event, "Save backup", `crm-backup-${stamp}.json`, [{ name: "JSON", extensions: ["json"] }]);
  if (!file) return false;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle("crm:restore", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Restore backup",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePaths.length) return null;
  const data = JSON.parse(fs.readFileSync(filePaths[0], "utf8"));
  if (!Array.isArray(data?.contacts)) throw new Error("This is not a Simple CRM backup file");
  return data;
});

ipcMain.handle("crm:data-folder", () => shell.openPath(dataDir()));

// ---------- Automatic updates (new versions are published to GitHub Releases) ----------
function setupAutoUpdates() {
  // Only the installed app updates itself, and only once an update location is configured
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // if you don't restart now, it installs when you close the app
  const tell = (channel, info) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, info?.version));
  autoUpdater.on("update-available", info => tell("update:downloading", info));
  autoUpdater.on("update-downloaded", info => tell("update:ready", info));
  autoUpdater.on("error", err => console.error("Update check failed:", err.message));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000); // every 4 hours
}

ipcMain.handle("update:install", () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  try { dailyBackup(); } catch (err) { console.error("Backup failed:", err); }
  createWindow();
  setupAutoUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
