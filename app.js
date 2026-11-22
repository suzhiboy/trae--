(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const paths = {
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m0-10h12"/>',
    library: '<path d="M3 5h4v15H3zM9 5h4v15H9zM15 6l4-1 3 14-4 1z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.55 2.55 0 1 1 4.3 1.85c-1.1.85-1.8 1.3-1.8 2.8M12 17h.01"/>',
    file: '<path d="M5 3h9l5 5v12a1 1 0 0 1-1 1H5zM14 3v6h5M8 13h8m-8 4h5"/>',
    bulb: '<path d="M9 16c0-2-3-3.2-3-6.9a6 6 0 0 1 12 0c0 3.7-3 4.9-3 6.9zM9.5 19h5M11 21h2"/>',
    scan: '<path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4m0 6v4a1 1 0 0 1-1 1h-4m-6 0H5a1 1 0 0 1-1-1v-4"/><circle cx="11" cy="11" r="3.4"/><path d="m13.5 13.5 3 3"/>',
    network: '<circle cx="5" cy="12" r="2.4"/><circle cx="17.5" cy="5" r="2.4"/><circle cx="17.5" cy="18.5" r="2.4"/><path d="m7.3 11 8-4.8m-8 7.2 8 4.2m2.2-10v8.5"/>',
    maximize: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/>',
    pointer: '<path d="m5 3 14 10-7 1-3 6z"/>',
    report: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    route: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    quiz: '<path d="m2.5 8 9.5-4.5L21.5 8 12 12.5zM6 10v6c3 3 9 3 12 0v-6m3-2v8"/>',
    next: '<path d="m9 5 7 7-7 7"/>'
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "ico");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths[name];
    return svg;
  }
  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(label, className, handle) {
    const result = el("button", className, label);
    result.type = "button";
    result.addEventListener("click", handle);
    return result;
  }
  document.querySelectorAll("[data-icon]").forEach(placeholder => placeholder.replaceWith(icon(placeholder.dataset.icon)));

  const engine = window.DetectiveEngine;
  const sheet = $("sheet");
  const question = $("question");
  const answer = $("answer");
  const submit = $("diagnose");
  let currentReport = null;
  let configured = false;
  let request = null;
  const stateNames = {foundation: "前置知识", gap: "疑似漏洞", target: "题目目标"};

  function formMessage(text) {
    const message = $("form-message");
    message.textContent = text;
    message.hidden = !text;
  }
  function setSubmit(label, busy = false) {
    submit.querySelector("span").textContent = label;
    submit.disabled = busy;
    submit.setAttribute("aria-busy", String(busy));
  }
  function cancelRequest() {
    if (request) request.abort();
    request = null;
  }
  function openSheet(title, content, kind = "") {
    $("sheet-title").textContent = title;
    sheet.className = kind;
    $("sheet-body").replaceChildren(content);
    if (!sheet.open) sheet.showModal();
  }
  function showCases() {
    const wrap = el("div");
    wrap.append(el("p", "sheet-copy", "选择一份错题，查看作答、可能的错因和对应的补习顺序。"));
    const list = el("div", "case-list");
    const symbols = ["ƒ", "½", "△"];
    engine.examples.forEach((example, index) => {
      const choice = button("", "case-choice", () => {
        loadExample(example);
        sheet.close();
        $("sr-feedback").textContent = "已载入" + example.title;
      });
      const copy = el("span");
      copy.append(el("strong", "", example.title), el("small", "", example.question));
      const symbol = el("span", "symbol", symbols[index]);
      symbol.setAttribute("aria-hidden", "true");
      choice.append(symbol, copy, icon("next"));
      list.append(choice);
    });
    wrap.append(list);
    openSheet("案例库", wrap);
  }
  function showGuide() {
    const wrap = el("div");
    const list = el("ol", "guide-list");
    for (const text of [
      "载入一个案例，或输入原题与自己的作答。保留算错的那一行，能给诊断多一条线索。",
      "点击「开始诊断」。图中的箭头从前置知识指向用到它的知识点，橙色节点是这次建议先检查的一步。",
      "阅读诊断依据，按顺序复习，再用验证题检查自己能否把同一个方法用到新题。"
    ]) list.append(el("li", "", text));
    wrap.append(list, el("p", "sheet-note", configured
      ? "AI 接口已配置。内置规则无法判断时，提交的题目和作答会发送到配置的模型服务。"
      : "当前为本地案例模式。题库覆盖三个内置案例及其典型作答。要诊断自拟题目，可按项目 README 配置模型并启动本地服务。"));
    openSheet("使用指南", wrap);
  }
  function showNode(node) {
    const content = el("div");
    const type = el("p", "node-type");
    type.append(el("b", node.state + "-dot"), document.createTextNode(stateNames[node.state]));
    content.append(type, el("p", "sheet-copy", node.detail));
    openSheet(node.label, content);
  }
  function expandMap() {
    if (!currentReport?.nodes.length) return;
    const content = el("div");
    const stage = el("div", "map-sheet-stage");
    const detail = el("p", "map-detail", "选择一个知识点查看说明。");
    detail.setAttribute("aria-live", "polite");
    content.append(stage, document.querySelector(".graph-bottom .legend").cloneNode(true), detail);
    openSheet("知识依赖图谱", content, "map-sheet");
    window.drawKnowledgeMap(stage, currentReport, node => {
      detail.textContent = node.label + "（" + stateNames[node.state] + "）　" + node.detail;
    });
  }
  function cardHead(title, symbol, className) {
    const head = el("div", "card-head " + className);
    head.append(icon(symbol), el("h3", "", title));
    return head;
  }
  function quizCard(quiz) {
    const section = el("section", "quiz-card paper");
    const title = el("h3", "quiz-title");
    title.append(icon("quiz"), document.createTextNode("验证一下"));
    const options = el("div", "quiz-options");
    const feedback = el("p", "quiz-feedback");
    feedback.hidden = true;
    feedback.setAttribute("role", "status");
    quiz.choices.forEach((choice, index) => {
      const pick = button(choice, "quiz-choice", () => {
        for (const item of options.children) item.setAttribute("aria-pressed", String(item === pick));
        feedback.hidden = false;
        feedback.textContent = (index === quiz.correctIndex ? "答对了。" : "再看这一步。") + quiz.explanation;
      });
      pick.setAttribute("aria-pressed", "false");
      options.append(pick);
    });
    section.append(title, el("p", "quiz-question", quiz.question), options, feedback);
    return section;
  }
  function reportCards(result) {
    const content = document.createDocumentFragment();
    const grid = el("div", "report-grid");
    const insight = el("section", "report-card paper");
    insight.append(cardHead("可能的错因", "focus", "root-head"), el("p", "root-point", result.root), el("p", "evidence", result.evidence));
    const path = el("section", "report-card paper");
    const steps = el("ol", "steps");
    result.steps.forEach((item, index) => {
      const step = el("li");
      const copy = el("div");
      copy.append(el("div", "step-title", item.title), el("p", "step-body", item.body));
      const number = el("span", "step-number", String(index + 1));
      number.setAttribute("aria-hidden", "true");
      step.append(number, copy);
      steps.append(step);
    });
    path.append(cardHead("建议补习顺序", "route", "path-head"), steps);
    grid.append(insight, path);
    content.append(grid, quizCard(result.quiz));
    return content;
  }
  function showReport(result, source) {
    currentReport = result;
    const hasGraph = result?.status === "diagnosed";
    const stage = $("map-stage");
    $("report-source").textContent = source;
    $("graph-badge").textContent = source;
    $("expand-map").disabled = !hasGraph;
    document.querySelector(".graph-bottom").hidden = !hasGraph;
    if (hasGraph) {
      window.drawKnowledgeMap(stage, result, showNode);
      $("report-content").replaceChildren(reportCards(result));
      return;
    }
    const correct = result?.status === "correct";
    const empty = el("div", "map-empty");
    empty.append(icon(correct ? "check" : "network"), document.createTextNode(correct
      ? "本次答案正确，可在报告中查看验算。"
      : result ? "线索不足时，图谱留空。" : "提交作答后，在这里查看知识依赖。"));
    stage.replaceChildren(empty);
    const note = el("div", "quiet-card paper");
    note.append(el("h3", "", result?.root ?? "等待本次诊断"), el("p", "empty-text", result?.evidence ?? "填写题目和作答后，点击「开始诊断」。"));
    if (result?.status === "unknown") note.append(button("载入内置案例", "secondary-button", showCases));
    $("report-content").replaceChildren(note);
  }
  function loadExample(example) {
    cancelRequest();
    question.value = example.question;
    answer.value = example.answer;
    setSubmit("开始诊断");
    formMessage("");
    showReport(engine.diagnose(example.question, example.answer), "案例预览");
  }
  function editForm() {
    cancelRequest();
    setSubmit("开始诊断");
    formMessage("");
    if ($("report-source").textContent !== "待诊断") showReport(null, "待诊断");
  }

  async function detectBackend() {
    if (!["http:", "https:"].includes(location.protocol)) return;
    $("engine-state").textContent = "正在检查诊断模式";
    try {
      const response = await fetch("/api/status", {signal: AbortSignal.timeout(2500)});
      if (response.ok) configured = (await response.json()).configured === true;
      if (configured) {
        $("engine-state").textContent = "AI 接口已配置";
        const tip = document.querySelector(".form-tip");
        tip.replaceChildren(icon("bulb"), document.createTextNode("本地无法判断时，提交的题目与作答会发送给配置的模型。"));
      }
    } catch { /* Static hosts use the offline engine. */ }
    if (!configured) $("engine-state").textContent = "本地案例模式";
  }
  const backendReady = detectBackend();
  async function diagnose(event) {
    event.preventDefault();
    const input = {question: question.value.trim(), answer: answer.value.trim()};
    if (!input.question || !input.answer) {
      formMessage("请填写题目内容和你的作答。");
      (input.question ? answer : question).focus();
      return;
    }
    cancelRequest();
    formMessage("");
    let result = engine.diagnose(input.question, input.answer);
    let source = "本地诊断";
    if (result.status === "unknown") {
      const controller = new AbortController();
      request = controller;
      setSubmit("正在诊断…", true);
      await backendReady;
      if (controller.signal.aborted) return;
      try {
        if (configured) {
          showReport(null, "分析中");
          const response = await fetch("/api/diagnose", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify(input), signal: controller.signal
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "模型暂时无法回应，请重试。");
          result = data;
          source = "AI 诊断";
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        result = {status: "unknown", root: "这次 AI 诊断未完成", evidence: error instanceof TypeError ? "连接已中断，可重新提交或载入内置案例。" : error.message, nodes: []};
        source = "服务提示";
      } finally {
        if (request === controller) request = null;
      }
      if (controller.signal.aborted) return;
    }
    showReport(result, source);
    setSubmit("重新诊断");
    $("sr-feedback").textContent = result.root;
    if (window.matchMedia("(max-width: 740px)").matches) {
      (result.status === "diagnosed" ? $("graph-panel") : $("report")).scrollIntoView({block: "start"});
    }
  }

  $("case-form").addEventListener("submit", diagnose);
  question.addEventListener("input", editForm);
  answer.addEventListener("input", editForm);
  $("pick-case").addEventListener("click", showCases);
  $("nav-cases").addEventListener("click", showCases);
  $("help-button").addEventListener("click", showGuide);
  $("expand-map").addEventListener("click", expandMap);
  $("nav-workspace").addEventListener("click", () => {
    $("workspace").focus({preventScroll: true});
    window.scrollTo({top: 0});
  });
  $("close-sheet").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", event => {
    if (event.target !== sheet) return;
    const rect = sheet.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) sheet.close();
  });
  loadExample(engine.examples[0]);
})();
