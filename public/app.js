/* QueueStorm Warmup — dashboard script
 * Wires the static form to the JSON API on the same origin.
 */

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    health: $("#health"),
    healthText: $("#health-text"),
    healthMeta: $("#health-meta"),
    form: $("#ticket-form"),
    ticketId: $("#ticket_id"),
    channel: $("#channel"),
    locale: $("#locale"),
    message: $("#message"),
    submitBtn: $("#submit-btn"),
    resetBtn: $("#reset-btn"),
    copyBtn: $("#copy-btn"),
    samplesRoot: $("#samples-root"),
    statusLine: $("#status-line"),
    empty: $("#empty"),
    result: $("#result"),
    summaryText: $("#summary-text"),
    rawJson: $("#raw-json"),
    chips: {
      ticket_id: document.querySelector('[data-chip="ticket_id"] .chip-value'),
      case_type: document.querySelector('[data-chip="case_type"] .chip-value'),
      severity: document.querySelector('[data-chip="severity"] .chip-value'),
      department: document.querySelector('[data-chip="department"] .chip-value'),
      confidence: document.querySelector('[data-chip="confidence"] .chip-value'),
      channel: document.querySelector('[data-chip="channel"] .chip-value'),
      locale: document.querySelector('[data-chip="locale"] .chip-value'),
      human_review_required: document.querySelector(
        '[data-chip="human_review_required"] .chip-value'
      ),
    },
  };

  // ----------------------------------------------------------------- samples
  const SAMPLES = [
    {
      id: "T-001",
      message:
        "I sent 3000 taka to the wrong number by mistake. Please help me get it back.",
    },
    {
      id: "T-002",
      message:
        "My payment failed but the balance was deducted. Please check transaction 99887766.",
    },
    {
      id: "T-003",
      message:
        "Someone called me pretending to be from bKash and asked for my OTP. Is that normal?",
    },
    {
      id: "T-004",
      message:
        "Please refund my last transaction, I changed my mind about the purchase.",
    },
    {
      id: "T-005",
      message:
        "আমি ভুল নাম্বারে ৫০০ টাকা পাঠিয়ে ফেলেছি। কিভাবে ফেরত পাবো?",
    },
    {
      id: "T-006",
      message: "The app crashed when I tried to open my statement this morning.",
    },
  ];

  function renderSamples() {
    const grid = document.createElement("div");
    grid.className = "sample-grid";

    SAMPLES.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sample";
      btn.dataset.id = s.id;
      btn.dataset.message = s.message;
      btn.innerHTML = `<strong>${s.id}</strong><br><span style="color:var(--muted)">${
        s.message.length > 60 ? s.message.slice(0, 60) + "…" : s.message
      }</span>`;
      btn.addEventListener("click", () => {
        els.ticketId.value = s.id;
        els.message.value = s.message;
        els.message.focus();
      });
      grid.appendChild(btn);
    });

    els.samplesRoot.appendChild(grid);
  }

  // ------------------------------------------------------------------ health
  async function checkHealth() {
    try {
      const res = await fetch("/health", { method: "GET" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      els.health.classList.remove("fail");
      els.health.classList.add("ok");
      els.healthText.textContent = "Service healthy";
      els.healthMeta.textContent = `· ${data.team || "PYM_Particles"} · ${
        data.timestamp || ""
      }`;
    } catch (err) {
      els.health.classList.remove("ok");
      els.health.classList.add("fail");
      els.healthText.textContent = "Service unreachable";
      els.healthMeta.textContent = `· ${err.message}`;
    }
  }

  // ------------------------------------------------------------------- util
  function setStatus(msg, kind) {
    els.statusLine.classList.remove("ok", "err");
    if (kind) els.statusLine.classList.add(kind);
    els.statusLine.textContent = msg || "";
  }

  function setLoading(loading) {
    if (loading) {
      els.submitBtn.disabled = true;
      els.submitBtn.dataset.label = els.submitBtn.textContent;
      els.submitBtn.innerHTML =
        '<span class="spinner" aria-hidden="true"></span> Sorting…';
    } else {
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = els.submitBtn.dataset.label || "Sort ticket";
    }
  }

  function fmtConfidence(c) {
    if (typeof c !== "number") return String(c);
    return (c * 100).toFixed(0) + "%";
  }

  function fmtBool(v) {
    return v ? "true" : "false";
  }

  function escapeText(t) {
    return String(t == null ? "" : t);
  }

  function renderResult(data) {
    // hide empty state, show result
    els.empty.style.display = "none";
    els.result.classList.remove("hidden");

    // ticket id echoed back (or fallback to input)
    els.chips.ticket_id.textContent = escapeText(
      data.ticket_id || els.ticketId.value || "—"
    );
    els.chips.ticket_id.dataset.c = "";

    els.chips.case_type.textContent = escapeText(data.case_type);
    els.chips.case_type.dataset.c = data.case_type || "";

    els.chips.severity.textContent = escapeText(data.severity);
    els.chips.severity.dataset.c = data.severity || "";

    els.chips.department.textContent = escapeText(data.department);
    els.chips.department.dataset.c = data.department || "";

    els.chips.confidence.textContent = fmtConfidence(data.confidence);
    els.chips.confidence.dataset.c = "";

    els.chips.channel.textContent = escapeText(
      data.channel || els.channel.value || "—"
    );
    els.chips.channel.dataset.c = "";

    els.chips.locale.textContent = escapeText(
      data.locale || els.locale.value || "—"
    );
    els.chips.locale.dataset.c = "";

    const needsReview = !!data.human_review_required;
    els.chips.human_review_required.textContent = fmtBool(needsReview);
    els.chips.human_review_required.dataset.c = needsReview ? "true" : "false";

    els.summaryText.textContent = escapeText(data.agent_summary || "—");

    els.rawJson.textContent = JSON.stringify(data, null, 2);
  }

  function showError(message, status) {
    els.empty.style.display = "block";
    els.result.classList.add("hidden");
    els.rawJson.textContent = JSON.stringify(
      { error: message, status: status || null },
      null,
      2
    );
  }

  // ------------------------------------------------------------------- form
  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("");

    const ticketId = els.ticketId.value.trim();
    const message = els.message.value.trim();
    const channel = els.channel.value;
    const locale = els.locale.value;

    if (!ticketId) {
      setStatus("Ticket ID is required.", "err");
      els.ticketId.focus();
      return;
    }
    if (!message) {
      setStatus("Message is required.", "err");
      els.message.focus();
      return;
    }
    if (message.length > 4000) {
      setStatus("Message is too long (max 4000 chars).", "err");
      return;
    }

    const payload = {
      ticket_id: ticketId,
      message: message,
      channel: channel,
      locale: locale,
    };

    setLoading(true);
    try {
      const res = await fetch("/sort-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Invalid JSON response from server");
      }
      if (!res.ok) {
        const errMsg = data && data.error ? data.error : "Request failed";
        setStatus(`Error ${res.status}: ${errMsg}`, "err");
        showError(errMsg, res.status);
        return;
      }
      renderResult(data);
      setStatus(
        `OK · ${data.case_type} · ${data.severity} · routed to ${data.department}`,
        "ok"
      );
    } catch (err) {
      setStatus(`Network error: ${err.message}`, "err");
      showError(err.message, 0);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    els.form.reset();
    els.statusLine.textContent = "";
    els.empty.style.display = "block";
    els.result.classList.add("hidden");
    els.rawJson.textContent = "";
    els.ticketId.focus();
  }

  async function handleCopy() {
    const text = els.rawJson.textContent || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = "Copied ✓";
      setTimeout(() => (els.copyBtn.textContent = original), 1200);
    } catch {
      // fallback: select text
      const range = document.createRange();
      range.selectNodeContents(els.rawJson);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // ------------------------------------------------------------------- bind
  function bind() {
    els.form.addEventListener("submit", handleSubmit);
    els.resetBtn.addEventListener("click", handleReset);
    els.copyBtn.addEventListener("click", handleCopy);
    // cmd/ctrl+enter from the textarea submits
    els.message.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        els.form.requestSubmit();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderSamples();
    bind();
    checkHealth();
    // refresh health every 30s
    setInterval(checkHealth, 30000);
  });
})();