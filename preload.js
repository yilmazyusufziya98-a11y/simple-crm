const { contextBridge, ipcRenderer } = require("electron");

// The only bridge between the page and the file system.
contextBridge.exposeInMainWorld("crmAPI", {
  load: () => ipcRenderer.invoke("crm:load"),
  save: (data) => ipcRenderer.invoke("crm:save", data),
  exportSheet: (data, stats) => ipcRenderer.invoke("crm:export-sheet", data, stats),
  openUrl: (url) => ipcRenderer.invoke("crm:open-url", url),
  searchAddress: (query, apiKey) => ipcRenderer.invoke("crm:address-search", query, apiKey),
  addressDetails: (placeId, apiKey) => ipcRenderer.invoke("crm:address-details", placeId, apiKey),
  backup: (data) => ipcRenderer.invoke("crm:backup", data),
  restore: () => ipcRenderer.invoke("crm:restore"),
  dataFolder: () => ipcRenderer.invoke("crm:data-folder"),
  loadLogin: () => ipcRenderer.invoke("creds:load"),
  saveLogin: (email, password) => ipcRenderer.invoke("creds:save", email, password),
  forgetLogin: (email) => ipcRenderer.invoke("creds:forget", email),
  onUpdate: (callback) => {
    ipcRenderer.on("update:downloading", (_e, version) => callback("downloading", version));
    ipcRenderer.on("update:ready", (_e, version) => callback("ready", version));
  },
  installUpdate: () => ipcRenderer.invoke("update:install"),
});
