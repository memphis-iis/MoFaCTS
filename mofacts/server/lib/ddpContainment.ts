type MeteorServerWithOptions = {
  options: {
    disconnectGracePeriod?: number;
  };
};

export type MeteorRuntimeMode = {
  qualificationMode: boolean;
  reactivityOrder: 'changeStreams';
  transport: 'sockjs';
};

export type MeteorContainmentIssue = {
  path: string;
  message: string;
};

export function inspectMeteorRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): { mode?: MeteorRuntimeMode; issues: MeteorContainmentIssue[] } {
  const issues: MeteorContainmentIssue[] = [];
  const qualificationSetting = env.MOFACTS_CHANGE_STREAMS_QUALIFICATION;
  const qualificationMode = qualificationSetting === 'true';

  if (env.MOFACTS_CHANGE_STREAMS_ENABLED !== undefined) {
    issues.push({
      path: 'MOFACTS_CHANGE_STREAMS_ENABLED',
      message: 'is obsolete; Change Streams are required for every MoFaCTS process',
    });
  }

  if (qualificationSetting && qualificationSetting !== 'true' && qualificationSetting !== 'false') {
    issues.push({
      path: 'MOFACTS_CHANGE_STREAMS_QUALIFICATION',
      message: 'must be true, false, or unset',
    });
  }

  if (env.METEOR_REACTIVITY_ORDER !== 'changeStreams') {
    issues.push({
      path: 'METEOR_REACTIVITY_ORDER',
      message: 'must be changeStreams; polling and all alternate drivers are prohibited',
    });
  }
  if (env.DDP_TRANSPORT !== 'sockjs') {
    issues.push({
      path: 'DDP_TRANSPORT',
      message: 'must be sockjs for the supported Meteor qualification boundary',
    });
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    mode: {
      qualificationMode,
      reactivityOrder: 'changeStreams',
      transport: 'sockjs',
    },
    issues,
  };
}

export function applyDdpContainment(
  meteorServer: MeteorServerWithOptions | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = inspectMeteorRuntimeMode(env);
  if (!result.mode) {
    throw new Error(result.issues.map((issue) => `${issue.path} ${issue.message}`).join('; '));
  }
  if (!meteorServer?.options) {
    throw new Error('Meteor.server.options is unavailable; disconnect containment cannot be applied');
  }

  meteorServer.options.disconnectGracePeriod = 0;
  if (meteorServer.options.disconnectGracePeriod !== 0) {
    throw new Error('Meteor disconnectGracePeriod containment was not applied');
  }

  return result.mode;
}
