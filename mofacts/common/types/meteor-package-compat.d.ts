declare module 'meteor/alanning:roles' {
  export const Roles: any;
}

declare module 'meteor/ostrio:files' {
  export class FilesCollection {
    constructor(options: Record<string, unknown>);
  }
}
