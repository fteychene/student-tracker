#!/bin/env bash

docker compose up -d
(cd frontend && npm run build)
cargo run