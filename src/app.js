import { AudioEngine } from './audio-engine.js';
import { SpinController } from './spin-controller.js';
import {
  LAYER_LABELS,
  describeStack,
  layerForReel,
  pickTech,
  techById,
} from './techstack.js';

const BACKDROP_KEY = 'nocturne-pachislot-backdrop';
const CAROUSEL_INTERVAL_MS = 1600;
const DEVICON_BASE = 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons';

const deviconUrl = (slug) => `${DEVICON_BASE}/${slug}/${slug}-original.svg`;

export function createApp(root = document, options = {}) {
  const body = root.body || root.querySelector('body');
  const machine = root.querySelector('#pachislot-machine');
  const startButton = root.querySelector('#start-button');
  const stopButtons = [...root.querySelectorAll('.stop-button')];
  const reels = [...root.querySelectorAll('.reel')];
  const muteButton = root.querySelector('#mute-toggle');
  const backdropButton = root.querySelector('#backdrop-toggle');
  const status = root.querySelector('#machine-status');
  const displayMessage = root.querySelector('#display-message');
  const carousel = root.querySelector('#stack-carousel');
  const carouselTrack = root.querySelector('#stack-carousel-track');
  const carouselDots = root.querySelector('#stack-carousel-dots');
  const carouselSummary = root.querySelector('#stack-carousel-summary');
  const storage = options.storage ?? globalThis.localStorage;
  const audio = options.audio ?? new AudioEngine({ windowRef: globalThis.window, storage });
  const listeners = [];
  let carouselTimer = null;
  let carouselIndex = 0;
  let lastStack = [];

  if (!machine || !startButton || stopButtons.length !== 3 || reels.length !== 3) {
    throw new Error('Pachislot markup is incomplete');
  }

  const on = (target, type, listener, config) => {
    target.addEventListener(type, listener, config);
    listeners.push(() => target.removeEventListener(type, listener, config));
  };

  const announce = (message) => {
    if (status) status.textContent = message;
  };

  const setDisplay = (message) => {
    if (displayMessage) displayMessage.textContent = message;
  };

  const setControls = (snapshot) => {
    const active = snapshot.phase === 'spinning';
    startButton.disabled = snapshot.phase !== 'idle';
    stopButtons.forEach((button, index) => {
      const canStop = active && snapshot.reels[index]?.state === 'spinning';
      button.disabled = !canStop;
      button.setAttribute('aria-pressed', canStop ? 'false' : 'true');
    });
  };

  const flash = (element, className) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    globalThis.setTimeout(() => element.classList.remove(className), 420);
  };

  const stopCarousel = () => {
    if (carouselTimer != null) {
      globalThis.clearInterval(carouselTimer);
      carouselTimer = null;
    }
  };

  const hideCarousel = () => {
    stopCarousel();
    body.classList.remove('carousel-open');
    if (carousel) carousel.hidden = true;
    if (carouselTrack) carouselTrack.innerHTML = '';
    if (carouselDots) carouselDots.innerHTML = '';
    if (carouselSummary) carouselSummary.innerHTML = '';
  };

  const renderCarouselSlide = () => {
    if (!carouselTrack || !lastStack.length) return;
    const active = carouselIndex % lastStack.length;
    const item = lastStack[active];
    carouselTrack.innerHTML = `
      <article class="stack-slide" data-layer="${item.layer}" data-tech="${item.id}" aria-label="${item.layerLabel}: ${item.name}">
        <span class="stack-slide-layer">${item.layerLabel}</span>
        <img class="stack-slide-icon" src="${deviconUrl(item.devicon)}" alt="" aria-hidden="true">
        <strong class="stack-slide-name">${item.name}</strong>
      </article>
    `;
    carouselTrack.dataset.active = String(active);
    if (carouselDots) {
      [...carouselDots.children].forEach((dot, index) => {
        dot.classList.toggle('is-active', index === active);
      });
    }
    if (carouselSummary) {
      [...carouselSummary.children].forEach((chip, index) => {
        chip.classList.toggle('is-active', index === active);
      });
    }
  };

  const showStackCarousel = (symbols) => {
    lastStack = describeStack(symbols);
    if (!carousel || !carouselTrack || !lastStack.length) return;

    if (carouselSummary) {
      carouselSummary.innerHTML = lastStack.map((item, index) => `
        <span class="stack-summary-chip${index === 0 ? ' is-active' : ''}" data-layer="${item.layer}" data-tech="${item.id}">
          <img src="${deviconUrl(item.devicon)}" alt="" aria-hidden="true">
          <span class="stack-summary-label">${item.name}</span>
        </span>
      `).join('');
    }

    carouselDots.innerHTML = lastStack
      .map((item, index) => `<span class="stack-dot${index === 0 ? ' is-active' : ''}" data-layer="${item.layer}"></span>`)
      .join('');

    carousel.hidden = false;
    body.classList.add('carousel-open');
    carouselIndex = 0;
    renderCarouselSlide();
    stopCarousel();

    if (!body.classList.contains('reduced-motion') && lastStack.length > 1) {
      carouselTimer = globalThis.setInterval(() => {
        carouselIndex = (carouselIndex + 1) % lastStack.length;
        renderCarouselSlide();
      }, options.carouselInterval ?? CAROUSEL_INTERVAL_MS);
    }
  };

  const setReelSymbol = (index, symbol) => {
    const reel = reels[index];
    const layer = layerForReel(index);
    const tech = techById(layer, symbol);
    const result = reel?.querySelector('.reel-result');
    const image = result?.querySelector('img');

    if (image && tech) image.setAttribute('src', deviconUrl(tech.devicon));
    if (result) {
      result.setAttribute('aria-label', tech?.name ?? symbol);
      result.dataset.layer = layer;
    }
    if (reel) {
      reel.dataset.symbol = symbol;
      reel.dataset.layer = layer;
    }
  };

  let tickTimer = null;
  const stopTicks = () => {
    if (tickTimer != null) {
      globalThis.clearInterval(tickTimer);
      tickTimer = null;
    }
  };

  const startTicks = () => {
    stopTicks();
    if (body.classList.contains('reduced-motion')) return;
    tickTimer = globalThis.setInterval(() => {
      if (controller.snapshot().phase === 'spinning') audio.play('tick');
    }, 95);
  };

  let controller;
  const handleControllerEvent = (event) => {
    switch (event.type) {
      case 'start':
        hideCarousel();
        machine.dataset.state = 'spinning';
        machine.classList.remove('is-celebrating');
        reels.forEach((reel) => { reel.dataset.state = 'spinning'; });
        setDisplay('SPINNING STACK');
        announce('Frontend, backend, and database reels are spinning. Use stop buttons one, two, and three.');
        audio.play('start');
        startTicks();
        break;
      case 'reelStop': {
        const reel = reels[event.index];
        const layer = layerForReel(event.index);
        const tech = techById(layer, event.symbol);
        reel.dataset.state = 'stopped';
        setReelSymbol(event.index, event.symbol);
        flash(reel, 'is-stopping');
        flash(stopButtons[event.index], 'is-hit');
        setDisplay(`${layer.toUpperCase()} · ${tech?.short ?? event.symbol}`);
        announce(`${LAYER_LABELS[layer]} locked on ${tech?.name ?? event.symbol}.`);
        audio.play('stop');
        break;
      }
      case 'allStopped': {
        stopTicks();
        machine.dataset.state = 'settling';
        machine.classList.add('is-celebrating');
        const stack = describeStack(event.symbols);
        const summary = stack.map((item) => item.name).join(' · ');
        setDisplay(summary);
        announce(`Stack complete: ${summary}.`);
        showStackCarousel(event.symbols);
        audio.play('complete');
        break;
      }
      case 'complete':
        stopTicks();
        machine.dataset.state = 'idle';
        machine.classList.remove('is-celebrating');
        if (lastStack.length) {
          setDisplay(lastStack.map((item) => item.short).join(' · '));
          announce('Stack ready. Press start to spin another tech stack.');
        } else {
          setDisplay('PRESS START');
          announce('Machine ready. Press start to spin a tech stack.');
        }
        break;
      case 'cancel':
        stopTicks();
        hideCarousel();
        machine.dataset.state = 'idle';
        machine.classList.remove('is-celebrating');
        reels.forEach((reel) => { reel.dataset.state = 'stopped'; });
        setDisplay('PAUSED');
        announce('Sequence paused while the page is hidden.');
        break;
      default:
        break;
    }
    setControls(event.snapshot);
  };

  controller = options.controller ?? new SpinController({
    autoStopDelays: options.autoStopDelays,
    settleDelay: options.settleDelay,
    schedule: options.schedule,
    cancel: options.cancel,
    selectSymbol: options.selectSymbol ?? ((index) => pickTech(index)),
    onEvent: handleControllerEvent,
  });

  if (options.controller) controller.onEvent = handleControllerEvent;

  const start = () => {
    if (controller.start()) return true;
    return false;
  };

  const stop = (index) => {
    if (!controller.stop(index, 'manual')) return false;
    audio.play('click');
    return true;
  };

  on(startButton, 'click', () => start());
  stopButtons.forEach((button, index) => on(button, 'click', () => stop(index)));

  on(root, 'keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const targetIsControl = event.target?.matches?.('button, input, select, textarea, a[href]');
    if (/^[123]$/.test(event.key)) {
      event.preventDefault();
      stop(Number(event.key) - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && !targetIsControl) {
      event.preventDefault();
      start();
    }
  });

  const updateMute = () => {
    const muted = audio.isMuted;
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.querySelector('.setting-value').textContent = muted ? 'OFF' : 'ON';
    muteButton.setAttribute('aria-label', muted ? 'Unmute machine sounds' : 'Mute machine sounds');
  };

  on(muteButton, 'click', () => {
    audio.toggle();
    updateMute();
  });
  updateMute();

  const readBackdrop = () => {
    try {
      return storage?.getItem(BACKDROP_KEY) === 'isolated' ? 'isolated' : 'arcade';
    } catch {
      return 'arcade';
    }
  };

  const applyBackdrop = (mode) => {
    body.dataset.backdrop = mode;
    const isolated = mode === 'isolated';
    backdropButton.setAttribute('aria-pressed', String(isolated));
    backdropButton.querySelector('.setting-value').textContent = isolated ? 'SOLO' : 'ARCADE';
    backdropButton.setAttribute('aria-label', isolated ? 'Use arcade backdrop' : 'Use isolated backdrop');
    try {
      storage?.setItem(BACKDROP_KEY, mode);
    } catch {
      // Presentation still changes when persistence is unavailable.
    }
  };

  applyBackdrop(readBackdrop());
  on(backdropButton, 'click', () => applyBackdrop(body.dataset.backdrop === 'arcade' ? 'isolated' : 'arcade'));

  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const applyMotion = () => body.classList.toggle('reduced-motion', Boolean(media?.matches));
  applyMotion();
  if (media?.addEventListener) {
    on(media, 'change', applyMotion);
  } else if (media?.addListener) {
    media.addListener(applyMotion);
    listeners.push(() => media.removeListener(applyMotion));
  }

  const doc = root.nodeType === 9 ? root : root.ownerDocument || document;
  const visibilityHandler = () => {
    if (doc.hidden || doc.visibilityState === 'hidden') {
      controller.cancel('visibility');
      audio.suspend();
    }
  };
  on(doc, 'visibilitychange', visibilityHandler);

  setControls(controller.snapshot());

  return {
    controller,
    audio,
    destroy() {
      stopTicks();
      hideCarousel();
      listeners.splice(0).forEach((remove) => remove());
      controller.destroy();
      audio.close?.();
    },
  };
}

export { BACKDROP_KEY, CAROUSEL_INTERVAL_MS };

if (typeof document !== 'undefined' && document.querySelector('[data-pachislot-app]')) {
  createApp(document);
}
