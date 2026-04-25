import { fetchCatalogStats } from "./catalog-stats.js";

// Translation strings.
const I18N = {
    // Nav
    nav_how: { zh: "工作原理", en: "How it works" },
    nav_examples: { zh: "示例", en: "Examples" },

    // Hero
    hero_badge: { zh: "v0.3.0 — 现已发布", en: "v0.3.0 — Now available" },
    terminal_title: { zh: "终端", en: "Terminal" },
    hero_tagline: {
        zh: "为 <strong>Claude Code</strong>、<strong>Codex</strong> 等 AI Agent 注入超能力。<br>连接真实世界，一切皆可在命令行中完成。",
        en: "Superpowers for <strong>Claude Code</strong>, <strong>Codex</strong> and other AI agents.<br>Connect to the real world — everything happens in the CLI.",
    },

    // Stats
    stat_actions_sub: { zh: "QR 码 · 文件处理 · 网络请求 · ···", en: "QR codes · file ops · HTTP · ···" },
    stat_cloud_sub: { zh: "随时调用，无需本地环境", en: "Call anytime — no local setup" },

    // How it works
    how_title: {
        zh: "三步，让 AI Agent 连接真实世界",
        en: "Connect AI agents to the real world in 3 steps",
    },
    how_s1_title: { zh: "安装 oo", en: "Install oo" },
    how_s1_desc: {
        zh: "一条命令完成安装，自动注入 Skills 到 Claude Code 和 Codex 中，无需任何额外配置。",
        en: "One command installs everything and auto-injects skills into Claude Code and Codex — zero extra config.",
    },
    how_s2_title: { zh: "AuthLink 你的服务", en: "AuthLink your services" },
    how_s2_desc: {
        zh: "通过 <code style=\"color:var(--green);font-size:12px\">oo login</code> 授权你的账号，然后 AuthLink Gmail、Notion、GitHub 等第三方服务。",
        en: "Sign in with <code style=\"color:var(--green);font-size:12px\">oo login</code>, then AuthLink Gmail, Notion, GitHub and other third-party services.",
    },
    how_s3_title: { zh: "用自然语言发号施令", en: "Command in natural language" },
    how_s3_desc: {
        zh: "在任意 AI Agent 中，用 <code style=\"color:var(--cyan);font-size:12px\">$oo</code> 前缀调用超能力，Agent 自动选择合适的工具完成任务。",
        en: "In any AI agent, invoke superpowers with the <code style=\"color:var(--cyan);font-size:12px\">$oo</code> prefix — the agent picks the right tool for the job.",
    },

    // Features
    feat_title: { zh: "你能用 oo 做什么", en: "What you can do with oo" },

    feat1_tag: { zh: "Gmail + Notion", en: "Gmail + Notion" },
    feat1_title: { zh: "邮件智能总结", en: "Smart email summary" },
    feat1_desc: {
        zh: "读取最近 3 封 Gmail 邮件，生成摘要并自动写入 Notion 数据库，全程无需打开浏览器。",
        en: "Read your 3 latest Gmail emails, summarize them, and push the results into a Notion database — no browser needed.",
    },
    feat1_cmd: {
        zh: "总结最近 3 封 Gmail 邮件到 Notion",
        en: "Summarize latest 3 Gmail emails to Notion",
    },

    feat2_tag: { zh: "二维码生成", en: "QR code" },
    feat2_title: { zh: "即时生成二维码", en: "Instant QR code generation" },
    feat2_desc: {
        zh: "输入任意链接或文字，一秒生成标准二维码图片并保存到本地，可直接使用。",
        en: "Pass any URL or text and get a standard QR code image saved locally, ready to use.",
    },
    feat2_cmd: {
        zh: "帮我生成一个二维码，内容是 https://oomol.com",
        en: "Generate a QR code for https://oomol.com",
    },

    feat3_tag: { zh: "Package 生态", en: "Package ecosystem" },
    feat3_title: { zh: "直接调用 Packages", en: "Call Packages directly" },
    feat3_desc: {
        zh: "在 Agent 对话中，用自然语言直接调用 OOMOL Package 生态中的任意能力。",
        en: "Invoke any capability from the OOMOL Package ecosystem in plain language, right inside your agent chat.",
    },
    feat3_cmd: { zh: "帮我压缩这些图片", en: "Compress these images for me" },

    feat4_tag: { zh: "GitHub", en: "GitHub" },
    feat4_title: { zh: "查看 Issues 动态", en: "Track Issues" },
    feat4_desc: {
        zh: "直接在 Agent 对话中查看、筛选、回复 GitHub Issues，无需切换浏览器。",
        en: "View, filter and reply to GitHub Issues from inside your agent chat — no browser switching.",
    },
    feat4_cmd: {
        zh: "帮我查看 oomol-lab/oo-cli 还有哪些 open issues",
        en: "Show me the open issues on oomol-lab/oo-cli",
    },

    // CTA
    cta_title: { zh: "让 AI Agent<br>真正无所不能", en: "Make AI agents<br>truly omnipotent" },
    cta_sub: { zh: "开源免费，一行命令即可安装。", en: "Open source and free — one command to install." },
};

