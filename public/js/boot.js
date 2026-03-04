(function () {
  function waitWindowLoad() {
    if (document.readyState === "complete") return Promise.resolve();
    return new Promise((res) =>
      window.addEventListener("load", res, { once: true }),
    );
  }

  function waitFonts() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return document.fonts.ready.catch(() => {});
  }

  function withMinDuration(promise, ms = 180) {
    const t = new Promise((r) => setTimeout(r, ms));
    return Promise.allSettled([promise, t]).then(() => {});
  }

  async function bootPage({
    init = async () => {},
    loaderId = "appLoader",
    rootId = "appRoot",
    minLoaderMs = 180,
  } = {}) {
    const loader = document.getElementById(loaderId);
    const root = document.getElementById(rootId);

    if (!loader || !root) {
      await init();
      return;
    }

    root.style.visibility = "hidden";

    const startup = (async () => {
      await waitWindowLoad();
      await waitFonts();
      await init();
    })();

    await withMinDuration(startup, minLoaderMs);

    document.body.classList.add("app-ready");
    root.style.visibility = "";
  }

  window.bootPage = bootPage;
})();
