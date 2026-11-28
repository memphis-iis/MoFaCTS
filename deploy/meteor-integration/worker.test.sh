#!/usr/bin/env bash
# Exercise the operator entry points with disposable jobs and a simulated engine.
set -euo pipefail
worker=$(realpath "$(dirname "$0")/worker.sh")
root=$(mktemp -d)
jobs=()
trap 'rm -rf -- "$root" "${jobs[@]}"' EXIT
mkdir "$root/bin"
export MOCK_ENGINE="$root/engine"
mkdir "$MOCK_ENGINE"
export PATH="$root/bin:$PATH"
cat > "$root/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
case "$1 $2" in
  'image inspect')
    case "$3" in
      mofacts-local/*)
        hash=${3##*:}
        [[ -f "$MOCK_ENGINE/$hash" ]] || exit 1
        if [[ "$*" == *Config.Labels* ]]; then echo "$hash"; else printf 'sha256:%064d\n' 1; fi ;;
      *) printf 'sha256:%064d\n' 1 ;;
    esac ;;
  'build --progress')
    while [[ "$1" != --tag ]]; do shift; done
    touch "$MOCK_ENGINE/${2##*:}"; echo build >> "$MOCK_ENGINE/builds" ;;
  'run --rm')
    case "$*" in
      *prepare-tests*)
        dir="$TMPDIR/mofacts-qualified-build-case"
        mkdir -p "$dir/test-context/mofacts/"{node_modules,.meteor/local,_build} "$dir/context"
        touch "$dir/context/retained"
        echo '{}' ;;
      *node\ -e*) echo "$TMPDIR/mofacts-qualified-build-case" ;;
    esac ;;
  'run --init') exit "${SETUP_EXIT:-0}" ;;
  'container inspect'|'network inspect'|'volume inspect') exit 1 ;;
  'start -a') exit "${SUITE_EXIT:-0}" ;;
  *) true ;;
esac
MOCK
# No host uid changes are needed for a simulated container.
printf '#!/bin/sh\nexit 0\n' > "$root/bin/chown"
cat > "$root/bin/df" <<'MOCK'
#!/usr/bin/env bash
if [[ "${LOW_C:-0}" == 1 && "${*: -1}" == /mnt/c ]]; then echo 2048; else /usr/bin/df "$@"; fi
MOCK
cat > "$root/bin/findmnt" <<'MOCK'
#!/usr/bin/env bash
if [[ "${BAD_C_SOURCE:-0}" == 1 ]]; then
  printf 'D:\\\n'
else
  # WSL can report the same mounted drive more than once. The worker must
  # normalize identical records without accepting a different drive.
  printf 'C:\\\nC:\\\n'
fi
MOCK
chmod +x "$root/bin/"*
git init -q "$root/source"
mkdir -p "$root/source/mofacts/.meteor"
for file in .meteor/{packages,release,versions} package{,-lock}.json; do echo fixture > "$root/source/mofacts/$file"; done
git -C "$root/source" add .
git -C "$root/source" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture
commit=$(git -C "$root/source" rev-parse HEAD)
new_job() {
  job=$(mktemp -d /var/tmp/mofacts-integration.XXXXXXXX)
  jobs+=("$job")
  (umask 022; git clone -q "$root/source" "$job/source")
  mkdir "$job/control"
  echo fixture > "$job/control/Dockerfile"
  echo "$commit" > "$job/owner"
  app="$job/tmp/mofacts-qualified-build-case/test-context/mofacts"
}
check_cleanup() {
  [[ -f "$app/../../context/retained" && -f "$job/results/capture.json" ]]
  [[ ! -e "$app/node_modules" && ! -e "$app/.meteor/local" && ! -e "$app/_build" ]]
  [[ "$(cat "$job/results/cleanup-status")" == complete ]]
}
new_job
status=0
SETUP_EXIT=37 bash "$worker" prepare "$job" "$commit" || status=$?
[[ "$status" == 37 && "$(cat "$job/results/prepare-exit-status")" == 37 ]]
check_cleanup
if grep -qi microsoft /proc/sys/kernel/osrelease; then
  new_job
  if LOW_C=1 bash "$worker" prepare "$job" "$commit"; then exit 1; fi
  [[ "$(cat "$job/results/prepare-c-free-bytes")" == 2048 && ! -e "$job/build" && ! -e "$job/invoked" ]]
  new_job
  if BAD_C_SOURCE=1 bash "$worker" prepare "$job" "$commit"; then exit 1; fi
  [[ ! -e "$job/build" && ! -e "$job/invoked" ]]
fi
for expected in 0 39; do
  new_job
  bash "$worker" prepare "$job" "$commit"
  [[ -d "$app/node_modules" && -f "$job/prepared" ]]
  status=0
  SUITE_EXIT="$expected" bash "$worker" run "$job" "$commit" --authorize-one-meteor-run || status=$?
  [[ "$status" == "$expected" && "$(cat "$job/results/lane-exit-status")" == "$expected" ]]
  check_cleanup
done
[[ "$(wc -l < "$MOCK_ENGINE/builds")" == 1 ]]
new_job
echo changed >> "$job/control/Dockerfile"
bash "$worker" prepare "$job" "$commit"
[[ "$(wc -l < "$MOCK_ENGINE/builds")" == 2 ]]
echo 'Worker lifecycle checks passed.'
