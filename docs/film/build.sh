#!/usr/bin/env bash
# build.sh — assemble the 90 s Majlis Party film from a live side-by-side capture.
#
#   bash docs/film/build.sh /path/to/body.mp4 out.mp4 [start_seconds] [body_seconds]
#
# The capture is 1600×900 host + 416×900 phone stacked side by side. This re-frames both onto a 1920×1080
# navy plate, adds the title and end cards, and lays a licensed music bed under it (CC BY 4.0, credited on the
# end card). Everything is 30 fps so the concat is exact, not best-effort.
set -euo pipefail
BODY=${1:?input capture}
OUT=${2:?output mp4}
START=${3:-6}
LEN=${4:-80}
DIR=$(cd "$(dirname "$0")" && pwd)
MUSIC=${MUSIC:-/opt/data/assets/music/norm/arabic-middle-eastern/arabic-middle-eastern-04-middle-eastern-mystique-with-bright-string.mp3}

ffmpeg -y -v error \
  -loop 1 -t 5 -i "$DIR/title.png" \
  -i "$BODY" \
  -loop 1 -t 5 -i "$DIR/end.png" \
  -i "$MUSIC" \
  -i "$DIR/overlay.png" \
  -filter_complex "\
[1:v]trim=start=${START}:duration=${LEN},setpts=PTS-STARTPTS,split=2[a][b];\
[a]crop=1600:900:0:0,scale=1440:810:flags=lanczos[A];\
[b]crop=416:900:1600:0,scale=350:757:flags=lanczos,pad=374:810:12:14:color=0x0B1626,drawbox=x=10:y=12:w=354:h=786:color=0xC9A03F@0.5:t=2[B];\
[A][B]hstack=inputs=2,pad=1920:1080:41:150:color=0x0B1626,fps=30[body];\
[0:v]scale=1920:1080,fps=30,format=yuv420p[ti];\
[2:v]scale=1920:1080,fps=30,format=yuv420p[en];\
[body][4:v]overlay=0:0[bodyo];\
[ti][bodyo][en]concat=n=3:v=1:a=0[v];\
[3:a]atrim=0:$((5+LEN+5)),asetpts=PTS-STARTPTS,volume=0.55,afade=t=in:st=0:d=1.5,afade=t=out:st=$((5+LEN+5-2)):d=2[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 128k -movflags +faststart -shortest "$OUT"

ffprobe -v error -show_entries format=duration,size:stream=width,height -of default=nw=1 "$OUT"
