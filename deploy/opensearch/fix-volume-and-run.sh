#!/bin/sh
set -e
chown -R opensearch:opensearch /usr/share/opensearch/data
exec gosu opensearch /usr/share/opensearch/opensearch-docker-entrypoint.sh "$@"
