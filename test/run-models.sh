#!/bin/sh
# v0.5.3: model comparison, one model loaded at a time, two passes each (first = includes load, second = warm).
export PATH=/opt/homebrew/bin:$PATH; cd ~/TQueries; prev=""
for m in "$@"; do [ -n "$prev" ] && ollama stop "$prev"; prev=$m
  for pass in first warm; do echo "### $m $pass"; TQ_MODEL=$m node test/model-multi.js; done; done
[ -n "$prev" ] && ollama stop "$prev"; echo ALL_DONE
