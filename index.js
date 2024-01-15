'use strict';

const ipc = window.api;

// HTML elements //

// buttons
const scoopButtons = {
  list: { element: document.querySelector('.scoop-list'), channel: 'scoop-list' },
  status: { element: document.querySelector('.scoop-status'), channel: 'scoop-status' },
  update: { element: document.querySelector('.scoop-update'), channel: 'scoop-update' },
  updateAll: { element: document.querySelector('.scoop-update-all'), channel: 'scoop-update-all' },
};

const modalButtons = {
  uninstall: { element: document.querySelector('#uninstall-modal .confirm'), channel: 'scoop-uninstall-app' },
  checkver: { element: document.querySelector('#bucket-selection-modal .confirm'), channel: 'scoop-checkver' },
};

const columnButtons = {
  update: { elementSelector: '#scoop-apps ["tabulator-field"="update"]', channel: 'scoop-update-app' },
};

// main table
const scoopAppListTableElement = document.querySelector('#scoop-apps');

// others
const scoopConsoleElement = document.querySelector('#console');

// global vars //

let appTable;
let scoopApps = [];

///////////
// logic //
///////////

// init //

document.addEventListener('DOMContentLoaded', (_event) => {
  // init table
  appTable = new Tabulator(scoopAppListTableElement, {
    reactiveData: true,
    data: scoopApps,
    index: 'name',
    columns: [
      {
        title: 'Name',
        field: 'name',
        sorter: 'string',
        width: 200
      },
      {
        title: 'Bucket',
        field: 'bucket',
        sorter: 'string',
        formatter: (cell) => /[^\\]*$/.exec(cell.getValue())[0],
        tooltip: (cell) => cell.getValue().includes('\\') ? cell.getValue() : false,
        headerFilter: 'list',
        headerFilterParams: { values: [] }
      },
      {
        title: 'Version',
        field: 'version',
        sorter: 'string',
        headerSort: false
      },
      {
        title: 'Latest',
        field: 'latest',
        sorter: 'string',
        headerSort: false
      },
      {
        title: 'Up to date',
        field: 'upToDate',
        formatter: 'tickCross',
        headerFilter: 'list',
        headerFilterParams: { values: { 'true': '✔', 'false': '❌' } }
      },
      {
        title: 'Update',
        field: 'updateAvailable',
        formatter: (cell) => cell.getValue() ? '<i class="fa fa-upload"></i>' : '',
        cellClick: (_uiEvent, cell) => cell.getValue() && ipc.send(columnButtons.update.channel, cell.getRow().getData().name)
      },
      {
        title: 'Uninstall',
        formatter: (_cell) => '<i class="fa fa-trash" data-bs-toggle="modal" data-bs-target="#uninstall-modal"></i>',
        cellClick: (_uiEvent, cell) => $('#uninstall-modal').data('app', cell.getRow().getData().name)
      }
    ],
  });
  appTable.on('tableBuilt', () => {
      // get apps and buckets
      ipc.send(scoopButtons.list.channel);
      ipc.send(scoopButtons.status.channel);
      ipc.send('scoop-bucket-list');
  });
});

// UI logic //

Object.values(scoopButtons).forEach(button => {
  button.element.addEventListener('click', () => ipc.send(button.channel, button.args));
  ipc.on(`${button.channel}-started`, (eventId) => buttonActionStarted(button, eventId));
  ipc.on(`${button.channel}-finished`, (eventId, success) => buttonActionFinished(button, eventId, success));
});

Object.values(modalButtons).forEach(button => {
  ipc.on(`${button.channel}-started`, (eventId) => buttonActionStarted(button, eventId));
  ipc.on(`${button.channel}-finished`, (eventId, success) => buttonActionFinished(button, eventId, success));
});
modalButtons.uninstall.element.addEventListener('click', () => ipc.send(modalButtons.uninstall.channel, $('#uninstall-modal').data('app')));
modalButtons.checkver.element.addEventListener('click', () => ipc.send(modalButtons.checkver.channel, $('#bucket-selection input:radio:checked').val()));

