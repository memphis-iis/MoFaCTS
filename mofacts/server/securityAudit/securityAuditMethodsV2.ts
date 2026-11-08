import { Meteor } from 'meteor/meteor';
import { AuditReceiverRequestError, type createSecurityAuditReceiverV2 } from './securityAuditReceiverV2.ts';
import { AuditReportIdError } from '../../common/securityAudit/reportV2.ts';

type MethodContext = { userId?: string | null };
type Receiver = Pick<ReturnType<typeof createSecurityAuditReceiverV2>, 'list' | 'getSummary' | 'issueDownload'>;

// Reuse the existing three method IDs/admin policy at cutover. This factory is
// inert and never installs a second set of Meteor methods alongside V1.
export function createSecurityAuditV2Methods(receiver: Receiver) {
  async function request<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof AuditReceiverRequestError) throw new Meteor.Error(error.category, 'Security audit request was rejected');
      if (error instanceof AuditReportIdError) throw new Meteor.Error('invalid-report-id', 'Security audit report ID is invalid');
      throw error;
    }
  }
  return {
    'admin.securityAudits.list': async function(this: MethodContext) { return request(() => receiver.list(this.userId)); },
    'admin.securityAudits.get': async function(this: MethodContext, reportId: unknown) { return request(() => receiver.getSummary(this.userId, typeof reportId === 'string' ? reportId.trim() : reportId)); },
    'admin.securityAudits.downloadToken': async function(this: MethodContext, reportId: unknown, format: unknown) {
      return request(() => receiver.issueDownload(this.userId, typeof reportId === 'string' ? reportId.trim() : reportId, format));
    },
  };
}
