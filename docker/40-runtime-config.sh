#!/bin/sh
set -eu

export DEFAULT_XMPP_SERVER="${DEFAULT_XMPP_SERVER:-}"
export DEFAULT_XMPP_HTTP_PORT="${DEFAULT_XMPP_HTTP_PORT:-7070}"
export DEFAULT_XMPP_HTTP_PATH="${DEFAULT_XMPP_HTTP_PATH:-/http-bind/}"
envsubst '${DEFAULT_XMPP_SERVER} ${DEFAULT_XMPP_HTTP_PORT} ${DEFAULT_XMPP_HTTP_PATH}' \
  < /opt/jabber-react/config.template.js \
  > /usr/share/nginx/html/config.js
