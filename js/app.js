/* ============================================================
   设备监理师考试与学习系统 · 应用主逻辑
   纯前端实现：数据在 data/*.js，进度存 localStorage
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  var CFG = window.SBJL_CONFIG;
  var DATA = window.SBJL_DATA || {};
  var VIEW = document.getElementById('view');
  var STORE_KEY = 'sbjl_state_v1';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDate(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function addDays(s, n) {
    var d = parseDate(s); d.setDate(d.getDate() + n); return d;
  }
  function daysBetween(a, b) {
    var x = parseDate(a).getTime();
    var y = parseDate(b).getTime();
    return Math.round((y - x) / 86400000);
  }
  function fmtCN(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 状态 ---------------- */
  function defaultState() {
    return {
      examDate: CFG.examDate,
      chapters: {},   // chId: 'done' | 'doing'
      plan: {},       // 'p1-w0': true
      wrong: {},      // qid: {n: 次数, t: 最近时间}
      records: [],    // 练习记录
      exams: [],      // 模考记录
      daily: {},      // 'YYYY-MM-DD': {q, c}
      cases: {},      // caseId: {score, t}
      read: {},       // bookId: {chapterId: true}
      bookLast: {},   // bookId: 最近阅读章节
      readFont: 16,   // 教材阅读字号
      lastVisit: todayStr()
    };
  }
  var S = load();
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var d = JSON.parse(raw);
      var base = defaultState();
      for (var k in base) if (!(k in d)) d[k] = base[k];
      return d;
    } catch (e) { return defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('存储空间不足，数据未保存'); }
  }
  function touchDaily(q, c) {
    var k = todayStr();
    S.daily[k] = S.daily[k] || { q: 0, c: 0 };
    S.daily[k].q += q; S.daily[k].c += c;
    S.lastVisit = k;
    save();
  }
  function pushRecord(r) {
    S.records.push(r);
    if (S.records.length > 3000) S.records.splice(0, S.records.length - 3000);
  }

  /* ---------------- 题库索引 ---------------- */
  var SUBJECTS = CFG.subjects.map(function (m) {
    var d = DATA[m.id] || {};
    return Object.assign({}, m, {
      chapters: d.chapters || [],
      questions: d.questions || [],
      cases: d.cases || []
    });
  });
  function subj(id) { for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].id === id) return SUBJECTS[i]; return null; }
  var QMAP = {};
  SUBJECTS.forEach(function (s) {
    s.questions.forEach(function (q) { q.subject = s.id; QMAP[q.id] = q; });
  });
  function qOf(id) { return QMAP[id]; }
  function chapterOf(sid, chId) {
    var s = subj(sid); if (!s) return null;
    for (var i = 0; i < s.chapters.length; i++) if (s.chapters[i].id === chId) return s.chapters[i];
    return null;
  }
  function questionsOf(sid, chId, type) {
    var s = subj(sid); if (!s) return [];
    return s.questions.filter(function (q) {
      return (!chId || q.ch === chId) && (!type || type === 'all' || q.t === type);
    });
  }

  /* ---------------- 通用统计 ---------------- */
  function chapterProgress(s) {
    var total = s.chapters.length;
    var done = s.chapters.filter(function (c) { return S.chapters[c.id] === 'done'; }).length;
    return { total: total, done: done, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function subjectAccuracy(sid) {
    var t = 0, c = 0;
    S.records.forEach(function (r) { if (r.s === sid) { t += r.total; c += r.correct; } });
    return { total: t, correct: c, pct: t ? Math.round(c / t * 100) : 0 };
  }
  function overall() {
    var t = 0, c = 0;
    S.records.forEach(function (r) { t += r.total; c += r.correct; });
    return { total: t, correct: c, pct: t ? Math.round(c / t * 100) : 0 };
  }
  function wrongCount() { return Object.keys(S.wrong).length; }
  function todayStats() {
    var k = todayStr();
    return S.daily[k] || { q: 0, c: 0 };
  }

  /* ---------------- 路由 ---------------- */
  var TITLES = {
    home: '学习台', plan: '备考计划', method: '零基础学习法', learn: '章节精讲', book: '教材精读', practice: '题库练习',
    exam: '全真模考', case: '案例特训', wrong: '错题本', cards: '速记卡',
    stats: '学习数据', manual: '学习手册'
  };
  function go(hash) { location.hash = hash; }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts;
    try { parts = h.split('/').map(decodeURIComponent); }
    catch (e) { parts = h.split('/'); } // 地址里出现非法 % 编码时不至于整页崩溃
    var page = parts[0] || 'home';
    // 离开模考页视为放弃本次考试，停止计时，避免后台自动交卷打断学习
    if (page !== 'exam' && exam && !exam.submitted) {
      if (exam.timer) { clearInterval(exam.timer); exam.timer = null; }
      exam = null;
    }
    // 离开练习/错题重做页后丢弃旧会话，避免快捷键误触旧题
    if (page !== 'practice' && page !== 'wrong') session = null;
    window.scrollTo(0, 0);
    $('#topTitle').textContent = TITLES[page] || '学习台';
    $$('#nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === page); });
    $$('#mobileNav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#/' + page);
    });
    $('#sidebar').classList.remove('open');
    switch (page) {
      case 'plan': renderPlan(); break;
      case 'method': renderMethod(); break;
      case 'learn':
        // #/learn/科目 显示该科目章节目录；#/learn/科目/章节 才进入章节详情
        if (parts[2]) renderChapter(parts[1], parts[2]);
        else renderLearn(parts[1]);
        break;
      case 'book': renderBook(parts[1], parts[2]); break;
      case 'practice': renderPractice(parts[1], parts.slice(2).join('/')); break;
      case 'exam': renderExam(parts[1]); break;
      case 'case': parts[1] ? renderCaseDetail(parts[1]) : renderCaseList(); break;
      case 'wrong': renderWrong(); break;
      case 'cards': renderCards(); break;
      case 'stats': renderStats(); break;
      case 'manual': renderManual(); break;
      default: renderHome();
    }
  }
  window.addEventListener('hashchange', route);

  /* ---------------- 弹窗 / 提示 ---------------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function modal(title, html, onOpen) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modalMask').classList.add('show');
    if (onOpen) onOpen($('#modalBody'));
  }
  function closeModal() { $('#modalMask').classList.remove('show'); }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var days = daysBetween(todayStr(), S.examDate);
    var phase = currentPhase();
    var weekNo = phase ? currentWeekIndex(phase) : -1;
    var ov = overall();
    var ts = todayStats();
    var cards = SUBJECTS.map(function (s) {
      var p = chapterProgress(s);
      var a = subjectAccuracy(s.id);
      return '<a class="subject-card" href="#/learn/' + s.id + '">' +
        '<div class="sc-top"><span class="sc-code">' + s.code + '</span><span class="dot" style="background:' + s.color + '"></span></div>' +
        '<h3>' + esc(s.short) + ' · ' + (s.objective ? '客观题' : '主观题') + '</h3>' +
        '<div class="sc-meta">' + p.done + '/' + p.total + ' 章 · 正确率 ' + (a.total ? a.pct + '%' : '—') + '</div>' +
        '<div class="bar"><i style="width:' + p.pct + '%;background:' + s.color + '"></i></div>' +
        '</a>';
    }).join('');

    var tasks = [];
    if (phase) {
      var wi = currentWeekIndex(phase);
      var taskText = phase.tasks[wi] || phase.tasks[phase.tasks.length - 1];
      tasks.push({ text: taskText, key: phase.id + '-w' + wi });
      tasks.push({ text: '完成 30 道章节练习，错题当天回炉', key: 'daily-' + todayStr() + '-practice' });
      tasks.push({ text: '速记卡过 15 张，重点记数字类考点', key: 'daily-' + todayStr() + '-cards' });
    } else {
      tasks.push({ text: '自主预热期：按「零基础学习法」的 12 周清单，每天 30—45 分钟', key: 'warmup' });
    }

    var taskHtml = tasks.map(function (t) {
      var on = !!S.plan[t.key];
      return '<div class="today-item" data-key="' + esc(t.key) + '">' +
        '<span class="tick ' + (on ? 'on' : '') + '">✓</span>' +
        '<div class="small">' + esc(t.text) + '</div></div>';
    }).join('');

    // 今日学习路径：当前阶段科目 → 第一个未掌握的章节
    var focusId = (phase && phase.subject) ? phase.subject : 'fagui';
    if (focusId === 'anli') focusId = 'fagui';
    var fs = subj(focusId);
    var fIdx = 0;
    if (fs) {
      for (var ci = 0; ci < fs.chapters.length; ci++) {
        if (S.chapters[fs.chapters[ci].id] !== 'done') { fIdx = ci; break; }
      }
    }
    var fCh = fs ? fs.chapters[fIdx] : null;
    var pathHtml = (fs && fCh) ? '<div class="card card-pad" style="margin-top:16px">' +
      '<div class="row" style="justify-content:space-between"><h3 style="font-size:16px">今日学习路径</h3>' +
      '<span class="chip">' + esc(fs.short) + ' · ' + esc(fCh.name) + '</span></div>' +
      '<div class="path-steps">' +
        '<a href="#/book/' + fs.id + '/' + fs.id + '-c' + (fIdx + 1) + '"><b>1 读教材</b><span>本章原文，先通读一遍</span></a>' +
        '<a href="#/learn/' + fs.id + '/' + fCh.id + '"><b>2 看精讲</b><span>考点、易错、数字速记</span></a>' +
        '<a href="#/practice/' + fs.id + '/' + fCh.id + '"><b>3 做练习</b><span>本章题目，正确率 75% 过关</span></a>' +
      '</div></div>' : '';

    VIEW.innerHTML =
      '<div class="hero">' +
        '<h1>距 2027 年设备监理师考试还有 <span style="color:#e5c07b">' + (days > 0 ? days : 0) + '</span> 天</h1>' +
        '<p>' + esc(CFG.examNote) + '</p>' +
        '<div class="hero-meta">' +
          '<div class="hm"><b>' + (phase ? phase.name.split(' · ')[0] : '自主预热') + '</b><span>当前阶段</span></div>' +
          '<div class="hm"><b>' + (weekNo >= 0 ? '第 ' + (weekNo + 1) + ' 周' : '—') + '</b><span>阶段进度</span></div>' +
          '<div class="hm"><b>' + ov.total + '</b><span>累计做题</span></div>' +
          '<div class="hm"><b>' + (ov.total ? ov.pct + '%' : '—') + '</b><span>总正确率</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="subject-grid">' + cards + '</div>' +
      pathHtml +
      '<div class="dash-grid">' +
        '<div class="card card-pad">' +
          '<div class="row" style="justify-content:space-between"><h3 style="font-size:16px">今日任务</h3><span class="chip chip-quiet">' + fmtCN(new Date()) + '</span></div>' +
          '<div class="today-list" id="todayList">' + taskHtml + '</div>' +
          '<div class="row" style="margin-top:14px"><a class="btn btn-primary btn-sm" href="#/practice">开始刷题</a><a class="btn btn-sm" href="#/plan">查看完整计划</a></div>' +
        '</div>' +
        '<div class="card card-pad">' +
          '<h3 style="font-size:16px;margin-bottom:12px">快捷入口</h3>' +
          '<div class="quick">' +
            '<a href="#/exam"><b>全真模考</b><span>110 分 · 限时 2 小时</span></a>' +
            '<a href="#/wrong"><b>错题本</b><span>' + wrongCount() + ' 道待攻克</span></a>' +
            '<a href="#/cards"><b>速记卡</b><span>数字/公式/口诀</span></a>' +
            '<a href="#/case"><b>案例特训</b><span>主观题答题模板</span></a>' +
          '</div>' +
          '<div class="small muted" style="margin-top:14px">今日已做 <b>' + ts.q + '</b> 题，答对 <b>' + ts.c + '</b> 题</div>' +
        '</div>' +
      '</div>';

    $$('#todayList .today-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.dataset.key;
        S.plan[k] = !S.plan[k]; save();
        el.querySelector('.tick').classList.toggle('on', !!S.plan[k]);
      });
    });
  }

  function currentPhase() {
    var today = todayStr();
    for (var i = 0; i < CFG.plan.phases.length; i++) {
      var p = CFG.plan.phases[i];
      var end = addDays(p.start, p.weeks * 7 - 1);
      if (today >= p.start && today <= todayStr(end)) return p;
    }
    // 正式计划尚未开始：返回 null，由首页显示“自主预热”
    if (today < CFG.plan.phases[0].start) return null;
    return CFG.plan.phases[CFG.plan.phases.length - 1];
  }
  function currentWeekIndex(p) {
    var n = daysBetween(p.start, todayStr());
    if (n < 0) return 0;
    var i = Math.floor(n / 7);
    return Math.max(0, Math.min(p.weeks - 1, i));
  }

  /* ---------------- 备考计划 ---------------- */
  function renderPlan() {
    var today = todayStr();
    var html = '<div class="page-head"><div><h1>备考计划</h1><div class="sub">2027 年 4 月预热 · 5—8 月每月一科 · 9 月冲刺，共 23 周</div></div>' +
      '<a class="btn" href="#/manual">查看学习手册</a></div>';

    html += '<div class="card card-pad" style="margin-bottom:18px">' +
      '<div class="row" style="justify-content:space-between"><h3 style="font-size:16px">四科考试规则</h3>' +
      '<span class="chip chip-gold">合格线 66 分（满分 110）</span></div>' +
      '<table class="num-table" style="margin-top:12px"><tr><th>科目</th><th>时长</th><th>题型</th><th>满分/合格</th></tr>' +
      '<tr><td>设备监理基础知识和相关法规</td><td>2 小时</td><td>单选 50 + 多选 30</td><td>110 / 66</td></tr>' +
      '<tr><td>设备工程质量管理与检验</td><td>2 小时</td><td>单选 50 + 多选 30</td><td>110 / 66</td></tr>' +
      '<tr><td>设备工程项目管理</td><td>2 小时</td><td>单选 50 + 多选 30</td><td>110 / 66</td></tr>' +
      '<tr><td>设备监理实务与案例分析</td><td>3 小时</td><td>案例 5 题（20/25 分）</td><td>110 / 66</td></tr>' +
      '</table></div>';

    html += '<div class="phase-list">';
    CFG.plan.phases.forEach(function (p, pi) {
      var start = p.start, end = todayStr(addDays(p.start, p.weeks * 7 - 1));
      var status = today > end ? 'done' : (today >= start ? 'active' : '');
      var total = p.weeks, doneW = 0;
      for (var i = 0; i < p.weeks; i++) if (S.plan[p.id + '-w' + i]) doneW++;
      html += '<div class="phase ' + status + '">' +
        '<div class="phase-head"><h3>' + p.name + '</h3>' +
        '<span class="phase-date">' + start + ' ~ ' + end + ' · ' + doneW + '/' + total + ' 周</span>' +
        (status === 'active' ? '<span class="chip chip-gold">进行中</span>' : (status === 'done' ? '<span class="chip">已完成</span>' : '')) +
        '</div>' +
        '<div class="small muted" style="margin:6px 0 4px">' + esc(p.goal) + '</div>' +
        '<div class="small" style="margin:4px 0 8px">' + p.tasks.map(function (t) { return '· ' + esc(t); }).join('<br>') + '</div>';
      html += '<div class="week-list">';
      for (var w = 0; w < p.weeks; w++) {
        var ws = todayStr(addDays(p.start, w * 7));
        var we = todayStr(addDays(p.start, w * 7 + 6));
        var isCur = today >= ws && today <= we;
        var key = p.id + '-w' + w;
        var task = p.tasks[w] || p.tasks[p.tasks.length - 1];
        html += '<label class="week ' + (isCur ? 'current' : '') + '">' +
          '<span class="wk-no">第' + (w + 1) + '周</span>' +
          '<span class="wk-body"><b>' + esc(task) + '</b><div>' + ws + ' ~ ' + we + (isCur ? ' · 本周' : '') + '</div></span>' +
          '<input type="checkbox" data-plan="' + key + '" ' + (S.plan[key] ? 'checked' : '') + '>' +
          '</label>';
      }
      html += '</div></div>';
    });
    html += '</div>';

    html += '<div class="section-title">每周学习节奏</div><div class="card card-pad"><table class="num-table">' +
      CFG.plan.rhythm.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</table></div>';

    VIEW.innerHTML = html;
    $$('[data-plan]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        S.plan[cb.dataset.plan] = cb.checked; save();
        toast(cb.checked ? '本周任务已完成' : '已取消');
      });
    });
  }

  /* ---------------- 零基础学习法 ---------------- */
  function renderMethod() {
    var M = window.SBJL_METHOD;
    if (!M) { VIEW.innerHTML = '<div class="card card-pad muted">学习法内容加载失败。</div>'; return; }
    var principles = M.principles.map(function (p) {
      return '<div class="principle"><b>' + esc(p.h) + '</b><p>' + esc(p.d) + '</p></div>';
    }).join('');
    var steps = M.steps.map(function (s) {
      return '<div class="step-item"><div class="step-no">' + s.n + '</div>' +
        '<div><b>' + esc(s.t) + '</b><p>' + esc(s.d) + '</p></div></div>';
    }).join('');
    var subjects = M.subjects.map(function (s) {
      return '<div class="subject-method">' +
        '<div class="row" style="justify-content:space-between"><h3>' + esc(s.name) + '</h3>' +
        '<span class="chip chip-quiet">' + esc(s.level) + ' · ' + esc(s.type) + '</span></div>' +
        '<div class="sm-row"><span>你的优势</span><div>' + esc(s.advantage) + '</div></div>' +
        '<div class="sm-row"><span>必须拿下</span><div>' + esc(s.must) + '</div></div>' +
        '<div class="sm-row"><span>可以放掉</span><div>' + esc(s.skip) + '</div></div>' +
        '<div class="sm-row"><span>怎么学</span><div>' + esc(s.how) + '</div></div>' +
        '<div class="sm-daily">' + esc(s.daily) + '</div></div>';
    }).join('');
    var schedule = M.schedule.map(function (s) {
      return '<tr><td><b>' + esc(s.phase) + '</b><br><span class="small muted">' + esc(s.name) + '</span></td>' +
        '<td>' + esc(s.time) + '</td><td>' + esc(s.goal) + '<br><span class="small muted">' + esc(s.task) + '</span></td></tr>';
    }).join('');
    var daily = M.daily.map(function (d) { return '<tr><td>' + esc(d[0]) + '</td><td>' + esc(d[1]) + '</td></tr>'; }).join('');
    var metrics = M.metrics.map(function (m) { return '<tr><td>' + esc(m[0]) + '</td><td>' + esc(m[1]) + '</td></tr>'; }).join('');
    var warmup = M.warmup.map(function (w, i) {
      var key = 'm-w' + i;
      var on = !!S.plan[key];
      return '<label class="warmup-row"><span class="wk-no">' + esc(w[0]) + '</span>' +
        '<span class="wk-body">' + esc(w[1]) + '</span>' +
        '<input type="checkbox" data-method="' + key + '" ' + (on ? 'checked' : '') + '></label>';
    }).join('');
    var doneW = M.warmup.filter(function (w, i) { return S.plan['m-w' + i]; }).length;

    VIEW.innerHTML = '<div class="page-head"><div><h1>零基础学习法</h1>' +
      '<div class="sub">给大专理科、从零开始的你：先建地图，再抓考点，用做题验证，靠间隔重复</div></div>' +
      '<a class="btn" href="#/plan">对照备考计划</a></div>' +
      '<div class="card card-pad" style="background:linear-gradient(120deg,#153b32,#256856);color:#eef4ef;border:none">' +
      '<p style="font-size:15px;line-height:1.8;margin:0">' + esc(M.intro) + '</p>' +
      '<div class="row" style="margin-top:14px"><span class="chip" style="background:rgba(255,255,255,.14);color:#fff">每天 90 分钟</span>' +
      '<span class="chip" style="background:rgba(255,255,255,.14);color:#fff">每章三遍</span>' +
      '<span class="chip" style="background:rgba(255,255,255,.14);color:#fff">错题 3/7/30 天回炉</span></div></div>' +
      '<div class="section-title">五条底层原则</div><div class="principle-grid">' + principles + '</div>' +
      '<div class="section-title">六步学习闭环（每章都走一遍）</div><div class="card card-pad"><div class="step-list">' + steps + '</div></div>' +
      '<div class="section-title">四科怎么打</div><div class="subject-method-grid">' + subjects + '</div>' +
      '<div class="section-title">时间怎么排（零基础版）</div><div class="card card-pad"><table class="num-table">' +
      '<tr><th style="width:22%">阶段</th><th style="width:24%">投入</th><th>目标与任务</th></tr>' + schedule + '</table>' +
      '<div class="small muted" style="margin-top:10px">零基础不要等到 5 月才启动：现在到 1 月先做 90 天预热，每天 30—45 分钟，把术语和框架混熟，5 月直接进法规才不会挫败。</div></div>' +
      '<div class="section-title">每天 90 分钟模板</div><div class="card card-pad"><table class="num-table">' +
      '<tr><th style="width:22%">时间</th><th>做什么</th></tr>' + daily + '</table></div>' +
      '<div class="section-title">12 周零基础预热清单 <span class="small muted">（已完成 <b id="warmupDone">' + doneW + '</b>/12）</span></div>' +
      '<div class="card card-pad"><div class="warmup-list">' + warmup + '</div></div>' +
      '<div class="section-title">零基础最容易踩的六个坑</div><div class="trap-box"><ul>' +
      M.pitfalls.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="section-title">什么算“学会了”</div><div class="card card-pad"><table class="num-table">' +
      '<tr><th style="width:26%">层级</th><th>达标标准</th></tr>' + metrics + '</table></div>';

    $$('[data-method]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        S.plan[cb.dataset.method] = cb.checked; save();
        var n = M.warmup.filter(function (w, i) { return S.plan['m-w' + i]; }).length;
        $('#warmupDone').textContent = n;
        toast(cb.checked ? '本周预热完成' : '已取消');
      });
    });
  }

  /* ---------------- 教材精读 ---------------- */
  var BOOK_META = [
    { id: 'fagui', short: '法规', name: '法规教材', desc: '2024 版教材 · 7 章', color: '#1f6f5c', chapters: 7, learn: 'fagui', practice: 'fagui' },
    { id: 'zhiliang', short: '质量', name: '质量教材', desc: '2024 冲刺教材 · 9 章', color: '#3a6382', chapters: 9, learn: 'zhiliang', practice: 'zhiliang' },
    { id: 'xiangmu', short: '管理', name: '管理教材', desc: '2024 讲义 · 8 章', color: '#8b6425', chapters: 8, learn: 'xiangmu', practice: 'xiangmu' },
    { id: 'guifan', short: '规范', name: '规范解读', desc: 'GB/T 26429-2022', color: '#9c4a33', chapters: 1, learn: 'fagui', practice: 'fagui' },
    { id: 'law2023', short: '法规旧版', name: '法规教材（2023 旧版）', desc: '扫描 OCR · 7 章', color: '#6b7a73', chapters: 7, learn: 'fagui', practice: 'fagui' },
    { id: 'guifanfull', short: '规范详解', name: '规范理解与实施', desc: '扫描 OCR · 11 章', color: '#5b5f8a', chapters: 11, learn: 'fagui', practice: 'fagui' }
  ];
  var bookState = { kw: '', bid: '' };

  function bookMeta(id) {
    for (var i = 0; i < BOOK_META.length; i++) if (BOOK_META[i].id === id) return BOOK_META[i];
    return BOOK_META[0];
  }
  function buildToc(chapters, readMap, activeId, kw) {
    var list = chapters;
    if (kw) {
      list = chapters.filter(function (c) { return (c.title + (c.text || '')).indexOf(kw) >= 0; });
    }
    var html = list.map(function (c) {
      var on = !!readMap[c.id];
      var text = c.text || '';
      var snip = '';
      if (kw) {
        var src = c.title + ' ' + text;
        var pos = src.indexOf(kw);
        snip = '<div class="toc-snip">…' + esc(src.slice(Math.max(0, pos - 18), pos + 30)) + '…</div>';
      }
      return '<a class="toc-item ' + (c.id === activeId ? 'active' : '') + '" href="#/book/' + bookState.bid + '/' + c.id + '">' +
        '<span class="toc-dot ' + (on ? 'on' : '') + '"></span>' +
        '<span class="toc-text"><b>' + esc(c.title) + '</b>' + snip +
        '<em>' + Math.max(1, Math.round((c.len || text.length) / 450)) + ' 分钟</em></span></a>';
    }).join('');
    return html || '<div class="small muted" style="padding:8px">没有匹配的章节</div>';
  }
  function loadBook(id, cb) {
    if (window.SBJL_BOOKS && window.SBJL_BOOKS[id]) { cb(); return; }
    var old = document.getElementById('bookScript-' + id);
    if (old) { old.addEventListener('load', cb); return; }
    var s = document.createElement('script');
    s.id = 'bookScript-' + id;
    s.src = 'data/book-' + id + '.js';
    s.onload = cb;
    s.onerror = function () {
      toast('教材文件加载失败，请检查 data/book-' + id + '.js');
      if (location.hash.indexOf('#/book/' + id) === 0 || location.hash === '#/book') {
        var v = document.getElementById('view');
        if (v) v.innerHTML = '<div class="page-head"><h1>教材精读</h1></div>' +
          '<div class="card card-pad muted">教材文件加载失败：data/book-' + esc(id) + '.js。请刷新页面重试。</div>';
      }
    };
    document.body.appendChild(s);
  }
  function loadScriptOnce(src, cb) {
    var old = document.querySelector('script[data-src="' + src + '"]');
    if (old) { old.addEventListener('load', cb); return; }
    var s = document.createElement('script');
    s.src = src;
    s.dataset.src = src;
    s.onload = cb;
    s.onerror = function () { toast('数据文件加载失败：' + src); };
    document.body.appendChild(s);
  }
  function renderBook(bid, chId) {
    bid = bid || 'fagui';
    var meta = bookMeta(bid);
    var tabs = BOOK_META.map(function (b) {
      var read = S.read[b.id] || {};
      var n = Object.keys(read).length;
      return '<a class="subj-tab ' + (b.id === bid ? 'active' : '') + '" href="#/book/' + b.id + '">' +
        '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:' + b.color + '"></span>' +
        esc(b.short) + ' <span id="tabCount-' + b.id + '">' + n + '</span>/' + b.chapters + '</a>';
    }).join('');

    if (!(window.SBJL_BOOKS && window.SBJL_BOOKS[bid])) {
      // 正文尚未加载：先用轻量目录把页面撑起来，正文在后台加载
      if (bookState.bid !== bid) { bookState.bid = bid; bookState.kw = ''; }
      var mb = window.SBJL_BOOK_META && window.SBJL_BOOK_META[bid];
      var mChapters = (mb && mb.chapters) || [];
      var mRead = S.read[bid] || {};
      var mReadN = mChapters.filter(function (c) { return !!mRead[c.id]; }).length;
      var wantId = chId || (S.bookLast && S.bookLast[bid]) || (mChapters[0] && mChapters[0].id);
      var want = null;
      for (var mi = 0; mi < mChapters.length; mi++) if (mChapters[mi].id === wantId) want = mChapters[mi];
      if (!want) want = mChapters[0];
      VIEW.innerHTML = '<div class="page-head"><div><h1>教材精读</h1>' +
        '<div class="sub">' + esc(meta.name) + ' · ' + esc(meta.desc) + ' · <span id="bookReadInfo">已读 ' + mReadN + '/' + mChapters.length + ' 章</span></div></div>' +
        '<div class="row"><span class="chip chip-quiet" id="bookPct">阅读进度 ' + (mChapters.length ? Math.round(mReadN / mChapters.length * 100) : 0) + '%</span></div></div>' +
        '<div class="subj-tabs">' + tabs + '</div>' +
        '<div class="book-layout"><aside class="book-toc"><input type="search" id="bookSearch" placeholder="搜索章节标题…" value="' + esc(bookState.kw) + '">' +
        '<div class="toc-list" id="tocList">' + buildToc(mChapters, mRead, want ? want.id : '', bookState.kw.trim()) + '</div>' +
        '<div class="small muted" style="padding:8px 4px">目录已就绪，正文按需加载；首次打开需下载本章原文，之后浏览器会缓存。</div></aside>' +
        '<article class="book-reader"><div class="reader-head"><div class="row" style="justify-content:space-between">' +
        '<h2>' + esc(want ? want.title : '正在加载目录') + '</h2><span class="small muted">正在加载…</span></div></div>' +
        '<div class="reader-body" id="readerBody"><p class="muted">正在加载正文，请稍候…</p></div></article></div>';
      $('#bookSearch').addEventListener('input', function () {
        bookState.kw = this.value;
        $('#tocList').innerHTML = buildToc(mChapters, mRead, want ? want.id : '', this.value.trim());
      });
      loadBook(bid, function () {
        if (location.hash.indexOf('#/book/' + bid) === 0 || location.hash === '#/book') renderBook(bid, chId);
      });
      return;
    }

    var book = window.SBJL_BOOKS[bid];
    var chapters = book.chapters;
    if (!chapters || !chapters.length) {
      VIEW.innerHTML = '<div class="page-head"><h1>教材精读</h1></div><div class="card card-pad muted">这本教材暂无正文，请稍后重试。</div>';
      return;
    }
    if (!chId && S.bookLast && S.bookLast[bid]) chId = S.bookLast[bid];
    var ch = null;
    for (var i = 0; i < chapters.length; i++) if (chapters[i].id === chId) ch = chapters[i];
    if (!ch) ch = chapters[0];
    if (!S.bookLast) S.bookLast = {};
    if (S.bookLast[bid] !== ch.id) { S.bookLast[bid] = ch.id; save(); }
    var idx = chapters.indexOf(ch);
    var readMap = S.read[bid] || {};
    var readN = chapters.filter(function (c) { return !!readMap[c.id]; }).length;
    var pct = Math.round(readN / chapters.length * 100);

    if (bookState.bid !== bid) { bookState.bid = bid; bookState.kw = ''; }
    var kw = bookState.kw.trim();
    var toc = buildToc(chapters, readMap, ch.id, kw);

    var paras = ch.text.split('\n\n').map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) {
      return '<p>' + esc(p) + '</p>';
    }).join('');
    var isRead = !!readMap[ch.id];

    VIEW.innerHTML = '<div class="page-head"><div><h1>教材精读</h1>' +
      '<div class="sub">' + esc(meta.name) + ' · ' + esc(meta.desc) + ' · <span id="bookReadInfo">已读 ' + readN + '/' + chapters.length + ' 章</span></div></div>' +
      '<div class="row"><span class="chip chip-quiet" id="bookPct">阅读进度 ' + pct + '%</span>' +
      '<a class="btn btn-sm" href="#/learn/' + meta.learn + '">对应精讲</a>' +
      '<a class="btn btn-sm" href="#/practice/' + meta.practice + '">做本科题</a></div></div>' +
      '<div class="subj-tabs">' + tabs + '</div>' +
      '<div class="book-layout">' +
        '<aside class="book-toc"><input type="search" id="bookSearch" placeholder="搜索本册关键词…" value="' + esc(bookState.kw) + '">' +
        '<div class="toc-list" id="tocList">' + toc + '</div>' +
        '<div class="small muted" style="padding:8px 4px">收录：法规 2024 教材、质量冲刺教材、管理讲义、规范解读；法规 2023 旧版与规范理解与实施为扫描 OCR 版，个别字句可能有误，以原书为准。</div></aside>' +
        '<article class="book-reader">' +
          '<div class="reader-head"><div class="row" style="justify-content:space-between">' +
          '<h2>' + esc(ch.title) + '</h2><div class="row">' +
          '<button class="icon-btn" id="fontMinus" title="缩小字号">A−</button>' +
          '<button class="icon-btn" id="fontPlus" title="放大字号">A+</button></div></div>' +
          '<div class="row" style="margin-top:6px">' +
          '<button class="btn btn-sm ' + (isRead ? 'btn-primary' : '') + '" id="btnRead">' + (isRead ? '✓ 已读' : '标记本章已读') + '</button>' +
          '<span class="small muted">约 ' + Math.max(1, Math.round(ch.text.length / 450)) + ' 分钟</span></div></div>' +
          '<div class="reader-body" id="readerBody" style="font-size:' + (S.readFont || 16) + 'px">' + paras + '</div>' +
          '<div class="reader-foot">' +
            (idx > 0 ? '<a class="btn btn-sm" id="bookPrev" href="#/book/' + bid + '/' + chapters[idx - 1].id + '">← ' + esc(chapters[idx - 1].title) + '</a>' : '<span></span>') +
            (idx < chapters.length - 1 ? '<a class="btn btn-sm" id="bookNext" href="#/book/' + bid + '/' + chapters[idx + 1].id + '">' + esc(chapters[idx + 1].title) + ' →</a>' : '<span></span>') +
          '</div>' +
        '</article></div>';

    $('#bookSearch').addEventListener('input', function () {
      bookState.kw = this.value;
      $('#tocList').innerHTML = buildToc(chapters, readMap, ch.id, this.value.trim());
    });
    $('#fontMinus').addEventListener('click', function () {
      S.readFont = Math.max(13, (S.readFont || 16) - 1); save();
      $('#readerBody').style.fontSize = S.readFont + 'px';
    });
    $('#fontPlus').addEventListener('click', function () {
      S.readFont = Math.min(22, (S.readFont || 16) + 1); save();
      $('#readerBody').style.fontSize = S.readFont + 'px';
    });
    $('#btnRead').addEventListener('click', function () {
      S.read[bid] = S.read[bid] || {};
      var nowRead = !S.read[bid][ch.id];
      if (nowRead) S.read[bid][ch.id] = true;
      else delete S.read[bid][ch.id];
      save();
      var n = chapters.filter(function (c) { return !!S.read[bid][c.id]; }).length;
      this.textContent = nowRead ? '✓ 已读' : '标记本章已读';
      this.classList.toggle('btn-primary', nowRead);
      $('#bookReadInfo').textContent = '已读 ' + n + '/' + chapters.length + ' 章';
      $('#bookPct').textContent = '阅读进度 ' + Math.round(n / chapters.length * 100) + '%';
      var tc = document.getElementById('tabCount-' + bid);
      if (tc) tc.textContent = n;
      var dot = document.querySelector('.toc-item[href="#/book/' + bid + '/' + ch.id + '"] .toc-dot');
      if (dot) dot.classList.toggle('on', nowRead);
      toast(nowRead ? '已标记本章' : '已取消');
    });
  }

  /* ---------------- 章节精讲 ---------------- */
  function renderLearn(sid) {
    sid = sid || (SUBJECTS[0] && SUBJECTS[0].id);
    var s = subj(sid) || SUBJECTS[0];
    var tabs = SUBJECTS.map(function (x) {
      var p = chapterProgress(x);
      return '<a class="subj-tab ' + (x.id === s.id ? 'active' : '') + '" href="#/learn/' + x.id + '">' +
        '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:' + x.color + '"></span>' +
        esc(x.short) + ' ' + p.done + '/' + p.total + '</a>';
    }).join('');
    var rows = s.chapters.map(function (c, i) {
      var st = S.chapters[c.id];
      return '<a class="chapter-row" href="#/learn/' + s.id + '/' + c.id + '">' +
        '<span class="ch-no">' + (i + 1) + '</span>' +
        '<span class="ch-main"><b>' + esc(c.name) + '</b><span>' + esc(c.weight || '') + (c.level ? ' · ' + c.level : '') + '</span></span>' +
        '<span class="ch-side">' +
          (st === 'done' ? '<span class="chip">已掌握</span>' : (st === 'doing' ? '<span class="chip chip-gold">学习中</span>' : '<span class="chip chip-quiet">未开始</span>')) +
          '<span class="small muted">' + ((c.points || []).length) + ' 个考点</span>' +
        '</span></a>';
    }).join('');
    VIEW.innerHTML = '<div class="page-head"><div><h1>' + esc(s.name) + '</h1>' +
      '<div class="sub">' + s.code + (s.objective ? ' · 客观题（单选 50 + 多选 30，110 分）' : ' · 主观题（案例 5 题，110 分）') + '</div></div>' +
      '<a class="btn btn-primary" href="#/practice/' + s.id + '">本科目刷题</a></div>' +
      '<div class="subj-tabs">' + tabs + '</div>' +
      '<div class="chapter-list">' + rows + '</div>';
  }

  function renderChapter(sid, chId) {
    var s = subj(sid); var c = chapterOf(sid, chId);
    if (!s || !c) { go('#/learn'); return; }
    var idx = s.chapters.indexOf(c);
    var points = (c.points || []).map(function (p) {
      return '<div class="point"><h4>' + esc(p.h) +
        (p.star ? ' <span class="star">' + '★'.repeat(p.star) + '</span>' : '') + '</h4>' +
        '<div class="body">' + (p.body || '') + '</div></div>';
    }).join('');
    var traps = (c.traps && c.traps.length) ? '<div class="trap-box"><h4>易错提醒</h4><ul>' +
      c.traps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' : '';
    var nums = (c.nums && c.nums.length) ? '<div class="section-title">数字 / 期限速记</div>' +
      '<table class="num-table">' + c.nums.map(function (n) { return '<tr><td>' + esc(n[0]) + '</td><td>' + esc(n[1]) + '</td></tr>'; }).join('') + '</table>' : '';
    var st = S.chapters[c.id];
    VIEW.innerHTML = '<div class="reading">' +
      '<div class="reading-head">' +
        '<a class="small muted" href="#/learn/' + s.id + '">← 返回 ' + esc(s.short) + ' 章节目录</a>' +
        '<h1 style="margin-top:10px">' + esc(c.name) + '</h1>' +
        '<div class="meta"><span class="chip">' + esc(c.weight || '考情待补充') + '</span>' +
        (c.level ? '<span class="chip chip-gold">' + esc(c.level) + '</span>' : '') +
        '<span class="chip chip-quiet">' + (c.points || []).length + ' 个考点</span>' +
        '<span class="chip chip-quiet">' + questionsOf(s.id, c.id).length + ' 道练习题</span></div>' +
      '</div>' +
      '<div class="small muted" style="margin-bottom:14px">' + esc(c.intro || '') + '</div>' +
      points + traps + nums +
      '<div class="row" style="margin-top:22px">' +
        '<button class="btn" id="btnMaster">' + (st === 'done' ? '✓ 已掌握（点击取消）' : '标记为已掌握') + '</button>' +
        '<a class="btn btn-primary" href="#/practice/' + s.id + '/' + c.id + '">做本章练习</a>' +
        (sid !== 'anli' ? '<a class="btn" href="#/book/' + sid + '/' + sid + '-c' + (idx + 1) + '">读教材本章</a>' : '') +
        (idx > 0 ? '<a class="btn" href="#/learn/' + s.id + '/' + s.chapters[idx - 1].id + '">上一章</a>' : '') +
        (idx < s.chapters.length - 1 ? '<a class="btn" href="#/learn/' + s.id + '/' + s.chapters[idx + 1].id + '">下一章</a>' : '') +
      '</div></div>';
    $('#btnMaster').addEventListener('click', function () {
      if (S.chapters[c.id] === 'done') delete S.chapters[c.id];
      else S.chapters[c.id] = 'done';
      save(); renderChapter(sid, chId);
      toast(S.chapters[c.id] === 'done' ? '已标记掌握' : '已取消');
    });
  }

  /* ---------------- 练习 ---------------- */
  var session = null;

  function renderPractice(sid, chId) {
    if (sid && chId) {
      // 从章节页直接进入：本章全部题目
      var list = questionsOf(sid, chId, 'all');
      if (!list.length) { toast('本章暂无练习题'); go('#/practice'); return; }
      startPractice(sid, chId, 'all', 0, 'practice');
      return;
    }
    var opts = SUBJECTS.filter(function (s) { return s.questions.length > 0; }).map(function (s) {
      return '<option value="' + s.id + '" ' + (sid === s.id ? 'selected' : '') + '>' + esc(s.name) + '（' + s.questions.length + ' 题）</option>';
    }).join('');
    VIEW.innerHTML = '<div class="page-head"><div><h1>题库练习</h1><div class="sub">按科目、章节、题型自由练习；做错的题自动进入错题本</div></div></div>' +
      '<div class="card card-pad" style="max-width:620px">' +
      '<div class="field"><label>选择科目</label><select id="pSubject">' + opts + '</select></div>' +
      '<div class="field"><label>选择章节</label><select id="pChapter"><option value="">全部章节</option></select></div>' +
      '<div class="field"><label>题型</label><select id="pType"><option value="all">全部题型</option><option value="single">单项选择</option><option value="multi">多项选择</option></select></div>' +
      '<div class="field"><label>题目数量</label><select id="pCount"><option value="10">10 题（约 10 分钟）</option><option value="20" selected>20 题（约 20 分钟）</option><option value="30">30 题</option><option value="50">50 题</option><option value="0">全部</option></select></div>' +
      '<div class="field"><label>模式</label><select id="pMode"><option value="practice">练习模式（答完立即看解析）</option><option value="recite">背题模式（直接显示答案）</option></select></div>' +
      '<button class="btn btn-primary btn-lg" id="btnStartPractice" style="width:100%">开始练习</button></div>';
    var sel = $('#pSubject'), chSel = $('#pChapter');
    function fillCh() {
      var s = subj(sel.value);
      chSel.innerHTML = '<option value="">全部章节</option>' + s.chapters.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + '（' + questionsOf(s.id, c.id).length + ' 题）</option>';
      }).join('');
    }
    sel.addEventListener('change', fillCh); fillCh();
    $('#btnStartPractice').addEventListener('click', function () {
      startPractice(sel.value, chSel.value, $('#pType').value, Number($('#pCount').value), $('#pMode').value);
    });
  }

  function startPractice(sid, chId, type, count, mode) {
    var list = questionsOf(sid, chId, type);
    if (!list.length) { toast('没有符合条件的题目'); return; }
    list = shuffle(list);
    if (count > 0) list = list.slice(0, count);
    session = {
      kind: 'practice', sid: sid, ch: chId, mode: mode, list: list,
      idx: 0, answers: {}, revealed: {}, start: Date.now()
    };
    renderPracticeQuestion();
  }

  function renderPracticeQuestion() {
    var s = session, q = s.list[s.idx];
    var sel = s.answers[q.id] || [];
    var revealed = s.mode === 'recite' || s.revealed[q.id];
    var ch = chapterOf(q.subject, q.ch);
    var opts = q.o.map(function (text, i) {
      var cls = 'opt';
      if (revealed) {
        if (q.a.indexOf(i) >= 0) cls += ' right';
        else if (sel.indexOf(i) >= 0) cls += ' wrong';
      } else if (sel.indexOf(i) >= 0) cls += ' sel';
      return '<div class="' + cls + '" data-i="' + i + '">' +
        '<span class="ok">' + String.fromCharCode(65 + i) + '</span><span>' + esc(text) + '</span></div>';
    }).join('');
    var correct = q.a.every(function (x) { return sel.indexOf(x) >= 0; }) && sel.length === q.a.length;
    var ansLine = q.a.map(function (i) { return String.fromCharCode(65 + i); }).join('') +
      (q.t === 'multi' ? '（多选，错选不得分，少选每个选项 0.5 分）' : '');
    var recite = s.mode === 'recite';
    var ansStatus = recite ? ' · 背题模式' : (correct ? ' · 回答正确' : (sel.length ? ' · 回答错误' : ' · 未作答'));
    var analysis = revealed ? '<div class="analysis"><div class="ans-line ' + (!recite && !correct ? 'bad' : '') + '">正确答案：' + ansLine + ansStatus + '</div>' +
      '<div>' + esc(q.e || '本题暂无解析，请对照教材相应章节。') + '</div></div>' : '';

    VIEW.innerHTML = '<div class="practice-wrap">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:10px">' +
        '<a class="small muted" href="#/practice">← 退出练习</a>' +
        '<span class="small muted">' + (s.idx + 1) + ' / ' + s.list.length + ' · ' + esc(subj(q.subject).short) + ' · ' + esc(ch ? ch.name : '') + '</span></div>' +
      '<div class="progress-line"><i style="width:' + ((s.idx + 1) / s.list.length * 100) + '%"></i></div>' +
      '<div class="q-card">' +
        '<div class="q-meta"><span class="chip ' + (q.t === 'multi' ? 'chip-gold' : '') + '">' + (q.t === 'multi' ? '多项选择 · 2 分' : '单项选择 · 1 分') + '</span>' +
        (q.diff ? '<span class="chip chip-quiet">难度 ' + '●'.repeat(q.diff) + '</span>' : '') + '</div>' +
        '<div class="q-stem"><span class="q-no">' + (s.idx + 1) + '.</span>' + esc(q.q) + '</div>' +
        '<div class="opts" id="opts">' + opts + '</div>' + analysis +
      '</div>' +
      '<div class="practice-foot">' +
        (revealed ? '<button class="btn btn-primary" id="btnNext">' + (s.idx === s.list.length - 1 ? '查看本次结果' : '下一题') + '</button>'
                  : '<button class="btn btn-primary" id="btnCheck">确认答案</button>') +
        '<button class="btn" id="btnSkip">跳过</button>' +
        '<span class="spacer"></span><span class="small muted">快捷键：1—5 选项，Enter 确认/下一题</span>' +
      '</div></div>';

    $$('#opts .opt').forEach(function (el) {
      el.addEventListener('click', function () {
        if (revealed) return;
        var i = Number(el.dataset.i);
        var cur = session.answers[q.id] || [];
        if (q.t === 'multi') {
          var p = cur.indexOf(i);
          if (p >= 0) cur.splice(p, 1); else cur.push(i);
        } else {
          cur = [i];
        }
        session.answers[q.id] = cur.sort();
        renderPracticeQuestion();
      });
    });
    if ($('#btnCheck')) $('#btnCheck').addEventListener('click', checkPractice);
    if ($('#btnNext')) $('#btnNext').addEventListener('click', nextPractice);
    if ($('#btnSkip')) $('#btnSkip').addEventListener('click', function () { session.idx++; if (session.idx >= session.list.length) finishPractice(); else renderPracticeQuestion(); });
  }

  function checkPractice() {
    var s = session, q = s.list[s.idx];
    var sel = s.answers[q.id] || [];
    if (!sel.length) { toast('请先选择答案'); return; }
    s.revealed[q.id] = true;
    var ok = q.a.length === sel.length && q.a.every(function (x) { return sel.indexOf(x) >= 0; });
    if (ok) {
      if (S.wrong[q.id]) {
        S.wrong[q.id].ok = (S.wrong[q.id].ok || 0) + 1;
        if (S.wrong[q.id].ok >= 2) delete S.wrong[q.id];
      }
    } else {
      S.wrong[q.id] = S.wrong[q.id] || { n: 0, t: '' };
      S.wrong[q.id].n++; S.wrong[q.id].t = todayStr();
    }
    pushRecord({ t: Date.now(), s: q.subject, ch: q.ch, total: 1, correct: ok ? 1 : 0, mode: s.mode });
    touchDaily(1, ok ? 1 : 0);
    save();
    renderPracticeQuestion();
  }

  function nextPractice() {
    session.idx++;
    if (session.idx >= session.list.length) { finishPractice(); return; }
    renderPracticeQuestion();
  }

  function finishPractice() {
    var s = session;
    var total = 0, correct = 0;
    s.list.forEach(function (q) {
      var sel = s.answers[q.id];
      if (!sel || !sel.length) return;
      total++;
      if (q.a.length === sel.length && q.a.every(function (x) { return sel.indexOf(x) >= 0; })) correct++;
    });
    var mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
    VIEW.innerHTML = '<div class="practice-wrap"><div class="card card-pad result-hero">' +
      '<div class="result-score">' + correct + ' / ' + s.list.length + '</div>' +
      '<div class="rs-sub">本次练习正确率 ' + Math.round(correct / s.list.length * 100) + '% · 用时约 ' + mins + ' 分钟</div>' +
      '<div class="row" style="justify-content:center;margin-top:18px">' +
      '<a class="btn btn-primary" href="#/practice/' + s.sid + '">再练一组</a>' +
      '<a class="btn" href="#/wrong">查看错题本</a>' +
      '<a class="btn" href="#/home">返回学习台</a></div></div></div>';
    session = null;
  }

  /* ---------------- 全真模考 ---------------- */
  var exam = null;

  function renderExam(stage) {
    if (stage === 'run' && exam && !exam.submitted) { renderExamQuestion(); return; }
    if (stage === 'result' && exam && exam.submitted) { renderExamResult(); return; }
    var subjOpts = SUBJECTS.filter(function (s) { return s.objective; }).map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
    }).join('');
    var history = S.exams.slice(-6).reverse().map(function (e) {
      return '<tr><td>' + (e.date || '') + '</td><td>' + esc(subj(e.s) ? subj(e.s).short : e.s) + '</td><td>' + e.score + ' / ' + e.total + '</td><td>' + (e.pass ? '<span class="chip">合格</span>' : '<span class="chip chip-red">未合格</span>') + '</td></tr>';
    }).join('');
    VIEW.innerHTML = '<div class="page-head"><div><h1>全真模考</h1><div class="sub">严格按考试规则组卷：单选 50 题（每题 1 分）+ 多选 30 题（每题 2 分），满分 110 分，66 分合格，限时 2 小时</div></div></div>' +
      '<div class="card card-pad" style="max-width:640px">' +
      '<div class="field"><label>选择科目</label><select id="eSubject">' + subjOpts + '</select></div>' +
      '<div class="field"><label>考试时长</label><select id="eTime"><option value="120">120 分钟（标准）</option><option value="60">60 分钟（半场练习）</option><option value="0">不限时</option></select></div>' +
      '<div class="small muted" style="margin-bottom:14px">注意：交卷后自动判分；多选题错选不得分，少选每个正确选项得 0.5 分。中途退出不保留答题记录。</div>' +
      '<button class="btn btn-primary btn-lg" id="btnStartExam" style="width:100%">开始模考</button></div>' +
      (history ? '<div class="section-title">最近模考</div><div class="card card-pad"><table class="num-table"><tr><th>日期</th><th>科目</th><th>成绩</th><th>结果</th></tr>' + history + '</table></div>' : '');
    $('#btnStartExam').addEventListener('click', function () {
      startExam($('#eSubject').value, Number($('#eTime').value));
    });
  }

  function startExam(sid, minutes) {
    var s = subj(sid);
    if (exam && exam.timer) clearInterval(exam.timer);
    var singles = shuffle(questionsOf(sid, '', 'single')).slice(0, 50);
    var multis = shuffle(questionsOf(sid, '', 'multi')).slice(0, 30);
    var list = singles.concat(multis);
    if (!list.length) { toast('该科目暂无题目'); return; }
    exam = {
      sid: sid, list: list, idx: 0, answers: {},
      start: Date.now(), limit: minutes * 60, timer: null, left: minutes * 60,
      endAt: minutes > 0 ? Date.now() + minutes * 60 * 1000 : 0,
      submitted: false
    };
    if (minutes > 0) {
      exam.timer = setInterval(function () {
        // 用结束时间反算，后台标签页被浏览器降频时也不会多送时间
        var left = Math.max(0, Math.ceil((exam.endAt - Date.now()) / 1000));
        exam.left = left;
        var el = $('#examTimer');
        if (el) {
          var m = Math.floor(left / 60), ss = left % 60;
          el.textContent = pad(m) + ':' + pad(ss);
          el.classList.toggle('warn', left <= 300);
        }
        if (left <= 0) { clearInterval(exam.timer); submitExam(true); }
      }, 1000);
    }
    go('#/exam/run');
    renderExamQuestion();
  }

  function renderExamQuestion() {
    var e = exam, q = e.list[e.idx];
    var sel = e.answers[q.id] || [];
    var opts = q.o.map(function (text, i) {
      return '<div class="opt ' + (sel.indexOf(i) >= 0 ? 'sel' : '') + '" data-i="' + i + '">' +
        '<span class="ok">' + String.fromCharCode(65 + i) + '</span><span>' + esc(text) + '</span></div>';
    }).join('');
    var sheet = e.list.map(function (qq, i) {
      var done = (e.answers[qq.id] || []).length > 0;
      return '<button class="' + (done ? 'done' : '') + ' ' + (i === e.idx ? 'cur' : '') + '" data-goto="' + i + '">' + (i + 1) + '</button>';
    }).join('');
    var left = e.limit ? Math.max(0, Math.ceil((e.endAt - Date.now()) / 1000)) : 0;
    e.left = left;
    var m = Math.floor(left / 60), ss = left % 60;
    VIEW.innerHTML = '<div class="exam-top">' +
      '<span class="chip">' + esc(subj(e.sid).short) + ' 模考</span>' +
      '<span class="timer ' + (left <= 300 ? 'warn' : '') + '" id="examTimer">' + (e.limit ? pad(m) + ':' + pad(ss) : '不限时') + '</span>' +
      '<span class="small muted">第 ' + (e.idx + 1) + ' / ' + e.list.length + ' 题</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-danger btn-sm" id="btnSubmitExam">交卷</button></div>' +
      '<div class="exam-layout"><div class="q-card">' +
        '<div class="q-meta"><span class="chip ' + (q.t === 'multi' ? 'chip-gold' : '') + '">' + (q.t === 'multi' ? '多项选择 · 2 分' : '单项选择 · 1 分') + '</span></div>' +
        '<div class="q-stem"><span class="q-no">' + (e.idx + 1) + '.</span>' + esc(q.q) + '</div>' +
        '<div class="opts" id="opts">' + opts + '</div>' +
      '</div><div class="card card-pad"><div class="small muted" style="margin-bottom:8px">答题卡</div>' +
        '<div class="sheet" id="sheet">' + sheet + '</div>' +
        '<div class="row" style="margin-top:12px"><button class="btn btn-sm" id="btnPrev">上一题</button><button class="btn btn-sm" id="btnNextQ">下一题</button></div></div></div>';
    $$('#opts .opt').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = Number(el.dataset.i);
        var cur = exam.answers[q.id] || [];
        if (q.t === 'multi') {
          var p = cur.indexOf(i);
          if (p >= 0) cur.splice(p, 1); else cur.push(i);
        } else cur = [i];
        exam.answers[q.id] = cur.sort();
        renderExamQuestion();
      });
    });
    $$('#sheet button').forEach(function (b) {
      b.addEventListener('click', function () { exam.idx = Number(b.dataset.goto); renderExamQuestion(); });
    });
    $('#btnPrev').addEventListener('click', function () { if (exam.idx > 0) { exam.idx--; renderExamQuestion(); } });
    $('#btnNextQ').addEventListener('click', function () { if (exam.idx < exam.list.length - 1) { exam.idx++; renderExamQuestion(); } });
    $('#btnSubmitExam').addEventListener('click', function () {
      var unanswered = exam.list.filter(function (qq) { return !(exam.answers[qq.id] || []).length; }).length;
      if (confirm('确定交卷？' + (unanswered ? '还有 ' + unanswered + ' 题未作答。' : ''))) submitExam(false);
    });
  }

  function submitExam(auto) {
    if (!exam) return;
    if (exam.timer) clearInterval(exam.timer);
    exam.submitted = true;
    var score = 0, total = 0, right = 0;
    exam.list.forEach(function (q) {
      var sel = exam.answers[q.id] || [];
      var pts = q.t === 'multi' ? 2 : 1;
      total += pts;
      var wrongSel = sel.some(function (i) { return q.a.indexOf(i) < 0; });
      if (q.t === 'multi') {
        if (!wrongSel) {
          var hit = sel.filter(function (i) { return q.a.indexOf(i) >= 0; }).length;
          if (hit === q.a.length && sel.length === q.a.length) { score += 2; right++; }
          else score += 0.5 * hit;
        }
      } else {
        if (sel.length === 1 && q.a.indexOf(sel[0]) >= 0) { score += 1; right++; }
      }
    });
    score = Math.round(score * 10) / 10;
    exam.score = score; exam.total = total; exam.right = right;
    exam.pass = score >= 66;
    var mins = Math.max(1, Math.round((Date.now() - exam.start) / 60000));
    S.exams.push({ date: todayStr(), s: exam.sid, score: score, total: total, pass: exam.pass, min: mins });
    touchDaily(exam.list.length, right);
    exam.list.forEach(function (q) {
      var sel = exam.answers[q.id] || [];
      var ok = q.a.length === sel.length && q.a.every(function (x) { return sel.indexOf(x) >= 0; });
      if (!ok) {
        S.wrong[q.id] = S.wrong[q.id] || { n: 0, t: '' };
        S.wrong[q.id].n++; S.wrong[q.id].t = todayStr();
      }
    });
    pushRecord({ t: Date.now(), s: exam.sid, ch: '', total: exam.list.length, correct: right, mode: 'exam' });
    save();
    if (auto) toast('考试时间到，已自动交卷');
    go('#/exam/result');
    renderExamResult();
  }

  function renderExamResult() {
    if (!exam) { go('#/exam'); return; }
    var e = exam;
    var review = e.list.map(function (q, i) {
      var sel = e.answers[q.id] || [];
      var ok = q.a.length === sel.length && q.a.every(function (x) { return sel.indexOf(x) >= 0; });
      return '<div class="point"><h4>第 ' + (i + 1) + ' 题 ' +
        '<span class="chip ' + (ok ? '' : 'chip-red') + '">' + (ok ? '正确' : (sel.length ? '错误' : '未答')) + '</span></h4>' +
        '<div class="small" style="margin-bottom:6px">' + esc(q.q) + '</div>' +
        '<div class="small muted">你的答案：' + (sel.length ? sel.map(function (x) { return String.fromCharCode(65 + x); }).join('') : '未作答') +
        ' ｜ 正确答案：' + q.a.map(function (x) { return String.fromCharCode(65 + x); }).join('') + '</div>' +
        (q.e ? '<div class="small" style="margin-top:6px;color:var(--ink-2)">' + esc(q.e) + '</div>' : '') + '</div>';
    }).join('');
    VIEW.innerHTML = '<div class="practice-wrap"><div class="card card-pad result-hero">' +
      '<div class="result-score ' + (e.pass ? '' : 'fail') + '">' + e.score + ' 分</div>' +
      '<div class="rs-sub">满分 ' + e.total + ' · 合格线 66 分 · ' + (e.pass ? '恭喜合格' : '未达合格线') + ' · 答对 ' + e.right + ' 题</div>' +
      '<div class="row" style="justify-content:center;margin-top:18px">' +
      '<a class="btn btn-primary" href="#/exam">再考一次</a><a class="btn" href="#/wrong">复盘错题</a><a class="btn" href="#/stats">看数据</a></div></div>' +
      '<div class="section-title">逐题解析</div>' + review + '</div>';
  }

  /* ---------------- 案例特训 ---------------- */
  function renderCaseList() {
    var s = subj('anli');
    var cases = s.cases || [];
    var modules = {};
    cases.forEach(function (c) { (modules[c.ch] = modules[c.ch] || []).push(c); });
    var html = '<div class="page-head"><div><h1>案例特训</h1><div class="sub">' + esc(CFG.caseNote) + '</div></div></div>';
    Object.keys(modules).forEach(function (k) {
      var ch = (s.chapters || []).filter(function (x) { return x.id === k; })[0];
      html += '<div class="section-title">' + esc(ch ? ch.name : '专项案例') + '</div>';
      modules[k].forEach(function (c) {
        var done = S.cases[c.id];
        html += '<a class="case-card" href="#/case/' + c.id + '" style="display:block">' +
          '<div class="row" style="justify-content:space-between"><h3>' + esc(c.title) + '</h3>' +
          (done ? '<span class="chip">已练 · 自评 ' + done.score + ' 分</span>' : '<span class="chip chip-quiet">未练习</span>') + '</div>' +
          '<div class="small muted">' + esc((c.bg || '').slice(0, 80)) + '…</div></a>';
      });
    });
    if (!cases.length) html += '<div class="card card-pad muted">案例题库正在整理中。</div>';
    VIEW.innerHTML = html;
  }

  function renderCaseDetail(id) {
    var s = subj('anli');
    var c = (s.cases || []).filter(function (x) { return x.id === id; })[0];
    if (!c) { go('#/case'); return; }
    var events = (c.events || []).map(function (e, i) { return '<div class="case-event"><b>事件' + (i + 1) + '：</b>' + esc(e) + '</div>'; }).join('');
    var asks = (c.asks || []).map(function (a, i) {
      return '<div class="case-ask"><div class="ask-q">问题 ' + (i + 1) + '（' + (a.score || 5) + ' 分）：' + esc(a.q) + '</div>' +
        '<button class="btn btn-sm" data-reveal="' + i + '">显示参考答案与评分要点</button>' +
        '<div class="answer-box" id="ans-' + i + '" style="display:none"><h4>参考答案 / 评分要点</h4>' +
        '<ul>' + (a.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
        (a.answer ? '<div style="margin-top:8px">' + esc(a.answer) + '</div>' : '') + '</div></div>';
    }).join('');
    VIEW.innerHTML = '<div class="reading"><div class="reading-head">' +
      '<a class="small muted" href="#/case">← 返回案例列表</a>' +
      '<h1 style="margin-top:10px">' + esc(c.title) + '</h1>' +
      '<div class="meta"><span class="chip">' + esc(c.type || '综合案例') + '</span><span class="chip chip-quiet">建议用时 ' + (c.minutes || 25) + ' 分钟</span></div></div>' +
      '<div class="case-bg"><b>背景：</b>' + esc(c.bg) + '</div>' + events + asks +
      '<div class="card card-pad" style="margin-top:18px"><div class="small" style="margin-bottom:8px">自评打分（对照评分要点，按点给分）</div>' +
      '<div class="row"><input type="number" id="caseScore" min="0" max="' + (c.max || 25) + '" value="' + (S.cases[c.id] ? S.cases[c.id].score : '') + '" style="width:100px;padding:8px 10px;border:1px solid var(--line-2);border-radius:8px" placeholder="0-' + (c.max || 25) + '">' +
      '<span class="small muted">/ ' + (c.max || 25) + ' 分</span><button class="btn btn-primary btn-sm" id="btnSaveCase">保存</button></div></div>' +
      '</div>';
    $$('[data-reveal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = document.getElementById('ans-' + b.dataset.reveal);
        var show = box.style.display === 'none';
        box.style.display = show ? 'block' : 'none';
        b.textContent = show ? '收起参考答案' : '显示参考答案与评分要点';
      });
    });
    $('#btnSaveCase').addEventListener('click', function () {
      var v = Number($('#caseScore').value);
      if (isNaN(v)) { toast('请输入分数'); return; }
      v = Math.max(0, Math.min(Number(c.max) || 25, Math.round(v))); // 防止输入超出满分或负数
      S.cases[c.id] = { score: v, t: todayStr() }; save();
      $('#caseScore').value = v;
      toast('已保存自评分数');
    });
  }

  /* ---------------- 错题本 ---------------- */
  function renderWrong() {
    var ids = Object.keys(S.wrong);
    // 题库更新后，清理已不存在的题目 id，避免计数虚高
    var valid = ids.filter(function (id) { return !!qOf(id); });
    if (valid.length !== ids.length) {
      var nw = {};
      valid.forEach(function (id) { nw[id] = S.wrong[id]; });
      S.wrong = nw; save(); ids = valid;
    }
    var groups = {};
    ids.forEach(function (id) {
      var q = qOf(id); if (!q) return;
      (groups[q.subject] = groups[q.subject] || []).push(q);
    });
    var total = ids.length;
    var html = '<div class="page-head"><div><h1>错题本</h1><div class="sub">做错自动收录；连续答对 2 次自动移出</div></div>' +
      '<div class="row">' + (total ? '<button class="btn btn-primary" id="btnReviewWrong">重做全部错题（' + total + '）</button>' : '') +
      '<button class="btn" id="btnClearWrong">清空</button></div></div>';
    if (!total) {
      html += '<div class="card card-pad muted">还没有做错的题目。去 <a href="#/practice" style="color:var(--teal)">题库练习</a> 做几道题吧。</div>';
    }
    SUBJECTS.forEach(function (s) {
      var list = groups[s.id] || [];
      if (!list.length) return;
      html += '<div class="section-title">' + esc(s.short) + ' · ' + list.length + ' 题</div>';
      list.forEach(function (q) {
        var w = S.wrong[q.id];
        var ch = chapterOf(q.subject, q.ch);
        html += '<div class="case-card"><div class="row" style="justify-content:space-between;margin-bottom:6px">' +
          '<span class="chip chip-quiet">' + esc(ch ? ch.name : '') + '</span>' +
          '<span class="chip chip-red">错 ' + w.n + ' 次</span></div>' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px">' + esc(q.q) + '</div>' +
          '<div class="small muted">正确答案：' + q.a.map(function (i) { return String.fromCharCode(65 + i); }).join('') + '</div>' +
          (q.e ? '<div class="small" style="margin-top:6px;color:var(--ink-2)">' + esc(q.e) + '</div>' : '') +
          '<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-remove="' + q.id + '">已掌握，移出</button></div></div>';
      });
    });

    // 个人易错考点（来自用户提供的三份错题表）；首次进入错题本时按需加载
    var mistakes = (window.SBJL_DATA && window.SBJL_DATA.mistakes) || [];
    if (!window.SBJL_DATA || !Array.isArray(window.SBJL_DATA.mistakes)) {
      loadScriptOnce('data/mistakes.js', function () {
        if (location.hash.indexOf('#/wrong') === 0) renderWrong();
      });
    }
    if (mistakes.length) {
      html += '<div class="section-title">我的易错考点 · ' + mistakes.length + ' 条</div>' +
        '<div class="card card-pad"><div class="small muted" style="margin-bottom:10px">整理自你提供的《法规错题》《质量错题》《项目管理错题》三份表格，按“错误原因 + 概括要点”复习。</div>' +
        '<div class="subj-tabs" id="mkTabs">' +
          '<button class="subj-tab active" data-mk="all">全部 ' + mistakes.length + '</button>' +
          SUBJECTS.filter(function (x) { return x.id !== 'anli'; }).map(function (x) {
            var n = mistakes.filter(function (m) { return m.s === x.id; }).length;
            return '<button class="subj-tab" data-mk="' + x.id + '">' + esc(x.short) + ' ' + n + '</button>';
          }).join('') +
        '</div>' +
        '<input type="search" id="mkSearch" placeholder="搜索知识点关键词，如：诉讼时效、控制图、索赔" style="width:100%;padding:9px 12px;border:1px solid var(--line-2);border-radius:9px;margin-bottom:12px;font-size:13.5px;font-family:inherit">' +
        '<div id="mkList"></div></div>';
    }

    VIEW.innerHTML = html;
    $$('[data-remove]').forEach(function (b) {
      b.addEventListener('click', function () { delete S.wrong[b.dataset.remove]; save(); renderWrong(); toast('已移出错题本'); });
    });
    if ($('#btnReviewWrong')) $('#btnReviewWrong').addEventListener('click', function () {
      var list = ids.map(qOf).filter(Boolean);
      session = { kind: 'practice', sid: list[0].subject, mode: 'practice', list: shuffle(list), idx: 0, answers: {}, revealed: {}, start: Date.now() };
      VIEW.innerHTML = '<div id="practiceHost"></div>';
      // 直接复用练习渲染：临时替换 VIEW 后调用
      renderWrongReview();
    });
    if ($('#btnClearWrong')) $('#btnClearWrong').addEventListener('click', function () {
      if (confirm('确定清空全部错题？此操作不可恢复。')) { S.wrong = {}; save(); renderWrong(); }
    });
    // 易错考点筛选与搜索
    if ($('#mkList')) {
      var mkState = { subj: window.__mkSubj || 'all', kw: '' };
      function drawMk() {
        var list = mistakes.filter(function (m) {
          if (mkState.subj !== 'all' && m.s !== mkState.subj) return false;
          if (mkState.kw && ((m.p || '') + (m.n || '') + (m.ch || '')).indexOf(mkState.kw) < 0) return false;
          return true;
        });
        $('#mkList').innerHTML = list.length ? list.map(function (m) {
          var sn = subj(m.s);
          return '<div class="mistake-row">' +
            '<div class="row" style="gap:6px;margin-bottom:3px"><span class="chip chip-quiet">' + esc(sn ? sn.short : '') + '</span>' +
            '<span class="small muted">' + esc(m.ch) + (m.page ? ' · ' + esc(m.page) : '') + '</span></div>' +
            '<div style="font-size:13.5px;line-height:1.6">' + esc(m.p) + '</div>' +
            (m.n ? '<div class="small" style="color:var(--teal);margin-top:3px">记忆点：' + esc(m.n) + '</div>' : '') +
            '<div class="small muted" style="margin-top:2px">错误原因：' + esc(m.r || '—') + '</div></div>';
        }).join('') : '<div class="muted small">没有匹配的考点</div>';
      }
      $$('#mkTabs [data-mk]').forEach(function (b) {
        b.addEventListener('click', function () {
          window.__mkSubj = b.dataset.mk;
          mkState.subj = b.dataset.mk;
          $$('#mkTabs [data-mk]').forEach(function (x) { x.classList.toggle('active', x === b); });
          drawMk();
        });
      });
      $('#mkSearch').addEventListener('input', function () {
        mkState.kw = this.value.trim(); drawMk();
      });
      if (window.__mkSubj) {
        $$('#mkTabs [data-mk]').forEach(function (x) { x.classList.toggle('active', x.dataset.mk === window.__mkSubj); });
      }
      drawMk();
    }
  }

  function renderWrongReview() {
    // 错题重做：用练习界面，但不重复记录“错题次数”以外的逻辑
    var s = session, q = s.list[s.idx];
    var sel = s.answers[q.id] || [];
    var revealed = s.revealed[q.id];
    var ch = chapterOf(q.subject, q.ch);
    var opts = q.o.map(function (text, i) {
      var cls = 'opt';
      if (revealed) {
        if (q.a.indexOf(i) >= 0) cls += ' right';
        else if (sel.indexOf(i) >= 0) cls += ' wrong';
      } else if (sel.indexOf(i) >= 0) cls += ' sel';
      return '<div class="' + cls + '" data-i="' + i + '"><span class="ok">' + String.fromCharCode(65 + i) + '</span><span>' + esc(text) + '</span></div>';
    }).join('');
    var correct = q.a.length === sel.length && q.a.every(function (x) { return sel.indexOf(x) >= 0; });
    VIEW.innerHTML = '<div class="practice-wrap"><div class="row" style="justify-content:space-between;margin-bottom:10px">' +
      '<a class="small muted" href="#/wrong">← 退出</a><span class="small muted">错题重做 ' + (s.idx + 1) + ' / ' + s.list.length + '</span></div>' +
      '<div class="q-card"><div class="q-meta"><span class="chip chip-red">' + esc(subj(q.subject).short) + ' · ' + esc(ch ? ch.name : '') + '</span></div>' +
      '<div class="q-stem"><span class="q-no">' + (s.idx + 1) + '.</span>' + esc(q.q) + '</div><div class="opts" id="opts">' + opts + '</div>' +
      (revealed ? '<div class="analysis"><div class="ans-line ' + (correct ? '' : 'bad') + '">正确答案：' + q.a.map(function (i) { return String.fromCharCode(65 + i); }).join('') + '</div><div>' + esc(q.e || '') + '</div></div>' : '') +
      '</div><div class="practice-foot">' + (revealed ? '<button class="btn btn-primary" id="btnNext">下一题</button>' : '<button class="btn btn-primary" id="btnCheck">确认答案</button>') +
      '</div></div>';
    $$('#opts .opt').forEach(function (el) {
      el.addEventListener('click', function () {
        if (revealed) return;
        var i = Number(el.dataset.i), cur = s.answers[q.id] || [];
        if (q.t === 'multi') { var p = cur.indexOf(i); if (p >= 0) cur.splice(p, 1); else cur.push(i); } else cur = [i];
        s.answers[q.id] = cur.sort(); renderWrongReview();
      });
    });
    if ($('#btnCheck')) $('#btnCheck').addEventListener('click', function () {
      if (!(s.answers[q.id] || []).length) { toast('请先选择答案'); return; }
      s.revealed[q.id] = true;
      var ok = q.a.length === s.answers[q.id].length && q.a.every(function (x) { return s.answers[q.id].indexOf(x) >= 0; });
      if (ok) {
        S.wrong[q.id] = S.wrong[q.id] || { n: 1, t: todayStr(), ok: 0 };
        S.wrong[q.id].ok = (S.wrong[q.id].ok || 0) + 1;
        if (S.wrong[q.id].ok >= 2) delete S.wrong[q.id];
      } else {
        S.wrong[q.id] = S.wrong[q.id] || { n: 0, t: '' };
        S.wrong[q.id].n++; S.wrong[q.id].t = todayStr(); S.wrong[q.id].ok = 0;
      }
      touchDaily(1, ok ? 1 : 0); save(); renderWrongReview();
    });
    if ($('#btnNext')) $('#btnNext').addEventListener('click', function () {
      s.idx++;
      if (s.idx >= s.list.length) { session = null; toast('错题重做完成'); go('#/wrong'); }
      else renderWrongReview();
    });
  }

  /* ---------------- 速记卡 ---------------- */
  function renderCards() {
    var cards = [];
    SUBJECTS.forEach(function (s) {
      s.chapters.forEach(function (c) {
        (c.nums || []).forEach(function (n) { cards.push({ s: s.id, sn: s.short, ch: c.name, k: n[0], v: n[1] }); });
      });
    });
    var active = window.__cardSubj || 'all';
    var cardSubjects = SUBJECTS.filter(function (s) {
      return cards.some(function (c) { return c.s === s.id; });
    });
    if (active !== 'all' && !cardSubjects.some(function (s) { return s.id === active; })) active = 'all';
    var list = cards.filter(function (c) { return active === 'all' || c.s === active; });
    var tabs = '<button class="subj-tab ' + (active === 'all' ? 'active' : '') + '" data-cs="all">全部 ' + cards.length + '</button>' +
      cardSubjects.map(function (s) {
        var n = cards.filter(function (c) { return c.s === s.id; }).length;
        return '<button class="subj-tab ' + (active === s.id ? 'active' : '') + '" data-cs="' + s.id + '">' + esc(s.short) + ' ' + n + '</button>';
      }).join('');
    VIEW.innerHTML = '<div class="page-head"><div><h1>速记卡</h1><div class="sub">点击卡片翻面。数字、期限、比例是客观题的高频送分点，每天过 15—30 张。</div></div></div>' +
      '<div class="subj-tabs">' + tabs + '</div>' +
      '<div class="flash-grid">' + list.map(function (c, i) {
        return '<div class="flash" data-flash="' + i + '"><div class="flash-inner">' +
          '<div class="flash-face flash-front"><div class="k">' + esc(c.sn) + ' · ' + esc(c.ch) + '</div><div class="q">' + esc(c.k) + '</div></div>' +
          '<div class="flash-face flash-back"><div class="a">' + esc(c.v) + '</div></div>' +
          '</div></div>';
      }).join('') + '</div>';
    $$('[data-cs]').forEach(function (b) {
      b.addEventListener('click', function () { window.__cardSubj = b.dataset.cs; renderCards(); });
    });
    $$('.flash').forEach(function (f) {
      f.addEventListener('click', function () { f.classList.toggle('flipped'); });
    });
  }

  /* ---------------- 学习数据 ---------------- */
  function renderStats() {
    var ov = overall();
    var totalQ = 0;
    SUBJECTS.forEach(function (s) { totalQ += s.questions.length; });
    var days = 0;
    for (var i = 0; i < 30; i++) { if (S.daily[todayStr(addDays(todayStr(), -i))]) days++; }
    var subjBars = SUBJECTS.map(function (s) {
      var a = subjectAccuracy(s.id);
      return '<div class="bar-row"><span>' + esc(s.short) + '</span><span class="track"><i style="width:' + a.pct + '%;background:' + s.color + '"></i></span><span class="val">' + (a.total ? a.pct + '%' : '—') + '</span></div>';
    }).join('');
    var chBars = '';
    var rows = [];
    S.records.forEach(function (r) {
      if (!r.ch) return;
      var key = r.s + '|' + r.ch;
      rows[key] = rows[key] || { s: r.s, ch: r.ch, t: 0, c: 0 };
      rows[key].t += r.total; rows[key].c += r.correct;
    });
    Object.keys(rows).forEach(function (k) {
      var x = rows[k], ch = chapterOf(x.s, x.ch), sj = subj(x.s);
      if (!ch || !sj) return;
      var pct = x.t ? Math.round(x.c / x.t * 100) : 0;
      chBars += '<div class="bar-row"><span class="small">' + esc(sj.short) + ' · ' + esc(ch.name.replace(/^第.+?章\s*/, '')) + '</span>' +
        '<span class="track"><i style="width:' + pct + '%"></i></span><span class="val">' + pct + '% (' + x.t + ')</span></div>';
    });
    var heat = '';
    for (var d = 29; d >= 0; d--) {
      var k = todayStr(addDays(todayStr(), -d));
      var q = (S.daily[k] || {}).q || 0;
      var lv = q === 0 ? '' : q < 10 ? 'l1' : q < 25 ? 'l2' : q < 50 ? 'l3' : 'l4';
      heat += '<i class="' + lv + '" title="' + k + '：' + q + ' 题"></i>';
    }
    VIEW.innerHTML = '<div class="page-head"><div><h1>学习数据</h1><div class="sub">数据只保存在本机浏览器，换设备不同步</div></div></div>' +
      '<div class="stat-grid">' +
        '<div class="stat"><b>' + ov.total + '</b><span>累计做题</span></div>' +
        '<div class="stat"><b>' + (ov.total ? ov.pct + '%' : '—') + '</b><span>总正确率</span></div>' +
        '<div class="stat"><b>' + wrongCount() + '</b><span>错题待攻克</span></div>' +
        '<div class="stat"><b>' + days + '</b><span>近 30 天学习天数</span></div>' +
      '</div>' +
      '<div class="section-title">各科正确率</div><div class="card card-pad"><div class="bars">' + subjBars + '</div></div>' +
      '<div class="section-title">教材阅读进度</div><div class="card card-pad"><div class="bars">' +
      BOOK_META.map(function (b) {
        var n = Object.keys(S.read[b.id] || {}).length;
        var p = Math.min(100, Math.round(n / b.chapters * 100));
        return '<div class="bar-row"><span>' + esc(b.short) + '教材</span><span class="track"><i style="width:' + p + '%;background:' + b.color + '"></i></span><span class="val">' + Math.min(n, b.chapters) + '/' + b.chapters + '</span></div>';
      }).join('') + '</div><div class="small muted" style="margin-top:10px">在「教材精读」里读完一章点“标记本章已读”，进度会自动统计。</div></div>' +
      '<div class="section-title">章节掌握情况</div><div class="card card-pad">' + (chBars ? '<div class="bars">' + chBars + '</div>' : '<div class="muted small">还没有章节练习记录。建议从「章节精讲 → 做本章练习」开始。</div>') + '</div>' +
      '<div class="section-title">近 30 天学习热力</div><div class="card card-pad"><div class="heat">' + heat + '</div>' +
      '<div class="small muted" style="margin-top:8px">颜色越深，当天做题越多（0 / <10 / <25 / <50 / ≥50）</div></div>' +
      '<div class="section-title">模考记录</div><div class="card card-pad">' +
      (S.exams.length ? '<table class="num-table"><tr><th>日期</th><th>科目</th><th>成绩</th><th>用时</th><th>结果</th></tr>' +
        S.exams.slice().reverse().map(function (e) {
          return '<tr><td>' + e.date + '</td><td>' + esc(subj(e.s) ? subj(e.s).short : e.s) + '</td><td>' + e.score + '</td><td>' + (e.min || '—') + ' 分</td><td>' + (e.pass ? '合格' : '未合格') + '</td></tr>';
        }).join('') + '</table>' : '<div class="muted small">暂无模考记录</div>') + '</div>';
  }

  /* ---------------- 学习手册 ---------------- */
  function renderManual() {
    var toc = SUBJECTS.map(function (s) {
      return '<a href="#m-' + s.id + '">' + esc(s.name) + '</a>';
    }).join('');
    var body = '<div class="manual"><div class="row no-print" style="justify-content:space-between;margin-bottom:10px">' +
      '<a class="small muted" href="#/home">← 返回学习台</a><button class="btn btn-sm" onclick="window.print()">打印 / 导出 PDF</button></div>' +
      '<h1>设备监理师考试 · 学习手册</h1>' +
      '<p class="muted">依据 2023 版考试大纲与 2024 版教材整理 · 四科核心考点、易错提醒与数字速记</p>' +
      '<div class="toc">' + toc + '</div>';
    SUBJECTS.forEach(function (s) {
      body += '<h2 id="m-' + s.id + '">' + esc(s.name) + '</h2>';
      if (s.objective) {
        body += '<p class="small muted">题型：单选 50 题（1 分）+ 多选 30 题（2 分），满分 110 分，66 分合格，考试时长 2 小时。</p>';
      } else {
        body += '<p class="small muted">题型：实务与案例分析 5 题（20 或 25 分），满分 110 分，66 分合格，考试时长 3 小时。</p>';
      }
      s.chapters.forEach(function (c) {
        body += '<h3>' + esc(c.name) + ' <span class="small muted">（' + esc(c.weight || '') + '）</span></h3>';
        if (c.intro) body += '<p>' + esc(c.intro) + '</p>';
        body += '<ul>';
        (c.points || []).forEach(function (p) {
          body += '<li><b>' + esc(p.h) + '</b>：' + (p.body || '').replace(/<br>/g, ' ') + '</li>';
        });
        body += '</ul>';
        if (c.traps && c.traps.length) {
          body += '<p><b style="color:#b8452b">易错：</b></p><ul>' + c.traps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        }
        if (c.nums && c.nums.length) {
          body += '<table class="num-table"><tr><th>考点</th><th>数字 / 规则</th></tr>' +
            c.nums.map(function (n) { return '<tr><td>' + esc(n[0]) + '</td><td>' + esc(n[1]) + '</td></tr>'; }).join('') + '</table>';
        }
      });
    });
    body += '<h2>附录 · 备考方法</h2><p>' + esc(CFG.plan.phases.map(function (p) { return p.name + '：' + p.goal; }).join(' ')) + '</p>';
    body += '</div>';
    VIEW.innerHTML = body;
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    modal('设置', '<div class="field"><label>考试日期</label><input type="date" id="setExamDate" value="' + S.examDate + '"></div>' +
      '<div class="small muted" style="margin-bottom:14px">官方公告发布后，把日期改准确，倒计时与计划会自动更新。</div>' +
      '<button class="btn btn-primary" id="btnSaveSettings" style="width:100%">保存</button>' +
      '<hr><div class="small" style="margin-bottom:8px">学习数据备份（换设备 / 清缓存前务必导出）</div>' +
      '<div class="row"><button class="btn btn-sm" id="btnExport">导出数据</button>' +
      '<label class="btn btn-sm" style="margin:0">导入数据<input type="file" id="fileImport" accept="application/json" style="display:none"></label></div>', function (body) {
      body.querySelector('#btnSaveSettings').addEventListener('click', function () {
        var v = body.querySelector('#setExamDate').value;
        if (v) { S.examDate = v; save(); toast('已保存'); closeModal(); renderTopCountdown(); route(); }
      });
      body.querySelector('#btnExport').addEventListener('click', function () {
        var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sbjl-data-' + todayStr() + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        toast('已导出');
      });
      body.querySelector('#fileImport').addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var d = JSON.parse(reader.result);
            if (!d || typeof d !== 'object' || !d.wrong || typeof d.wrong !== 'object') throw new Error('格式不符');
            if (!Array.isArray(d.records) || !Array.isArray(d.exams)) throw new Error('格式不符');
            if (!confirm('导入会覆盖当前全部学习数据，确定继续？')) return;
            var base = defaultState();
            for (var k in base) if (!(k in d)) d[k] = base[k];
            S = d; save(); closeModal(); toast('导入成功'); route();
          } catch (err) { toast('导入失败：文件格式不正确'); }
        };
        reader.readAsText(f);
      });
    });
  }
  function renderTopCountdown() {
    var days = daysBetween(todayStr(), S.examDate);
    $('#examCountdown').textContent = days > 0 ? '距考试 ' + days + ' 天' : '考试已开始';
    $('#sideCountdown').innerHTML = '距考试<br><b>' + (days > 0 ? days : 0) + '</b> 天';
  }

  /* ---------------- 键盘快捷键 ---------------- */
  document.addEventListener('keydown', function (e) {
    if (location.hash.indexOf('#/book') !== 0) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') {
      var prev = $('#bookPrev'); if (prev) { e.preventDefault(); prev.click(); }
    } else if (e.key === 'ArrowRight') {
      var next = $('#bookNext'); if (next) { e.preventDefault(); next.click(); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!session && !exam) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!document.getElementById('opts')) return; // 只在答题界面响应快捷键
    var isExam = !!exam && location.hash.indexOf('#/exam/run') >= 0;
    var cur = isExam ? exam : session;
    if (!cur) return;
    var q = cur.list[cur.idx];
    if (/^[1-5]$/.test(e.key)) {
      var i = Number(e.key) - 1;
      if (i >= q.o.length) return;
      var revealed = isExam ? false : (session.mode === 'recite' || session.revealed[q.id]);
      if (revealed) return;
      var arr = cur.answers[q.id] || [];
      if (q.t === 'multi') { var p = arr.indexOf(i); if (p >= 0) arr.splice(p, 1); else arr.push(i); }
      else arr = [i];
      cur.answers[q.id] = arr.sort();
      if (isExam) renderExamQuestion(); else if (location.hash.indexOf('#/wrong') === 0) renderWrongReview(); else renderPracticeQuestion();
    } else if (e.key === 'Enter') {
      if (isExam) { if (exam.idx < exam.list.length - 1) { exam.idx++; renderExamQuestion(); } }
      else if (location.hash.indexOf('#/wrong') === 0) {
        if (session.revealed[q.id]) $('#btnNext') && $('#btnNext').click();
        else checkPracticeInWrong();
      } else {
        if (session.revealed[q.id] || session.mode === 'recite') nextPractice();
        else checkPractice();
      }
    }
  });
  function checkPracticeInWrong() { if ($('#btnCheck')) $('#btnCheck').click(); }

  /* ---------------- 启动 ---------------- */
  $('#btnSettings').addEventListener('click', openSettings);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalMask').addEventListener('click', function (e) { if (e.target === $('#modalMask')) closeModal(); });
  $('#btnMenu').addEventListener('click', function () { $('#sidebar').classList.toggle('open'); });
  $('#btnReset').addEventListener('click', function () {
    if (confirm('确定清空本机所有学习数据（进度、错题、成绩）？此操作不可恢复。')) {
      localStorage.removeItem(STORE_KEY); S = defaultState(); save(); toast('已重置'); route();
    }
  });
  renderTopCountdown();
  route();

  // 空闲时预取最近阅读的教材，减少首次打开教材的等待
  (function prefetchBook() {
    var conn = navigator.connection || {};
    if (conn.saveData) return;
    if (conn.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return;
    var bid = null;
    for (var k in S.bookLast) { if (Object.prototype.hasOwnProperty.call(S.bookLast, k)) { bid = k; break; } }
    bid = bid || 'fagui';
    var run = function () {
      if (!(window.SBJL_BOOKS && window.SBJL_BOOKS[bid])) loadBook(bid, function () {});
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 3000);
  })();
})();