let currentLang = localStorage.getItem("oo-lang") || "zh";

function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    localStorage.setItem("oo-lang", lang);
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (I18N[key] && I18N[key][lang] != null)
            el.textContent = I18N[key][lang];
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
        const key = el.getAttribute("data-i18n-html");
        if (I18N[key] && I18N[key][lang] != null)
            el.innerHTML = I18N[key][lang];
    });
    const btn = document.getElementById("langToggle");
    if (btn)
        btn.textContent = lang === "zh" ? "EN" : "中";
}

function toggleLang() {
    applyLang(currentLang === "zh" ? "en" : "zh");
    requestAnimationFrame(updateActiveTabIndicators);
}

// Apply before DOM paints to avoid flash
document.addEventListener("DOMContentLoaded", () => applyLang(currentLang));

// Edit-mode controls.
const TWEAK_DEFAULTS = /* EDITMODE-BEGIN */ {
    accent: "#00e5a0",
    accentDim: "#00b07a",
    speed: 3,
}; /* EDITMODE-END */

const tweakState = { ...TWEAK_DEFAULTS };

window.addEventListener("message", (e) => {
    if (e.data?.type === "__activate_edit_mode")
        document.getElementById("tweaks-panel").style.display = "block";
    if (e.data?.type === "__deactivate_edit_mode")
        document.getElementById("tweaks-panel").style.display = "none";
});
window.parent.postMessage({ type: "__edit_mode_available" }, "*");

function setAccent(swatch, c, dim) {
    document.querySelectorAll(".tweak-swatch").forEach(s => s.classList.remove("active"));
    swatch.classList.add("active");
    document.documentElement.style.setProperty("--green", c);
    document.documentElement.style.setProperty("--green-dim", dim);
    tweakState.accent = c;
    tweakState.accentDim = dim;
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { accent: c, accentDim: dim } }, "*");
}

let typingDelay = 40;
function setSpeed(v) {
    typingDelay = Math.round(80 / Number(v));
}

function setGrid(v) {
    const el = document.querySelector("body");
    if (!el)
        return;

    if (v === "none") {
        el.style.setProperty("--grid-opacity", "0");
    }
    else {
        el.style.setProperty("--grid-opacity", "1");
    }
}

function getEventElement(event) {
    if (event.target instanceof Element) {
        return event.target;
    }
    if (event.target instanceof Node) {
        return event.target.parentElement;
    }
    return null;
}

function handleDocumentClick(event) {
    const target = getEventElement(event);
    if (!target)
        return;

    const languageButton = target.closest("[data-action=\"toggle-language\"]");
    if (languageButton) {
        toggleLang();
        return;
    }

    const terminalAgentTab = target.closest("[data-terminal-agent]");
    if (terminalAgentTab instanceof HTMLButtonElement) {
        setTerminalAgent(terminalAgentTab.dataset.terminalAgent ?? "");
        return;
    }

    const installTab = target.closest("[data-install-tab]");
    if (installTab instanceof HTMLButtonElement) {
        switchTab(installTab, installTab.dataset.installTab);
        return;
    }

    const copyButton = target.closest("[data-copy-command]");
    if (copyButton instanceof HTMLButtonElement) {
        void copyCommand(copyButton, copyButton.dataset.copyCommand ?? "");
        return;
    }

    const accentSwatch = target.closest("[data-accent][data-accent-dim]");
    if (accentSwatch instanceof HTMLElement) {
        setAccent(
            accentSwatch,
            accentSwatch.dataset.accent ?? TWEAK_DEFAULTS.accent,
            accentSwatch.dataset.accentDim ?? TWEAK_DEFAULTS.accentDim,
        );
    }
}

document.addEventListener("click", handleDocumentClick);

