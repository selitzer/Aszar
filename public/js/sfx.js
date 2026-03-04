(function () {
  const sounds = new Map();
  let unlocked = false;

  function unlock() {
    if (unlocked) return;
    unlocked = true;

    for (const a of sounds.values()) {
      const vol = a.volume ?? 1;
      a.muted = true;
      a.volume = vol;

      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        })
        .catch(() => {
          a.muted = false;
        });
    }
  }

  function load(name, src, { volume = 0.8 } = {}) {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = volume;
    sounds.set(name, a);
  }

  function play(name, { volume } = {}) {
    const a = sounds.get(name);
    if (!a) return;

    const inst = a.cloneNode(true);
    inst.volume = typeof volume === "number" ? volume : a.volume;
    inst.currentTime = 0;
    inst.play().catch(() => {});
  }

  function setVolumeAll(v) {
    for (const a of sounds.values()) a.volume = v;
  }

  window.SFX = { load, play, unlock, setVolumeAll };
})();
