"use strict";

(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const app = document.getElementById("app");
  const PROGRESS_KEY = "progress_v1";

  let course = null;
  let progress = { done: {}, ex: {} };

  // ---------- Telegram ----------

  function inTelegram() {
    return Boolean(tg && tg.initData);
  }

  function haptic(kind) {
    if (inTelegram() && tg.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred(kind);
    }
  }

  function cloudAvailable() {
    return inTelegram() && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9");
  }

  // ---------- Прогресс ----------

  function loadProgress() {
    return new Promise(function (resolve) {
      if (cloudAvailable()) {
        tg.CloudStorage.getItem(PROGRESS_KEY, function (err, value) {
          if (!err && value) {
            resolve(parseProgress(value));
          } else {
            resolve(loadLocal());
          }
        });
      } else {
        resolve(loadLocal());
      }
    });
  }

  function loadLocal() {
    try {
      return parseProgress(window.localStorage.getItem(PROGRESS_KEY));
    } catch (e) {
      return { done: {}, ex: {} };
    }
  }

  function parseProgress(raw) {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return { done: p.done || {}, ex: p.ex || {} };
      }
    } catch (e) {
      // битые данные — начинаем с нуля
    }
    return { done: {}, ex: {} };
  }

  function saveProgress() {
    const raw = JSON.stringify(progress);
    try {
      window.localStorage.setItem(PROGRESS_KEY, raw);
    } catch (e) {
      // localStorage может быть недоступен — не критично
    }
    if (cloudAvailable()) {
      tg.CloudStorage.setItem(PROGRESS_KEY, raw);
    }
  }

  // ---------- Текст ----------

  const AR = "[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+";
  const AR_RUN = new RegExp(AR + "(?:[ \\u00A0–·/،.]+" + AR + ")*", "g");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // **жирный** + арабские фрагменты в отдельный rtl-span с арабским шрифтом
  function rich(s) {
    let html = escapeHtml(s);
    html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    html = html.replace(AR_RUN, function (m) {
      // короткие фрагменты (слово, пара форм) не переносим
      const cls = m.length <= 24 ? "ar nw" : "ar";
      return '<span class="' + cls + '" dir="rtl" lang="ar">' + m + "</span>";
    });
    return html.replace(/\n/g, "<br>");
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (html !== undefined) {
      node.innerHTML = html;
    }
    return node;
  }

  // ---------- Маршрутизация ----------

  function lessonById(id) {
    return course.lessons.find(function (l) {
      return l.id === id;
    });
  }

  function route() {
    const m = window.location.hash.match(/^#\/lesson\/(\d+)/);
    if (m && lessonById(Number(m[1]))) {
      renderLesson(lessonById(Number(m[1])));
    } else {
      renderList();
    }
    window.scrollTo(0, 0);
  }

  function go(hash) {
    if (window.location.hash === hash) {
      route();
    } else {
      window.location.hash = hash;
    }
  }

  function onBack() {
    go("#/");
  }

  function setBackButton(visible) {
    if (!inTelegram() || !tg.BackButton) {
      return;
    }
    if (visible) {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }

  // ---------- Экраны ----------

  function exerciseStats(lesson) {
    let total = 0;
    let correct = 0;
    lesson.exercises.forEach(function (ex, ei) {
      if (ex.type === "choice") {
        ex.items.forEach(function (_, ii) {
          total += 1;
          if (progress.ex[lesson.id + "-" + ei + "-" + ii] === true) {
            correct += 1;
          }
        });
      }
    });
    return { total: total, correct: correct };
  }

  function renderList() {
    setBackButton(false);
    app.innerHTML = "";
    app.appendChild(el("h1", null, escapeHtml(course.course)));

    course.lessons.forEach(function (lesson) {
      const done = progress.done[lesson.id] === true;
      const card = el("button", "card lesson-link" + (done ? " done" : ""));
      card.type = "button";
      card.appendChild(el("div", "lesson-num", done ? "✓" : String(lesson.id)));
      const body = el("div");
      body.appendChild(el("div", "lesson-title", "Урок " + lesson.id + ". " + escapeHtml(lesson.title)));
      body.appendChild(el("div", "lesson-sub", rich(lesson.summary)));
      const st = exerciseStats(lesson);
      if (st.total > 0) {
        const bar = el("div", "progress");
        const fill = el("span");
        fill.style.width = Math.round((st.correct / st.total) * 100) + "%";
        bar.appendChild(fill);
        body.appendChild(bar);
      }
      card.appendChild(body);
      card.addEventListener("click", function () {
        go("#/lesson/" + lesson.id);
      });
      app.appendChild(card);
    });
  }

  function renderBlock(block) {
    if (block.type === "p") {
      return el("p", null, rich(block.text));
    }
    if (block.type === "h") {
      return el("h2", null, rich(block.text));
    }
    if (block.type === "note") {
      return el("p", "note", rich(block.text));
    }
    if (block.type === "list") {
      const ul = el("ul", "items");
      block.items.forEach(function (item) {
        ul.appendChild(el("li", null, rich(item)));
      });
      return ul;
    }
    if (block.type === "table") {
      const wrap = el("div", "table-wrap");
      const table = el("table");
      const thead = el("thead");
      const hr = el("tr");
      block.head.forEach(function (h) {
        hr.appendChild(el("th", null, rich(h)));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el("tbody");
      block.rows.forEach(function (row) {
        const tr = el("tr");
        row.forEach(function (cell) {
          tr.appendChild(el("td", null, rich(cell)));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }
    return el("p", null, rich(block.text || ""));
  }

  function renderChoice(lesson, ex, ei, onUpdate) {
    const box = el("div");
    ex.items.forEach(function (item, ii) {
      const key = lesson.id + "-" + ei + "-" + ii;
      const row = el("div", "ex-item");
      row.appendChild(el("div", "ex-q", rich(item.q)));
      const opts = el("div", "options");
      const fb = el("div", "feedback");
      const buttons = [];

      function showResult(chosen) {
        buttons.forEach(function (b, bi) {
          b.disabled = true;
          if (bi === item.answer) {
            b.classList.add("correct");
          } else if (bi === chosen) {
            b.classList.add("wrong");
          }
        });
        const ok = chosen === item.answer;
        fb.className = "feedback " + (ok ? "ok" : "bad");
        fb.innerHTML = (ok ? "Верно." : "Неверно.") + (item.explain ? " " + rich(item.explain) : "");
      }

      ex.options.forEach(function (opt, oi) {
        const b = el("button", "opt", rich(opt));
        b.type = "button";
        b.addEventListener("click", function () {
          const ok = oi === item.answer;
          progress.ex[key] = ok;
          saveProgress();
          haptic(ok ? "success" : "error");
          showResult(oi);
          onUpdate();
        });
        buttons.push(b);
        opts.appendChild(b);
      });

      row.appendChild(opts);
      row.appendChild(fb);
      if (key in progress.ex) {
        // уже отвечали: показываем правильный ответ без повторного выбора
        showResult(progress.ex[key] === true ? item.answer : -1);
      }
      box.appendChild(row);
    });
    return box;
  }

  function renderReveal(ex) {
    const box = el("div");
    const btn = el("button", "btn", "Показать ответ");
    btn.type = "button";
    const ans = el("div", "answer", rich(ex.answer));
    ans.hidden = true;
    btn.addEventListener("click", function () {
      ans.hidden = !ans.hidden;
      btn.textContent = ans.hidden ? "Показать ответ" : "Скрыть ответ";
    });
    box.appendChild(btn);
    box.appendChild(ans);
    return box;
  }

  function renderLesson(lesson) {
    setBackButton(true);
    app.innerHTML = "";

    if (!inTelegram()) {
      const back = el("button", "back", "← Все уроки");
      back.type = "button";
      back.addEventListener("click", onBack);
      app.appendChild(back);
    }

    app.appendChild(el("h1", null, "Урок " + lesson.id + ". " + escapeHtml(lesson.title)));
    app.appendChild(el("p", "muted", "По видео №" + lesson.video));

    const theory = el("div", "card");
    lesson.blocks.forEach(function (block) {
      theory.appendChild(renderBlock(block));
    });
    app.appendChild(theory);

    app.appendChild(el("h2", null, "Упражнения"));
    const score = el("div", "score");

    function updateScore() {
      const st = exerciseStats(lesson);
      score.textContent = "Тесты: " + st.correct + " из " + st.total + " верно";
    }

    lesson.exercises.forEach(function (ex, ei) {
      const card = el("div", "card");
      card.appendChild(el("div", "ex-prompt", (ei + 1) + ". " + rich(ex.prompt)));
      if (ex.type === "choice") {
        card.appendChild(renderChoice(lesson, ex, ei, updateScore));
      } else {
        card.appendChild(renderReveal(ex));
      }
      app.appendChild(card);
    });
    updateScore();
    app.appendChild(score);

    const doneBtn = el("button", "btn primary");
    doneBtn.type = "button";
    const next = lessonById(lesson.id + 1);

    function paintDone() {
      if (progress.done[lesson.id] === true) {
        doneBtn.textContent = next ? "Следующий урок →" : "К списку уроков";
      } else {
        doneBtn.textContent = "Урок пройден";
      }
    }

    doneBtn.addEventListener("click", function () {
      if (progress.done[lesson.id] !== true) {
        progress.done[lesson.id] = true;
        saveProgress();
        haptic("success");
        paintDone();
        return;
      }
      go(next ? "#/lesson/" + next.id : "#/");
    });
    paintDone();
    const wrap = el("div");
    wrap.style.marginTop = "16px";
    wrap.appendChild(doneBtn);
    app.appendChild(wrap);
  }

  // ---------- Старт ----------

  function startLessonFromParam() {
    // t.me/<bot>/<app>?startapp=lesson_2 → открыть урок 2
    if (!inTelegram()) {
      return;
    }
    const p = tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    const m = p ? String(p).match(/^lesson_(\d+)$/) : null;
    if (m && !window.location.hash) {
      window.location.hash = "#/lesson/" + m[1];
    }
  }

  function init() {
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.BackButton) {
        tg.BackButton.onClick(onBack);
      }
    }
    Promise.all([
      fetch("data/lessons.json", { cache: "no-cache" }).then(function (r) {
        if (!r.ok) {
          throw new Error("HTTP " + r.status);
        }
        return r.json();
      }),
      loadProgress()
    ])
      .then(function (res) {
        course = res[0];
        progress = res[1];
        startLessonFromParam();
        window.addEventListener("hashchange", route);
        route();
      })
      .catch(function (err) {
        app.innerHTML = '<p class="center">Не удалось загрузить уроки.</p><p class="muted center">' + escapeHtml(err.message) + "</p>";
      });
  }

  init();
})();
