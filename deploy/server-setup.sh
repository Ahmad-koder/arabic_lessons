#!/bin/sh
# Первая установка бота на сервер (Ubuntu 24.04). Запускать от root.
set -eu

REPO=https://github.com/Ahmad-koder/arabic_lessons.git
DIR=/srv/arabic-bot

apt-get install -y python3-venv git

if ! id arabicbot >/dev/null 2>&1; then
  useradd --system --home "$DIR" --shell /usr/sbin/nologin arabicbot
fi

if [ ! -d "$DIR/.git" ]; then
  git clone "$REPO" "$DIR"
fi

python3 -m venv "$DIR/.venv"
"$DIR/.venv/bin/pip" install -q -r "$DIR/bot/requirements.txt"

if [ ! -f "$DIR/.env" ]; then
  cp "$DIR/.env.example" "$DIR/.env"
  echo "Заполните $DIR/.env (BOT_TOKEN, CHANNEL_ID) и запустите скрипт ещё раз."
  chown -R arabicbot: "$DIR"
  chmod 600 "$DIR/.env"
  exit 0
fi

chown -R arabicbot: "$DIR"
chmod 600 "$DIR/.env"
cp "$DIR/deploy/arabic-bot.service" /etc/systemd/system/arabic-bot.service
systemctl daemon-reload
systemctl enable --now arabic-bot
systemctl restart arabic-bot
systemctl --no-pager status arabic-bot | head -5
