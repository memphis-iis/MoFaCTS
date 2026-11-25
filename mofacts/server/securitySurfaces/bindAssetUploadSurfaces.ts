import type { DdpUploadRegistration } from 'meteor/ostrio:files';
import { FILES_DDP_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';

type Operation = keyof typeof FILES_DDP_VERIFICATIONS;
type Owner = { observeDdpUploadRegistration?: () => DdpUploadRegistration | null };
type ReadMethods = () => Readonly<Record<string, unknown>> | undefined;

const policy = Object.freeze({
  _Start: Object.freeze({ kind: 'authenticated-upload-start', authorization: 'asset-upload-eligibility' }),
  _Write: Object.freeze({ kind: 'pending-upload-owner', action: 'write-or-finish' }),
  _Abort: Object.freeze({ kind: 'pending-upload-owner', action: 'abort' }),
  _Remove: Object.freeze({ kind: 'client-removal-disabled' }),
} as const);

const operations = Object.keys(policy) as Operation[];
const egress = Object.freeze({
  _Start: 'owned-upload-metadata-or-status', _Write: 'owned-upload-metadata-or-status',
  _Abort: 'protocol-status', _Remove: 'none',
} as const);
let binding: (() => ReturnType<typeof observeAssetUploadSurfaces>) | undefined;
let duplicateBinding = false;

export function observeAssetUploadSurfaces(owner: Owner, readMethods: ReadMethods) {
  const observed = owner.observeDdpUploadRegistration?.();
  if (!observed || observed.collectionName !== 'Assets' || observed.allowClientCode !== false) {
    return { state: 'unavailable', reason: 'asset-package-configuration' } as const;
  }
  const methodMap = readMethods();
  const byOperation = new Map(observed.methods.map(method => [method.operation, method]));
  if (observed.methods.length !== operations.length || byOperation.size !== operations.length
    || new Set(observed.methods.map(method => method.name)).size !== operations.length
    || operations.some(operation => {
      const method = byOperation.get(operation);
      return !method || typeof method.handler !== 'function' || !methodMap
        || !Object.hasOwn(methodMap, method.name) || methodMap[method.name] !== method.handler;
    })) {
    return { state: 'unavailable', reason: 'asset-package-handler-mismatch' } as const;
  }
  return Object.freeze({
    state: 'observed',
    surfaces: Object.freeze(operations.map(operation => Object.freeze({
      owner: 'ostrio:files@3.0.1',
      dispatch: 'framework-owned',
      name: byOperation.get(operation)!.name,
      surfaceId: FILES_DDP_VERIFICATIONS[operation].surfaceId,
      verification: FILES_DDP_VERIFICATIONS[operation],
      policy: policy[operation],
      dataEgress: egress[operation],
    }))),
  } as const);
}

export function bindAssetUploadSurfaceOwner(owner: Owner, readMethods: ReadMethods): void {
  if (binding) duplicateBinding = true;
  else binding = () => observeAssetUploadSurfaces(owner, readMethods);
}

export function registeredAssetUploadSurfaces() {
  if (!binding || duplicateBinding) return { state: 'unavailable', reason: 'asset-package-owner-binding' } as const;
  return binding();
}