Object.values(columnButtons).forEach(button => {
  ipc.on(`${button.channel}-started`, (eventId) => buttonActionStarted(button, eventId));
  ipc.on(`${button.channel}-finished`, (eventId, success) => buttonActionFinished(button, eventId, success));
});


function buttonActionStarted(button, eventId) {
  console.log(`${button.channel} running...`);
  if (button.element) {
    $(button.element.querySelector('.wait')).collapse('show');
    $(button.element).addClass('disabled');
    $(button.element).removeClass('btn-warning');
    $(button.element).removeClass('btn-danger');
  }

  makeToast(eventId, `${button.channel} running...`, { autohide: false, progressBar: true })
}

function buttonActionFinished(button, eventId, success) {
  console.log(`${button.channel} finished.`);
  if (button.element) {
    $(button.element.querySelector('.wait')).collapse('hide');
    $(button.element).removeClass('disabled');
    if (!success) $(button.element).addClass('btn-danger');
  }

  if (eventId) $(`#toasts #toast-${eventId}`).toast('hide');
  if (success) {
    makeToast(null, `${button.channel} finished.`, { delay: 1500 })
  } else {
    makeToast(null, `${button.channel} failed!`, { autohide: false })
  }
}

function makeToast(eventId, body, options) {
  // show toast
  let newToast = $('#toasts .template').clone();
  newToast.removeClass('template');
  newToast.removeClass('d-none');
  newToast.find('.toast-body').text(body);
  if (eventId) newToast.attr('id', `toast-${eventId}`);
  if (options.progressBar) newToast.find('.progress').removeClass('d-none');
  newToast.appendTo('#toasts');

  newToast.on('hidden.bs.toast', () => newToast.remove());

  if (options) newToast.toast(options);
  newToast.toast('show');
}

// IPC logic //

ipc.on('app-list-entry', (newApp) => {
  // calculate update status
  if (newApp.latest === undefined) newApp.latest = '';
  newApp.upToDate = (newApp.latest === '' || newApp.version && newApp.version === newApp.latest);
  newApp.updateAvailable = (newApp.latest !== '' && newApp.version && newApp.version !== newApp.latest);

  const foundApp = scoopApps.find(app => (app.name === newApp.name));
  if (foundApp) {
    // merge existing objects (use assign instead of object spread so that Tabulator's auto-update can pick it up)
    Object.assign(foundApp, newApp)
  } else {
    scoopApps.push(newApp);
  }
});

ipc.on('app-list-entry-remove', (removedApp) => {
  const foundApp = scoopApps.find(app => (app.name === removedApp));
  if (foundApp) {
    scoopApps.splice(scoopApps.indexOf(foundApp), 1);
  } else {
    console.log(`removed app ${removedApp} not found`);
  }
});

ipc.on('bucket-list-entry', (bucket, favorite) => {
  const bucketColumn = appTable.getColumn('bucket');
  const filterValues = bucketColumn.getDefinition().headerFilterParams.values;
  if (!filterValues.includes(bucket)) {
    filterValues.push(bucket);
    filterValues.sort();
    bucketColumn.reloadHeaderFilter();

    // update checkver modal
    let newRadio = $('#bucket-selection-modal #bucket-selection .template').clone();
    newRadio.find('input').val(bucket);
    newRadio.find('label').append(bucket);
    newRadio.removeClass('d-none');
    newRadio.removeClass('template');

    if (favorite) newRadio.find('input').prop('checked', true);

    newRadio.appendTo($('#bucket-selection-modal #bucket-selection'));
  }
});

ipc.on('console-log', (line) => {
  scoopConsoleElement.value += line;
  // scroll to bottom
  scoopConsoleElement.scrollTop = scoopConsoleElement.scrollHeight;
});
