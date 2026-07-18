import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
let app;

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: (key) => { map.delete(String(key)); },
    clear: () => { map.clear(); },
  };
}

function mount() {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.replaceChild(document.importNode(parsed.body, true), document.body);
}

function createAudioMock(muted = false) {
  return {
    isMuted: muted,
    play: vi.fn().mockResolvedValue(true),
    toggle: vi.fn(function toggle() { this.isMuted = !this.isMuted; return this.isMuted; }),
    suspend: vi.fn(),
    close: vi.fn(),
  };
}

describe('pachislot application', () => {
  let storage;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    mount();
  });

  afterEach(() => {
    app?.destroy();
    app = null;
    vi.useRealTimers();
  });

  it('provides the complete semantic control and display structure', () => {
    expect(document.querySelector('#start-button').getAttribute('aria-label')).toBe('Start all three reels');
    expect([...document.querySelectorAll('.stop-button')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Stop frontend reel',
      'Stop backend reel',
      'Stop database reel',
    ]);
    expect(document.querySelector('#mute-toggle').getAttribute('aria-label')).toBeTruthy();
    expect(document.querySelector('#backdrop-toggle').getAttribute('aria-label')).toBeTruthy();
    expect(document.querySelectorAll('.reel-strip')).toHaveLength(3);
    expect([...document.querySelectorAll('.reel')].map((reel) => reel.dataset.layer)).toEqual(['fe', 'be', 'db']);
    expect(document.querySelector('#stack-carousel')).toBeTruthy();
    expect(document.querySelector('[aria-label="Upper feature display"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Lower energy artwork"]')).toBeTruthy();
  });

  it('runs a mixed button and keyboard sequence and shows the tech stack carousel', () => {
    const audio = createAudioMock();
    const symbols = ['vue', 'go', 'redis'];
    app = createApp(document, {
      audio,
      storage,
      autoStopDelays: [100, 200, 300],
      settleDelay: 30,
      carouselInterval: 50,
      selectSymbol: (index) => symbols[index],
    });

    const start = document.querySelector('#start-button');
    const stops = [...document.querySelectorAll('.stop-button')];
    const carousel = document.querySelector('#stack-carousel');
    start.click();
    expect(start.disabled).toBe(true);
    expect(stops.every((button) => !button.disabled)).toBe(true);
    expect(document.querySelector('#pachislot-machine').dataset.state).toBe('spinning');
    expect(carousel.hidden).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(stops[2].disabled).toBe(true);
    expect(document.querySelectorAll('.reel')[2].dataset.symbol).toBe('redis');

    vi.advanceTimersByTime(200);
    expect(document.querySelector('#pachislot-machine').dataset.state).toBe('settling');
    expect(carousel.hidden).toBe(false);
    expect(document.body.classList.contains('carousel-open')).toBe(true);
    expect(document.querySelectorAll('#stack-carousel-summary .stack-summary-chip')).toHaveLength(3);
    expect(document.querySelector('.stack-slide').getAttribute('aria-label')).toBe('Frontend: Vue');
    expect(document.querySelector('.stack-slide-name').textContent).toBe('Vue');
    expect(document.querySelector('.stack-slide img').getAttribute('src')).toContain('/vuejs/vuejs-original.svg');
    expect([...document.querySelectorAll('.stack-summary-label')].map((el) => el.textContent)).toEqual([
      'Vue',
      'Go',
      'Redis',
    ]);

    vi.advanceTimersByTime(50);
    expect(document.querySelector('.stack-slide img').getAttribute('src')).toContain('/go/go-original.svg');
    expect(document.querySelector('.stack-slide-name').textContent).toBe('Go');

    vi.advanceTimersByTime(30);
    expect(start.disabled).toBe(false);
    expect(document.querySelector('#machine-status').textContent).toContain('ready');
    expect(audio.play).toHaveBeenCalledWith('complete');
  });

  it('persists mute and backdrop preferences', () => {
    const audio = createAudioMock(true);
    app = createApp(document, { audio, storage });
    const mute = document.querySelector('#mute-toggle');
    const backdrop = document.querySelector('#backdrop-toggle');

    expect(mute.getAttribute('aria-pressed')).toBe('true');
    mute.click();
    expect(audio.toggle).toHaveBeenCalledOnce();
    expect(mute.getAttribute('aria-pressed')).toBe('false');

    backdrop.click();
    expect(document.body.dataset.backdrop).toBe('isolated');
    expect(storage.getItem('nocturne-pachislot-backdrop')).toBe('isolated');
  });

  it('starts from keyboard, applies presentation states, and cancels when hidden', () => {
    const audio = createAudioMock();
    app = createApp(document, {
      audio,
      storage,
      autoStopDelays: [80, 160, 240],
      settleDelay: 40,
      selectSymbol: (index) => ['react', 'node', 'postgres'][index],
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const machine = document.querySelector('#pachislot-machine');
    expect(machine.dataset.state).toBe('spinning');
    expect(machine.classList.contains('is-celebrating')).toBe(false);
    expect(document.querySelector('#display-message').textContent).toBe('SPINNING STACK');
    expect(audio.play).toHaveBeenCalledWith('start');

    document.querySelectorAll('.stop-button')[0].click();
    expect(document.querySelectorAll('.reel')[0].classList.contains('is-stopping')).toBe(true);
    expect(audio.play).toHaveBeenCalledWith('click');
    expect(audio.play).toHaveBeenCalledWith('stop');

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(machine.dataset.state).toBe('idle');
    expect(document.querySelector('#stack-carousel').hidden).toBe(true);
    expect(audio.suspend).toHaveBeenCalledOnce();
    expect(document.querySelector('#machine-status').textContent).toContain('paused');
  });

  it('supports repeated spin cycles after completion', () => {
    const audio = createAudioMock();
    app = createApp(document, {
      audio,
      storage,
      autoStopDelays: [10, 20, 30],
      settleDelay: 10,
      selectSymbol: (index) => ['react', 'node', 'postgres'][index],
    });

    const start = document.querySelector('#start-button');
    start.click();
    vi.advanceTimersByTime(50);
    expect(document.querySelector('#pachislot-machine').dataset.state).toBe('idle');
    expect(start.disabled).toBe(false);
    expect(document.querySelector('#stack-carousel').hidden).toBe(false);

    start.click();
    expect(document.querySelector('#pachislot-machine').dataset.state).toBe('spinning');
    expect(document.querySelector('#stack-carousel').hidden).toBe(true);
    expect(audio.play).toHaveBeenCalledWith('start');
  });
});
