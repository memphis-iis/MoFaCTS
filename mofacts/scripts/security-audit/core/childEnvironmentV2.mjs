const profiles = Object.freeze({
  'linux-tool': new Set(['PATH', 'HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'HTTP_PROXY', 'HTTPS_PROXY',
    'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_OPTIONS', 'CI']),
  'windows-browser': new Set(['PATH', 'SystemRoot', 'WINDIR', 'ProgramData', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP', 'NODE_OPTIONS']),
});

// Shared child-process environment boundary. Linux's existing repository/tool
// profile is unchanged; Windows browser acquisition explicitly selects only its
// OS/bootstrap locations. Neither profile accepts fixture/provider/signing data
// or Node injection/test-filter options. Do not pass a complete process.env.
export function auditToolEnvironmentV2(environment, profile = 'linux-tool') {
  const allowed = Object.hasOwn(profiles, profile) ? profiles[profile] : undefined;
  if (!allowed || !environment || typeof environment !== 'object' || Array.isArray(environment)
      || !Object.hasOwn(environment, 'PATH') || environment.NODE_OPTIONS !== ''
      || Object.entries(environment).some(([key, value]) => !allowed.has(key) || typeof value !== 'string' || value.includes('\0'))
      || profile === 'windows-browser' && (!environment.SystemRoot || !environment.USERPROFILE)) {
    throw new Error('Invalid audit child environment');
  }
  return Object.freeze({ ...environment });
}
