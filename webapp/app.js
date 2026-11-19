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

  // Своя палитра (styles.css): светлая или тёмная — вслед за темой Telegram или системы
  const THEME_BG = { light: "#f5efe3", dark: "#0f1613" };

  function applyTheme() {
    let scheme = "light";
    if (inTelegram() && tg.colorScheme) {
      scheme = tg.colorScheme;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      scheme = "dark";
    }
    document.documentElement.setAttribute("data-theme", scheme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", THEME_BG[scheme]);
    }
    if (inTelegram() && tg.isVersionAtLeast && tg.isVersionAtLeast("6.1")) {
      try {
        tg.setHeaderColor(THEME_BG[scheme]);
        tg.setBackgroundColor(THEME_BG[scheme]);
      } catch (e) {
        // старые клиенты Telegram — не критично
      }
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

  function lessonsWord(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) {
      return "урок";
    }
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) {
      return "урока";
    }
    return "уроков";
  }

  function renderList() {
    setBackButton(false);
    setReadProgress(false);
    app.innerHTML = "";

    const total = course.lessons.length;
    const doneCount = course.lessons.filter(function (l) {
      return progress.done[l.id] === true;
    }).length;

    // Шапка с орнаментом и общим прогрессом
    const hero = el("section", "hero");
    hero.appendChild(el("div", "pattern"));
    const inner = el("div", "hero-inner");
    inner.appendChild(el("div", "hero-word", '<span dir="rtl" lang="ar">الْفِعْلُ</span>'));
    inner.appendChild(el("h1", null, escapeHtml(course.course)));
    inner.appendChild(el("p", "hero-sub",
      total + " " + lessonsWord(total) + (doneCount ? " · пройдено " + doneCount : "")));
    const bar = el("div", "hero-progress");
    const fill = el("span");
    fill.style.width = Math.round((doneCount / total) * 100) + "%";
    bar.appendChild(fill);
    inner.appendChild(bar);
    hero.appendChild(inner);
    app.appendChild(hero);

    // «Продолжить» — первый непройденный урок
    const next = course.lessons.find(function (l) {
      return progress.done[l.id] !== true;
    });
    if (next) {
      const cont = el("button", "continue");
      cont.type = "button";
      cont.appendChild(el("div", "continue-icon", doneCount ? "→" : "▶"));
      const cb = el("div");
      cb.appendChild(el("div", "continue-label", doneCount ? "Продолжить" : "Начать"));
      cb.appendChild(el("div", "continue-title", "Урок " + next.id + ". " + escapeHtml(next.title)));
      cont.appendChild(cb);
      cont.addEventListener("click", function () {
        go("#/lesson/" + next.id);
      });
      app.appendChild(cont);
    }

    app.appendChild(el("div", "section-label", "Все уроки"));

    course.lessons.forEach(function (lesson) {
      const done = progress.done[lesson.id] === true;
      const card = el("button", "card lesson-link" + (done ? " done" : ""));
      card.type = "button";
      card.appendChild(el("div", "lesson-num", done ? "✓" : String(lesson.id)));
      const body = el("div", "lesson-body");
      body.appendChild(el("div", "lesson-title", escapeHtml(lesson.title)));
      body.appendChild(el("div", "lesson-sub", rich(lesson.summary)));
      const st = exerciseStats(lesson);
      if (st.total > 0) {
        const meta = el("div", "lesson-meta");
        const pbar = el("div", "progress");
        const pfill = el("span");
        pfill.style.width = Math.round((st.correct / st.total) * 100) + "%";
        pbar.appendChild(pfill);
        meta.appendChild(pbar);
        meta.appendChild(el("span", "count", "тесты " + st.correct + "/" + st.total));
        body.appendChild(meta);
      }
      card.appendChild(body);
      card.addEventListener("click", function () {
        go("#/lesson/" + lesson.id);
      });
      app.appendChild(card);
    });
  }

  // Тонкая полоса прогресса чтения урока
  const readBar = el("div", "read-progress");
  document.body.appendChild(readBar);

  function updateReadProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    readBar.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + "%";
  }

  function setReadProgress(on) {
    readBar.hidden = !on;
    if (on) {
      updateReadProgress();
    }
  }

  window.addEventListener("scroll", updateReadProgress, { passive: true });

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
    const btn = el("button", "btn reveal", "Показать ответ");
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

    // Шапка урока
    const head = el("header", "card lesson-head");
    head.appendChild(el("div", "pattern"));
    head.appendChild(el("div", "eyebrow", "Урок " + lesson.id + " из " + course.lessons.length));
    head.appendChild(el("h1", null, escapeHtml(lesson.title)));
    if (lesson.summary) {
      head.appendChild(el("p", "lesson-summary", rich(lesson.summary)));
    }
    app.appendChild(head);

    // Теория: каждый заголовок открывает новую карточку-раздел
    let section = null;
    lesson.blocks.forEach(function (block) {
      if (!section || block.type === "h") {
        section = el("section", "card section");
        app.appendChild(section);
      }
      section.appendChild(renderBlock(block));
    });

    // Упражнения
    const exHead = el("div", "ex-header");
    exHead.appendChild(el("h2", null, "Упражнения"));
    const score = el("div", "score");
    exHead.appendChild(score);
    app.appendChild(exHead);

    function updateScore() {
      const st = exerciseStats(lesson);
      score.textContent = "тесты " + st.correct + " из " + st.total;
      score.hidden = st.total === 0;
    }

    lesson.exercises.forEach(function (ex, ei) {
      const card = el("div", "card");
      const prompt = el("div", "ex-prompt");
      prompt.appendChild(el("span", "ex-n", String(ei + 1)));
      prompt.appendChild(el("div", null, rich(ex.prompt)));
      card.appendChild(prompt);
      if (ex.type === "choice") {
        card.appendChild(renderChoice(lesson, ex, ei, updateScore));
      } else {
        card.appendChild(renderReveal(ex));
      }
      app.appendChild(card);
    });
    updateScore();

    // Отметка о прохождении и навигация
    const doneBtn = el("button", "btn primary");
    doneBtn.type = "button";
    const prev = lessonById(lesson.id - 1);
    const next = lessonById(lesson.id + 1);

    function paintDone() {
      const done = progress.done[lesson.id] === true;
      doneBtn.classList.toggle("is-done", done);
      if (done) {
        doneBtn.textContent = next ? "✓ Пройден · следующий урок →" : "✓ Пройден · к списку уроков";
      } else {
        doneBtn.textContent = "Отметить урок пройденным";
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
    const finish = el("div", "finish");
    finish.appendChild(doneBtn);

    const nav = el("div", "lesson-nav");
    [[prev, "← Урок "], [next, "Урок "]].forEach(function (pair, i) {
      const target = pair[0];
      const b = el("button", "btn");
      b.type = "button";
      if (target) {
        b.textContent = i === 0 ? pair[1] + target.id : pair[1] + target.id + " →";
        b.addEventListener("click", function () {
          go("#/lesson/" + target.id);
        });
      } else {
        b.disabled = true;
      }
      nav.appendChild(b);
    });
    finish.appendChild(nav);
    app.appendChild(finish);

    setReadProgress(true);
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
    applyTheme();
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.BackButton) {
        tg.BackButton.onClick(onBack);
      }
      if (tg.onEvent) {
        tg.onEvent("themeChanged", applyTheme);
      }
    }
    if (!inTelegram() && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) {
        mq.addEventListener("change", applyTheme);
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
