(function () {
  "use strict";

  var form = document.getElementById("intake");
  if (!form) return;

  var steps = form.querySelectorAll(".form-step");
  var progress = form.querySelectorAll(".form-progress span");
  var stepLabel = document.getElementById("step-label");
  var error = document.getElementById("error");
  var note = document.getElementById("checkout-note");
  var submit = document.getElementById("submit");
  var draftKey = "storysitting-start-draft-v2";
  var requestKeyName = "storysitting-start-request-v2";
  var requestKey = sessionStorage.getItem(requestKeyName) || "";

  function showStep(index, moveFocus) {
    steps.forEach(function (step, currentIndex) {
      var active = currentIndex === index;
      step.classList.toggle("active", active);
      step.setAttribute("aria-hidden", String(!active));
      step.querySelectorAll("input,textarea,select,button").forEach(function (control) {
        control.disabled = !active;
      });
    });
    progress.forEach(function (item, currentIndex) {
      item.classList.toggle("active", currentIndex <= index);
    });
    stepLabel.textContent = index === 0 ? "1 / 2 · About you" : "2 / 2 · About them";
    if (moveFocus !== false) steps[index].querySelector("input,textarea,select,button").focus();
  }

  function validStep(index) {
    var fields = steps[index].querySelectorAll("input,textarea,select");
    for (var position = 0; position < fields.length; position += 1) {
      if (!fields[position].reportValidity()) return false;
    }
    return true;
  }

  function saveDraft() {
    var draft = {};
    new FormData(form).forEach(function (value, key) {
      if (key !== "website") draft[key] = value;
    });
    draft.consent = form.querySelector("[name=consent]").checked;
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch (_error) { /* Browser storage is optional. */ }
  }

  function restoreDraft() {
    var raw = sessionStorage.getItem(draftKey);
    if (!raw) return false;
    try {
      var draft = JSON.parse(raw);
      Object.keys(draft).forEach(function (key) {
        var field = form.elements.namedItem(key);
        if (!field || key === "website") return;
        if (field.type === "checkbox") field.checked = Boolean(draft[key]);
        else field.value = String(draft[key] || "");
      });
      return Boolean(draft.subject_name || draft.subject_phone || draft.capture);
    } catch (_error) {
      return false;
    }
  }

  form.querySelector("[data-next]").addEventListener("click", function () {
    if (!validStep(0)) return;
    saveDraft();
    showStep(1);
  });
  form.querySelector("[data-back]").addEventListener("click", function () { showStep(0); });
  steps[0].addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
      event.preventDefault();
      form.querySelector("[data-next]").click();
    }
  });
  form.addEventListener("input", saveDraft);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    error.style.display = "none";
    if (note) note.style.display = "none";
    submit.disabled = true;
    submit.textContent = "Opening secure checkout…";
    saveDraft();

    var data = {};
    new FormData(form).forEach(function (value, key) { data[key] = value; });
    data.consent = form.querySelector("[name=consent]").checked;
    data.sponsor_contact_authorized = data.consent;
    data.storyteller_name = data.subject_name;
    data.storyteller_phone = data.subject_phone;
    data.story_seeds = data.capture.split(/\n|\.|;/).map(function (item) { return item.trim(); }).filter(Boolean).slice(0, 5);

    if (!requestKey && window.crypto && window.crypto.randomUUID) {
      requestKey = window.crypto.randomUUID();
      sessionStorage.setItem(requestKeyName, requestKey);
    }

    fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
      body: JSON.stringify(data)
    }).then(function (response) {
      return response.json().then(function (json) { return { ok: response.ok, json: json }; });
    }).then(function (result) {
      if (result.ok && result.json.url) {
        window.location.href = result.json.url;
        return;
      }
      throw new Error(result.json.error || "Checkout could not be opened.");
    }).catch(function (problem) {
      error.textContent = problem.message || "Something went wrong. No payment was taken.";
      error.style.display = "block";
      submit.disabled = false;
      submit.textContent = "Open their Story Start · $5";
      error.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  var canceled = new URLSearchParams(window.location.search).get("canceled") === "1";
  var hasSecondStepDraft = restoreDraft();
  showStep(canceled && hasSecondStepDraft ? 1 : 0, false);
  if (canceled && note) {
    note.textContent = "Checkout was canceled. No payment was taken. Your answers are still here when you are ready.";
    note.style.display = "block";
  }
})();
