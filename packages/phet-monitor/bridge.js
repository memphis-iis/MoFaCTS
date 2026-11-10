/* Version 1 child bridge. Loaded after collector and build configuration. */
(function( global ) {
  'use strict';
  var config = global.phetResearchConfiguration;
  var collector = global.phetResearchMonitor;
  var session = null;
  var hostOrigin = null;
  var outstanding = null;
  var lastAck = 0;
  var lastProgress = 0;
  var retryMilliseconds = 1000;
  var failed = false;
  var timer = null;
  var retryTimer = null;

  function message( kind, data ) {
    return { protocol: 'phet-research', version: 1, buildId: config.buildId,
      sessionId: session, kind: kind, data: data };
  }
  function send( kind, data ) {
    if ( session ) { global.parent.postMessage( message( kind, data ), hostOrigin ); }
  }
  function stop( reason ) {
    if ( failed ) { return; }
    failed = true;
    send( 'error', { reason: reason, evidenceComplete: false, lastAcknowledgedSequence: lastAck } );
    collector.stop();
    clearTimeout( timer );
    clearTimeout( retryTimer );
    collector.onRecords( null );
  }
  function schedule() {
    if ( session && !failed && !outstanding && timer === null ) {
      timer = setTimeout( flush, 100 );
    }
  }
  function retry() {
    retryTimer = null;
    if ( failed || !outstanding ) { return; }
    if ( performance.now() - lastProgress >= 10000 ) { stop( 'acknowledgment-timeout' ); return; }
    send( 'batch', outstanding );
    retryTimer = setTimeout( retry, retryMilliseconds );
  }
  function flush() {
    timer = null;
    if ( !session || failed ) { return; }
    if ( outstanding ) { return; }
    // Bound startup snapshots as well as steady-state traffic. Every record
    // stays queued until its ordered chunk receives a durable acknowledgment.
    var records = collector.drain( 4000, 1024 * 1024 );
    if ( records.length ) {
      outstanding = { firstSequence: records[ 0 ].sequence,
        lastSequence: records[ records.length - 1 ].sequence, records: records };
      lastProgress = performance.now();
      send( 'batch', outstanding );
      retryTimer = setTimeout( retry, retryMilliseconds );
    }
    if ( !collector.status().complete && !outstanding ) { stop( 'collector-incomplete' ); }
  }
  function receive( event ) {
    if ( event.source !== global.parent || config.hostOrigins.indexOf( event.origin ) < 0 ) { return; }
    var data = event.data;
    if ( !data || data.protocol !== 'phet-research' || data.version !== 1 || data.buildId !== config.buildId ) { return; }
    if ( data.kind === 'initialize' ) {
      if ( session || typeof data.sessionId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test( data.sessionId ) ) { return; }
      session = data.sessionId;
      hostOrigin = event.origin;
      send( 'ready', { evidenceComplete: collector.status().complete, scope: 'initialized-screen-models' } );
      collector.onRecords( schedule );
      schedule();
    }
    else if ( data.sessionId === session && event.origin === hostOrigin && data.kind === 'ack' ) {
      if ( outstanding && data.data && data.data.sequence === outstanding.lastSequence ) {
        lastAck = outstanding.lastSequence;
        outstanding = null;
        clearTimeout( retryTimer );
        retryTimer = null;
        schedule();
      }
    }
    else if ( data.sessionId === session && event.origin === hostOrigin && data.kind === 'stop' ) {
      stop( 'host-ended-attempt' );
    }
  }
  global.addEventListener( 'message', receive );
  global.addEventListener( 'pagehide', function() {
    stop( 'simulation-unloaded' );
    global.removeEventListener( 'message', receive );
  } );
}( window ));
