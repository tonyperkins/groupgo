#!/bin/bash
set -e

NODE_VERSION="v20.18.3"
NODE_DIST="node-$NODE_VERSION-linux-x64"
INSTALL_DIR="/home/tony/cascadeprojects/groupgo/.node"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ ! -f "$NODE_DIST.tar.xz" ]; then
    echo "Downloading Node.js $NODE_VERSION..."
    curl -O "https://nodejs.org/dist/$NODE_VERSION/$NODE_DIST.tar.xz"
fi

echo "Extracting Node.js..."
tar -xJf "$NODE_DIST.tar.xz" --strip-components=1

echo "Node.js $NODE_VERSION installed at $INSTALL_DIR"
"$INSTALL_DIR/bin/node" -v
