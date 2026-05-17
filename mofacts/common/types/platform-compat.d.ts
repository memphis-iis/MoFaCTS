declare module 'meteor/ostrio:flow-router-extra' {
  export interface FlowRouterCurrent {
    path?: string;
    queryParams?: Record<string, string | undefined>;
    route?: { name?: string };
    [key: string]: unknown;
  }
  export const FlowRouter: {
    go(path: string, params?: Record<string, unknown>, queryParams?: Record<string, unknown>): void;
    current(): FlowRouterCurrent | undefined;
    getParam?(name: string): string | undefined;
    getQueryParam?(name: string): string | undefined;
    [key: string]: unknown;
  };
}

declare var Tdfs: any;
declare var Assignments: any;
declare var Courses: any;
declare var GlobalExperimentStates: any;
declare var Histories: any;
declare var Items: any;
declare var Stims: any;
declare var itemSourceSentences: any;
declare var Sections: any;
declare var SectionUserMap: any;
declare var UserTimesLog: any;
declare var UserMetrics: any;
declare var DynamicSettings: any;
declare var ScheduledTurkMessages: any;
declare var ClozeEditHistory: any;
declare var ErrorReports: any;
declare var DynamicConfig: any;
declare var PasswordResetTokens: any;
declare var AuditLog: any;
declare var UserDashboardCache: any;
declare var UserUploadQuota: any;
declare var ManualContentDrafts: any;
declare var H5PContents: any;
declare var DynamicAssets: any;
declare var JSONEditor: any;
declare var bootstrap: any;
