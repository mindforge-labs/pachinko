/** Static cabinet artwork rendered by the Next.js page. */
export const pachinkoMarkup = String.raw`
  <svg class="svg-library" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="gold-face" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff3a6"/><stop offset=".2" stop-color="#d99a25"/>
        <stop offset=".47" stop-color="#7d4206"/><stop offset=".7" stop-color="#f4ca54"/><stop offset="1" stop-color="#6c3407"/>
      </linearGradient>
      <linearGradient id="chrome-face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#faf8ff"/><stop offset=".18" stop-color="#686474"/>
        <stop offset=".42" stop-color="#e9e8ef"/><stop offset=".66" stop-color="#3a3743"/><stop offset="1" stop-color="#c5c1cc"/>
      </linearGradient>
      <radialGradient id="purple-core">
        <stop offset="0" stop-color="#fb8cff"/><stop offset=".35" stop-color="#8b21d1"/><stop offset="1" stop-color="#170326"/>
      </radialGradient>
      <filter id="gold-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="purple-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      <!-- FE -->
      <symbol id="icon-react" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="5.5" fill="#61dafb"/>
        <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#61dafb" stroke-width="3"/>
        <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#61dafb" stroke-width="3" transform="rotate(60 32 32)"/>
        <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#61dafb" stroke-width="3" transform="rotate(120 32 32)"/>
      </symbol>
      <symbol id="icon-vue" viewBox="0 0 64 64">
        <path fill="#41b883" d="M32 54 4 10h14l14 24 14-24h14L32 54Z"/>
        <path fill="#35495e" d="M32 40 20 20h8l4 7 4-7h8L32 40Z"/>
      </symbol>
      <symbol id="icon-svelte" viewBox="0 0 64 64">
        <path fill="#ff3e00" d="M40 10c-7-4-16-2-21 5L11 28a12 12 0 0 0 5 17c2 1 4 2 6 2l2-1 3 5c5 7 14 9 21 5l8-5a12 12 0 0 0-5-17l-2-1-3-5c-2-3-4-5-7-6Zm-1 28c-3 2-7 1-9-2l-7-11a4 4 0 0 1 2-6c1-.5 2-.5 3 0l2 1a2 2 0 0 0 3-2l-2-1c-4-2-9-1-12 3a8 8 0 0 0-1 10l7 11c3 5 9 6 14 3a8 8 0 0 0 3-11l-2-1a2 2 0 1 0-2 3l2 1c1 2 1 5-1 6Z"/>
      </symbol>
      <symbol id="icon-next" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="#111"/><circle cx="32" cy="32" r="26" fill="none" stroke="#eee" stroke-width="3"/>
        <path fill="#fff" d="M24 20h7.2c8.4 0 13.8 4.5 13.8 12.2S39.6 44.5 31.2 44.5H24V20Zm7 18.8c4.6 0 7.3-2.4 7.3-6.6S35.6 26 31 26h-1.5v12.8H31Z"/>
        <path fill="#fff" d="m38 44 10-20h6.5L43.2 44H38Z"/>
      </symbol>
      <symbol id="icon-angular" viewBox="0 0 64 64">
        <path fill="#dd0031" d="M32 6 8 14l4 34 20 10 20-10 4-34L32 6Z"/>
        <path fill="#c3002f" d="M32 6v52l20-10 4-34L32 6Z"/>
        <path fill="#fff" d="m32 18 11 28h-6.2l-2.2-5.8H27.4L25.2 46H19L32 18Zm0 10.5-3.5 9.3h7L32 28.5Z"/>
      </symbol>
      <symbol id="icon-solid" viewBox="0 0 64 64">
        <path fill="#2c4f7c" d="M36 10c-10 0-18 6-22 14 8-4 18-2 24 4 7 7 8 17 4 24 10-2 17-12 16-23 0-11-10-19-22-19Z"/>
        <path fill="#4f8cc9" d="M18 28c-6 8-6 18-1 25 8-5 12-14 10-23-1-4-4-7-9-2Z"/>
        <path fill="#66e1ee" d="M28 34c-5 8-4 18 2 24 7-6 10-15 7-23-2-4-5-5-9-1Z"/>
      </symbol>

      <!-- BE -->
      <symbol id="icon-node" viewBox="0 0 64 64">
        <path fill="#3c873a" d="M32 6 10 18v28l22 12 22-12V18L32 6Z"/>
        <path fill="#68a063" d="M32 12.5 16 21v22l16 8.5 16-8.5V21L32 12.5Z"/>
        <path fill="#fff" d="M28 24h8c4 0 7 2.5 7 6.5S40 37 36 37h-3v7h-5V24Zm5 9h2.5c1.7 0 2.7-.8 2.7-2.2S37.2 29 35.5 29H33v4Z"/>
      </symbol>
      <symbol id="icon-go" viewBox="0 0 64 64">
        <ellipse cx="32" cy="34" rx="26" ry="16" fill="#00add8"/>
        <circle cx="22" cy="32" r="3" fill="#fff"/><circle cx="34" cy="32" r="3" fill="#fff"/>
        <path fill="#fff" d="M14 28c4-6 10-8 16-6M46 40c-3 4-9 6-14 4"/><path fill="#5dc9e2" d="M48 26c4 1 7 4 8 8-3-1-6-2-8-5Z"/>
      </symbol>
      <symbol id="icon-rust" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="18" fill="none" stroke="#dea584" stroke-width="4"/>
        <circle cx="32" cy="32" r="8" fill="#dea584"/>
        <g fill="#dea584">
          <rect x="30" y="6" width="4" height="10" rx="1"/><rect x="30" y="48" width="4" height="10" rx="1"/>
          <rect x="6" y="30" width="10" height="4" rx="1"/><rect x="48" y="30" width="10" height="4" rx="1"/>
          <rect x="30" y="6" width="4" height="10" rx="1" transform="rotate(45 32 32)"/>
          <rect x="30" y="6" width="4" height="10" rx="1" transform="rotate(135 32 32)"/>
          <rect x="30" y="6" width="4" height="10" rx="1" transform="rotate(225 32 32)"/>
          <rect x="30" y="6" width="4" height="10" rx="1" transform="rotate(315 32 32)"/>
        </g>
      </symbol>
      <symbol id="icon-django" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="12" fill="#092e20"/>
        <path fill="#fff" d="M28 14h8v28c0 6-3 10-10 10H20v-7h5c2 0 3-1 3-3V14Zm12 10h8v24h-8V24Zm0-10h8v7h-8v-7Z"/>
      </symbol>
      <symbol id="icon-rails" viewBox="0 0 64 64">
        <path fill="#cc0000" d="M32 8 12 20v24l20 12 20-12V20L32 8Z"/>
        <path fill="#fff" d="M24 26c0-4 3-7 8-7s8 3 8 7c0 5-4 7-6 8l6 9h-6l-5-8h-1v8h-5V26h5Zm0 0h5c2 0 3 1 3 3s-1 3-3 3h-5v-6Z"/>
      </symbol>
      <symbol id="icon-fastapi" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="#009688"/>
        <path fill="#fff" d="M28 12h8l-4 16h10L28 52l4-18H22L28 12Z"/>
      </symbol>

      <!-- DB -->
      <symbol id="icon-postgres" viewBox="0 0 64 64">
        <ellipse cx="32" cy="20" rx="16" ry="10" fill="#336791"/>
        <path fill="#336791" d="M16 20c0 14 5 30 16 30s16-16 16-30"/>
        <ellipse cx="32" cy="20" rx="16" ry="10" fill="#4789b6"/>
        <path fill="#fff" d="M24 18c0-2 2-4 4-4s3 1 3 3-1 3-3 3-4 0-4-2Zm10 1c0-2 2-3 4-3s4 2 4 4-2 3-4 3-4-1-4-4Z"/>
        <path fill="#101820" d="M27 30c2 6 8 10 12 8 1 4-2 8-7 8s-9-5-5-16Z"/>
      </symbol>
      <symbol id="icon-mongo" viewBox="0 0 64 64">
        <path fill="#10aa50" d="M32 8c2 10 14 18 14 32 0 8-6 14-14 16-8-2-14-8-14-16 0-14 12-22 14-32Z"/>
        <path fill="#b8c4c2" d="M31 18v36c-1-.5-2-2-2-4V22c0-2 1-3 2-4Z"/>
      </symbol>
      <symbol id="icon-redis" viewBox="0 0 64 64">
        <path fill="#912626" d="M8 24 32 12l24 12-24 12L8 24Z"/>
        <path fill="#c6302b" d="M8 32 32 20l24 12-24 12L8 32Z"/>
        <path fill="#912626" d="M8 40 32 28l24 12-24 12L8 40Z"/>
        <path fill="#fff" opacity=".35" d="M20 28 32 22l12 6-12 6-12-6Z"/>
      </symbol>
      <symbol id="icon-mysql" viewBox="0 0 64 64">
        <path fill="#00758f" d="M10 38c6-14 16-22 30-24 2 8 2 16-2 24-8 2-18 2-28 0Z"/>
        <path fill="#f29111" d="M40 16c8 2 14 8 16 16-6 4-12 6-20 6 0-8 2-16 4-22Z"/>
        <path fill="#fff" d="M18 36c4 2 10 3 16 2 1 4-2 8-8 8-6 0-10-4-8-10Z"/>
      </symbol>
      <symbol id="icon-sqlite" viewBox="0 0 64 64">
        <rect x="12" y="8" width="40" height="48" rx="6" fill="#0f80cc"/>
        <path fill="#003b57" d="M18 16h28v6H18zm0 12h20v5H18zm0 11h24v5H18z"/>
        <circle cx="44" cy="44" r="8" fill="#7dd3fc"/>
      </symbol>
      <symbol id="icon-dynamo" viewBox="0 0 64 64">
        <path fill="#4053d6" d="M12 18h40l-6 12H18L12 18Zm4 16h32l-6 12H22l-6-12Zm4 16h24l-4 8H24l-4-8Z"/>
        <path fill="#ee4251" d="m34 10 4 8H26l4-8h4Z"/>
      </symbol>
    </defs>
  </svg>

  <div id="stack-carousel" class="stack-carousel" hidden aria-label="Selected tech stack carousel">
    <div class="stack-carousel-backdrop" aria-hidden="true"></div>
    <div class="stack-carousel-panel" role="dialog" aria-modal="true" aria-labelledby="stack-carousel-heading">
      <header class="stack-carousel-head">
        <span id="stack-carousel-heading">YOUR STACK</span>
        <div class="stack-carousel-actions">
          <button id="stack-carousel-minimize" class="stack-carousel-action" type="button" aria-label="Minimize stack popup" aria-expanded="true">
            <svg class="stack-carousel-action-icon stack-carousel-icon-minimize" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
            <svg class="stack-carousel-action-icon stack-carousel-icon-expand" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <rect x="3.5" y="3.5" width="9" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          </button>
          <button id="stack-carousel-reset" class="stack-carousel-action stack-carousel-reset" type="button" aria-label="Reset pachinko">
            <svg class="stack-carousel-action-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M13.2 8A5.2 5.2 0 1 1 10.4 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
              <path d="M10.1 1.8h3.2V5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="stack-carousel-viewport">
        <div id="stack-carousel-track" class="stack-carousel-track" aria-live="polite"></div>
      </div>
      <div id="stack-carousel-summary" class="stack-carousel-summary" aria-label="Selected stack actions"></div>
      <div id="stack-carousel-dots" class="stack-carousel-dots" aria-label="Choose stack item"></div>
      <section class="prompt-builder" aria-labelledby="prompt-builder-heading">
        <div class="prompt-builder-copy">
          <strong id="prompt-builder-heading">GEMINI IMPLEMENTATION PROMPT</strong>
          <span>Student CRUD · CLI only · Linux + Windows · Docker</span>
        </div>
        <label class="auth-option" for="include-auth">
          <input id="include-auth" type="checkbox">
          <span class="auth-option-control" aria-hidden="true"></span>
          <span>Include authentication</span>
        </label>
        <div class="prompt-builder-actions">
          <button id="generate-prompt" class="prompt-secondary-action" type="button">
            GENERATE PROMPT
          </button>
          <button id="ask-gemini" class="prompt-primary-action" type="button">
            ASK GEMINI
          </button>
        </div>
        <p id="prompt-builder-status" class="prompt-builder-status" role="status" aria-live="polite"></p>
        <div id="result-stage" class="result-stage" hidden>
          <div class="result-toolbar">
            <div class="result-tabs" role="tablist" aria-label="Gemini result">
              <button type="button" role="tab" id="result-tab-guide" class="result-tab" aria-controls="gemini-guide" aria-selected="false" tabindex="-1" hidden>GUIDE</button>
              <button type="button" role="tab" id="result-tab-prompt" class="result-tab" aria-controls="gemini-system-prompt" aria-selected="false" tabindex="-1">PROMPT</button>
            </div>
            <button id="copy-active-result" class="prompt-copy-action" type="button">COPY</button>
          </div>
          <div class="result-panels">
            <article id="gemini-guide" class="result-body markdown-body" role="tabpanel" aria-labelledby="result-tab-guide" hidden tabindex="0"></article>
            <article id="gemini-system-prompt" class="result-body markdown-body" role="tabpanel" aria-labelledby="result-tab-prompt" hidden tabindex="0"></article>
          </div>
        </div>
      </section>
    </div>
  </div>

  <header class="utility-bar" aria-label="Showcase settings">
    <div class="brand-mark" aria-label="Nocturne Nova">
      <span class="brand-star" aria-hidden="true">✦</span>
      <span>NOCTURNE NOVA</span>
    </div>
    <div class="setting-group">
      <button class="setting-button" id="backdrop-toggle" type="button" aria-label="Use isolated backdrop" aria-pressed="false">
        <span aria-hidden="true">◫</span><span class="setting-label">SCENE</span><span class="setting-value">ARCADE</span>
      </button>
      <button class="setting-button" id="mute-toggle" type="button" aria-label="Mute machine sounds" aria-pressed="false">
        <span aria-hidden="true">♪</span><span class="setting-label">SOUND</span><span class="setting-value">ON</span>
      </button>
    </div>
  </header>

  <main class="showcase" aria-labelledby="showcase-title">
    <h1 id="showcase-title" class="visually-hidden">Nocturne Nova tech stack spinner</h1>
    <div class="machine-connector connector-left" aria-hidden="true"><i></i><b></b></div>
    <div class="machine-connector connector-right" aria-hidden="true"><i></i><b></b></div>

    <aside class="stack-module stack-module--frontend" aria-label="Frontend module">
      <div class="stack-module__corner stack-module__corner--one" aria-hidden="true"></div>
      <header class="stack-module__header">
        <span class="stack-module__signal" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="stack-module__eyebrow">FRONTEND MODULE</span>
        <strong>FE · INTERFACE LAYER</strong>
      </header>
      <div class="stack-module__slots">
        <div class="module-tech-card"><img src="/devicons/nextjs.svg" alt=""><span>Next.js</span><b>01</b></div>
        <div class="module-tech-card"><img src="/devicons/react.svg" alt=""><span>React</span><b>02</b></div>
        <div class="module-tech-card"><img src="/devicons/tailwindcss.svg" alt=""><span>Tailwind CSS</span><b>03</b></div>
      </div>
      <footer class="stack-module__footer"><span>READY</span><i aria-hidden="true"></i><span>SYNC</span></footer>
    </aside>

    <aside class="stack-module stack-module--backend" aria-label="Backend module">
      <div class="stack-module__corner stack-module__corner--one" aria-hidden="true"></div>
      <header class="stack-module__header">
        <span class="stack-module__signal" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="stack-module__eyebrow">BACKEND MODULE</span>
        <strong>BE · DATA &amp; SERVICES</strong>
      </header>
      <div class="stack-module__slots">
        <div class="module-tech-card"><img src="/devicons/bun.svg" alt=""><span>Bun</span><b>01</b></div>
        <div class="module-tech-card"><img src="/devicons/redis.svg" alt=""><span>Redis</span><b>02</b></div>
        <div class="module-tech-card"><img src="/devicons/postgresql.svg" alt=""><span>PostgreSQL</span><b>03</b></div>
      </div>
      <footer class="stack-module__footer"><span>READY</span><i aria-hidden="true"></i><span>SYNC</span></footer>
    </aside>

    <article class="machine" id="pachislot-machine" data-state="idle" aria-label="Nocturne Nova tech stack spinner cabinet">
      <div class="machine-shadow" aria-hidden="true"></div>
      <div class="cabinet-spine left-spine" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="cabinet-spine right-spine" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

      <section class="crown" aria-label="Cabinet crown">
        <div class="crown-wing crown-wing-left" aria-hidden="true"></div>
        <div class="crown-center">
          <span class="crown-kicker">TECH STACK SPINNER</span>
          <strong>NOCTURNE <em>NOVA</em></strong>
          <span class="crown-rule" aria-hidden="true"></span>
        </div>
        <div class="crown-wing crown-wing-right" aria-hidden="true"></div>
      </section>

      <div class="cabinet-shell" aria-hidden="true"></div>

      <section class="upper-zone" aria-label="Upper feature display">
        <div class="upper-screen">
          <div class="screen-scan" aria-hidden="true"></div>
          <svg class="constellation" viewBox="0 0 280 150" aria-hidden="true">
            <g fill="none" stroke="#c767ff" stroke-width="1" opacity=".55">
              <path d="M12 112 58 48l45 38 34-63 48 76 76-64"/><path d="m21 27 61 55 76 24 47-73"/>
            </g>
            <g fill="#fff0a4" filter="url(#gold-glow)">
              <circle cx="58" cy="48" r="3"/><circle cx="103" cy="86" r="4"/><circle cx="137" cy="23" r="3"/><circle cx="185" cy="99" r="4"/><circle cx="261" cy="35" r="3"/>
            </g>
            <path d="M50 119c35-38 77-47 126-28 25 10 45 8 72-2" fill="none" stroke="#f1c957" stroke-width="3"/>
          </svg>
          <div class="screen-copy">
            <span class="screen-overline">STACK BUILDER</span>
            <strong id="display-message">PRESS START</strong>
            <small>FE · BE · DB</small>
          </div>
          <div class="screen-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>

        <div class="emblem-wrap" aria-label="Decorative nova emblem">
          <svg class="nova-emblem" viewBox="0 0 180 180" aria-hidden="true">
            <g filter="url(#gold-glow)">
              <path fill="url(#gold-face)" d="M90 5 104 51 148 28 126 72 175 81 130 99 165 132 115 120 111 172 88 128 53 166 60 115 10 128 48 95 5 70 55 67 38 20 78 51Z"/>
              <circle cx="90" cy="90" r="48" fill="#16091f" stroke="url(#gold-face)" stroke-width="9"/>
              <path d="M55 103c22 17 47 14 70-12M60 80c19-17 40-18 63-4" fill="none" stroke="#f4cc58" stroke-width="7" stroke-linecap="round"/>
              <path d="m76 50 13 27 24-17-9 31 27 7-29 9 9 27-23-18-15 24 2-31-29-2 27-16-20-22Z" fill="url(#purple-core)" stroke="#fff1a6" stroke-width="3"/>
            </g>
          </svg>
          <span class="emblem-orbit orbit-one" aria-hidden="true"></span>
          <span class="emblem-orbit orbit-two" aria-hidden="true"></span>
        </div>
      </section>

      <section class="reel-bay" aria-label="Tech stack reels">
        <div class="reel-header" aria-hidden="true"><span>FE</span><strong>STACK REELS</strong><span>DB</span></div>
        <div class="reel-frame">
          <span class="payline payline-top" aria-hidden="true"></span>
          <span class="payline payline-main" aria-hidden="true"></span>
          <span class="payline payline-bottom" aria-hidden="true"></span>

          <div class="reel" data-reel="0" data-layer="fe" data-state="stopped" data-symbol="react" aria-label="Frontend reel">
            <div class="reel-strip" aria-hidden="true">
              <div class="tech-tile" data-layer="fe"><img class="tech-icon" src="/devicons/vuejs.svg" alt=""></div>
              <div class="tech-tile" data-layer="fe"><img class="tech-icon" src="/devicons/nextjs.svg" alt=""></div>
              <div class="tech-tile" data-layer="fe"><img class="tech-icon" src="/devicons/svelte.svg" alt=""></div>
              <div class="tech-tile" data-layer="fe"><img class="tech-icon" src="/devicons/react.svg" alt=""></div>
              <div class="tech-tile" data-layer="fe"><img class="tech-icon" src="/devicons/angularjs.svg" alt=""></div>
              <div class="tech-tile" data-layer="fe"><img class="tech-icon" src="/devicons/solidjs.svg" alt=""></div>
            </div>
            <div class="reel-result tech-tile" data-layer="fe" role="img" aria-label="React">
              <img class="tech-icon" src="/devicons/react.svg" alt="">
            </div>
          </div>

          <div class="reel" data-reel="1" data-layer="be" data-state="stopped" data-symbol="express" aria-label="Backend framework reel">
            <div class="reel-strip" aria-hidden="true">
              <div class="tech-tile" data-layer="be"><img class="tech-icon" src="/devicons/express.svg" alt=""></div>
              <div class="tech-tile" data-layer="be"><img class="tech-icon" src="/devicons/spring.svg" alt=""></div>
              <div class="tech-tile" data-layer="be"><img class="tech-icon" src="/devicons/django.svg" alt=""></div>
              <div class="tech-tile" data-layer="be"><img class="tech-icon" src="/devicons/nextjs.svg" alt=""></div>
              <div class="tech-tile" data-layer="be"><img class="tech-icon" src="/devicons/rails.svg" alt=""></div>
              <div class="tech-tile" data-layer="be"><img class="tech-icon" src="/devicons/fastapi.svg" alt=""></div>
            </div>
            <div class="reel-result tech-tile" data-layer="be" role="img" aria-label="Express">
              <img class="tech-icon" src="/devicons/express.svg" alt="">
            </div>
          </div>

          <div class="reel" data-reel="2" data-layer="db" data-state="stopped" data-symbol="postgres" aria-label="Database reel">
            <div class="reel-strip" aria-hidden="true">
              <div class="tech-tile" data-layer="db"><img class="tech-icon" src="/devicons/mongodb.svg" alt=""></div>
              <div class="tech-tile" data-layer="db"><img class="tech-icon" src="/devicons/redis.svg" alt=""></div>
              <div class="tech-tile" data-layer="db"><img class="tech-icon" src="/devicons/mysql.svg" alt=""></div>
              <div class="tech-tile" data-layer="db"><img class="tech-icon" src="/devicons/postgresql.svg" alt=""></div>
              <div class="tech-tile" data-layer="db"><img class="tech-icon" src="/devicons/sqlite.svg" alt=""></div>
              <div class="tech-tile" data-layer="db"><img class="tech-icon" src="/devicons/dynamodb.svg" alt=""></div>
            </div>
            <div class="reel-result tech-tile" data-layer="db" role="img" aria-label="Postgres">
              <img class="tech-icon" src="/devicons/postgresql.svg" alt="">
            </div>
          </div>
        </div>
        <div class="reel-footer" aria-hidden="true"><i></i><span>FE · BE · DB · SHOWCASE ONLY</span><i></i></div>
      </section>

      <section class="control-deck" aria-label="Machine controls">
        <div class="deck-surface" aria-hidden="true"></div>
        <div class="start-control">
          <button class="start-button" id="start-button" type="button" aria-label="Start all three reels">
            <span class="button-shine" aria-hidden="true"></span><span>START</span>
          </button>
          <small>ENTER · SPACE</small>
        </div>

        <div class="stop-controls" role="group" aria-label="Individual reel stop controls">
          <div class="stop-control">
            <button class="stop-button" type="button" data-stop="0" aria-label="Stop frontend reel" aria-keyshortcuts="1" aria-pressed="true" disabled><span>1</span></button>
            <small>FE</small>
          </div>
          <div class="stop-control">
            <button class="stop-button" type="button" data-stop="1" aria-label="Stop backend reel" aria-keyshortcuts="2" aria-pressed="true" disabled><span>2</span></button>
            <small>BE</small>
          </div>
          <div class="stop-control">
            <button class="stop-button" type="button" data-stop="2" aria-label="Stop database reel" aria-keyshortcuts="3" aria-pressed="true" disabled><span>3</span></button>
            <small>DB</small>
          </div>
        </div>

        <div class="coin-detail" aria-label="Decorative coin area; no payment accepted">
          <span class="coin-slot" aria-hidden="true"></span><strong>DISPLAY</strong><small>NO COINS</small>
        </div>
      </section>

      <section class="lower-panel" aria-label="Lower energy artwork">
        <div class="panel-glass" aria-hidden="true"></div>
        <svg class="energy-art" viewBox="0 0 500 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="energy-sun"><stop offset="0" stop-color="#fff8bd"/><stop offset=".18" stop-color="#f1c53c"/><stop offset=".43" stop-color="#b52fc6"/><stop offset="1" stop-color="#13051e" stop-opacity="0"/></radialGradient>
          </defs>
          <circle cx="250" cy="130" r="120" fill="url(#energy-sun)" opacity=".7"/>
          <g fill="none" stroke-linecap="round">
            <path d="M-30 232C80 176 105 66 238 128S407 185 535 25" stroke="#f8d55c" stroke-width="11"/>
            <path d="M-25 244C100 196 101 91 241 141S405 202 532 58" stroke="#8226b7" stroke-width="22" opacity=".8"/>
            <path d="M-10 55c126 63 159 46 244 82s159 43 284-69" stroke="#d45cee" stroke-width="4"/>
            <path d="M53 264C150 156 182 72 251 136s89 72 194 125" stroke="#fff4ac" stroke-width="3"/>
          </g>
          <g fill="#f8db66" filter="url(#gold-glow)">
            <path d="m66 46 5 13 14 3-12 8 1 14-11-8-13 6 4-13-10-10 14 1Z"/>
            <path d="m419 56 6 16 17 3-14 10 2 17-14-10-16 7 5-16-11-13 17 1Z"/>
            <path d="m331 184 5 13 14 3-12 8 1 14-11-8-13 6 4-13-10-10 14 1Z"/>
          </g>
        </svg>
        <div class="panel-title">
          <span>STACK</span><strong>BUILDER</strong><small>FE · BE · DB</small>
        </div>
        <div class="spiral-ornament" aria-hidden="true">
          <svg viewBox="0 0 160 180">
            <path d="M28 162C2 116 5 51 55 20c30-18 78-10 90 29 10 34-16 71-49 68-26-2-42-29-26-49 12-15 37-10 36 9" fill="none" stroke="url(#gold-face)" stroke-width="12" stroke-linecap="round"/>
            <path d="m24 136 24-5-4 24M27 98l22 8-14 19M42 58l18 18-22 7M72 25l8 23-24-4M113 24l-9 24-17-19M143 55l-25 8 12-22" fill="none" stroke="#f8db69" stroke-width="5" stroke-linecap="round"/>
          </svg>
        </div>
      </section>

      <footer class="machine-base" aria-label="Cabinet base">
        <div class="base-light" aria-hidden="true"></div>
        <span>NOCTURNE WORKS</span><strong>EXHIBITION UNIT · 03</strong>
      </footer>
    </article>

    <p class="keyboard-hint"><kbd>Enter</kbd> or <kbd>Space</kbd> start · <kbd>1</kbd> FE · <kbd>2</kbd> BE · <kbd>3</kbd> DB</p>
    <p class="disclaimer">Interactive art only — no wagers, credits, prizes, or payouts.</p>
    <p id="machine-status" class="visually-hidden" role="status" aria-live="polite">Machine ready. Press start to spin a tech stack.</p>
  </main>

`;
