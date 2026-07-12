#!/bin/sh
# Сборка одного самодостаточного HTML из модулей src/
cd "$(dirname "$0")"
{
  cat src/part_head.html
  printf '<script>\n'
  cat src/engine.js
  printf '</script>\n<script>\n'
  cat src/ui.js
  printf '</script>\n'
  cat src/part_tail.html
} > umo-binar-planner.html
cp umo-binar-planner.html index.html   # копия для GitHub Pages (короткая ссылка)
echo "Собрано: umo-binar-planner.html ($(wc -c < umo-binar-planner.html | tr -d ' ') байт) + index.html"
