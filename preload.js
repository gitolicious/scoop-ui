// allow IPC
const electron = require('electron');

process.once('loaded', () => {
    // make IPC available to renderer
    global.ipcRenderer = electron.ipcRenderer;

    // allow require for devtron
    if (process.env.NODE_ENV === 'development'){
        window.__devtron = {require: require, process: process};
        require('devtron').install();
    }
});
