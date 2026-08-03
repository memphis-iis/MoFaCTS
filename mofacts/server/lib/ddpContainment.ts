type MeteorServerWithOptions = {
  options: {
    disconnectGracePeriod?: number;
  };
};

export type Meteor35RuntimeMode = {
  changeStreamsEnabled: boolean;
  qualificationMode: boolean;
  reactivityOrder: 'polling' | 'changeStreams,polling';
  transport: 'sockjs';
};

export type Meteor35ContainmentIssue = {
  path: string;
  message: string;
};

export function inspectMeteor35RuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): { mode?: Meteor35RuntimeMode; issues: Meteor35ContainmentIssue[] } {
  const issues: Meteor35ContainmentIssue[] = [];
  const changeStreamsSetting = env.MOFACTS_CHANGE_STREAMS_ENABLED;
  const changeStreamsEnabled = changeStreamsSetting === 'true';
  const qualificationSetting = env.MOFACTS_CHANGE_STREAMS_QUALIFICATION;
  const qualificationMode = qualificationSetting === 'true';

  if (changeStreamsSetting && changeStreamsSetting !== 'true' && changeStreamsSetting !== 'false') {
    issues.push({
      path: 'MOFACTS_CHANGE_STREAMS_ENABLED',
      message: 'must be true, false, or unset',
    });
  }

  if (qualificationSetting && qualificationSetting !== 'true' && qualificationSetting !== 'false') {
    issues.push({
      path: 'MOFACTS_CHANGE_STREAMS_QUALIFICATION',
      message: 'must be true, false, or unset',
    });
  }

  if (qualificationMode && !changeStreamsEnabled) {
    issues.push({
      path: 'MOFACTS_CHANGE_STREAMS_ENABLED',
      message: 'must be true when Change Streams qualification is enabled',
    });
  }

  const expectedReactivityOrder = changeStreamsEnabled ? 'changeStreams,polling' : 'polling';
  if (env.METEOR_REACTIVITY_ORDER !== expectedReactivityOrder) {
    issues.push({
      path: 'METEOR_REACTIVITY_ORDER',
      message: changeStreamsEnabled
        ? 'must be changeStreams,polling when Change Streams are enabled'
        : 'must be polling unless Change Streams are explicitly enabled',
    });
  }
  if (env.DDP_TRANSPORT !== 'sockjs') {
    issues.push({
      path: 'DDP_TRANSPORT',
      message: 'must be sockjs for the Meteor 3.5 qualification boundary',
    });
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    mode: {
      changeStreamsEnabled,
      qualificationMode,
      reactivityOrder: expectedReactivityOrder,
      transport: 'sockjs',
    },
    issues,
  };
}

export function applyDdpContainment(
  meteorServer: MeteorServerWithOptions | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = inspectMeteor35RuntimeMode(env);
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
