import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MongoClient, ReadPreference } from 'mongodb';
import * as z from 'zod/v4';

const PORT = Number(process.env.PORT || 8932);
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const HISTORY_COLLECTION = 'history';
const DAY_MS = 24 * 60 * 60 * 1000;

if (!MONGO_URI) {
  throw new Error('MONGO_URI is required');
}

if (!DB_NAME) {
  throw new Error('DB_NAME is required');
}

const client = new MongoClient(MONGO_URI, {
  readPreference: ReadPreference.SECONDARY_PREFERRED
});

await client.connect();

const db = client.db(DB_NAME);
const history = db.collection(HISTORY_COLLECTION);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toIso(ms) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null;
}

function makeServer() {
  const server = new McpServer({
    name: 'mofacts-mongo-mcp',
    version: '0.1.0'
  });

  server.registerTool(
    'usage_summary',
    {
      title: 'Usage Summary',
      description: 'Return session and event counts over the last N days.',
      inputSchema: {
        days: z.number().int().min(1).max(365).default(7)
      }
    },
    async ({ days }) => {
      const safeDays = clamp(days, 1, 365);
      const sinceMs = Date.now() - (safeDays * DAY_MS);

      const [summary = null] = await history.aggregate([
        {
          $match: {
            $expr: {
              $gte: [
                { $ifNull: ['$recordedServerTime', '$time'] },
                sinceMs
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            event_count: { $sum: 1 },
            session_ids: { $addToSet: '$sessionID' },
            user_ids: { $addToSet: '$userId' },
            last_event_at_ms: {
              $max: { $ifNull: ['$recordedServerTime', '$time'] }
            }
          }
        }
      ]).toArray();

      const result = {
        days: safeDays,
        since: new Date(sinceMs).toISOString(),
        event_count: summary?.event_count || 0,
        session_count: (summary?.session_ids || []).filter(Boolean).length,
        user_count: (summary?.user_ids || []).filter(Boolean).length,
        last_event_at: toIso(summary?.last_event_at_ms)
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'recent_sessions',
    {
      title: 'Recent Sessions',
      description: 'Return the most recent session summaries derived from history.sessionID.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(10)
      }
    },
    async ({ limit }) => {
      const safeLimit = clamp(limit, 1, 100);

      const sessions = await history.aggregate([
        {
          $match: {
            sessionID: { $nin: [null, ''] }
          }
        },
        {
          $addFields: {
            _ts: { $ifNull: ['$recordedServerTime', '$time'] }
          }
        },
        {
          $sort: {
            _ts: -1
          }
        },
        {
          $group: {
            _id: '$sessionID',
            last_event_at_ms: { $first: '$_ts' },
            user_id: { $first: '$userId' },
            tdf_id: { $first: '$TDFId' },
            started_at_ms: { $min: '$_ts' },
            event_count: { $sum: 1 }
          }
        },
        {
          $sort: {
            last_event_at_ms: -1
          }
        },
        {
          $limit: safeLimit
        }
      ]).toArray();

      const result = sessions.map((session) => ({
        session_id: session._id,
        user_id: session.user_id || null,
        tdf_id: session.tdf_id || null,
        started_at: toIso(session.started_at_ms),
        last_event_at: toIso(session.last_event_at_ms),
        event_count: session.event_count
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: {
          sessions: result
        }
      };
    }
  );

  server.registerTool(
    'session_events',
    {
      title: 'Session Events',
      description: 'Return recent history rows for a single sessionID.',
      inputSchema: {
        session_id: z.string().min(1),
        limit: z.number().int().min(1).max(200).default(25)
      }
    },
    async ({ session_id, limit }) => {
      const safeLimit = clamp(limit, 1, 200);

      const events = await history.aggregate([
        {
          $match: {
            sessionID: session_id
          }
        },
        {
          $addFields: {
            _ts: { $ifNull: ['$recordedServerTime', '$time'] }
          }
        },
        {
          $sort: {
            _ts: -1,
            eventId: -1
          }
        },
        {
          $limit: safeLimit
        },
        {
          $project: {
            _id: 0,
            session_id: '$sessionID',
            event_id: '$eventId',
            recorded_at_ms: '$_ts',
            user_id: '$userId',
            tdf_id: '$TDFId',
            outcome: '$outcome',
            response_type: '$typeOfResponse',
            response_value: '$responseValue',
            level_unit: '$levelUnit',
            level_unit_name: '$levelUnitName',
            entry_point: '$entryPoint'
          }
        }
      ]).toArray();

      const result = events.map((event) => ({
        ...event,
        recorded_at: toIso(event.recorded_at_ms)
      })).map(({ recorded_at_ms, ...event }) => event);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: {
          session_id,
          events: result
        }
      };
    }
  );

  return server;
}

const app = createMcpExpressApp({ host: 'localhost' });

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    db: DB_NAME,
    collection: HISTORY_COLLECTION
  });
});

app.post('/mcp', async (req, res) => {
  const server = makeServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.'
    },
    id: null
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.'
    },
    id: null
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`mofacts-mongo-mcp listening on http://0.0.0.0:${PORT}/mcp`);
});

async function shutdown() {
  server.close();
  await client.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
