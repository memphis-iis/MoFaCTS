import { REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES } from './verificationCatalog.ts';

type Status = 'PASS' | 'FAIL' | 'ERROR';
type Execution = Readonly<{ verificationId: string; outcome: Status }>;
type Smoke = Readonly<{
  ordinaryLoginSmokePassed: boolean;
  resetSmokePassed: boolean;
  passwordlessSmokePassed: boolean;
}>;
type ControlResult = Readonly<{
  controlId: string;
  status: Status;
  evidence: Readonly<{
    summary: string;
    category?: 'evidence-incomplete';
    metrics?: Readonly<Record<string, number | boolean>>;
  }>;
}>;

export function evaluateReproducibleAuthenticationEvidence(
  executions: readonly Execution[], smoke: Smoke,
): readonly ControlResult[] {
  const byId = new Map<string, Status>();
  for (const execution of executions) {
    if (byId.has(execution.verificationId) || !['PASS', 'FAIL', 'ERROR'].includes(execution.outcome)) {
      throw new Error('Invalid reproducible authentication execution');
    }
    byId.set(execution.verificationId, execution.outcome);
  }
  return Object.entries(REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES).map(([controlId, requiredIds]) => {
    const outcomes = requiredIds.map(id => byId.get(id));
    if (outcomes.some(outcome => outcome === undefined || outcome === 'ERROR')) {
      return { controlId, status: 'ERROR' as const, evidence: { category: 'evidence-incomplete' as const,
        summary: 'Exact-revision deterministic authentication evidence is incomplete.' } };
    }
    const metrics = {
      requiredCaseCount: requiredIds.length,
      passedCaseCount: outcomes.filter(outcome => outcome === 'PASS').length,
      ...smoke,
    };
    const status: Status = outcomes.every(outcome => outcome === 'PASS') && Object.values(smoke).every(Boolean)
      ? 'PASS' : 'FAIL';
    return { controlId, status, evidence: { metrics,
      summary: status === 'PASS'
        ? 'Exact-revision Meteor cases and ordinary staging authentication smoke checks passed.'
        : 'A deterministic authentication case or ordinary staging smoke check failed.' } };
  });
}

export type DeploymentNetworkAttestation = Readonly<{
  cloudUnexpectedAllowRuleCount: number;
  hostUnexpectedAllowRuleCount: number;
  unexpectedListenerCount: number;
  unexpectedDockerPublicationCount: number;
  httpReachable: boolean;
  httpsReachable: boolean;
}>;

export function evaluateDeploymentNetworkAttestation(metrics: DeploymentNetworkAttestation): Status {
  return metrics.cloudUnexpectedAllowRuleCount === 0 && metrics.hostUnexpectedAllowRuleCount === 0
    && metrics.unexpectedListenerCount === 0 && metrics.unexpectedDockerPublicationCount === 0
    && metrics.httpReachable && metrics.httpsReachable ? 'PASS' : 'FAIL';
}

export type MongoDeploymentAttestation = Readonly<{
  disposableUnauthenticatedReadRejected: boolean;
  disposableAuthenticatedReadSucceeded: boolean;
  authEnabled: boolean;
  privateBinding: boolean;
  unexpectedDockerPublicationCount: number;
  authenticatedHealthPassed: boolean;
}>;

export function evaluateMongoDeploymentAttestation(metrics: MongoDeploymentAttestation): Status {
  return metrics.disposableUnauthenticatedReadRejected && metrics.disposableAuthenticatedReadSucceeded
    && metrics.authEnabled && metrics.privateBinding && metrics.unexpectedDockerPublicationCount === 0
    && metrics.authenticatedHealthPassed ? 'PASS' : 'FAIL';
}
