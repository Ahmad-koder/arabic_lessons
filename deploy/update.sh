#!/bin/sh
# Обновление бота после git push. Запускать от root на сервере.
set -eu
DIR=/srv/arabic-bot
sudo -u arabicbot git -C "$DIR" pull --ff-only
sudo -u arabicbot "$DIR/.venv/bin/pip" install -q -r "$DIR/bot/requirements.txt"
systemctl restart arabic-bot
systemctl --no-pager status arabic-bot | head -5
