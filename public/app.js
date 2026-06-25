(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    health: $("#health"),
    healthText: $(".health-text"),
    healthMeta: $("#health-meta"),
    form: $("#ticket-form"),
    ticketId: $("#ticket_id"),
    channel: $("#channel"),
    locale: $("#locale"),
    message: $("#message"),
    submitBtn: $("#submit-btn"),
    resetBtn: $("#reset-btn"),
    copyBtn: $("#copy-btn"),
    statusLine: $("#status-line"),
    empty: $("#result-empty"),
    result: $("#result"),
    summaryText: $("#summary-text"),
    rawJson: $("#raw-json"),
    chips: {
      case_type: $("#chip-case_type"),
      severity: $("#chip-severity"),
      department: $("#chip-department"),
      confidence: $("#chip-confidence"),
      human_review_required: $("#chip-human_review_required"),
    },
  };

  async function checkHealth() {
    try {
      const res = await fetch("/health", { method: "GET" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      els.health.classList.remove("fail");
      els.health.classList.add("ok");
      els.healthText.textContent = "Service healthy";
      if (els.healthMeta) {
        els.healthMeta.textContent = `· ${data.team || "PYM_Particles"} · ${
          data.timestamp || ""
        }`;
      }
    } catch (err) {
      els.health.classList.remove("ok");
      els.health.classList.add("fail");
      els.healthText.textContent = "Service unreachable";
      if (els.healthMeta) els.healthMeta.textContent = `· ${err.message}`;
    }
  }

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
    els.empty.style.display = "none";
    els.result.classList.remove("hidden");

    els.chips.case_type.textContent = escapeText(data.case_type);
    els.chips.case_type.dataset.c = data.case_type || "";

    els.chips.severity.textContent = escapeText(data.severity);
    els.chips.severity.dataset.c = data.severity || "";

    els.chips.department.textContent = escapeText(data.department);
    els.chips.department.dataset.c = data.department || "";

    els.chips.confidence.textContent = fmtConfidence(data.confidence);
    els.chips.confidence.dataset.c = "";

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
      const range = document.createRange();
      range.selectNodeContents(els.rawJson);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function bind() {
    els.form.addEventListener("submit", handleSubmit);
    els.resetBtn.addEventListener("click", handleReset);
    els.copyBtn.addEventListener("click", handleCopy);
    document.querySelectorAll(".sample").forEach((btn, index) => {
      btn.addEventListener("click", () => {
        const message = btn.dataset.message || "";
        if (message) els.message.value = message;
        els.ticketId.value =
          btn.dataset.id || `T-${String(index + 1).padStart(3, "0")}`;
        els.message.focus();
      });
    });
    els.message.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        els.form.requestSubmit();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    checkHealth();
    setInterval(checkHealth, 30000);
  });
})();
