// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, shell } from 'electron';

console.log('[Preload] Script loading...');

// Expose settings API to renderer
contextBridge.exposeInMainWorld('settingsAPI', {
  getKeyStatus: () => {
    console.log('[Preload] getKeyStatus called, invoking IPC...');
    return ipcRenderer.invoke('settings:getKeyStatus');
  },
  saveApiKey: (key: string) => ipcRenderer.invoke('settings:saveApiKey', key),
  deleteApiKey: () => ipcRenderer.invoke('settings:deleteApiKey'),
  close: () => ipcRenderer.send('settings:close'),
  openExternal: (url: string) => shell.openExternal(url),
});

console.log('[Preload] settingsAPI exposed to renderer');
