/* Shared event-only model collector. ES5 syntax supports historical AMD builds. */
(function( global ) {
  'use strict';
  function createCollector( options ) {
    options = options || {};
    if ( options.sampling && options.sampling !== 'object-events' ) { throw new Error( 'Only object-events monitoring is supported' ); }
    var ids = new WeakMap(), metadata = new WeakMap(), owners = new WeakMap();
    var collections = new WeakMap(), disposed = new WeakSet(), excludedCache = new WeakMap();
    var active = new Map(), roots = [], rootIds = new Set(), candidates = new Set(), discovery = [], pending = [], records = [];
    var sequence = 0, serial = 0, order = 0, frame = 0, inspections = 0;
    var started = false, stopped = false, complete = true, settling = false;
    var notify = null, maximum = options.maximumRecords || 100000, maximumObjects = options.maximumObjects || 20000;
    var clock = options.clock || function() { return performance.now(); };
    var skipped = /^(listeners|listenersToEmitTo|onBeforeNotify|disposeEmitter|disposeProperty|tandem|phetioType|phetioValueType|valueValidator|validValues|_initialValue|initialValue|tinyProperty|tinyEmitter|changedEmitter|startedCallbacksForChangedEmitter|endedCallbacksForChangedEmitter|callbacksStartedEmitter|callbacksEndedEmitter|_disposeEmitter|_disposer|disposer|view|_view|display|_display|_addedListeners|_removedListeners)$/;
    function own( object, key ) {
      var descriptor = Object.getOwnPropertyDescriptor( object, key );
      return descriptor && Object.prototype.hasOwnProperty.call( descriptor, 'value' ) ? descriptor.value : undefined;
    }
    function id( object ) {
      var result = ids.get( object );
      if ( !result ) { result = 'o' + ( ++serial ); ids.set( object, result ); }
      return result;
    }
    function add( type, data, event ) {
      if ( stopped || !complete && type !== 'monitoring-error' ) { return; }
      if ( records.length >= maximum && type !== 'monitoring-error' ) { fail( 'queue-overflow' ); return; }
      records.push( { type: type, data: data, time: event ? event.time : clock(),
        order: event ? event.order : ++order, frame: event ? event.frame : frame } );
      if ( notify ) { notify(); }
    }
    function fail( reason ) {
      if ( !complete || stopped ) { return; }
      complete = false; pending = [];
      add( 'monitoring-error', { reason: reason, evidenceComplete: false } );
    }
    function guarded( action ) {
      if ( stopped || !complete ) { return; }
      try { action(); } catch( error ) { fail( 'collector-error: ' + error.message ); }
    }
    function excluded( object ) {
      if ( excludedCache.has( object ) ) { return excludedCache.get( object ); }
      var phet = global.phet, scenery = phet && phet.scenery, joist = phet && phet.joist;
      var result = object === global || object === global.document ||
        ( typeof global.Node === 'function' && object instanceof global.Node ) ||
        ( scenery && typeof scenery.Node === 'function' && object instanceof scenery.Node ) ||
        ( joist && typeof joist.Screen === 'function' && object instanceof joist.Screen ) ||
        ( joist && typeof joist.Sim === 'function' && object instanceof joist.Sim ) ||
        ( typeof own( object, 'phetioID' ) === 'string' && typeof own( object, 'name' ) === 'string' &&
          Object.prototype.hasOwnProperty.call( object, 'parentTandem' ) ) ||
        !!( own( object, '_children' ) && own( object, '_parents' ) );
      excludedCache.set( object, !!result ); return !!result;
    }
    function kind( object ) {
      if ( collections.has( object ) ) { return 'collection'; }
      if ( own( object, 'tinyProperty' ) || own( object, 'changedEmitter' ) ||
        Object.prototype.hasOwnProperty.call( object, '_value' ) && ( own( object, 'listeners' ) || own( object, 'listenersToEmitTo' ) ) ) { return 'property'; }
      if ( own( object, 'tinyEmitter' ) || own( object, 'listeners' ) ) { return 'emitter'; }
      if ( Array.isArray( object ) ) { return 'array'; }
      if ( object instanceof Map ) { return 'map'; }
      if ( object instanceof Set ) { return 'set'; }
      if ( ArrayBuffer.isView( object ) && !( object instanceof DataView ) ) { return 'typed-array'; }
      if ( object instanceof Date || object instanceof RegExp || object instanceof WeakMap || object instanceof WeakSet || object instanceof ArrayBuffer || object instanceof DataView ) { return 'unsupported'; }
      return 'object';
    }
    function backend( object ) { return own( object, 'tinyProperty' ) || own( object, 'changedEmitter' ) || own( object, 'tinyEmitter' ) || object; }
    function propertyValue( object ) { return own( own( object, 'tinyProperty' ) || object, '_value' ); }
    function value( input ) {
      if ( input === null || typeof input === 'string' || typeof input === 'boolean' ) { return input; }
      if ( typeof input === 'number' ) { return Number.isFinite( input ) ? input : { number: String( input ) }; }
      if ( input === undefined ) { return { undefined: true }; }
      if ( typeof input === 'object' ) { return excluded( input ) ? { unsupported: 'browser-rendering-or-instrumentation-object' } : { ref: id( input ) }; }
      return { unsupported: typeof input };
    }
    function catalog( entry ) {
      var observed = entry.kind === 'property' || entry.kind === 'emitter' || entry.kind === 'collection';
      var tandem = own( entry.object, 'tandem' );
      add( 'catalog', { id: entry.id, path: entry.path, tandem: tandem && ( own( tandem, 'phetioID' ) || own( tandem, 'id' ) ) || null,
        kind: entry.kind, coverage: observed ? 'observed' : 'unsupported', sampling: 'object-events', pathSemantics: 'discovery-address',
        observation: entry.kind === 'collection' ? 'axon-collection-mutations' : observed ? 'axon-notifications' : 'initial-only',
        limitation: observed ? 'Notifications only. Direct writes that bypass the shared API are unsupported; mutable event references are snapshotted when processed and pre-discovery references resolve later.' :
          'No dependable change signal. Own fields are inventoried initially and may be snapshotted when explicitly carried by an event; silent writes, accessors and internal state are not observed.' } );
    }
    // Only called for a newly discovered object, a notified property/collection,
    // or a value explicitly carried by an event. Never called by a frame scan.
    function inspect( entry, reason ) {
      inspections++;
      var object = entry.object, type = entry.kind, edges = [], state, fields, fieldCoverage;
      function encode( input, key ) {
        var encoded = value( input );
        if ( encoded && encoded.ref ) {
          edges.push( { id: encoded.ref, key: key } );
          discover( input, entry.path + '.' + key );
        }
        return encoded;
      }
      if ( type === 'property' ) { state = { value: encode( propertyValue( object ), 'value' ) }; }
      else if ( type === 'emitter' ) { state = {}; }
      else if ( type === 'unsupported' ) { state = { unsupported: 'unregistered-internal-state' }; }
      else if ( type === 'map' ) {
        var pairs = [];
        object.forEach( function( v, k ) { var index = pairs.length; pairs.push( [ encode( k, 'entries.' + index + '.key' ), encode( v, 'entries.' + index + '.value' ) ] ); } );
        state = { entries: pairs, changeCoverage: 'unsupported' };
      }
      else if ( type === 'set' ) {
        var members = [];
        object.forEach( function( v ) { members.push( encode( v, 'members.' + members.length ) ); } );
        state = { members: members, changeCoverage: 'unsupported' };
      }
      else if ( type === 'typed-array' ) {
        state = { values: Array.prototype.map.call( object, value ), changeCoverage: 'unsupported' };
      }
      else {
        fields = Object.create( null ); fieldCoverage = Object.create( null );
        var source = type === 'collection' ? collections.get( object ) : object;
        var keys = Object.keys( source );
        if ( type === 'array' || type === 'collection' ) { keys.push( 'length' ); }
        keys.forEach( function( key ) {
          if ( skipped.test( key ) || type === 'collection' && key !== 'length' && !/^(0|[1-9][0-9]*)$/.test( key ) ) { return; }
          var descriptor = Object.getOwnPropertyDescriptor( source, key );
          if ( descriptor && Object.prototype.hasOwnProperty.call( descriptor, 'value' ) ) {
            fields[ key ] = encode( descriptor.value, key );
            fieldCoverage[ key ] = type === 'collection' ? 'observed-mutation' : 'initial-only-no-change-signal';
          }
          else { fields[ key ] = { unsupported: 'accessor-not-invoked' }; fieldCoverage[ key ] = 'unsupported-accessor'; }
        } );
        if ( type === 'collection' ) {
          [ 'lengthProperty', 'elementAddedEmitter', 'elementRemovedEmitter', 'startedCallbacksForItemAddedEmitter',
            'endedCallbacksForItemAddedEmitter', 'startedCallbacksForItemRemovedEmitter', 'endedCallbacksForItemRemovedEmitter' ].forEach( function( key ) {
            var child = own( object, key );
            if ( child && typeof child === 'object' ) { fields[ key ] = encode( child, key ); fieldCoverage[ key ] = 'api-identity'; }
          } );
        }
        state = { fields: fields, fieldCoverage: fieldCoverage };
      }
      var changed = JSON.stringify( state ) !== JSON.stringify( entry.state );
      var oldEdges = entry.edges;
      entry.edges = edges;
      var oldTargets = new Set( oldEdges.map( function( edge ) { return edge.id; } ) );
      var newTargets = new Set( edges.map( function( edge ) { return edge.id; } ) );
      oldTargets.forEach( function( target ) {
        if ( newTargets.has( target ) ) { return; }
        var child = active.get( target );
        if ( child ) { child.parents.delete( entry.id ); candidates.add( target ); }
      } );
      newTargets.forEach( function( target ) {
        var child = active.get( target ); if ( child ) { child.parents.add( entry.id ); }
      } );
      if ( changed || !entry.state ) {
        var initial = !entry.state; entry.state = state;
        add( initial ? 'initial' : 'sample', { id: entry.id, state: state, trigger: reason } );
      }
    }
    function discover( object, path ) {
      if ( !object || typeof object !== 'object' || excluded( object ) ) { return null; }
      var entry = metadata.get( object );
      if ( entry && active.has( entry.id ) ) { return entry; }
      if ( active.size >= maximumObjects ) { fail( 'discovery-limit' ); return null; }
      entry = { object: object, id: id( object ), path: path, kind: kind( object ), state: null, edges: [], parents: new Set() };
      metadata.set( object, entry ); active.set( entry.id, entry );
      if ( entry.kind === 'property' || entry.kind === 'emitter' ) { owners.set( backend( object ), entry ); }
      candidates.add( entry.id ); discovery.push( entry );
      return entry;
    }
    function flushDiscovery() {
      for ( var index = 0; index < discovery.length && complete; index++ ) {
        var entry = discovery[ index ]; catalog( entry ); inspect( entry, 'discovery' );
      }
      discovery = [];
    }
    function snapshotValue( object, path, sourceId ) {
      if ( !object || typeof object !== 'object' || excluded( object ) ) { return; }
      var prior = metadata.get( object ), entry = discover( object, path );
      if ( prior && prior.state && entry && entry.kind !== 'property' && entry.kind !== 'emitter' && entry.kind !== 'unsupported' ) {
        inspect( entry, { eventSource: sourceId, coverage: 'event-point-only' } );
      }
    }
    function recordEvent( event, entry ) {
      add( event.disposed ? 'disposed' : entry.kind === 'property' ? 'property' : 'event',
        { id: entry.id, args: event.args.map( value ) }, event );
      if ( event.disposed ) { disposed.add( entry.object ); candidates.add( entry.id ); return; }
      event.args.forEach( function( arg, index ) { snapshotValue( arg, entry.path + '.eventArgs.' + index, entry.id ); } );
      if ( entry.kind === 'property' ) { inspect( entry, 'property-notification' ); }
      flushDiscovery();
    }
    function resolvePending() {
      var changed = true;
      while ( changed ) {
        changed = false;
        pending.forEach( function( event ) {
          if ( event.resolved ) { return; }
          var entry = owners.get( event.object ) || metadata.get( event.object );
          if ( entry && active.has( entry.id ) ) { event.resolved = true; recordEvent( event, entry ); changed = true; }
        } );
      }
    }
    function retire( entry ) {
      active.delete( entry.id ); metadata.delete( entry.object );
      if ( owners.get( backend( entry.object ) ) === entry ) { owners.delete( backend( entry.object ) ); }
      add( 'detached', { id: entry.id } );
    }
    // Trial deletion is restricted to removed/new event subgraphs. Incoming
    // references from outside that subgraph preserve aliases and rooted cycles.
    // Edges contain IDs, never backward strong references to model objects.
    function reconcile() {
      if ( !candidates.size ) { return; }
      var affected = new Set(), queue = Array.from( candidates );
      candidates.clear();
      for ( var index = 0; index < queue.length; index++ ) {
        var entry = active.get( queue[ index ] );
        if ( !entry || affected.has( entry.id ) ) { continue; }
        affected.add( entry.id ); entry.edges.forEach( function( edge ) { queue.push( edge.id ); } );
      }
      var kept = new Set(); queue = [];
      affected.forEach( function( key ) {
        var entry = active.get( key );
        if ( disposed.has( entry.object ) ) { return; }
        var external = rootIds.has( key );
        entry.parents.forEach( function( parent ) {
          var source = active.get( parent );
          if ( source && !affected.has( parent ) && !disposed.has( source.object ) ) { external = true; }
        } );
        if ( external ) { queue.push( key ); }
      } );
      for ( index = 0; index < queue.length; index++ ) {
        var current = active.get( queue[ index ] );
        if ( !current || kept.has( current.id ) || disposed.has( current.object ) ) { continue; }
        kept.add( current.id );
        current.edges.forEach( function( edge ) { if ( affected.has( edge.id ) ) { queue.push( edge.id ); } } );
      }
      affected.forEach( function( key ) {
        if ( kept.has( key ) ) { return; }
        var entry = active.get( key );
        entry.edges.forEach( function( edge ) { var child = active.get( edge.id ); if ( child ) { child.parents.delete( key ); } } );
        entry.parents.forEach( function( parent ) {
          var source = active.get( parent ); if ( source ) { source.edges = source.edges.filter( function( edge ) { return edge.id !== key; } ); }
        } );
        retire( entry );
      } );
    }
    function settle() {
      if ( settling ) { return; }
      settling = true;
      guarded( function() {
        resolvePending(); pending = []; reconcile();
        if ( records.length && records[ records.length - 1 ].type !== 'checkpoint' ) {
          add( 'checkpoint', { activeObjects: active.size, evidenceComplete: complete, sampling: 'object-events' } );
        }
      } );
      settling = false;
    }
    return {
      beginModel: function() { started = true; },
      model: function( model ) { guarded( function() {
        started = true;
        var path = 'screens.' + roots.length + '.model';
        var entry = discover( model, path );
        if ( entry ) { roots.push( { id: entry.id, path: path } ); rootIds.add( entry.id ); }
        flushDiscovery();
        resolvePending();
      } ); },
      registerCollection: function( object, array ) { guarded( function() {
        collections.set( object, array );
        var entry = metadata.get( object );
        if ( entry && entry.kind !== 'collection' ) { entry.kind = 'collection'; catalog( entry ); inspect( entry, 'collection-registration' ); flushDiscovery(); }
      } ); },
      collectionChanged: function( object, array ) { guarded( function() {
        if ( array ) { collections.set( object, array ); }
        var entry = metadata.get( object );
        if ( entry && active.has( entry.id ) ) { inspect( entry, 'collection-mutation' ); flushDiscovery(); resolvePending(); }
      } ); },
      emit: function( object, args ) { guarded( function() {
        if ( !started ) { return; }
        var event = { object: object, args: Array.prototype.slice.call( args ), time: clock(), order: ++order, frame: frame };
        var entry = owners.get( object );
        if ( entry && active.has( entry.id ) ) { recordEvent( event, entry ); }
        else if ( pending.length < maximum ) { pending.push( event ); }
        else { fail( 'early-event-queue-overflow' ); }
      } ); },
      dispose: function( object ) { guarded( function() {
        if ( !started || disposed.has( object ) ) { return; }
        var entry = owners.get( object ) || metadata.get( object );
        disposed.add( object );
        var event = { object: object, args: [], disposed: true, time: clock(), order: ++order, frame: frame };
        if ( entry && active.has( entry.id ) ) { recordEvent( event, entry ); }
        else if ( pending.length < maximum ) { pending.push( event ); }
        else { fail( 'early-event-queue-overflow' ); }
      } ); },
      frame: function() { frame++; settle(); },
      onRecords: function( listener ) { notify = listener; if ( notify && records.length ) { notify(); } },
      drain: function( limit, byteLimit ) {
        var cutoff = pending.length ? pending[ 0 ].order : Infinity;
        var ready = records.filter( function( record ) { return record.order < cutoff; } );
        records = records.filter( function( record ) { return record.order >= cutoff; } );
        ready.sort( function( a, b ) { return a.order - b.order; } );
        var count = 0, bytes = 256, encoder = byteLimit === undefined ? null : new TextEncoder();
        while ( count < ready.length && ( limit === undefined || count < limit ) ) {
          ready[ count ].sequence = sequence + count + 1;
          var size = encoder ? encoder.encode( JSON.stringify( ready[ count ] ) ).length + 1 : 0;
          if ( encoder && bytes + size > byteLimit ) { break; }
          bytes += size; count++;
        }
        if ( count === 0 && ready.length && encoder ) { fail( 'record-exceeds-transport-limit' ); }
        records = ready.slice( count ).concat( records );
        ready = ready.slice( 0, count ); sequence += count;
        return ready;
      },
      status: function() { return { complete: complete, stopped: stopped, frame: frame, activeObjects: active.size,
        queuedRecords: records.length, pendingEvents: pending.length, sampling: 'object-events', objectInspections: inspections }; },
      snapshot: function() { return Array.from( active.values() ).map( function( entry ) {
        return { id: entry.id, path: entry.path, kind: entry.kind, state: entry.state };
      } ); },
      stop: function() {
        stopped = true; notify = null; records = []; pending = []; discovery = []; roots = []; rootIds.clear(); candidates.clear(); active.clear();
        ids = new WeakMap(); metadata = new WeakMap(); owners = new WeakMap(); collections = new WeakMap(); disposed = new WeakSet(); excludedCache = new WeakMap();
      }
    };
  }
  global.PhETResearch = { createCollector: createCollector };
}( typeof window === 'undefined' ? globalThis : window ));
