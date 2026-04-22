/**
 * Diagnostic script to analyze Anki deck structure
 */

const fs = require('fs');
const JSZip = require('jszip');
const initSqlJs = require('sql.js');

const US = '\x1f'; // Anki field separator

function queryAll(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function splitFields(fldsRaw) {
  return (fldsRaw || '').split(US);
}

async function diagnoseDeck(apkgPath) {
  

  const apkgBuffer = fs.readFileSync(apkgPath);
  const zip = await JSZip.loadAsync(apkgBuffer);

  // Find collection database
  let sqliteBytes;
  const c21 = zip.file('collection.anki21');
  const c2 = zip.file('collection.anki2');

  if (c21) {
    sqliteBytes = await c21.async('uint8array');
  } else if (c2) {
    sqliteBytes = await c2.async('uint8array');
  } else {
    throw new Error('No collection database found');
  }

  // Open SQLite database
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(sqliteBytes));

  // Get models and decks
  const colRows = queryAll(db, 'SELECT models, decks FROM col');
  const models = colRows.length > 0 ? JSON.parse(colRows[0].models || '{}') : {};
  const decks = colRows.length > 0 ? JSON.parse(colRows[0].decks || '{}') : {};

  
  for (const [_id, _deck] of Object.entries(decks)) {
    // Deck iteration retained for optional verbose diagnostics.
  }

  
  for (const [_id, model] of Object.entries(models)) {
    
    
    
    
    model.flds.forEach((_fld, _idx) => {
      
    });
    
    model.tmpls.forEach((_tmpl, _idx) => {
      
      
      
    });
  }

  // Load first few notes to see actual data
  
  const notes = queryAll(db, 'SELECT id, guid, mid, flds, tags FROM notes LIMIT 3');
  notes.forEach((note, _idx) => {
    const fields = splitFields(note.flds);
    
    fields.forEach((field, _fieldIdx) => {
      const _preview = field.length > 100 ? field.substring(0, 100) + '...' : field;
      
    });
  });

  // Count cards per note to understand card generation
  
  const _noteCount = queryAll(db, 'SELECT COUNT(*) as count FROM notes')[0].count;
  const _cardCount = queryAll(db, 'SELECT COUNT(*) as count FROM cards')[0].count;
  
  
  

  // Cards per note distribution
  const cardsPerNote = queryAll(db, 'SELECT nid, COUNT(*) as card_count FROM cards GROUP BY nid LIMIT 5');
  
  cardsPerNote.forEach(_row => {
    
  });

  db.close();
}

// Run if called directly
if (require.main === module) {
  const apkgPath = process.argv[2] || 'C:\\Users\\ppavl\\OneDrive\\Active projects\\mofacts_config\\Countries_of_the_World_vector_maps__EN.apkg';

  diagnoseDeck(apkgPath)
    .then(() => {})
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
