# MoFaCTS (svelte-app)

MoFaCTS is a Meteor.js-driven, responsive implementation of the FaCT System designed for use by mobile participants.

## Canonical Documentation

Most long-form documentation is maintained in the GitHub wiki. Keep repo docs minimal to reduce drift.

- Wiki: https://github.com/memphis-iis/mofacts/wiki
- Developer doc routing: https://github.com/memphis-iis/mofacts/wiki/Developer-Documentation-Map
- Local development setup: https://github.com/memphis-iis/mofacts/wiki/Local-Install
- Production deployment runbook: https://github.com/memphis-iis/mofacts/wiki/Remote-Install
- Runtime configuration schema: https://github.com/memphis-iis/mofacts/wiki/Settings-json-Reference
- Troubleshooting: https://github.com/memphis-iis/mofacts/wiki/Troubleshooting
- Learning algorithms reference: https://github.com/memphis-iis/mofacts/wiki/Learning-Algorithms-Reference

## Repo Layout

- `mofacts/` is the Meteor app root (`client`, `common`, `server`, `packages`, `public`).
- `mofacts/.deploy/` holds deployment assets.
- `docs/` and `mofacts/docs/` contain planning and implementation reference docs that are not canonical.
- `scripts/` and `mofacts/scripts/` hold helper utilities.

## Version Requirements

See `SUPPORT.md` for supported runtime and tooling policy plus required CI checks.
Use the wiki Local Install guide for setup workflow details.

## Notes

- The active app lives at `C:\dev\mofacts\svelte-app\mofacts`.
