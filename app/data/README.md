# App Data

Target home for application-owned data boundaries.

Current status: architectural scaffold. Runtime data code still lives under `mofacts/server/`, `mofacts/common/`, and related Meteor paths.

Belongs here:

- Collections and schemas.
- Publications and server methods.
- Persistence-oriented logging.
- User history storage.
- Data migrations.

Does not belong here:

- Pure learning-model computation.
- Trial rendering or unit-engine behavior.
- TDF interpretation that can live in contributor-facing learning components.

Server methods should remain minimized: add them only for database access, authentication or authorization enforcement, secret handling, or external API calls that cannot safely run on the client.
