import { installMongoDriverUnhandledPolicy } from './mongoDriverUnhandledPolicy';

installMongoDriverUnhandledPolicy({
  logger: (level, message, details) => {
    console.log(message, { level, ...(details || {}) });
  },
});
