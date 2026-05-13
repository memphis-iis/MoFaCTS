# The tag here should match the Meteor version of your app, per .meteor/release
FROM geoffreybooth/meteor-base:3.4.1 AS meteor_builder
ENV METEOR_ALLOW_SUPERUSER=1

# Use the repo-owned deploy scripts so .deploy is the only source of truth.
COPY ./mofacts/.deploy/docker/ $SCRIPTS_FOLDER/
RUN sed -i 's/\r$//' $SCRIPTS_FOLDER/*.sh && \
    chmod +x $SCRIPTS_FOLDER/*.sh

# Function: copy application source into container build context.
COPY ./mofacts/ $APP_SOURCE_FOLDER/

# Function: clear Meteor cache so the image build compiles from a clean state.
RUN echo "[Function] Clean Meteor local cache" && \
    rm -rf $APP_SOURCE_FOLDER/.meteor/local

# Function: install app npm dependencies used by Meteor build.
# Keep `meteor update --npm` in this same layer for Meteor-Rspack compatibility.
RUN cd $APP_SOURCE_FOLDER && \
    echo "[Function] Install app dependencies" && \
    (METEOR_ALLOW_SUPERUSER=1 meteor update --npm 2>/dev/null || true) && \
    METEOR_ALLOW_SUPERUSER=1 meteor npm ci

# Function: expose Meteor bundled node binary on PATH for Rspack child processes.
RUN NODE_BIN="$(find /root/.meteor/packages/meteor-tool -type f -path '*/dev_bundle/bin/node' | head -n 1)" && \
    echo "[Function] Link Meteor node binary for /usr/bin/env node" && \
    test -n "$NODE_BIN" && \
    ln -sf "$NODE_BIN" /usr/local/bin/node

# Function: build Meteor server bundle with retries and focused diagnostics.
# Build uses --allow-incompatible-update for Meteor 3.x migration compatibility.
RUN cd $APP_SOURCE_FOLDER && \
    mkdir -p $APP_BUNDLE_FOLDER && \
    BUILD_LOG=/tmp/meteor-build.log && \
    for i in 1 2 3; do \
      echo "Meteor build attempt $i"; \
      if NODE_PATH=$APP_SOURCE_FOLDER/node_modules:/root/.meteor/packages/node_modules \
        TOOL_NODE_FLAGS=--max-old-space-size=8000 \
        meteor build --allow-incompatible-update --allow-superuser --directory $APP_BUNDLE_FOLDER --server-only \
        >"$BUILD_LOG" 2>&1; then \
        echo "Meteor build succeeded on attempt $i"; \
        grep -aniE "warn(ing)?" "$BUILD_LOG" | tail -n 100 || true; \
        exit 0; \
      fi; \
      echo "Meteor build failed on attempt $i. Key diagnostics:" >&2; \
      grep -aniE "error|failed|exception|syntaxerror|errors prevented|cannot find module|warn(ing)?" "$BUILD_LOG" | tail -n 200 >&2 || true; \
      echo "Last 120 lines from full build log:" >&2; \
      tail -n 120 "$BUILD_LOG" >&2 || true; \
      echo "Meteor build failed; retrying in 10s..." >&2; \
      sleep 10; \
    done; \
    echo "Meteor build failed after 3 attempts" >&2; \
    exit 1


# Use the specific version of Node expected by your Meteor release, per https://docs.meteor.com/history; this is expected for Meteor 3.4
FROM node:26.1.0-alpine AS bundle_deps_builder

ENV APP_BUNDLE_FOLDER /opt/bundle
ENV SCRIPTS_FOLDER /docker
ARG ALPINE_PRIMARY_MIRROR=https://dl-cdn.alpinelinux.org/alpine
ARG ALPINE_FALLBACK_MIRROR=https://dl-2.alpinelinux.org/alpine

