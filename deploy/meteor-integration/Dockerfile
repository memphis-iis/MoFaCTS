# Test tooling only. This does not build or release the MoFaCTS application.
FROM docker:29.8.2-cli@sha256:35cfcf893c20f2931f4909151b5407aaaeab711277de7ce8b8f521f095d54c32 AS docker_cli
FROM mcr.microsoft.com/playwright:v1.60.0-noble@sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948
ENV HUSKY=0 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker_cli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
RUN apt-get update && apt-get install --yes --no-install-recommends build-essential python3 && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --uid 2000 --create-home --shell /bin/bash mofacts-test && \
    mkdir -p /opt/toolchain/.meteor && chown -R 2000:2000 /opt/toolchain
COPY --chown=2000:2000 release /opt/toolchain/.meteor/release
COPY --chown=2000:2000 packages /opt/toolchain/.meteor/packages
COPY --chown=2000:2000 versions /opt/toolchain/.meteor/versions
ENV HOME=/home/mofacts-test
ENV PATH=/home/mofacts-test/.meteor:$PATH
USER 2000:2000
WORKDIR /opt/toolchain
RUN curl --fail --silent --show-error 'https://install.meteor.com/?release=3.5.4' --output /tmp/install-meteor.sh && \
    sh /tmp/install-meteor.sh && rm /tmp/install-meteor.sh && \
    test "$(cat .meteor/release)" = 'METEOR@3.5.4' && \
    test "$(meteor --version)" = 'Meteor 3.5.4' && \
    test "$(meteor node --version)" = 'v24.22.1' && \
    test "$(meteor npm --version)" = '11.19.1' && \
    test "$(meteor node -p 'process.versions.undici')" = '7.30.1' && \
    meteor node -p 'process.execPath' > /tmp/mofacts-node-bin
USER root
ENV HOME=/root
RUN node_bin="$(cat /tmp/mofacts-node-bin)" && \
    test -x "$node_bin" && \
    ln -sf "$node_bin" /usr/local/bin/node && \
    ln -sf "$(dirname "$node_bin")/npm" /usr/local/bin/npm && \
    rm /tmp/mofacts-node-bin
# Browser revision is owned by the application's lockfile. The application will
# still install its own dependencies and run its own postinstall in the test copy.
COPY package.json package-lock.json /opt/browser/
RUN git config --system --add url.https://github.com/unetworking/uWebSockets.js.insteadOf ssh://git@github.com/unetworking/uWebSockets.js && \
    git config --system --add url.https://github.com/unetworking/uWebSockets.js.insteadOf git@github.com:unetworking/uWebSockets.js
RUN cd /opt/browser && npm ci --ignore-scripts && \
    test "$(node -p 'require("playwright/package.json").version')" = '1.60.0' && \
    ./node_modules/.bin/playwright install chromium
WORKDIR /work
ENTRYPOINT []
