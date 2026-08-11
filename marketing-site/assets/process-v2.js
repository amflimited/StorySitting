(function () {
  "use strict";

  if (new URLSearchParams(window.location.search).get("welcome") === "1") {
    sessionStorage.removeItem("storysitting-start-draft-v2");
    sessionStorage.removeItem("storysitting-start-request-v2");
  }

  function statusFor(element) {
    var scope = element.closest(".next-action-body") || document;
    return scope.querySelector(".copy-status");
  }

  function say(element, message) {
    var status = statusFor(element);
    if (status) status.textContent = message;
  }

  document.addEventListener("click", function (event) {
    var copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      var source = document.querySelector(copyButton.getAttribute("data-copy"));
      if (!source || !navigator.clipboard) {
        say(copyButton, "Press and hold the link above to copy it.");
        return;
      }
      navigator.clipboard.writeText(source.textContent.trim()).then(function () {
        say(copyButton, "Family Pass copied.");
      }).catch(function () {
        say(copyButton, "Press and hold the link above to copy it.");
      });
      return;
    }

    var shareButton = event.target.closest("[data-share-pass]");
    if (!shareButton) return;
    var url = shareButton.getAttribute("data-share-url");
    var name = shareButton.getAttribute("data-share-name") || "your storyteller";
    if (!navigator.share) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          say(shareButton, "Family Pass copied—send it privately.");
        });
      } else {
        say(shareButton, "Press and hold the Family Pass above to copy it.");
      }
      return;
    }
    navigator.share({
      title: "A private StorySitting Family Pass",
      text: "I opened a Story Start for " + name + ". This private pass lets you decide whether anything continues.",
      url: url
    }).then(function () {
      say(shareButton, "Family Pass shared.");
    }).catch(function (error) {
      if (error && error.name !== "AbortError") say(shareButton, "The pass was not shared. You can copy the link instead.");
    });
  });
})();
