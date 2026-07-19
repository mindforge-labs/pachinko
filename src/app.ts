import { animateView, spring } from 'motion';
import { AudioEngine } from './audio-engine';
import { renderPreviewMarkdown } from './markdown';
import { SpinController } from './spin-controller';
import {
  LAYER_LABELS,
  TECH_STACK,
  describeStack,
  layerForReel,
  pickTech,
  techById,
  technologyById,
} from './techstack';

const BACKDROP_KEY = 'nocturne-pachislot-backdrop';
const CAROUSEL_INTERVAL_MS = 1600;
const INITIAL_SYMBOLS = ['react', 'express', 'postgresql'];
const MINIMIZE_SPRING = { type: spring, visualDuration: 0.48, bounce: 0.22 } as const;

const iconUrlFor = (item) => techById(item.layer, item.id)?.iconUrl ?? item.iconUrl ?? `/devicons/${item.id}.svg`;

export function createApp(root: Document = document, options: any = {}) {
  const body = root.body || root.querySelector('body');
  const machine = root.querySelector<HTMLElement>('#pachislot-machine');
  const startButton = root.querySelector<HTMLButtonElement>('#start-button');
  const stopButtons = [...root.querySelectorAll<HTMLButtonElement>('.stop-button')];
  const stopControlLabels = stopButtons.map((button) => button.closest('.stop-control')?.querySelector<HTMLElement>('small') ?? null);
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
  const carouselBackdrop = root.querySelector<HTMLElement>('.stack-carousel-backdrop');
  const carouselPanel = root.querySelector<HTMLElement>('.stack-carousel-panel');
  const carouselViewport = root.querySelector<HTMLElement>('.stack-carousel-viewport');
  const promptBuilder = root.querySelector<HTMLElement>('.prompt-builder');
  const carouselReset = root.querySelector('#stack-carousel-reset');
  const authCheckbox = root.querySelector<HTMLInputElement>('#include-auth');
  const generatePromptButton = root.querySelector<HTMLButtonElement>('#generate-prompt');
  const askGeminiButton = root.querySelector<HTMLButtonElement>('#ask-gemini');
  const promptStatus = root.querySelector<HTMLElement>('#prompt-builder-status');
  const resultStage = root.querySelector<HTMLElement>('#result-stage');
  const resultTabGuide = root.querySelector<HTMLButtonElement>('#result-tab-guide');
  const resultTabPrompt = root.querySelector<HTMLButtonElement>('#result-tab-prompt');
  const promptView = root.querySelector<HTMLElement>('#gemini-system-prompt');
  const guideView = root.querySelector<HTMLElement>('#gemini-guide');
  const copyActiveResultButton = root.querySelector<HTMLButtonElement>('#copy-active-result');
  const storage = options.storage ?? globalThis.localStorage;
  const audio = options.audio ?? new AudioEngine({ windowRef: globalThis.window, storage });
  const listeners = [];
  let carouselTimer = null;
  let carouselIndex = 0;
  let lastStack = [];
  let lastBackendRuntime: string | null = null;
  let promptRequestVersion = 0;
  let restorePopupAfterReroll = false;
  let activeResultTab: 'guide' | 'prompt' = 'prompt';
  let promptRaw = '';
  let guideRaw = '';

  if (!machine || !startButton || stopButtons.length !== 3 || reels.length !== 3) {
    throw new Error('Pachislot markup is incomplete');
  }

  const populateReelStrips = () => {
    reels.forEach((reel, index) => {
      const layer = layerForReel(index);
      const pool = TECH_STACK[layer];
      const strip = reel.querySelector<HTMLElement>('.reel-strip');
      if (!strip || !pool.length) return;

      // Two identical sets let either end of the strip wrap without a visible seam.
      const sequence = [...pool, ...pool];
      const fragment = root.createDocumentFragment();
      sequence.forEach((tech) => {
        const tile = root.createElement('div');
        tile.className = 'tech-tile';
        tile.dataset.layer = layer;
        tile.dataset.tech = tech.id;

        const image = root.createElement('img');
        image.className = 'tech-icon';
        image.src = tech.iconUrl;
        image.alt = '';
        image.loading = 'eager';
        image.decoding = 'async';
        tile.append(image);
        fragment.append(tile);
      });

      strip.replaceChildren(fragment);
      strip.dataset.poolSize = String(pool.length);

      const tileShift = 100 / sequence.length;
      const rollsDown = index === 1;
      // Three symbols align with the cabinet's top, center, and bottom paylines.
      strip.style.setProperty('--strip-height', `${sequence.length * 31}%`);
      strip.style.setProperty('--tile-size', `${tileShift}%`);
      strip.style.setProperty('--reel-duration', `${(pool.length * (rollsDown ? 0.19 : 0.21)).toFixed(2)}s`);
      strip.style.setProperty('--loop-start', rollsDown ? '-50%' : '0%');
      strip.style.setProperty('--loop-end', rollsDown ? '0%' : '-50%');
      strip.style.setProperty('--brake-start', `${(rollsDown ? 3 : -3) * tileShift}%`);
      strip.style.setProperty('--brake-near', `${(rollsDown ? 0.3 : -0.3) * tileShift}%`);
    });
  };

  populateReelStrips();

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
    const rerolling = snapshot.phase === 'rerolling';
    const physicalRerollMode = snapshot.phase === 'idle'
      && snapshot.stackComplete
      && Boolean(carousel?.classList.contains('is-minimized'));
    startButton.disabled = snapshot.phase !== 'idle';
    stopButtons.forEach((button, index) => {
      const canStop = active && snapshot.reels[index]?.state === 'spinning';
      const layer = layerForReel(index);
      const remaining = snapshot.rerollsRemaining?.[layer] ?? 0;
      const canReroll = physicalRerollMode && remaining > 0;
      button.disabled = !(canStop || canReroll);
      button.setAttribute('aria-pressed', canStop ? 'false' : 'true');
      button.setAttribute('aria-label', canReroll
        ? `Reroll ${LAYER_LABELS[layer]}, ${remaining} remaining`
        : `Stop ${LAYER_LABELS[layer].toLowerCase()} reel`);
      const buttonLabel = button.querySelector<HTMLElement>('span');
      if (buttonLabel) buttonLabel.textContent = physicalRerollMode ? `↻ ${remaining}` : String(index + 1);
      if (stopControlLabels[index]) stopControlLabels[index]!.textContent = physicalRerollMode ? `${layer.toUpperCase()} REROLL` : layer.toUpperCase();
    });
    carousel?.querySelectorAll<HTMLButtonElement>('.stack-reroll-button').forEach((button) => {
      const index = Number(button.dataset.reroll);
      const layer = layerForReel(index);
      const remaining = snapshot.rerollsRemaining?.[layer] ?? 0;
      button.disabled = rerolling || snapshot.phase !== 'idle' || !snapshot.stackComplete || remaining <= 0;
      button.textContent = remaining > 0 ? `REROLL · ${remaining} LEFT` : 'NO REROLLS LEFT';
      button.setAttribute('aria-label', `Reroll ${LAYER_LABELS[layer]}, ${remaining} remaining`);
    });
    if (carouselMinimize instanceof HTMLButtonElement) carouselMinimize.disabled = rerolling;
    if (carouselReset instanceof HTMLButtonElement) carouselReset.disabled = rerolling;
    if (authCheckbox) authCheckbox.disabled = rerolling;
    if (generatePromptButton) generatePromptButton.disabled = rerolling;
    if (askGeminiButton) askGeminiButton.disabled = rerolling;
    if (copyActiveResultButton) copyActiveResultButton.disabled = rerolling;
    if (resultTabGuide) resultTabGuide.disabled = rerolling;
    if (resultTabPrompt) resultTabPrompt.disabled = rerolling;
  };

  const flash = (element, className, duration = 420) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    globalThis.setTimeout(() => element.classList.remove(className), duration);
  };

  const stopCarousel = () => {
    if (carouselTimer != null) {
      globalThis.clearInterval(carouselTimer);
      carouselTimer = null;
    }
  };

  const setMarkdownView = (element: HTMLElement | null, source: string) => {
    if (!element) return;
    element.innerHTML = source.trim() ? renderPreviewMarkdown(source) : '';
  };

  const setResultTab = (tab: 'guide' | 'prompt') => {
    const hasGuide = Boolean(guideRaw.trim());
    const nextTab = tab === 'guide' && hasGuide ? 'guide' : 'prompt';
    activeResultTab = nextTab;

    if (resultTabGuide) {
      resultTabGuide.hidden = !hasGuide;
      resultTabGuide.setAttribute('aria-selected', nextTab === 'guide' ? 'true' : 'false');
      resultTabGuide.tabIndex = nextTab === 'guide' ? 0 : -1;
    }
    if (resultTabPrompt) {
      resultTabPrompt.setAttribute('aria-selected', nextTab === 'prompt' ? 'true' : 'false');
      resultTabPrompt.tabIndex = nextTab === 'prompt' ? 0 : -1;
    }
    if (guideView) guideView.hidden = nextTab !== 'guide';
    if (promptView) promptView.hidden = nextTab !== 'prompt';
    if (copyActiveResultButton) {
      copyActiveResultButton.textContent = nextTab === 'guide' ? 'COPY GUIDE' : 'COPY PROMPT';
    }
  };

  const showResultStage = (tab: 'guide' | 'prompt') => {
    if (resultStage) resultStage.hidden = false;
    carousel?.classList.add('has-prompt');
    setResultTab(tab);
  };

  const resetPromptBuilder = ({ resetAuth = false } = {}) => {
    promptRequestVersion += 1;
    carousel?.classList.remove('has-prompt');
    promptRaw = '';
    guideRaw = '';
    if (resultStage) resultStage.hidden = true;
    if (promptView) {
      promptView.innerHTML = '';
      promptView.hidden = true;
    }
    if (guideView) {
      guideView.innerHTML = '';
      guideView.hidden = true;
    }
    if (resultTabGuide) {
      resultTabGuide.hidden = true;
      resultTabGuide.setAttribute('aria-selected', 'false');
      resultTabGuide.tabIndex = -1;
    }
    if (resultTabPrompt) {
      resultTabPrompt.setAttribute('aria-selected', 'false');
      resultTabPrompt.tabIndex = -1;
    }
    activeResultTab = 'prompt';
    if (promptStatus) promptStatus.textContent = '';
    if (generatePromptButton) {
      generatePromptButton.disabled = false;
      generatePromptButton.textContent = 'GENERATE PROMPT';
    }
    if (askGeminiButton) {
      askGeminiButton.disabled = false;
      askGeminiButton.textContent = 'ASK GEMINI';
    }
    if (copyActiveResultButton) copyActiveResultButton.textContent = 'COPY';
    if (resetAuth && authCheckbox) authCheckbox.checked = false;
  };

  const hideCarousel = () => {
    stopCarousel();
    resetPromptBuilder({ resetAuth: true });
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
    const pairName = item.runtime ? `${item.name} + ${item.runtime.name}` : item.name;
    const pairIcons = item.runtime
      ? `<span class="stack-slide-pair-icons"><img class="stack-slide-icon" src="${iconUrlFor(item)}" alt=""><span aria-hidden="true">+</span><img class="stack-slide-icon" src="${item.runtime.iconUrl}" alt=""></span>`
      : `<img class="stack-slide-icon" src="${iconUrlFor(item)}" alt="" aria-hidden="true">`;
    carouselTrack.innerHTML = `
      <a
        class="stack-slide"
        data-layer="${item.layer}"
        data-tech="${item.id}"
        href="${item.docsUrl}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open ${item.name} documentation (${item.layerLabel}: ${pairName})"
      >
        <span class="stack-slide-layer">${item.layerLabel}</span>
        ${pairIcons}
        <strong class="stack-slide-name">${pairName}</strong>
        ${item.runtime ? `<span class="stack-slide-runtime">Framework + compatible runtime</span>` : ''}
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

  const showStackCarousel = (symbols, backendRuntime, { resetAuth = true, minimized = false, activeIndex = 0 } = {}) => {
    lastBackendRuntime = backendRuntime;
    lastStack = describeStack(symbols, backendRuntime);
    if (!carousel || !carouselTrack || !lastStack.length) return;
    resetPromptBuilder({ resetAuth });

    if (carouselSummary) {
      carouselSummary.innerHTML = lastStack.map((item, index) => `
        <article class="stack-summary-card${index === activeIndex ? ' is-active' : ''}" data-layer="${item.layer}" data-tech="${item.id}">
          <a
            class="stack-summary-chip"
            data-slide="${index}"
            href="${item.docsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open ${item.name} documentation (${item.layerLabel}${item.runtime ? ` with ${item.runtime.name}` : ''})"
            title="${item.name} docs"
          >
            <img src="${iconUrlFor(item)}" alt="" aria-hidden="true">
            <span class="stack-summary-label">${item.name}${item.runtime ? ` + ${item.runtime.name}` : ''}</span>
            <span class="stack-summary-docs">DOCS ↗</span>
          </a>
          <button class="stack-reroll-button" type="button" data-reroll="${index}"></button>
        </article>
      `).join('');
    }

    if (carouselDots) {
      carouselDots.innerHTML = lastStack
        .map((item, index) => `
          <button
            class="stack-dot${index === activeIndex ? ' is-active' : ''}"
            type="button"
            data-layer="${item.layer}"
            data-slide="${index}"
            aria-label="Show ${item.layerLabel}: ${item.name}${item.runtime ? ` with ${item.runtime.name}` : ''}"
            aria-current="${index === activeIndex ? 'true' : 'false'}"
          ></button>
        `)
        .join('');
    }

    carousel.hidden = false;
    carousel.classList.toggle('is-minimized', minimized);
    carouselMinimize?.setAttribute('aria-expanded', String(!minimized));
    carouselMinimize?.setAttribute('aria-label', minimized ? 'Restore stack popup' : 'Minimize stack popup');
    body.classList.toggle('carousel-open', !minimized);
    carouselIndex = activeIndex;
    renderCarouselSlide();
    if (!minimized) startCarouselLoop();
    setControls(controller.snapshot());
  };

  const setReelSymbol = (index, symbol) => {
    const reel = reels[index];
    const layer = layerForReel(index);
    const tech = techById(layer, symbol);
    const result = reel?.querySelector<HTMLElement>('.reel-result');
    const image = result?.querySelector('img');

    if (image && tech) image.setAttribute('src', tech.iconUrl);
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
      if (['spinning', 'rerolling'].includes(controller.snapshot().phase)) audio.play('tick');
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
        flash(reel, 'is-stopping', 680);
        flash(stopButtons[event.index], 'is-hit');
        setDisplay(`${layer.toUpperCase()} · ${tech?.short ?? event.symbol}`);
        const runtime = event.index === 1 && event.backendRuntime ? technologyById(event.backendRuntime) : null;
        announce(`${LAYER_LABELS[layer]} locked on ${tech?.name ?? event.symbol}${runtime ? ` with ${runtime.name}` : ''}.`);
        audio.play('stop');
        break;
      }
      case 'allStopped': {
        stopTicks();
        machine.dataset.state = 'settling';
        machine.classList.add('is-celebrating');
        const stack = describeStack(event.symbols, event.backendRuntime);
        const summary = stack.map((item) => item.runtime ? `${item.name} + ${item.runtime.name}` : item.name).join(' · ');
        setDisplay(summary);
        announce(`Stack complete: ${summary}.`);
        showStackCarousel(event.symbols, event.backendRuntime);
        audio.play('complete');
        break;
      }
      case 'complete':
        stopTicks();
        machine.dataset.state = 'idle';
        machine.classList.remove('is-celebrating');
        if (lastStack.length) {
          setDisplay(lastStack.map((item) => item.runtime ? `${item.short}+${item.runtime.short}` : item.short).join(' · '));
          announce('Stack ready. Press start to spin another tech stack.');
        } else {
          setDisplay('PRESS START');
          announce('Machine ready. Press start to spin a tech stack.');
        }
        break;
      case 'rerollStart': {
        const reel = reels[event.index];
        const layer = layerForReel(event.index);
        resetPromptBuilder();
        stopCarousel();
        machine.dataset.state = 'rerolling';
        machine.classList.remove('is-celebrating');
        reel.dataset.state = 'spinning';
        setDisplay(`REROLLING ${layer.toUpperCase()}`);
        announce(`${LAYER_LABELS[layer]} reroll started. All other controls are temporarily disabled.`);
        audio.play('start');
        startTicks();
        break;
      }
      case 'rerollStop': {
        const reel = reels[event.index];
        reel.dataset.state = 'stopped';
        setReelSymbol(event.index, event.symbol);
        flash(reel, 'is-stopping', 680);
        flash(stopButtons[event.index], 'is-hit');
        audio.play('stop');
        break;
      }
      case 'rerollComplete': {
        stopTicks();
        machine.dataset.state = 'idle';
        lastBackendRuntime = event.backendRuntime;
        const activeIndex = event.index;
        showStackCarousel(event.symbols, event.backendRuntime, {
          resetAuth: false,
          minimized: true,
          activeIndex,
        });
        const item = lastStack[activeIndex];
        const summary = lastStack.map((stackItem) => stackItem.runtime
          ? `${stackItem.short}+${stackItem.runtime.short}`
          : stackItem.short).join(' · ');
        setDisplay(summary);
        announce(`${item.layerLabel} rerolled to ${item.name}${item.runtime ? ` with ${item.runtime.name}` : ''}.`);
        if (restorePopupAfterReroll) transitionCarouselMinimized(false);
        restorePopupAfterReroll = false;
        break;
      }
      case 'rerollCancel': {
        stopTicks();
        machine.dataset.state = 'idle';
        reels[event.index].dataset.state = 'stopped';
        setReelSymbol(event.index, event.symbol);
        if (restorePopupAfterReroll) applyCarouselMinimizedState(false);
        restorePopupAfterReroll = false;
        announce('Reroll paused while the page is hidden. The previous result was restored and the reroll was refunded.');
        break;
      }
      case 'cancel':
        stopTicks();
        hideCarousel();
        machine.dataset.state = 'idle';
        machine.classList.remove('is-celebrating');
        reels.forEach((reel) => { reel.dataset.state = 'stopped'; });
        setDisplay('PAUSED');
        announce('Sequence paused while the page is hidden.');
        break;
      case 'reset':
        break;
      default:
        break;
    }
    setControls(event.snapshot);
  };

  controller = options.controller ?? new SpinController({
    autoStopDelays: options.autoStopDelays,
    settleDelay: options.settleDelay,
    rerollDelay: options.rerollDelay,
    rerollLimits: options.rerollLimits,
    reducedMotion: options.reducedMotion ?? (() => body.classList.contains('reduced-motion')),
    schedule: options.schedule,
    cancel: options.cancel,
    selectSymbol: options.selectSymbol ?? ((index) => pickTech(index)),
    selectRerollSymbol: options.selectRerollSymbol,
    selectBackendPair: options.selectBackendPair,
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

  const requestReroll = (index: number, fromPopup = false) => {
    const snapshot = controller.snapshot();
    const layer = layerForReel(index);
    if (snapshot.phase !== 'idle' || !snapshot.stackComplete || (snapshot.rerollsRemaining?.[layer] ?? 0) <= 0) return false;
    if (fromPopup) {
      restorePopupAfterReroll = true;
      carouselIndex = index;
      transitionCarouselMinimized(true);
    }
    if (controller.reroll(index)) {
      audio.play('click');
      return true;
    }
    if (fromPopup) {
      restorePopupAfterReroll = false;
      transitionCarouselMinimized(false);
    }
    return false;
  };

  const activateReelControl = (index: number) => {
    const snapshot = controller.snapshot();
    if (snapshot.phase === 'spinning') return stop(index);
    if (snapshot.phase === 'idle' && snapshot.stackComplete && carousel?.classList.contains('is-minimized')) {
      return requestReroll(index);
    }
    return false;
  };

  const clearCarouselChromeInlineStyles = () => {
    for (const element of [carouselViewport, carouselSummary, carouselDots, promptBuilder, carouselPanel, carouselBackdrop]) {
      if (!(element instanceof HTMLElement)) continue;
      element.style.opacity = '';
      element.style.transform = '';
      element.style.width = '';
      element.style.height = '';
      element.style.maxHeight = '';
    }
  };

  const applyCarouselMinimizedState = (minimized: boolean) => {
    if (!carousel) return;
    carousel.classList.toggle('is-minimized', minimized);
    body.classList.toggle('carousel-open', !minimized);
    carouselMinimize?.setAttribute('aria-expanded', String(!minimized));
    carouselMinimize?.setAttribute('aria-label', minimized ? 'Restore stack popup' : 'Minimize stack popup');
    if (minimized) {
      stopCarousel();
      clearCarouselChromeInlineStyles();
    } else {
      clearCarouselChromeInlineStyles();
      renderCarouselSlide();
      startCarouselLoop();
    }
    setControls(controller.snapshot());
  };

  const transitionCarouselMinimized = (minimized: boolean) => {
    if (!carousel || carousel.hidden || carousel.classList.contains('is-minimized') === minimized) return;

    if (body.classList.contains('reduced-motion') || !carouselPanel) {
      applyCarouselMinimizedState(minimized);
      return;
    }

    const fadeTargets = [carouselViewport, carouselSummary, carouselDots, promptBuilder]
      .filter((element): element is HTMLElement => element instanceof HTMLElement);

    const view = animateView(
      () => applyCarouselMinimizedState(minimized),
      { ...MINIMIZE_SPRING, interrupt: 'immediate' },
    )
      .add(carouselPanel)
      .layout(MINIMIZE_SPRING);

    if (carouselBackdrop) {
      view
        .add(carouselBackdrop)
        .exit({ opacity: 0 }, { duration: 0.22 })
        .enter({ opacity: [0, 1] }, { duration: 0.3 });
    }

    for (const target of fadeTargets) {
      view
        .add(target)
        .exit({ opacity: 0, transform: 'scale(0.97)' }, { duration: 0.18 })
        .enter({ opacity: [0, 1], transform: ['scale(0.97)', 'none'] }, { duration: 0.28 });
    }

    // Layout/fade springs can leave inline size/opacity that fights CSS after settle.
    globalThis.setTimeout(() => {
      clearCarouselChromeInlineStyles();
    }, 700);
  };

  const toggleCarouselMinimized = () => {
    if (!carousel || carousel.hidden) return;
    transitionCarouselMinimized(!carousel.classList.contains('is-minimized'));
  };

  const resetPachinko = () => {
    controller.reset('reset');
    stopTicks();
    hideCarousel();
    lastStack = [];
    lastBackendRuntime = null;
    carouselIndex = 0;
    restorePopupAfterReroll = false;
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

  const generateGeminiPrompt = async () => {
    if (!lastStack.length || !generatePromptButton) return;

    const requestVersion = ++promptRequestVersion;
    generatePromptButton.disabled = true;
    generatePromptButton.textContent = 'GENERATING…';
    if (promptStatus) promptStatus.textContent = 'Building a prompt for the rolled stack…';

    try {
      const response = await globalThis.fetch('/api/gemini-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: lastStack.map(({ id }) => id),
          backendRuntime: lastBackendRuntime,
          authentication: Boolean(authCheckbox?.checked),
        }),
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload?.error || 'Could not generate the prompt.');
      if (requestVersion !== promptRequestVersion) return;
      if (typeof payload?.prompt !== 'string') throw new Error('The server returned an invalid prompt.');

      promptRaw = payload.prompt;
      guideRaw = '';
      setMarkdownView(promptView, promptRaw);
      setMarkdownView(guideView, '');
      showResultStage('prompt');
      generatePromptButton.textContent = 'REGENERATE PROMPT';
      if (promptStatus) promptStatus.textContent = 'Prompt ready. Copy it into Gemini as a system prompt.';
      promptView?.focus();
    } catch (error) {
      if (requestVersion !== promptRequestVersion) return;
      if (promptStatus) {
        promptStatus.textContent = error instanceof Error ? error.message : 'Could not generate the prompt.';
      }
      generatePromptButton.textContent = 'TRY AGAIN';
    } finally {
      if (requestVersion === promptRequestVersion) generatePromptButton.disabled = false;
    }
  };

  const askGemini = async () => {
    if (!lastStack.length || !askGeminiButton) return;

    const requestVersion = ++promptRequestVersion;
    askGeminiButton.disabled = true;
    askGeminiButton.textContent = 'GEMINI IS WRITING…';
    if (generatePromptButton) generatePromptButton.disabled = true;
    if (promptStatus) promptStatus.textContent = 'Gemini is generating the implementation guide. This can take a few minutes…';

    try {
      const response = await globalThis.fetch('/api/gemini-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: lastStack.map(({ id }) => id),
          backendRuntime: lastBackendRuntime,
          authentication: Boolean(authCheckbox?.checked),
        }),
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload?.error || 'Gemini could not generate the guide.');
      if (requestVersion !== promptRequestVersion) return;
      if (typeof payload?.prompt !== 'string' || typeof payload?.guide !== 'string') {
        throw new Error('Gemini returned an invalid guide.');
      }

      promptRaw = payload.prompt;
      guideRaw = payload.guide;
      setMarkdownView(promptView, promptRaw);
      setMarkdownView(guideView, guideRaw);
      showResultStage('guide');
      if (generatePromptButton) generatePromptButton.textContent = 'REGENERATE PROMPT';
      askGeminiButton.textContent = 'ASK GEMINI AGAIN';
      if (promptStatus) promptStatus.textContent = `Guide ready from ${payload.model || 'Gemini'}. You can copy the prompt or the result.`;
      guideView?.focus();
    } catch (error) {
      if (requestVersion !== promptRequestVersion) return;
      askGeminiButton.textContent = 'TRY GEMINI AGAIN';
      if (promptStatus) {
        promptStatus.textContent = error instanceof Error ? error.message : 'Gemini could not generate the guide.';
      }
    } finally {
      if (requestVersion === promptRequestVersion) {
        askGeminiButton.disabled = false;
        if (generatePromptButton) generatePromptButton.disabled = false;
      }
    }
  };

  const activeResultText = () => (activeResultTab === 'guide' ? guideRaw : promptRaw);

  const copyActiveResult = async () => {
    const value = activeResultText();
    const button = copyActiveResultButton;
    if (!value.trim() || !button) return;

    const successMessage = activeResultTab === 'guide'
      ? 'Implementation guide copied.'
      : 'Copied. Paste it into Gemini as the system prompt.';
    const idleLabel = activeResultTab === 'guide' ? 'COPY GUIDE' : 'COPY PROMPT';

    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(value);
      } else {
        throw new Error('Clipboard API is unavailable.');
      }
      button.textContent = 'COPIED ✓';
      if (promptStatus) promptStatus.textContent = successMessage;
      globalThis.setTimeout(() => {
        if (copyActiveResultButton) copyActiveResultButton.textContent = idleLabel;
      }, 1600);
    } catch {
      (activeResultTab === 'guide' ? guideView : promptView)?.focus();
      button.textContent = 'COPY FAILED';
      if (promptStatus) promptStatus.textContent = 'Automatic copy is blocked by the browser.';
    }
  };

  on(startButton, 'click', () => start());
  stopButtons.forEach((button, index) => on(button, 'click', () => activateReelControl(index)));
  if (carouselMinimize) on(carouselMinimize, 'click', toggleCarouselMinimized);
  if (carouselBackdrop) {
    on(carouselBackdrop, 'click', (() => {
      if (!carousel || carousel.hidden || carousel.classList.contains('is-minimized')) return;
      toggleCarouselMinimized();
    }) as EventListener);
  }
  if (carouselReset) on(carouselReset, 'click', resetPachinko);
  if (generatePromptButton) on(generatePromptButton, 'click', (() => { void generateGeminiPrompt(); }) as EventListener);
  if (askGeminiButton) on(askGeminiButton, 'click', (() => { void askGemini(); }) as EventListener);
  if (resultTabGuide) on(resultTabGuide, 'click', (() => { setResultTab('guide'); }) as EventListener);
  if (resultTabPrompt) on(resultTabPrompt, 'click', (() => { setResultTab('prompt'); }) as EventListener);
  if (copyActiveResultButton) on(copyActiveResultButton, 'click', (() => { void copyActiveResult(); }) as EventListener);
  if (authCheckbox) {
    on(authCheckbox, 'change', () => {
      resetPromptBuilder();
      if (promptStatus) promptStatus.textContent = authCheckbox.checked
        ? 'Authentication will be included.'
        : 'Authentication will remain an extension point.';
    });
  }
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
      const rerollButton = (event.target as Element | null)?.closest?.('.stack-reroll-button');
      if (rerollButton instanceof HTMLButtonElement && carouselSummary.contains(rerollButton)) {
        event.preventDefault();
        const index = Number(rerollButton.dataset.reroll);
        if (Number.isInteger(index)) requestReroll(index, true);
        return;
      }
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
      activateReelControl(Number(event.key) - 1);
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