const speedSlider = document.getElementById("speed-slider");
if (speedSlider instanceof HTMLInputElement) {
    speedSlider.addEventListener("input", () => setSpeed(speedSlider.value));
}

const gridSelect = document.getElementById("grid-select");
if (gridSelect instanceof HTMLSelectElement) {
    gridSelect.addEventListener("change", () => setGrid(gridSelect.value));
}

function switchTab(btn, id) {
    if (id === undefined)
        return;

    btn.closest(".install-box")
        .querySelectorAll(".install-tab")
        .forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    const box = btn.closest(".install-box");
    const viewport = box.querySelector(".install-viewport");
    // Toggle active row
    box.querySelectorAll(".install-cmd-row").forEach(r => r.classList.remove("active"));
    const targetRow = document.getElementById(`tab-${id}`);
    if (targetRow) {
        targetRow.classList.add("active");
        if (viewport)
            viewport.style.height = `${targetRow.offsetHeight}px`;
    }
    updateTabIndicator(btn);
}

function updateTabIndicator(activeBtn) {
    const indicator = activeBtn.closest(".install-tabs").querySelector(".install-tab-indicator");
    if (!indicator)
        return;
    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
}

function updateTerminalAgentIndicator(activeBtn) {
    const tabs = activeBtn.closest(".terminal-agent-tabs");
    if (!tabs)
        return;

    const indicator = tabs.querySelector(".terminal-agent-tab-indicator");
    if (!indicator)
        return;

    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
}

function updateActiveTabIndicators() {
    const activeInstallTab = document.querySelector(".install-tab.active");
    if (activeInstallTab instanceof HTMLButtonElement)
        updateTabIndicator(activeInstallTab);

    const activeTerminalAgentTab = document.querySelector(".terminal-agent-tab.active");
    if (activeTerminalAgentTab instanceof HTMLButtonElement)
        updateTerminalAgentIndicator(activeTerminalAgentTab);
}

window.addEventListener("load", () => {
    updateActiveTabIndicators();
    const box = document.querySelector(".install-box");
    const slot = document.querySelector(".install-slot");
    const cmdRow = document.getElementById("tab-cmd");
    const unixRow = document.getElementById("tab-unix");
    const viewport = document.querySelector(".install-viewport");
    if (!box || !slot || !cmdRow || !unixRow || !viewport)
        return;
    // Activate unix row by default
    unixRow.classList.add("active");
    // Measure tallest state (cmd) for slot min-height to lock outer layout
    cmdRow.style.visibility = "visible";
    cmdRow.style.opacity = "0";
    const cmdH = cmdRow.offsetHeight;
    cmdRow.style.visibility = "";
    cmdRow.style.opacity = "";
    viewport.style.height = `${unixRow.offsetHeight}px`;
    slot.style.minHeight = `${cmdH + box.querySelector(".install-tabs").offsetHeight + 2}px`;
});

window.addEventListener("resize", () => requestAnimationFrame(updateActiveTabIndicators));

async function writeClipboardText(text) {
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        }
        catch {
            // Fall back for local file previews and restricted browser contexts.
        }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
        return document.execCommand("copy");
    }
    finally {
        textarea.remove();
    }
}

async function copyCommand(btn, text) {
    const copied = await writeClipboardText(text);
    btn.textContent = copied ? "copied!" : "failed";
    btn.classList.toggle("copied", copied);
    setTimeout(() => {
        btn.textContent = "copy";
        btn.classList.remove("copied");
    }, 2000);
}

// Stats number animation.
const statNumbers = document.querySelectorAll(".stat-num .stat-accent");
const statFormatter = new Intl.NumberFormat("en-US");
const reduceNumberMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const STAT_NUMBER_DURATION_MS = 1600;
const STAT_NUMBER_STAGGER_MS = 120;
const STAT_STEP_BASE_WEIGHT = 0.45;
const STAT_STEP_CURVE_POWER = 2.2;
const MAX_EXACT_STAT_STEPS = 5000;
const statAnimationRunIds = new WeakMap();

function easeOutCubic(progress) {
    return 1 - (1 - progress) ** 3;
}

function isDigit(char) {
    return char >= "0" && char <= "9";
}

