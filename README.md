# Scoop UI

My take on an Electron-based UI for the [Scoop package manager](https://scoop.sh/).

> _Beware:_ This is an early stage version. The base functions are functional but it requires a few UI tweaks and improvements.

## How to use

You will need to have Scoop installed. Then the app behaves just as any other Electron application.

### Installation

    npm install

In case you are behind a proxy, do not forget to set the following environment variables for the Electron download:

    "ELECTRON_GET_USE_PROXY": "true"
    "GLOBAL_AGENT_HTTP_PROXY": "http://host:port"

### Direct run

    npm run start

For development purposes, the `start-dev` script will start with the [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools/) open.

### Build

    npm run dist

You will find the Windows x64 binary `.exe` in the `out` folder.

## License

[CC0 1.0 (Public Domain)](LICENSE)