# Function: install OS build dependencies for native module compilation.
# These stay in this intermediate image and are excluded from final runtime image.
RUN set -eux; \
    ALPINE_BRANCH="v$(cut -d. -f1,2 /etc/alpine-release)"; \
    install_with_mirror() { \
      mirror="$1"; \
      printf '%s\n' \
        "${mirror}/${ALPINE_BRANCH}/main" \
        "${mirror}/${ALPINE_BRANCH}/community" > /etc/apk/repositories; \
      apk update && apk add --no-cache bash g++ make python3; \
    }; \
    install_with_mirror "$ALPINE_PRIMARY_MIRROR" || install_with_mirror "$ALPINE_FALLBACK_MIRROR"

# Function: copy startup scripts from Meteor builder stage.
COPY --from=meteor_builder $SCRIPTS_FOLDER $SCRIPTS_FOLDER/

# Function: copy compiled app bundle from Meteor builder stage.
COPY --from=meteor_builder $APP_BUNDLE_FOLDER/bundle $APP_BUNDLE_FOLDER/bundle/

# Function: pin vulnerable transitive packages before dependency install.
RUN cd $APP_BUNDLE_FOLDER/bundle/programs/server && \
    echo "[Function] Pin transitive dependency overrides" && \
    npm pkg set "dependencies.@mapbox/node-pre-gyp=2.0.3" && \
    npm pkg set "dependencies.node-gyp=12.2.0" && \
    npm pkg set "dependencies.underscore=1.13.8"

# Function: install server npm deps and run high-severity npm audit.
# Do not force native modules to rebuild from source here; packages like argon2
# can use prebuilt binaries, while source rebuilds make the image build depend
# on external Node header downloads.
RUN bash $SCRIPTS_FOLDER/build-meteor-npm-dependencies.sh && \
    echo "[Function] Install bundle npm dependencies and audit" && \
    cd $APP_BUNDLE_FOLDER/bundle/programs/server && \
    npm audit --audit-level=high


# Start another Docker stage, so that the final image doesn't contain the layer with the build dependencies
# See previous FROM line; this must match
FROM node:26.1.0-alpine AS runtime

ENV APP_BUNDLE_FOLDER /opt/bundle
ENV SCRIPTS_FOLDER /docker
ARG ALPINE_PRIMARY_MIRROR=https://dl-cdn.alpinelinux.org/alpine
ARG ALPINE_FALLBACK_MIRROR=https://dl-2.alpinelinux.org/alpine

# Function: install runtime OS dependencies only.
RUN set -eux; \
    ALPINE_BRANCH="v$(cut -d. -f1,2 /etc/alpine-release)"; \
    install_with_mirror() { \
      mirror="$1"; \
      printf '%s\n' \
        "${mirror}/${ALPINE_BRANCH}/main" \
        "${mirror}/${ALPINE_BRANCH}/community" > /etc/apk/repositories; \
      apk update && apk add --no-cache bash ca-certificates font-dejavu imagemagick; \
    }; \
    install_with_mirror "$ALPINE_PRIMARY_MIRROR" || install_with_mirror "$ALPINE_FALLBACK_MIRROR"

# Function: copy startup scripts and fully-built bundle from dependency builder stage.
COPY --from=bundle_deps_builder $SCRIPTS_FOLDER $SCRIPTS_FOLDER/

# Function: copy app bundle with built dependencies from dependency builder stage.
COPY --from=bundle_deps_builder $APP_BUNDLE_FOLDER/bundle $APP_BUNDLE_FOLDER/bundle/

# Function: bake settings.json into the image so deploys are self-contained.
# Placed at /app/settings.json to avoid being shadowed by the /mofactsAssets bind mount
# (which holds SSL certs, feedback data, and dictionaries).
RUN mkdir -p /app
COPY ./mofacts/.deploy/settings.json /app/settings.json
COPY ./mofacts/.deploy/settingsstaging.json /app/settingsstaging.json

# Function: remove platform-specific binaries not needed in linux container runtime.
RUN rm -rf $APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules/@swc/core-darwin* \
           $APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules/@swc/core-linux-x64-gnu \
           $APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules/@swc/core-win32* && \
    find $APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules -type d -name "*darwin*" -exec rm -rf {} + 2>/dev/null || true

# Start app
ENTRYPOINT ["/docker/entrypoint.sh"]

CMD ["node", "main.js"]
