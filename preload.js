// allow IPC
const { contextBridge, ipcRenderer, BrowserWindow } = require('electron');
process.once('loaded', () => {
  // make IPC communication available to renderer
  // whitelist channels
  let validSenderChannels = [
    'scoop-list',
    'scoop-status',
    'scoop-update',
    'scoop-update-app',
    'scoop-update-all',
    'scoop-uninstall-app',
    'scoop-checkver',
    'scoop-update-app',
    'scoop-bucket-list',
  ];
  let validReceiverChannels = [
    'app-list-entry',
    'app-list-entry-remove',
    'bucket-list-entry',
    'console-log',
  ];
  validSenderChannels.forEach(channel => {
    validReceiverChannels.push(`${channel}-started`);
    validReceiverChannels.push(`${channel}-finished`);
  });

  contextBridge.exposeInMainWorld(
    'api',
    {
      send: (channel, data) => {
        if (validSenderChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
        } else {
          console.warn(`Invalid sender channel ${channel}`);
        }
      },
      on: (channel, func) => {
        if (validReceiverChannels.includes(channel)) {
          // Deliberately strip event as it includes `sender`
          ipcRenderer.on(channel, (_event, ...args) => func(...args));
        } else {
          console.warn(`Invalid receiver channel ${channel}`);
        }
      }
    }
  )
});
