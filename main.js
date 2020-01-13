// require //
const {app, BrowserWindow} = require('electron');
const ipc = require('electron').ipcMain;

const storage = require('electron-json-storage');

const path = require('path');

const {spawn} = require('child_process');

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
      preload: path.join(__dirname, 'preload.js')
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
    console.log(`restored favorite bucket ${favoriteBucket}`);
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', app.quit);

app.on('activate', () => {
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
    mainWindow.webContents.send('console-log', data);
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
    mainWindow.webContents.send('console-log', data);
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

ipc.on('scoop-list', (event) => {
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
          const app = {
            name: appArray[1],
            version: appArray[2],
            bucket: appArray[4] ? appArray[4] : '(scoop)'
          };
          mainWindow.webContents.send('app-list-entry', app);
        }
      },
      (code) => {
        mainWindow.webContents.send('scoop-list-finished', eventId, code === 0);
      })
  }
);

ipc.on('scoop-status', (event) => {
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
        const app = {
          name: appArray[1],
          version: appArray[2],
          latest: appArray[3],
          upToDate: false // update available
        };
        mainWindow.webContents.send('app-list-entry', app);
      }
    },
    (code) => {
      mainWindow.webContents.send('scoop-status-finished', eventId, code === 0);
    });
});

ipc.on('scoop-bucket-list', (event) => {
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

ipc.on('scoop-update', (event) => {
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

ipc.on('scoop-update-app', (event, app) => {
  app = sanitize(app);

  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-update-app-started', eventId, app);

  console.log(`scoop update app ${app}`);
  scoopSpawn(
    [
      scoopBinary,
      'update',
      app,
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-update-app-finished', eventId, code === 0, app);
      // refresh app list after scoop update
      ipc.emit('scoop-status');
    });
});

ipc.on('scoop-update-all', (event) => {
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


ipc.on('scoop-uninstall-app', (event, app) => {
  app = sanitize(app);

  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-uninstall-app-started', eventId, app);

  console.log(`scoop uninstall app ${app}`);
  scoopSpawn(
    [
      scoopBinary,
      'uninstall',
      app,
    ],
    null,
    (code) => {
      mainWindow.webContents.send('scoop-uninstall-app-finished', eventId, code === 0, app);
      if (code === 0) mainWindow.webContents.send('app-list-entry-remove', app);
      // refresh app list after scoop update
      ipc.emit('scoop-status');
    });
});

ipc.on('scoop-checkver', (event, bucket) => {
  bucket = sanitize(bucket);
  const eventId = getRandomId();
  mainWindow.webContents.send('scoop-checkver-started', eventId, bucket);

  favoriteBucket = bucket;
  storage.set('favorite-bucket', {bucket: bucket}, (error) => {
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
