// require //
const { app: electronApp, BrowserWindow } = require('electron');
const { ipcMain: ipc } = require('electron');

const storage = require('electron-json-storage');

const path = require('path');

const { spawn } = require('child_process');

// globals //
let mainWindow;

let favoriteBucket;

const scoopBinary = `${process.env["SCOOP"]}\\apps\\scoop\\current\\bin\\scoop.ps1`;

/////////////////
// main window //
/////////////////

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWindow.maximize();
  mainWindow.loadFile('index.html');

  // open dev tools when in dev environment
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // remove window reference on window close
  mainWindow.on('closed', () => {
    mainWindow = null
  });

  storage.get('favorite-bucket', (error, data) => {
    if (error) throw error;

    favoriteBucket = data.bucket;
    console.log(favoriteBucket && `restored favorite bucket ${favoriteBucket}` || 'no favorite bucket set');
  });
}

electronApp.on('ready', createWindow);

electronApp.on('window-all-closed', electronApp.quit);

electronApp.on('activate', () => {
  if (mainWindow === null) createWindow()
});

////////////
// helper //
////////////

function sanitize(string) {
  // use sanitizer from https://github.com/lukesampson/scoop/blob/08af9ff6e7f7b017701c0c9114294b13e1e83fb8/lib/core.ps1#L187
  return string.replace(/[/\\?:*<>|]/, '');
}

/////////////////
// Scoop logic //
/////////////////

function scoopSpawn(argsArray, lineCallback, exitCallback) {
  let lineBuffer = '';

  const childProcess = spawn(
    `${process.env["windir"]}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    argsArray
  );

  childProcess.stdout.on('data', (data) => {
    mainWindow.webContents.send('console-log', data.toString());
    if (lineCallback) {
      lineBuffer += data;
      // flush when line is complete
      if (lineBuffer.includes('\r') || lineBuffer.includes('\n')) {
        lineBuffer.toString()
          .split(/\r?\n/)
          .forEach(lineCallback);
        // clear line
        lineBuffer = '';
      }
    }
  });

  childProcess.stderr.on('data', (data) => {
    mainWindow.webContents.send('console-log', data.toString());
    console.error('stderr: ' + data.toString());
  });

  childProcess.on('exit', (code) => {
    console.log('child process exited with code ' + code.toString());
    if (exitCallback) exitCallback(code);
  });
}

///////////////////
// IPC listeners //
///////////////////

ipc.on('scoop-list', (_event) => {
  const scoopListRegex = /^\s+([^\s]+)\s+([^\s]+)(\s+\[([^\s]+)])?$/;
  const eventId = getRandomId();

  mainWindow.webContents.send('scoop-list-started', eventId);

  console.log('scoop list');
  scoopSpawn(
    [
      scoopBinary,
      'list',
    ],
    (appRaw) => {
      // does this line contain app list information?
      const appArray = appRaw.match(scoopListRegex);
      if (appArray) {
        const appInfo = {
          name: appArray[1],
          version: appArray[2],
          bucket: appArray[4] ? appArray[4] : '(scoop)',
        };
        mainWindow.webContents.send('app-list-entry', appInfo);
      }
    },
    (code) => {
      mainWindow.webContents.send('scoop-list-finished', eventId, code === 0);
    })
}
);

ipc.on('scoop-status', (_event) => {
  const scoopStatusRegex = /^\s+([^\s]+):\s+([^\s]+)\s+->\s+([^\s]+)$/;
  const eventId = getRandomId();

  mainWindow.webContents.send('scoop-status-started', eventId);

  console.log('scoop status');
  scoopSpawn(
    [
      scoopBinary,
      'status',
    ],
    (appRaw) => {
      const appArray = appRaw.match(scoopStatusRegex);
      if (appArray) {
        const appInfo = {
          name: appArray[1],
          version: appArray[2],
          latest: appArray[3],
        };
        mainWindow.webContents.send('app-list-entry', appInfo);
      }
    },
    (code) => {
      mainWindow.webContents.send('scoop-status-finished', eventId, code === 0);
    });
});

ipc.on('scoop-bucket-list', (_event) => {
  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-bucket-list-started', eventId);

  // default bucket
  mainWindow.webContents.send('bucket-list-entry', 'scoop');

  console.log('scoop bucket list');
  scoopSpawn(
    [
      scoopBinary,
      'bucket',
      'list',
    ],
    (bucket) => {
      if (bucket.trim()) mainWindow.webContents.send('bucket-list-entry', bucket, bucket === favoriteBucket);
    },
    (code) => {
      mainWindow.webContents.send('scoop-bucket-list-finished', eventId, code === 0);
    });
});

ipc.on('scoop-update', (_event) => {
  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-update-started', eventId);

  console.log('scoop update');
  scoopSpawn(
    [
      scoopBinary,
      'update',
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-update-finished', eventId, code === 0);
      // refresh app list after scoop update
      ipc.emit('scoop-status');
    });
});

ipc.on('scoop-update-app', (_event, appName) => {
  appName = sanitize(appName);

  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-update-app-started', eventId, appName);

  console.log(`scoop update app ${appName}`);
  scoopSpawn(
    [
      scoopBinary,
      'update',
      appName,
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-update-app-finished', eventId, code === 0, appName);
      // refresh app list after scoop update
      ipc.emit('scoop-list');
      ipc.emit('scoop-status');
    });
});

ipc.on('scoop-update-all', (_event) => {
  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-update-all-started', eventId);

  console.log('scoop update all');
  scoopSpawn(
    [
      scoopBinary,
      'update',
      '*',
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-update-all-finished', eventId, code === 0);
      // refresh app list after scoop update
      ipc.emit('scoop-status');
    });
});


ipc.on('scoop-uninstall-app', (_event, appName) => {
  appName = sanitize(appName);

  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-uninstall-app-started', eventId, appName);

  console.log(`scoop uninstall app ${appName}`);
  scoopSpawn(
    [
      scoopBinary,
      'uninstall',
      appName,
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-uninstall-app-finished', eventId, code === 0, appName);
      if (code === 0) mainWindow.webContents.send('app-list-entry-remove', appName);
      // refresh app list after scoop update
      ipc.emit('scoop-status');
    });
});

ipc.on('scoop-checkver', (_event, bucket) => {
  bucket = sanitize(bucket);
  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-checkver-started', eventId, bucket);

  favoriteBucket = bucket;
  storage.set('favorite-bucket', { bucket: bucket }, (error) => {
    if (error) throw error;
    console.log(`saved bucket ${favoriteBucket} as favorite`);
  });

  console.log(`scoop checkver bucket ${bucket}`);
  scoopSpawn(
    [
      `${process.env["SCOOP"]}\\apps\\scoop\\current\\bin\\checkver.ps1`,
      '*',
      `${process.env["SCOOP"]}\\buckets\\${bucket}`,
      '-u',
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-checkver-finished', eventId, code === 0, bucket);
      // refresh app list after scoop update
      ipc.emit('scoop-status');
    });
});

////////////
// helper //
////////////

function getRandomId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
