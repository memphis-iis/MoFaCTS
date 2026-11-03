"""Root-only Linux fixtures: real Bash/jq, synthetic commands and no live services."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def require(condition, message):
    if not condition:
        raise AssertionError(message)


require(os.geteuid() == 0, "Fixture requires root")
require(shutil.which("jq") is not None, "Fixture requires existing jq")
repository = Path(__file__).resolve().parents[5]
source = repository / "deploy/security-audit"
root = Path(tempfile.mkdtemp(prefix="mofacts-host-exposure-test-", dir="/root"))
root.chmod(0o700)
try:
    binary = root / "bin"
    binary.mkdir(mode=0o700)
    for name in ("host-listener-policy.awk", "host-firewall-policy.awk", "host-apache-policy.awk",
                 "host-sidecar-policy.jq", "host-mongo-roles.js"):
        shutil.copyfile(source / name, root / name)
        (root / name).chmod(0o644)
    shutil.copyfile(repository / "deploy/mongodb/read-default-concern-role.json", root / "read-default-concern-role.json")
    (root / "read-default-concern-role.json").chmod(0o644)
    script = (source / "host-exposure-audit.sh").read_text()
    constants = {
        "CONFIG_FILE": root / "config", "LISTENER_POLICY_FILE": root / "host-listener-policy.awk",
        "FIREWALL_POLICY_FILE": root / "host-firewall-policy.awk", "APACHE_POLICY_FILE": root / "host-apache-policy.awk",
        "SIDECAR_POLICY_FILE": root / "host-sidecar-policy.jq", "MONGO_ROLE_PROBE_FILE": root / "host-mongo-roles.js",
        "READ_CONCERN_ROLE_FILE": root / "read-default-concern-role.json", "RELEASE_RECEIPT_TOOL": root / "no-receipt",
    }
    lines = script.splitlines()
    for index, line in enumerate(lines):
        key = line.split("=", 1)[0]
        if key in constants:
            lines[index] = key + "=" + str(constants[key])
    (root / "audit.sh").write_text("\n".join(lines) + "\n")
    (root / "site.conf").write_text("<VirtualHost *:443>\nServerName staging2.optimallearning.org\n</VirtualHost>\n")
    command = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
r = Path(os.environ['FIXTURE_ROOT'])
s = json.loads((r / 'scenario').read_text())
a = sys.argv[1:]
name = Path(sys.argv[0]).name
def emit(value): print(value)
if name == 'ss':
    if s.get('ssError'): sys.exit(1)
    emit('tcp LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*')
    if s.get('listener'): emit(s['listener'])
elif name in ('ufw', 'apache2ctl', 'systemctl'):
    sys.exit(1)
elif name == 'docker':
    if a[:2] == ['container', 'ls']:
        if s.get('listError'): sys.exit(1)
        if 'listRaw' in s: emit(s['listRaw'])
        else:
            ids = s.get('ids', ['1' * 64])
            for value in ids: emit(value)
    elif a[:2] == ['container', 'inspect']:
        if s.get('inspectError'): sys.exit(1)
        items = s.get('records', [{'id':'1'*64,'service':'mofacts','imageTitle':None,'exposedPorts':None,'bindings':None,'networkPorts':None}])
        if 'inspectRaw' in s: emit(s['inspectRaw'])
        else:
            for item in items: emit(json.dumps(item))
    elif a[0] == 'inspect':
        fmt, container = a[2:4]
        if fmt == '{{.HostConfig.NetworkMode}}': emit('fixture-private')
        elif fmt == '{{.Image}}': emit('sha256:' + 'a'*64)
        elif container == 'app': emit('{"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"3000"}]}')
        else: emit('{}')
    elif a[0] == '--version': emit('Docker fixture')
    elif a[0] == 'exec':
        if '--file' in a:
            sys.stdin.read()
            if s.get('roleRaw') is not None: emit(s['roleRaw'])
            else:
                data = next(x.split('=',1)[1] for x in a if x.startswith('MOFACTS_AUDIT_MONGO_INPUT='))
                mode = json.loads(data)['sidecarExpectedState']
                result = {'state':'observed','appRolesExact':True,'readConcernRoleExact':True}
                result['sidecarUserAbsent' if mode == 'absent' else 'sidecarRolesExact'] = True
                result.update(s.get('roleOverrides', {}))
                emit(json.dumps(result))
            sys.exit(s.get('roleExit', 0))
        if 'mongosh' in a:
            if '--version' in a: emit('mongosh fixture')
            elif '--username' not in a: sys.exit(s.get('unauthExit', 1))
            else:
                user = a[a.index('--username') + 1]
                if user == 'reserved-helper':
                    (r / 'sidecar-auth-called').write_text('called')
                    sys.exit(s.get('sidecarAuthExit', 0))
                sys.exit(s.get('adminAuthExit' if user == 'observer' else 'appAuthExit', 0))
        elif 'redis-cli' in a:
            if '--version' in a: emit('redis-cli fixture')
            else: emit('PONG' if any(x.startswith('REDISCLI_AUTH=') for x in a) else 'NOAUTH Authentication required.')
        elif 'node' not in a: sys.exit(1)
    else: sys.exit(1)
else: sys.exit(1)
'''
    for name in ("docker", "ss", "ufw", "apache2ctl", "systemctl"):
        (binary / name).write_text(command)
        (binary / name).chmod(0o755)
    common = {
        "MOFACTS_APP_CONTAINER": "app", "MOFACTS_MONGO_CONTAINER": "mongo", "MOFACTS_REDIS_CONTAINER": "redis",
        "MOFACTS_MONGO_DB": "fixture", "MOFACTS_MONGO_REPLICA_SET": "fixture-rs",
        "MOFACTS_MONGO_ADMIN_USER": "observer", "MOFACTS_MONGO_ADMIN_PASSWORD": "synthetic-private-marker",
        "MOFACTS_MONGO_APP_USER": "app-user", "MOFACTS_MONGO_APP_PASSWORD": "synthetic-private-marker",
        "MOFACTS_MONGO_SIDECAR_USER": "reserved-helper", "MOFACTS_MONGO_APP_ROLE": "readWrite",
        "MOFACTS_SIDECAR_EXPECTED_STATE": "absent", "MOFACTS_REDIS_PASSWORD": "synthetic-private-marker",
        "MOFACTS_MANAGEMENT_CIDRS": "100.64.0.0/10,fd7a:115c:a1e0::/48",
        "MOFACTS_SSH_MANAGEMENT_INTERFACE": "tailscale0", "APACHE_HTTPS_SITE_FILE": str(root / "site.conf"),
        "MOFACTS_PUBLIC_HOSTNAME": "staging2.optimallearning.org",
    }
    count = 0

    def run(name, scenario=None, changes=None, expected_sidecar="PASS", expected_mongo="PASS", config_error=False, extra_expectations=None, prepare=None):
        global count
        config = {**common, **(changes or {})}
        (root / "config").write_text("".join(f"{key}='{value}'\n" for key, value in config.items() if value is not None))
        (root / "config").chmod(0o600)
        (root / "scenario").write_text(json.dumps(scenario or {}))
        (root / "sidecar-auth-called").unlink(missing_ok=True)
        if prepare:
            prepare()
        result = subprocess.run(["bash", str(root / "audit.sh")], text=True, capture_output=True, timeout=15,
                                env={**os.environ, "PATH": str(binary) + ":" + os.environ["PATH"],
                                     "FIXTURE_ROOT": str(root), "MOFACTS_SIDECAR_EXPECTED_STATE": "absent",
                                     "MOFACTS_MONGO_APP_USER": "ambient-app-user"})
        require(result.returncode == 0, name + ": shell failed")
        require("synthetic-private-marker" not in result.stdout + result.stderr, name + ": secret leaked")
        report = json.loads(result.stdout)
        controls = {item["controlId"]: item for item in report["controls"]}
        require(controls["internal.audit-config"]["status"] == ("ERROR" if config_error else "PASS"), name + ": config")
        if not config_error:
            require(controls["internal.sidecar-loopback"]["status"] == expected_sidecar, name + ": Sidecar " + controls["internal.sidecar-loopback"]["status"])
            mongo = controls["internal.mongodb-auth"]
            require(mongo["status"] == expected_mongo, name + ": Mongo " + mongo["status"])
            if config["MOFACTS_SIDECAR_EXPECTED_STATE"] == "absent":
                require(not (root / "sidecar-auth-called").exists(), name + ": absent helper authenticated")
                require("sidecarConnectivityProbeExit" not in mongo["evidence"].get("metrics", {}), name + ": fabricated connectivity")
            else:
                require((root / "sidecar-auth-called").exists(), name + ": configured helper skipped")
        for key, status in (extra_expectations or {}).items():
            require(controls[key]["status"] == status, name + ": " + key)
        count += 1

    run("absent")
    run("empty inventory", {"ids": [], "records": []})
    for socket in ("tcp LISTEN 0 10 127.0.0.1:8931 0.0.0.0:*", "udp UNCONN 0 0 127.0.0.1:8932 0.0.0.0:*", "tcp LISTEN 0 10 [::1]:8931 [::]:*"):
        run("helper listener", {"listener": socket}, expected_sidecar="FAIL")
    ordinary = {"id": "1" * 64, "service": None, "imageTitle": None, "exposedPorts": None, "bindings": None, "networkPorts": None}
    for fields in ({"service": "mongo-mcp"}, {"imageTitle": "mofacts-playwright-mcp"},
                   {"exposedPorts": {"8931/udp": {}}},
                   {"bindings": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8932"}]}}):
        run("stopped or remapped helper", {"records": [{**ordinary, **fields}]}, expected_sidecar="FAIL")
    for scenario in ({"listError": True}, {"inspectError": True}, {"records": []}, {"ids": ["1" * 64] * 2},
                     {"ids": [f"{index:064x}" for index in range(257)]}, {"records": [{**ordinary, "private": "synthetic-private-marker"}]},
                     {"listRaw": "1" * 64 + "\n" * 16707}, {"listRaw": "1" * 64 + "\u0000"},
                     {"inspectRaw": json.dumps(ordinary) + "\n" * 1048577}, {"inspectRaw": json.dumps(ordinary) + "\u0000"}):
        run("unavailable inventory", scenario, expected_sidecar="ERROR")
    run("socket failure", {"ssError": True}, expected_sidecar="ERROR")
    for field in ("appRolesExact", "readConcernRoleExact", "sidecarUserAbsent"):
        run("observed role violation", {"roleOverrides": {field: False}, "roleExit": 3}, expected_mongo="FAIL")
    valid_roles = json.dumps({"state": "observed", "appRolesExact": True, "readConcernRoleExact": True, "sidecarUserAbsent": True})
    for scenario in ({"roleRaw": "not-json", "roleExit": 70},
                     {"roleRaw": '{"state":"unavailable","reason":"query-failed"}', "roleExit": 70},
                     {"roleOverrides": {"sidecarUserAbsent": False}}, {"roleExit": 3},
                     {"roleRaw": "{}"}, {"roleRaw": "[]\n[]"}, {"roleRaw": "x" * 257},
                     {"roleRaw": valid_roles + "\n" * 257}, {"roleRaw": valid_roles + "\u0000"}):
        run("inconclusive role observation", scenario, expected_mongo="ERROR")
    run("observer timeout", {"roleExit": 124}, expected_mongo="ERROR")
    run("observer authentication failed", {"adminAuthExit": 1}, expected_mongo="ERROR")
    run("app authentication failed", {"appAuthExit": 1}, expected_mongo="ERROR")
    run("unauthenticated accepted", {"unauthExit": 0}, expected_mongo="FAIL")
    run("unauthenticated transport error", {"unauthExit": 2}, expected_mongo="ERROR")
    run("configured", changes={"MOFACTS_SIDECAR_EXPECTED_STATE": "configured", "MOFACTS_MONGO_SIDECAR_PASSWORD": "synthetic-private-marker", "MOFACTS_MONGO_SIDECAR_ROLE": "read"})
    run("configured authentication fails", {"sidecarAuthExit": 5}, changes={"MOFACTS_SIDECAR_EXPECTED_STATE": "configured", "MOFACTS_MONGO_SIDECAR_PASSWORD": "synthetic-private-marker", "MOFACTS_MONGO_SIDECAR_ROLE": "read"}, expected_mongo="ERROR")
    (root / "host-sidecar-policy.jq").chmod(0o666)
    run("unsafe container policy", expected_sidecar="ERROR")
    (root / "host-sidecar-policy.jq").chmod(0o644)
    (root / "read-default-concern-role.json").chmod(0o666)
    run("unsafe role definition", expected_mongo="ERROR")
    (root / "read-default-concern-role.json").chmod(0o644)
    for name, key in (("host-listener-policy.awk", "internal.listening-sockets"), ("host-firewall-policy.awk", "internal.firewall")):
        (root / name).chmod(0o666)
        run("unsafe executable policy", extra_expectations={key: "ERROR"})
        (root / name).chmod(0o644)
    (root / "host-apache-policy.awk").chmod(0o666)
    run("unsafe Apache policy", config_error=True)
    (root / "host-apache-policy.awk").chmod(0o644)
    probe = root / "host-mongo-roles.js"
    original = root / "probe-original"
    probe.rename(original)
    probe.symlink_to(original)
    run("symlink observer", expected_mongo="ERROR")
    probe.unlink()
    original.rename(probe)
    os.link(probe, original)
    run("hardlinked observer", expected_mongo="ERROR")
    original.unlink()
    root.chmod(0o770)
    run("writable ancestor", config_error=True)
    root.chmod(0o700)

    def symlink_config():
        (root / "config").rename(root / "config-real")
        (root / "config").symlink_to(root / "config-real")

    run("symlink protected configuration", config_error=True, prepare=symlink_config)
    (root / "config").unlink()
    (root / "config-real").rename(root / "config")
    for changes in ({"MOFACTS_SIDECAR_EXPECTED_STATE": None}, {"MOFACTS_SIDECAR_EXPECTED_STATE": "unknown"},
                    {"MOFACTS_MONGO_APP_USER": None},
                    {"MOFACTS_MONGO_SIDECAR_PASSWORD": "synthetic-private-marker"}, {"MOFACTS_MONGO_SIDECAR_ROLE": "read"},
                    {"MOFACTS_MONGO_SIDECAR_USER": "app-user"}):
        run("invalid explicit profile", changes=changes, config_error=True)
    print(f"Protected host exposure fixtures passed ({count} cases).")
finally:
    require(root.parent == Path("/root") and root.name.startswith("mofacts-host-exposure-test-"), "Unsafe fixture cleanup")
    shutil.rmtree(root)
