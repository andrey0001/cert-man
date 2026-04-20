#!/bin/sh
# Ensure the data directory exists and is owned by the node user
mkdir -p /app/data
chown -R node:node /app/data

# Switch to the node user to run the application
exec su node -c "$*"