function readStatValue(text) {
    const chars = [...text.trim()];
    const firstDigitIndex = chars.findIndex(isDigit);
    if (firstDigitIndex === -1)
        return undefined;

    let lastDigitIndex = firstDigitIndex;
    for (let index = firstDigitIndex + 1; index < chars.length; index++) {
        if (isDigit(chars[index]))
            lastDigitIndex = index;
    }

    const digits = chars.slice(firstDigitIndex, lastDigitIndex + 1).filter(isDigit).join("");
    const target = Number.parseInt(digits, 10);
    if (!Number.isSafeInteger(target))
        return undefined;

    return {
        prefix: chars.slice(0, firstDigitIndex).join(""),
        suffix: chars.slice(lastDigitIndex + 1).join(""),
        target,
    };
}

function setStatNumber(el, stat, value) {
    el.textContent = `${stat.prefix}${statFormatter.format(value)}${stat.suffix}`;
}

function createStatTimeline(target) {
    if (target <= 0 || target > MAX_EXACT_STAT_STEPS)
        return undefined;

    const stepWeights = [];
    let totalWeight = 0;
    for (let value = 1; value <= target; value++) {
        const stepProgress = value / target;
        const weight = STAT_STEP_BASE_WEIGHT + stepProgress ** STAT_STEP_CURVE_POWER;
        stepWeights.push(weight);
        totalWeight += weight;
    }

    const thresholds = [0];
    let elapsedWeight = 0;
    for (const weight of stepWeights) {
        elapsedWeight += weight;
        thresholds.push(elapsedWeight / totalWeight);
    }

    thresholds[target] = 1;
    return thresholds;
}

function getTimelineValue(thresholds, progress) {
    let low = 0;
    let high = thresholds.length - 1;

    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (thresholds[middle] <= progress) {
            low = middle + 1;
        }
        else {
            high = middle - 1;
        }
    }

    return high;
}

function getStatFrameValue(stat, progress) {
    const target = stat.target;
    if (progress >= 1 || target <= 0)
        return target;

    if (stat.thresholds !== undefined)
        return getTimelineValue(stat.thresholds, progress);

    return Math.floor(target * easeOutCubic(progress));
}

function requestStatFrame(callback) {
    let didRun = false;
    const timer = window.setTimeout(() => {
        didRun = true;
        callback(performance.now());
    }, 48);

    requestAnimationFrame((now) => {
        if (didRun)
            return;

        window.clearTimeout(timer);
        callback(now);
    });
}

function animateStatNumber(el, index) {
    const stat = readStatValue(el.textContent ?? "");
    if (stat === undefined)
        return;
    stat.thresholds = createStatTimeline(stat.target);
    el.dataset.statTarget = String(stat.target);
    const runId = (statAnimationRunIds.get(el) ?? 0) + 1;
    statAnimationRunIds.set(el, runId);

    if (reduceNumberMotion) {
        setStatNumber(el, stat, stat.target);
        return;
    }

    setStatNumber(el, stat, 0);
    el.classList.add("is-updating");

    const delay = index * STAT_NUMBER_STAGGER_MS;
    const startAt = performance.now() + delay;

    function tick(now) {
        if (statAnimationRunIds.get(el) !== runId)
            return;

        if (now < startAt) {
            requestStatFrame(tick);
            return;
        }

        const progress = Math.min(1, (now - startAt) / STAT_NUMBER_DURATION_MS);
        setStatNumber(el, stat, getStatFrameValue(stat, progress));

        if (progress < 1) {
            requestStatFrame(tick);
            return;
        }

        setStatNumber(el, stat, stat.target);
        el.classList.remove("is-updating");
        el.classList.add("is-complete");
    }

    requestStatFrame(tick);
}

statNumbers.forEach((el, index) => {
    if (el instanceof HTMLElement)
        animateStatNumber(el, index);
});

function readCatalogStatValue(stats, key) {
    switch (key) {
        case "actionCount":
            return stats.actionCount;
        case "providerCount":
            return stats.providerCount;
        case "blockCount":
            return stats.blockCount;
        default:
            return undefined;
    }
}

const CATALOG_STAT_UNAVAILABLE_TEXT = "N/A";

function setCatalogStatUnavailable(el) {
    delete el.dataset.statTarget;
    el.classList.remove("is-updating", "is-complete");
    el.textContent = CATALOG_STAT_UNAVAILABLE_TEXT;
}

function updateCatalogStatNumbers(stats) {
    document.querySelectorAll("[data-catalog-stat]").forEach((el) => {
        if (!(el instanceof HTMLElement))
            return;

        const value = stats === undefined ? undefined : readCatalogStatValue(stats, el.dataset.catalogStat);
        if (value === undefined) {
            setCatalogStatUnavailable(el);
            return;
        }

        if (el.dataset.statTarget === String(value))
            return;

        el.textContent = String(value);
        animateStatNumber(el, 0);
    });
}

