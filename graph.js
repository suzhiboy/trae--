/* Responsive SVG knowledge map. Edge pairs always run prerequisite → dependent. */
(() => {
  "use strict";

  const namespace = "http://www.w3.org/2000/svg";
  const activeMaps = new WeakMap();
  let serial = 0;
  const colors = {
    foundation: { ink: "#86e0cf", fill: "#244440", shade: "#2e6360", name: "前置知识" },
    gap: { ink: "#ffb88e", fill: "#654047", shade: "#995c4b", name: "疑似漏洞" },
    target: { ink: "#c2a8ff", fill: "#423056", shade: "#715498", name: "题目目标" }
  };

  function element(name, attrs = {}, parent) {
    const node = document.createElementNS(namespace, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.append(node);
    return node;
  }

  function paintGradient(defs, type, id, attrs, stops) {
    const gradient = element(type, { id, ...attrs }, defs);
    for (const [offset, color, opacity = 1] of stops) {
      element("stop", { offset, "stop-color": color, "stop-opacity": opacity }, gradient);
    }
  }

  function star(parent, x, y, r, color, opacity) {
    const points = [[0, -r], [r / 5, -r / 5], [r, 0], [r / 5, r / 5],
      [0, r], [-r / 5, r / 5], [-r, 0], [-r / 5, -r / 5]];
    element("polygon", {
      points: points.map(([dx, dy]) => [x + dx, y + dy].join(",")).join(" "),
      fill: color, opacity
    }, parent);
  }

  function sky(svg, width, height, gap, prefix) {
    const scene = element("g", { "aria-hidden": "true", "pointer-events": "none" }, svg);
    element("ellipse", { cx: gap.x, cy: gap.y, rx: Math.min(width * .38, 250), ry: height * .6,
      fill: "url(#" + prefix + "nebula)" }, scene);
    const horizon = element("g", {
      fill: "none", stroke: "#b5a1de", "stroke-width": .7,
      transform: "rotate(-17 " + gap.x + " " + gap.y + ")"
    }, scene);
    for (const [rx, ry, opacity] of [[.25, .25, .105], [.39, .40, .12], [.55, .59, .08]]) {
      element("ellipse", { cx: gap.x, cy: gap.y, rx: width * rx, ry: height * ry, opacity }, horizon);
    }
    // A stable seed keeps the sky in place while switching cases and resizing.
    let seed = 87231;
    function random() {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const count = Math.min(196, Math.round(width * height / 1300));
    for (let i = 0; i < count; i++) {
      const x = random() * width, y = random() * height;
      const size = random(), fleck = i % 13 === 0 ? "#e0bb9e" : "#d3c5f3";
      if (i % 17 === 0) star(scene, x, y, 2.6 + size * 1.7, fleck, .48);
      else element("circle", { cx: x, cy: y, r: .45 + size * .78, fill: fleck, opacity: .18 + size * .39 }, scene);
    }
  }

  function permutations(items) {
    if (items.length < 2) return [items];
    return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(tail => [item, ...tail]));
  }

  function intersection(a, b, c, d) {
    const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
  }

  function positions(nodes, edges, w, h) {
    const gap = nodes.find(n => n.state === "gap");
    const target = nodes.find(n => n.state === "target");
    const bases = nodes.filter(n => n !== gap && n !== target);
    const slots = {
      1: [[.155, .49]],
      2: [[.16, .24], [.24, .70]],
      3: [[.155, .22], [.17, .67], [.52, .76]],
      4: [[.145, .19], [.145, .67], [.73, .16], [.53, .78]]
    }[bases.length] || [];
    const point = ([x, y]) => ({ x: w * x, y: h * y });
    const anchors = new Map();
    if (gap) anchors.set(gap.id, point([.475, bases.length === 4 ? .42 : .36 + (bases.length === 1 ? .05 : 0)]));
    if (target) anchors.set(target.id, point([.84, bases.length === 4 ? .55 : .47]));
    // At most four foundation nodes. Prefer short, left-to-right, uncrossed dependencies.
    let best, bestScore = Infinity;
    for (const order of permutations(bases)) {
      const layout = new Map(anchors);
      order.forEach((n, i) => layout.set(n.id, point(slots[i] || [.5, .5])));
      let score = 0;
      const segments = edges.map(([u, v]) => [layout.get(u), layout.get(v)]).filter(([a, b]) => a && b);
      for (const [a, b] of segments) {
        const dx = b.x - a.x, dy = b.y - a.y;
        score += Math.hypot(dx, dy) + Math.max(-dx, 0) * .85;
        for (const [c, d] of segments) {
          if (a !== c && a !== d && b !== c && b !== d && intersection(a, b, c, d)) score += w * .7;
        }
      }
      if (score < bestScore) { bestScore = score; best = layout; }
    }
    return best || anchors;
  }

  function labelLines(label, fontSize, maxWidth) {
    const lines = [""];
    let width = 0;
    for (const ch of label) {
      const advance = (ch.codePointAt(0) > 255 ? 1 : .60) * fontSize;
      if (width + advance > maxWidth && lines.at(-1)) {
        if (lines.length === 2) {
          lines[1] = lines[1].slice(0, -1) + "…";
          break;
        }
        lines.push(""); width = 0;
      }
      lines[lines.length - 1] += ch;
      width += advance;
    }
    return lines;
  }

  function nodeGeometry(node, point, width) {
    const narrow = width < 490;
    const radius = node.state === "gap" ? (narrow ? 24 : 31) :
      node.state === "target" ? (narrow ? 19 : 24) : (narrow ? 16 : 20);
    const labelSize = narrow ? 13 : 15;
    const maxWidth = Math.min(narrow ? 87 : 130, Math.min(point.x, width - point.x) * 2 - 5);
    const lines = labelLines(node.label, labelSize, maxWidth);
    const labelWidth = Math.max(...lines.map(line => Array.from(line).reduce((sum, ch) =>
      sum + (ch.codePointAt(0) > 255 ? 1 : .60) * labelSize, 0)));
    const labelTop = point.y + radius + (node.state === "gap" ? 9 : 6);
    return { node, ...point, radius, labelSize, lines, labelTop, labelWidth };
  }

  function outward(a, b, distance) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    return { x: a.x + distance * dx / length, y: a.y + distance * dy / length };
  }

  function onCurve(a, c, b, t) {
    const s = 1 - t;
    return { x: s * s * a.x + 2 * t * s * c.x + t * t * b.x, y: s * s * a.y + 2 * t * s * c.y + t * t * b.y };
  }

  function route(a, b, geometry) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    let best, bestScore = Infinity;
    // Try gently bowed paths first. Route around nearby knowledge points and their labels.
    for (const bend of [-.085, .085, -.25, .25, -.44, .44, -.72, .72]) {
      const c = { x: (a.x + b.x) / 2 - dy * bend, y: (a.y + b.y) / 2 + dx * bend };
      const start = outward(a, c, a.radius + (a.node.state === "gap" ? 10 : 4));
      const end = outward(b, c, b.radius + (b.node.state === "gap" ? 11 : 5));
      let score = Math.abs(bend) * length * .45;
      for (let j = 0; j <= 24; j++) {
        const p = onCurve(start, c, end, j / 24);
        for (const g of geometry.values()) {
          if (g !== a && g !== b && Math.hypot(p.x - g.x, p.y - g.y) < g.radius + 6) score += 85;
          const bottom = g.labelTop + g.lines.length * (g.labelSize + 2);
          if (Math.abs(p.x - g.x) < g.labelWidth / 2 + 3 && p.y > g.labelTop - 2 && p.y < bottom) score += 24;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        best = "M" + start.x + " " + start.y + "Q" + c.x + " " + c.y + " " + end.x + " " + end.y;
      }
    }
    return best;
  }

  const glyphs = {
    signed: "M-7 -3h7M-3.5 -6.5v7M1 5h6",
    distribution: "M-7 0h2.5c5 0 1-6 6-6H7M-4.5 0c5 0 1 6 6 6H7M4 -9l3 3-3 3M4 3l3 3-3 3",
    equality: "M-7 -3h14M-7 3h14",
    inverse: "M-7 -1l4-4M-7 -1l4 4M-6 -1h8a4.5 4.5 0 0 1 0 9H0",
    unit: "M0 -8a8 8 0 1 0 8 8H0zM3 -8v5h5a7 7 0 0 0-5-5z",
    common: "M-8 -2h16M-5 -7h3M2 -7h3M-5 4h3M2 4h3",
    operation: "M-8 -4h6M-5 -7v6M2 4h6M3 0l4 8",
    add: "M-8 0h16M0 -8v16",
    sides: "M-7 6V-7L8 6zM-7 2h4v4",
    theorem: "M-8 6V-7L8 6zM-8 2h4v4",
    square: "M-6 -6h12v12H-6zM-6 -6l12 12",
    sqrt: "M-9 1h3l3 6 4-14h7",
    book: "M0 -5c-3-2-5-2-8-2v12c3 0 5 0 8 2 3-2 5-2 8-2V-7c-3 0-5 0-8 2zM0 -5V7",
    target: "M0 -8a8 8 0 1 0 8 8M0 -4a4 4 0 1 0 4 4M0 0l8-8M5 -8h3v3",
    search: "M4 1a6 6 0 1 0-12 0 6 6 0 0 0 12 0zM3 5l5 5M-4 1h4M-2 -1v4"
  };

  function drawNode(svg, g, prefix, onSelect) {
    const { node, x, y, radius: r, lines, labelSize, labelTop } = g;
    const state = node.state, palette = colors[state], isGap = state === "gap";
    const group = element("g", { class: "graph-node", tabindex: "0", role: "button",
      "aria-label": node.label + "，" + palette.name + "，查看知识点", transform: "translate(" + x + " " + y + ")" }, svg);
    element("title", {}, group).textContent = node.label + " · " + palette.name + "。 " + node.detail;
    const size = r * (isGap ? 2.35 : 1.65);
    element("circle", { r: size, fill: "url(#" + prefix + state + "-glow)", "pointer-events": "none" }, group);
    if (isGap) {
      element("circle", { r: r + 8, fill: "none", stroke: palette.ink, opacity: .44, "stroke-width": .8,
        "stroke-dasharray": "2 4" }, group);
      for (const angle of [-48, 39, 128, 215]) {
        element("path", { d: "M0 -" + (r + 6) + "v-4", transform: "rotate(" + angle + ")",
          stroke: palette.ink, opacity: .85, "stroke-linecap": "round", "stroke-width": 1.7 }, group);
      }
    }
    element("circle", { class: "node-outline", r, fill: "url(#" + prefix + state + "-fill)", stroke: palette.ink,
      "stroke-width": isGap ? 2 : 1.5 }, group);
    element("circle", { r: r - (isGap ? 5 : 3.8), fill: "none", stroke: palette.ink, opacity: isGap ? .50 : .2,
      "stroke-width": .7 }, group);
    const knownIcon = Object.hasOwn(glyphs, node.id) ? glyphs[node.id] : null;
    const icon = state === "target" ? glyphs.target : knownIcon || (isGap ? glyphs.search : glyphs.book);
    element("path", { d: icon, fill: "none", stroke: isGap ? "#ffdfc5" : palette.ink, "stroke-linecap": "round",
      "stroke-linejoin": "round", "stroke-width": 1.65, transform: "scale(" + (r / 18) + ")" }, group);
    if (isGap) {
      const top = -r - 27;
      element("rect", { x: -28, y: top, width: 56, height: 17, rx: 8.5, fill: "#4a323e", stroke: "#a97464", "stroke-width": .7 }, group);
      element("text", { x: 0, y: top + 12.1, "text-anchor": "middle", fill: "#ffd0ad",
        "font-size": 10.5, "font-weight": 650 }, group).textContent = palette.name;
    }
    const label = element("text", { class: "node-label", "text-anchor": "middle", style: "font-size:" + labelSize + "px" }, group);
    lines.forEach((line, i) => {
      element("tspan", { x: 0, y: labelTop - y + labelSize + i * (labelSize + 2) }, label).textContent = line;
    });
    // Transparent paint extends each button to a minimum 44 px hit target.
    element("circle", { r: Math.max(22, r), fill: "transparent" }, group);
    group.addEventListener("click", () => onSelect?.(node));
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!event.repeat) onSelect?.(node);
      }
    });
  }

  function render(svg, width, height, report, prefix, onSelect) {
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    const focused = svg.contains(document.activeElement)
      ? document.activeElement.closest(".graph-node")?.getAttribute("aria-label") : null;
    svg.replaceChildren();
    const labels = new Map(report.nodes.map(node => [node.id, node.label]));
    const description = element("desc", { id: prefix + "description" }, svg);
    description.textContent = report.edges.map(([u, v]) => labels.get(u) + "是“" + labels.get(v) + "”的前置知识").join("。");
    svg.setAttribute("aria-describedby", description.id);
    const defs = element("defs", {}, svg);
    paintGradient(defs, "radialGradient", prefix + "nebula", {}, [
      [0, "#de9769", .13], [.42, "#c588ae", .059], [1, "#6b4c9c", 0]
    ]);
    for (const [state, palette] of Object.entries(colors)) {
      paintGradient(defs, "linearGradient", prefix + state + "-fill", { x1: "0%", x2: "90%", y1: "0%", y2: "100%" },
        [[0, palette.shade], [1, palette.fill]]);
      paintGradient(defs, "radialGradient", prefix + state + "-glow", {},
        [[0, palette.ink, .27], [.4, palette.ink, state === "gap" ? .17 : .09], [1, palette.ink, 0]]);
      const marker = element("marker", { id: prefix + state + "-arrow", viewBox: "0 0 8 8",
        refX: 7, refY: 4, markerWidth: 8, markerHeight: 8, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
      element("path", { d: "M1 1L7 4 1 7", fill: "none", stroke: palette.ink, "stroke-width": 1.35,
        "stroke-linecap": "round", "stroke-linejoin": "round" }, marker);
    }
    const layout = positions(report.nodes, report.edges, width, height);
    const geometry = new Map(report.nodes.map(node => [node.id, nodeGeometry(node, layout.get(node.id), width)]));
    const gap = Array.from(geometry.values()).find(g => g.node.state === "gap") || { x: width / 2, y: height / 2 };
    sky(svg, width, height, gap, prefix);
    const edges = element("g", { "aria-hidden": "true", "pointer-events": "none", fill: "none" }, svg);
    report.edges.forEach(([u, v], i) => {
      const a = geometry.get(u), b = geometry.get(v);
      if (!a || !b) return;
      const lineId = prefix + "edge" + i, state = b.node.state;
      paintGradient(defs, "linearGradient", lineId, { gradientUnits: "userSpaceOnUse", x1: a.x, y1: a.y, x2: b.x, y2: b.y },
        [[0, colors[a.node.state].ink, .48], [1, colors[state].ink, .80]]);
      const d = route(a, b, geometry);
      element("path", { d, stroke: colors[state].ink, opacity: .065, "stroke-width": 5 }, edges);
      element("path", { d, stroke: "url(#" + lineId + ")", "stroke-width": 1.5,
        "marker-end": "url(#" + prefix + state + "-arrow)" }, edges);
    });
    for (const g of geometry.values()) drawNode(svg, g, prefix, onSelect);
    if (focused) Array.from(svg.querySelectorAll(".graph-node")).find(g => g.getAttribute("aria-label") === focused)?.focus();
  }

  function drawKnowledgeMap(container, report, onSelect) {
    activeMaps.get(container)?.disconnect();
    activeMaps.delete(container);
    if (!report?.nodes?.length) {
      const message = document.createElement("p");
      message.className = "map-empty";
      message.textContent = report?.status === "correct" ? "答案正确，本次没有待排查的知识点。" : "诊断出可能的错因后，在这里查看知识依赖。";
      container.replaceChildren(message);
      return;
    }
    const prefix = "kg" + (++serial) + "-";
    const svg = element("svg", { class: "star-map", role: "group", "aria-label": "知识依赖图，箭头从前置知识指向后续知识",
      preserveAspectRatio: "xMidYMid meet" });
    container.replaceChildren(svg);
    let lastWidth, lastHeight;
    function resize() {
      if (svg.parentNode !== container) return;
      const rect = container.getBoundingClientRect();
      const width = Math.round(rect.width), height = Math.round(rect.height);
      if (!width || !height || (width === lastWidth && height === lastHeight)) return;
      lastWidth = width; lastHeight = height;
      render(svg, width, height, report, prefix, onSelect);
    }
    resize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      activeMaps.set(container, observer);
    }
    return svg;
  }

  window.drawKnowledgeMap = drawKnowledgeMap;
})();
