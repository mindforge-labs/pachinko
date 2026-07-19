import { AudioEngine } from './audio-engine';
import { SpinController } from './spin-controller';
import {
  LAYER_LABELS,
  describeStack,
  layerForReel,
  pickTech,
  techById,
} from './techstack';

const BACKDROP_KEY = 'nocturne-pachislot-backdrop';
const CAROUSEL_INTERVAL_MS = 1600;
const DEVICON_BASE = '/devicons';
const INITIAL_SYMBOLS = ['react', 'nodejs', 'postgresql'];

const deviconUrl = (slug) => `${DEVICON_BASE}/${slug}.svg`;
const deviconFor = (item) => techById(item.layer, item.id)?.devicon ?? item.id;

export function createApp(root: Document = document, options: any = {}) {
  const body = root.body || root.querySelector('body');
  const machine = root.querySelector<HTMLElement>('#pachislot-machine');
  const startButton = root.querySelector<HTMLButtonElement>('#start-button');
  const stopButtons = [...root.querySelectorAll<HTMLButtonElement>('.stop-button')];
  const reels = [...root.querySelectorAll<HTMLElement>('.reel')];
  const muteButton = root.querySelector<HTMLButtonElement>('#mute-toggle');
  const backdropButton = root.querySelector<HTMLButtonElement>('#backdrop-toggle');
  const status = root.querySelector('#machine-status');
  const displayMessage = root.querySelector('#display-message');
  const carousel = root.querySelector<HTMLElement>('#stack-carousel');
  const carouselTrack = root.querySelector<HTMLElement>('#stack-carousel-track');
  const carouselDots = root.querySelector('#stack-carousel-dots');
  const carouselSummary = root.querySelector('#stack-carousel-summary');
  const carouselMinimize = root.querySelector('#stack-carousel-minimize');
  const carouselReset = root.querySelector('#stack-carousel-reset');
  const storage = options.storage ?? globalThis.localStorage;
  const audio = options.audio ?? new AudioEngine({ windowRef: globalThis.window, storage });
  const listeners = [];
  let carouselTimer = null;
  let carouselIndex = 0;
  let lastStack = [];

  if (!machine || !startButton || stopButtons.length !== 3 || reels.length !== 3) {
    throw new Error('Pachislot markup is incomplete');
  }

  const on = (target: EventTarget, type: string, listener: EventListener, config?: AddEventListenerOptions) => {
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
    if (carousel) {
      carousel.hidden = true;
      carousel.classList.remove('is-minimized');
    }
    carouselMinimize?.setAttribute('aria-expanded', 'true');
    carouselMinimize?.setAttribute('aria-label', 'Minimize stack popup');
    if (carouselTrack) carouselTrack.innerHTML = '';
    if (carouselDots) carouselDots.innerHTML = '';
    if (carouselSummary) carouselSummary.innerHTML = '';
  };

  const renderCarouselSlide = () => {
    if (!carouselTrack || !lastStack.length) return;
    const active = carouselIndex % lastStack.length;
    const item = lastStack[active];
    carouselTrack.innerHTML = `
      <a
        class="stack-slide"
        data-layer="${item.layer}"
        data-tech="${item.id}"
        href="${item.docsUrl}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open ${item.name} documentation (${item.layerLabel})"
      >
        <span class="stack-slide-layer">${item.layerLabel}</span>
        <img class="stack-slide-icon" src="${deviconUrl(deviconFor(item))}" alt="" aria-hidden="true">
        <strong class="stack-slide-name">${item.name}</strong>
        <span class="stack-slide-cta">Open docs ↗</span>
      </a>
    `;
    carouselTrack.dataset.active = String(active);
    if (carouselDots) {
      [...carouselDots.children].forEach((dot, index) => {
        dot.classList.toggle('is-active', index === active);
        if (dot instanceof HTMLButtonElement) {
          dot.setAttribute('aria-current', index === active ? 'true' : 'false');
        }
      });
    }
    if (carouselSummary) {
      [...carouselSummary.children].forEach((chip, index) => {
        chip.classList.toggle('is-active', index === active);
      });
    }
  };

  const startCarouselLoop = () => {
    stopCarousel();
    if (body.classList.contains('reduced-motion') || lastStack.length <= 1) return;
    carouselTimer = globalThis.setInterval(() => {
      carouselIndex = (carouselIndex + 1) % lastStack.length;
      renderCarouselSlide();
    }, options.carouselInterval ?? CAROUSEL_INTERVAL_MS);
  };

  const goToCarouselSlide = (index: number) => {
    if (!lastStack.length || index < 0 || index >= lastStack.length) return;
    carouselIndex = index;
    renderCarouselSlide();
    startCarouselLoop();
  };

  const openTechDocs = (url: string | null | undefined) => {
    if (!url) return false;
    const opened = globalThis.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
    return true;
  };

  const showStackCarousel = (symbols) => {
    lastStack = describeStack(symbols);
    if (!carousel || !carouselTrack || !lastStack.length) return;

    if (carouselSummary) {
      carouselSummary.innerHTML = lastStack.map((item, index) => `
        <a
          class="stack-summary-chip${index === 0 ? ' is-active' : ''}"
          data-layer="${item.layer}"
          data-tech="${item.id}"
          data-slide="${index}"
          href="${item.docsUrl}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open ${item.name} documentation (${item.layerLabel})"
          title="${item.name} docs"
        >
          <img src="${deviconUrl(deviconFor(item))}" alt="" aria-hidden="true">
          <span class="stack-summary-label">${item.name}</span>
        </a>
      `).join('');
    }

    if (carouselDots) {
      carouselDots.innerHTML = lastStack
        .map((item, index) => `
          <button
            class="stack-dot${index === 0 ? ' is-active' : ''}"
            type="button"
            data-layer="${item.layer}"
            data-slide="${index}"
            aria-label="Show ${item.layerLabel}: ${item.name}"
            aria-current="${index === 0 ? 'true' : 'false'}"
          ></button>
        `)
        .join('');
    }

    carousel.hidden = false;
    carousel.classList.remove('is-minimized');
    carouselMinimize?.setAttribute('aria-expanded', 'true');
    carouselMinimize?.setAttribute('aria-label', 'Minimize stack popup');
    body.classList.add('carousel-open');
    carouselIndex = 0;
    renderCarouselSlide();
    startCarouselLoop();
  };

  const setReelSymbol = (index, symbol) => {
    const reel = reels[index];
    const layer = layerForReel(index);
    const tech = techById(layer, symbol);
    const result = reel?.querySelector<HTMLElement>('.reel-result');
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
    onEvent: handleControllerEvent as any,
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

  const toggleCarouselMinimized = () => {
    if (!carousel || carousel.hidden) return;
    const minimized = carousel.classList.toggle('is-minimized');
    body.classList.toggle('carousel-open', !minimized);
    carouselMinimize?.setAttribute('aria-expanded', String(!minimized));
    carouselMinimize?.setAttribute('aria-label', minimized ? 'Restore stack popup' : 'Minimize stack popup');
    if (minimized) stopCarousel();
    else {
      renderCarouselSlide();
      startCarouselLoop();
    }
  };

  const resetPachinko = () => {
    controller.cancel('reset');
    stopTicks();
    hideCarousel();
    lastStack = [];
    carouselIndex = 0;
    machine.dataset.state = 'idle';
    machine.classList.remove('is-celebrating');
    reels.forEach((reel, index) => {
      reel.dataset.state = 'stopped';
      setReelSymbol(index, INITIAL_SYMBOLS[index]);
    });
    setDisplay('PRESS START');
    announce('Machine reset. Press start to spin a tech stack.');
    setControls(controller.snapshot());
  };

  on(startButton, 'click', () => start());
  stopButtons.forEach((button, index) => on(button, 'click', () => stop(index)));
  if (carouselMinimize) on(carouselMinimize, 'click', toggleCarouselMinimized);
  if (carouselReset) on(carouselReset, 'click', resetPachinko);
  if (carouselDots) {
    on(carouselDots, 'click', ((event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.('.stack-dot');
      if (!(target instanceof HTMLButtonElement) || !carouselDots.contains(target)) return;
      const index = Number(target.dataset.slide);
      if (Number.isInteger(index)) goToCarouselSlide(index);
    }) as EventListener);
  }

  if (carouselTrack) {
    on(carouselTrack, 'click', ((event: MouseEvent) => {
      const slide = (event.target as Element | null)?.closest?.('a.stack-slide');
      if (!(slide instanceof HTMLAnchorElement) || !carouselTrack.contains(slide)) return;
      event.preventDefault();
      openTechDocs(slide.href);
    }) as EventListener);
    on(carouselTrack, 'mouseenter', () => stopCarousel());
    on(carouselTrack, 'mouseleave', () => {
      if (!carousel?.classList.contains('is-minimized')) startCarouselLoop();
    });
    on(carouselTrack, 'focusin', () => stopCarousel());
    on(carouselTrack, 'focusout', ((event: FocusEvent) => {
      if (!carouselTrack.contains(event.relatedTarget as Node | null)
        && !carousel?.classList.contains('is-minimized')) {
        startCarouselLoop();
      }
    }) as EventListener);
  }

  if (carouselSummary) {
    on(carouselSummary, 'click', ((event: MouseEvent) => {
      const chip = (event.target as Element | null)?.closest?.('a.stack-summary-chip');
      if (!(chip instanceof HTMLAnchorElement) || !carouselSummary.contains(chip)) return;
      event.preventDefault();
      const index = Number(chip.dataset.slide);
      if (Number.isInteger(index)) {
        carouselIndex = index;
        renderCarouselSlide();
      }
      openTechDocs(chip.href);
    }) as EventListener);
    on(carouselSummary, 'mouseenter', () => stopCarousel());
    on(carouselSummary, 'mouseleave', () => {
      if (!carousel?.classList.contains('is-minimized')) startCarouselLoop();
    });
  }

  on(root, 'keydown', ((event: KeyboardEvent) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const targetIsControl = (event.target as Element | null)?.matches?.('button, input, select, textarea, a[href]');
    if (/^[123]$/.test(event.key)) {
      event.preventDefault();
      stop(Number(event.key) - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && !targetIsControl) {
      event.preventDefault();
      start();
    }
  }) as EventListener);

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