async function syncCatalogStats() {
    const stats = await fetchCatalogStats();
    updateCatalogStatNumbers(stats);
}

void syncCatalogStats();

// Terminal animation.
// Sequences simulate agent conversations with the oo skill.
const sequences = [
    {
        userMsgKey: "feat1_cmd",
        outputs: [
            { text: "> Using skill: oo · gmail.fetch", cls: "info", delay: 400 },
            { text: "  ✓ 3 emails fetched via AuthLink", cls: "success", delay: 600 },
            { text: "> Using skill: oo · notion.write", cls: "info", delay: 300 },
            { text: "  ✓ Summaries written to gmail_summary", cls: "success", delay: 500 },
            { text: "  Done. 3 items added to Notion.", cls: "dim", delay: 300 },
        ],
    },
    {
        userMsgKey: "feat2_cmd",
        outputs: [
            { text: "> Using skill: oo · qr.generate", cls: "info", delay: 400 },
            { text: "  ✓ QR code saved: ~/Downloads/oomol-qr.png", cls: "success", delay: 800 },
        ],
    },
    {
        userMsgKey: "feat4_cmd",
        outputs: [
            { text: "> Using skill: oo · github.issues", cls: "info", delay: 400 },
            { text: "  ✓ Found 1 open issue in oomol-lab/oo-cli", cls: "success", delay: 600 },
            { text: "  #1  Add Windows ARM64 support", cls: "amber", delay: 300 },
        ],
    },
];

const termOut = document.getElementById("terminal-output");
let seqIndex = 0;
const MAX_TERMINAL_LINES = 10;
const TERMINAL_COMMAND_NAME = "oo";
const terminalAgents = {
    claude: {
        prompt: "/",
    },
    codex: {
        prompt: "$",
    },
};
let currentTerminalAgent = "claude";
let currentTerminalRunId = 0;
let terminalStartTimer;

function clearOldLines() {
    while (termOut.children.length > MAX_TERMINAL_LINES) {
        termOut.removeChild(termOut.firstChild);
    }
}

function getCurrentTerminalAgent() {
    return terminalAgents[currentTerminalAgent];
}

function syncTerminalAgentTabs() {
    let activeTab;
    document.querySelectorAll("[data-terminal-agent]").forEach((tab) => {
        if (!(tab instanceof HTMLButtonElement))
            return;

        const isActive = tab.dataset.terminalAgent === currentTerminalAgent;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
        if (isActive)
            activeTab = tab;
    });

    if (activeTab)
        updateTerminalAgentIndicator(activeTab);
}

function startTerminalSequence(delay) {
    window.clearTimeout(terminalStartTimer);
    currentTerminalRunId += 1;
    const runId = currentTerminalRunId;
    terminalStartTimer = window.setTimeout(() => {
        void runSequence(runId);
    }, delay);
}

function getTerminalCommandPrompt() {
    return getCurrentTerminalAgent().prompt;
}

function formatTerminalCommand(commandText) {
    return `${getTerminalCommandPrompt()}${TERMINAL_COMMAND_NAME} ${commandText}`;
}

function getTerminalCommandParts(commandEl) {
    const existingPrompt = commandEl.querySelector(".t-agent-prompt");
    const existingName = commandEl.querySelector(".t-agent-oo");
    const existingSpace = commandEl.querySelector(".t-command-space");
    const existingText = commandEl.querySelector(".t-command-text");

    if (
        existingPrompt instanceof HTMLElement
        && existingName instanceof HTMLElement
        && existingSpace instanceof HTMLElement
        && existingText instanceof HTMLElement
    ) {
        return {
            promptEl: existingPrompt,
            nameEl: existingName,
            spaceEl: existingSpace,
            textEl: existingText,
        };
    }

    const promptEl = document.createElement("span");
    promptEl.className = "t-agent-prompt";
    const nameEl = document.createElement("span");
    nameEl.className = "t-agent-oo";
    const spaceEl = document.createElement("span");
    spaceEl.className = "t-command-space";
    const textEl = document.createElement("span");
    textEl.className = "t-command-text";
    commandEl.replaceChildren(promptEl, nameEl, spaceEl, textEl);
    return { promptEl, nameEl, spaceEl, textEl };
}

