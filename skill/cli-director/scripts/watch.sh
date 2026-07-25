#!/bin/bash
# watch.sh <socket> <session> <task-id> [timeout-min=45]
# exit 0=done  1=timeout  2=10min with no log growth AND no pane change, no sentinel
#      3=startup-dead (zero log bytes within ~90s of dispatch)
command -v md5 >/dev/null || md5() { md5sum; }
sock=$1; sess=$2; id=$3; t=${4:-45}; log=".tasks/$id.log"
prev=""; size=-1; quiet=0
for ((i=0; i<t*4; i++)); do
  [ -f ".tasks/$id.done" ] && exit 0
  tmux -L "$sock" has-session -t "$sess" 2>/dev/null || exit 2
  sz=$(stat -f%z "$log" 2>/dev/null || stat -c%s "$log" 2>/dev/null || echo 0)
  cur=$(tmux -L "$sock" capture-pane -p -t "$sess" 2>/dev/null | md5)
  if [ "$sz" = "$size" ] && [ "$cur" = "$prev" ]; then quiet=$((quiet+1)); else quiet=0; fi
  size=$sz; prev=$cur
  [ "$i" -ge 6 ] && [ "$sz" -eq 0 ] && exit 3
  [ "$quiet" -ge 40 ] && exit 2
  sleep 15
done
exit 1
