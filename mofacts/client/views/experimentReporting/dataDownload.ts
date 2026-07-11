import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import './dataDownload.html';
import '../shared/adminUi/adminUi';
import { ReactiveVar } from 'meteor/reactive-var';
import { clientConsole } from '../..';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import {
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from '../../lib/adminUi/loadableState';
import { createTemplateLifetime, type TemplateLifetime } from '../../lib/adminUi/templateLifetime';
import {
  createAsyncCommandController,
  type AsyncCommandController,
  type AsyncCommandState,
} from '../../lib/adminUi/asyncCommandState';
import { normalizeDataDownloadRows, type DataDownloadRow } from './dataDownloadState';

const MeteorCompat = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

type DownloadMessage = Readonly<{
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
}>;

type DataDownloadInstance = Blaze.TemplateInstance & {
  filesPresentation: ReactiveVar<LoadableState<DataDownloadRow[]>>;
  downloadMessage: ReactiveVar<DownloadMessage | null>;
  downloadCommandState: ReactiveVar<AsyncCommandState<void>>;
  downloadCommand: AsyncCommandController<void>;
  filesLifetime: TemplateLifetime;
  nextFilesRequestId: number;
};

function reportingText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readyLoadValue<T>(state: LoadableState<T>): T | null {
  return state.status === 'ready' || state.status === 'empty' || state.status === 'refreshing' || state.status === 'refresh-error'
    ? state.value
    : null;
}

function loadErrorMessage<T>(state: LoadableState<T>): string {
  return state.status === 'error' || state.status === 'refresh-error' ? state.message : '';
}

function loadPending<T>(state: LoadableState<T>): boolean {
  return state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing';
}

function rowAccessibleName(row: DataDownloadRow): string {
  return String(row?.disp || row?.content?.fileName || row?._id || '').trim();
}

function setDownloadMessage(instance: DataDownloadInstance, text: string | null, level: DownloadMessage['level'] = 'info'): void {
  instance.downloadMessage.set(text ? { text, level } : null);
}

function loadDownloadableFiles(instance: DataDownloadInstance): void {
  const requestId = ++instance.nextFilesRequestId;
  const generation = instance.filesLifetime.begin();
  instance.filesPresentation.set(startLoad(instance.filesPresentation.get(), requestId));

  MeteorCompat.callAsync('getAccessableTDFSForUser', Meteor.userId())
    .then((result) => {
      if (!instance.filesLifetime.isCurrent(generation)) return;
      const rows = normalizeDataDownloadRows(result);
      instance.filesPresentation.set(resolveLoad(
        instance.filesPresentation.get(),
        requestId,
        rows,
        (value) => value.length === 0,
      ));
    })
    .catch((error) => {
      if (!instance.filesLifetime.isCurrent(generation)) return;
      clientConsole(1, '[DataDownload] Failed to load data:', error);
      instance.filesPresentation.set(rejectLoad(
        instance.filesPresentation.get(),
        requestId,
        { message: reportingText('reporting.couldNotLoadDownloadableData'), retryable: true },
      ));
    });
}

Template.dataDownload.onCreated(function(this: DataDownloadInstance) {
  this.filesPresentation = new ReactiveVar<LoadableState<DataDownloadRow[]>>({ status: 'idle' });
  this.downloadMessage = new ReactiveVar<DownloadMessage | null>(null);
  this.downloadCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
  this.downloadCommand = createAsyncCommandController((state) => this.downloadCommandState.set(state));
  this.filesLifetime = createTemplateLifetime();
  this.nextFilesRequestId = 0;
  loadDownloadableFiles(this);
});

Template.dataDownload.onDestroyed(function(this: DataDownloadInstance) {
  this.filesLifetime.destroy();
  this.downloadCommand.destroy();
});

Template.dataDownload.helpers({
  isLoading(): boolean {
    return loadPending((Template.instance() as DataDownloadInstance).filesPresentation.get());
  },
  loadErrorText(): string {
    return loadErrorMessage((Template.instance() as DataDownloadInstance).filesPresentation.get());
  },
  downloadFilesTableLabel(): string {
    return reportingText('reporting.dataFromOwnedTdfs');
  },
  downloadFilesTableData() {
    const instance = Template.instance() as DataDownloadInstance;
    const filesPresentation = instance.filesPresentation.get();
    return {
      rows: readyLoadValue(filesPresentation) || [],
      isLoading: loadPending(filesPresentation),
      loadErrorText: loadErrorMessage(filesPresentation),
      downloadBusy: instance.downloadCommandState.get().status === 'pending',
    };
  },
  downloadMessage(): DownloadMessage | null {
    return (Template.instance() as DataDownloadInstance).downloadMessage.get();
  },
  downloadMessageUrgent(): boolean {
    return (Template.instance() as DataDownloadInstance).downloadMessage.get()?.level === 'error';
  },
  downloadBusy(): boolean {
    return (Template.instance() as DataDownloadInstance).downloadCommandState.get().status === 'pending';
  },
  reportingText(key: Parameters<typeof translatePlatformString>[1], options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return reportingText(key, options?.hash);
  },
});

Template.dataDownloadFilesTable.helpers({
  reportingText(key: Parameters<typeof translatePlatformString>[1], options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return reportingText(key, options?.hash);
  },
  downloadFileAriaLabel(row: DataDownloadRow): string {
    const target = rowAccessibleName(row);
    const action = reportingText('reporting.downloadDataFile');
    return target ? `${action}: ${target}` : action;
  },
  rootOmnibusAriaLabel(row: DataDownloadRow): string {
    const target = rowAccessibleName(row);
    const action = reportingText('reporting.downloadRootOmnibus');
    return target ? `${action}: ${target}` : action;
  },
});

Template.dataDownload.events({
  'click [data-download-load-retry]'(event: Event, instance: DataDownloadInstance) {
    event.preventDefault();
    loadDownloadableFiles(instance);
  },
  'click .data-download-link'(event: any, instance: DataDownloadInstance) {
    event.preventDefault();
    const fileName = event.currentTarget.getAttribute('data-fileName');
    const fileId = event.currentTarget.getAttribute('data-fileId');
    if (fileName) {
      makeDataDownloadMethodCall(instance, 'downloadDataByFile', fileName);
    } else {
      makeDataDownloadMethodCall(instance, 'downloadDataById', fileId);
    }
  },
  'click .root-omnibus-download-link'(event: any, instance: DataDownloadInstance) {
    event.preventDefault();
    const fileName = event.currentTarget.getAttribute('data-fileName');
    if (!fileName) {
      return;
    }
    makeDataDownloadMethodCall(instance, 'downloadDataByFile', fileName);
  },
  'click #userDataDownloadLink'(event: any, instance: DataDownloadInstance) {
    event.preventDefault();
    makeDataDownloadMethodCall(instance, 'downloadDataByTeacher', Meteor.userId());
  },
  'click #ownHistoryDownloadButton'(event: any, instance: DataDownloadInstance) {
    event.preventDefault();
    makeDataDownloadMethodCall(instance, 'downloadOwnHistoryAcrossTdfs');
  },
});

function makeDataDownloadMethodCall(instance: DataDownloadInstance, methodName: string, ...args: any[]): void {
  setDownloadMessage(instance, reportingText('reporting.preparingDownload'), 'info');
  void instance.downloadCommand.run(async () => {
    const response = await MeteorCompat.callAsync(methodName, ...args);
    if (response?.downloadUrl) {
      startDownloadFromUrl(response.downloadUrl);
    } else {
      createData(response);
    }
  }, {
    getErrorMessage: (error) => reportingText('reporting.downloadFailed', { error: errorMessage(error) }),
    onSuccess: () => {
      setDownloadMessage(instance, reportingText('reporting.downloadStarted'), 'success');
    },
    onFailure: (error) => {
      const message = errorMessage(error);
      clientConsole(1, '[DataDownload] Download failed:', message);
      setDownloadMessage(instance, reportingText('reporting.downloadFailed', { error: message }), 'error');
    },
  });
}

function startDownloadFromUrl(url: string): void {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  a.href = url;
  a.click();
  document.body.removeChild(a);
}

function encodeUtf16Le(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(2 + str.length * 2);
  const view = new DataView(buf);
  view.setUint8(0, 0xFF);
  view.setUint8(1, 0xFE);
  for (let i = 0; i < str.length; i++) {
    view.setUint16(2 + i * 2, str.charCodeAt(i), true);
  }
  return buf;
}

function createData(result: any): void {
  let blobData: ArrayBuffer | string = result.content;
  let mimeType: string = result.contentType;
  if (result.contentType === 'text/tab-separated-values') {
    blobData = encodeUtf16Le(result.content);
    mimeType = 'text/tab-separated-values; charset=utf-16le';
  }
  const blob = new Blob([blobData], { type: mimeType });
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  const url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = result.fileName;
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