function renderTerminalCommand(commandEl, commandText, visibleLength) {
    const prompt = getTerminalCommandPrompt();
    const parts = getTerminalCommandParts(commandEl);
    const prefixLength = prompt.length + TERMINAL_COMMAND_NAME.length;
    const boundedLength = Math.max(0, Math.min(visibleLength, formatTerminalCommand(commandText).length));
    const nameLength = Math.max(0, Math.min(TERMINAL_COMMAND_NAME.length, boundedLength - prompt.length));
    const textLength = Math.max(0, boundedLength - prefixLength - 1);

    parts.promptEl.textContent = prompt.slice(0, boundedLength);
    parts.nameEl.textContent = TERMINAL_COMMAND_NAME.slice(0, nameLength);
    parts.spaceEl.textContent = boundedLength > prefixLength ? " " : "";
    parts.textEl.textContent = commandText.slice(0, textLength);
}

function syncTerminalCommandPrefixes() {
    document.querySelectorAll(".t-cmd").forEach((commandEl) => {
        if (!(commandEl instanceof HTMLElement))
            return;

        const commandText = commandEl.dataset.terminalCommandText;
        if (commandText === undefined)
            return;

        if (commandEl.dataset.terminalCommandComplete === "true") {
            renderTerminalCommand(commandEl, commandText, formatTerminalCommand(commandText).length);
            return;
        }

        const currentLength = commandEl.textContent?.length ?? 0;
        renderTerminalCommand(commandEl, commandText, currentLength);
    });
}

function syncFeatureCommandPrompts() {
    const prompt = getTerminalCommandPrompt();
    document.querySelectorAll(".fc-prompt").forEach((promptEl) => {
        promptEl.textContent = prompt;
    });
}

function setTerminalAgent(agentId) {
    if (!Object.hasOwn(terminalAgents, agentId) || agentId === currentTerminalAgent)
        return;

    currentTerminalAgent = agentId;
    syncTerminalAgentTabs();
    syncTerminalCommandPrefixes();
    syncFeatureCommandPrompts();
    termOut.replaceChildren();
    startTerminalSequence(300);
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function sleepIfCurrent(runId, ms) {
    await sleep(ms);
    return runId === currentTerminalRunId;
}

async function typeTerminalCommand(el, commandText, runId) {
    el.dataset.terminalCommandText = commandText;
    delete el.dataset.terminalCommandComplete;
    const commandLength = formatTerminalCommand(commandText).length;

    for (let i = 0; i < commandLength; i++) {
        if (runId !== currentTerminalRunId)
            return false;

        renderTerminalCommand(el, commandText, i + 1);
        await sleep(typingDelay);
    }

    el.dataset.terminalCommandComplete = "true";
    return runId === currentTerminalRunId;
}

async function runSequence(runId) {
    if (runId !== currentTerminalRunId)
        return;

    const seq = sequences[seqIndex % sequences.length];
    seqIndex++;

    // Show user message bubble
    const userLine = document.createElement("div");
    const userLineClasses = ["t-line", "t-user-line"];
    if (termOut.childElementCount > 0)
        userLineClasses.push("t-sequence-start");
    userLine.className = userLineClasses.join(" ");
    const userLabel = document.createElement("span");
    userLabel.className = "t-user-label";
    userLabel.textContent = "You";
    const userText = document.createElement("span");
    userText.className = "t-cmd";
    const cursor = document.createElement("span");
    cursor.className = "t-cursor";
    userLine.appendChild(userLabel);
    userLine.appendChild(userText);
    userLine.appendChild(cursor);
    termOut.appendChild(userLine);
    clearOldLines();

    if (!(await sleepIfCurrent(runId, 300)))
        return;

    const userCommandText = I18N[seq.userMsgKey][currentLang];
    if (!(await typeTerminalCommand(userText, userCommandText, runId)))
        return;

    cursor.remove();
    if (!(await sleepIfCurrent(runId, 300)))
        return;

    // Print tool outputs
    for (const out of seq.outputs) {
        if (!(await sleepIfCurrent(runId, out.delay)))
            return;

        const outLine = document.createElement("div");
        outLine.className = `t-line t-output ${out.cls}`;
        outLine.textContent = out.text;
        termOut.appendChild(outLine);
        clearOldLines();
    }

    if (!(await sleepIfCurrent(runId, 1400)))
        return;

    void runSequence(runId);
}

// Start after a brief delay.
syncTerminalAgentTabs();
syncFeatureCommandPrompts();
startTerminalSequence(600);
