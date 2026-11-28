# Meteor email in MoFaCTS

This directory contains the server-only `email@3.2.1` source from
[Meteor 3.6.1](https://github.com/meteor/meteor/tree/eaf134973529396b660078b705b9fa50a4747fd5/packages/email).
MoFaCTS retains the upstream MIT license, package name, exports, type
declarations and tests.

Meteor compiles the email package against the Nodemailer file layout present
at build time. The local package pins Nodemailer 10.6.1 through `Npm.depends`
and uses Meteor's package-scoped `Npm.require` with Nodemailer's public
CommonJS entries. The email source uses the filenames declared in Nodemailer's
CommonJS subpath exports to resolve service data and the mail composer.
The Docker build checks the bundled version and exercises
message composition and the existing SMTP service lookup. It installs the
reviewed OpenPGP update separately.

The MoFaCTS release maintainer owns this package. On a Meteor upgrade, compare
the pinned upstream source and license with the target release. Remove the
local package once the upstream package ships a sufficiently patched
Nodemailer dependency. Verify Meteor integration, exact production bundle
startup, mail composition and the runtime image audit before switching sources.
Meteor generates the package's npm installation under `.npm/`.
