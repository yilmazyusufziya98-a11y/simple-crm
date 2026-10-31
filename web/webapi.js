// Web version: provides in the browser what preload.js provides in the desktop app.
// Bundled into web-dist/webapi.js by build-web.js.
import { buildWorkbook } from "../export.js";
import { searchAddress, addressDetails } from "../address.js";

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const today = () => new Date().toISOString().slice(0, 10);

window.crmAPI = {
  isWeb: true,
  // Data lives in the cloud (with Firestore's own offline cache); no extra copy in the browser
  load: async () => null,
  save: async () => {},

  async exportSheet(data, stats) {
    const wb = await buildWorkbook(data, stats);
    const buffer = await wb.xlsx.writeBuffer();
    const name = `CRM ${today()}.xlsx`;
    download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
    return `${name} (in your Downloads folder)`;
  },
  openUrl: async url => { window.open(url, "_blank", "noopener"); },

  searchAddress,
  addressDetails,

  async backup(data) {
    download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `crm-backup-${today()}.json`);
    return true;
  },
  restore() {
    return new Promise((resolve, reject) => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
      input.onchange = async () => {
        try {
          const file = input.files[0];
          if (!file) return resolve(null);
          const data = JSON.parse(await file.text());
          if (!Array.isArray(data?.contacts)) throw new Error("This is not a Simple CRM backup file");
          resolve(data);
        } catch (err) { reject(err); }
      };
      input.click();
    });
  },

  // The browser's own password manager remembers logins on the web
  loadLogin: async () => null,
  saveLogin: async () => {},
  forgetLogin: async () => {},
};

// Let the browser offer saved passwords, and hide the desktop-only "Remember me"
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-email")?.setAttribute("autocomplete", "username");
  const remember = document.querySelector(".login-card .remember");
  if (remember) remember.style.display = "none";
});
