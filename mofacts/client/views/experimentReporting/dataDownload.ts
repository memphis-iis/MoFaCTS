import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import './dataDownload.html';
import { ReactiveVar } from 'meteor/reactive-var';
import { clientConsole } from '../..';

const MeteorCompat = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

Template.dataDownload.onCreated(function(this: any) {
  this.accessableFiles = new ReactiveVar([]);
  this.isLoading = new ReactiveVar(true);
  this.subscriptions = [];
  this.autoruns = [];
});

function getConditionRefs(tdf: any): string[] {
  const raw = tdf?.content?.tdfs?.tutor?.setspec?.condition;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry: any) => String(entry || '').trim())
    .filter((entry: string) => entry.length > 0);
}

Template.dataDownload.onRendered(async function(this: any) {
  const instance = this;

  try {
    const accessableFilesResult = await MeteorCompat.callAsync('getAccessableTDFSForUser', Meteor.userId());

    const accessableFiles = (accessableFilesResult as any[])?.map(function(tdf: any) {
      const name = tdf.content?.tdfs?.tutor?.setspec?.lessonname || 'NO NAME';
      tdf.disp = name;
      const conditionRefs = getConditionRefs(tdf);
      tdf.hasConditionChildren = conditionRefs.length > 0;
      tdf.conditionCount = conditionRefs.length;
      return tdf;
    }) || [];
    instance.accessableFiles.set(accessableFiles);
  } catch (err) {
    clientConsole(1, '[DataDownload] Failed to load data:', err);
    instance.accessableFiles.set([]);
  } finally {
    instance.isLoading.set(false);
  }
});

Template.dataDownload.onDestroyed(function(this: any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: any) => ar.stop());

  // Clean up subscriptions
  this.subscriptions.forEach((sub: any) => sub.stop());
});

Template.dataDownload.helpers({
  'isLoading': function() {
    return (Template.instance() as any).isLoading.get();
  },
  'dataDownloads': function() {
    const instance = Template.instance() as any;
    const accessableFiles = instance.accessableFiles.get();
    if (!accessableFiles || accessableFiles.length === 0) {
      return [];
    }
    return accessableFiles;
  },
  'accessableFiles': function() {
    return (Template.instance() as any).accessableFiles.get();
  },
});

Template.dataDownload.events({
  'click .data-download-link': function(event: any) {
    event.preventDefault();
    const fileName = event.currentTarget.getAttribute('data-fileName');
    const fileId = event.currentTarget.getAttribute('data-fileId');
    if (fileName) {
      makeDataDownloadMethodCall('downloadDataByFile', fileName);
    } else {
      makeDataDownloadMethodCall('downloadDataById', fileId);
    }
  },
  'click .root-omnibus-download-link': function(event: any) {
    event.preventDefault();
    const fileName = event.currentTarget.getAttribute('data-fileName');
    if (!fileName) {
      return;
    }
    makeDataDownloadMethodCall('downloadDataByFile', fileName);
  },

  'click #userDataDownloadLink': function(event: any) {
    event.preventDefault();
    makeDataDownloadMethodCall('downloadDataByTeacher', Meteor.userId());
  },
});

async function makeDataDownloadMethodCall(methodName: string, ...args: any[]): Promise<void> {
  try {
    const response = await MeteorCompat.callAsync(methodName, ...args);
    createData(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    clientConsole(1, '[DataDownload] Download failed:', message);
  }
}

function createData(result: any): void {
  const blob = new Blob([result.content], {type : result.contentType});
  let  a = document.createElement("a");
  document.body.appendChild(a);
  a.style = "display: none";
  const url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = result.fileName;
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}






