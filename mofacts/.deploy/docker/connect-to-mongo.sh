#!/bin/bash

set -o errexit

cd $SCRIPTS_FOLDER

if [ -n "${MONGO_URL:-}" ]; then
	echo 'Connecting to MongoDB...'
	node <<- 'EOJS'
	const mongoClient = require('mongodb').MongoClient;
	setInterval(function() {
		mongoClient.connect(process.env.MONGO_URL, function(err, client) {
			if (client) {
				console.log('Successfully connected to MongoDB');
				client.close();
			}
			if (err) {
				console.error(err);
			} else {
				process.exit(0);
			}
		});
	}, 1000);
	EOJS
fi
