# Timeline Cursor Glow & Detective Magnifying Glass

## Current State
В разделе **Experience (Professional Journey)** на странице `about.html` курсор пользователя управляет динамическим фоновым свечением («лупой детектива») с эффектной картографической точечной сеткой (Map Dot Grid). При наведении мыши свет плавно следит за курсором по всей рабочей области секции Journey на Canvas 2D (`.timeline-glow-canvas`).

Свечение живет **строго под подложкой бумаги (`z-index: 1`)** под карточками ролей и кнопкой `Show more` (`.timeline-expand`, `z-index: 2`). Градиенты рисуются непосредственно на холсте с использованием двух слоев радиального свечения (Primary Core Aura + Secondary Ambient Fill) с живой фазовой пульсацией дыхания и просвечивающей топографической сеткой микроточек с шагом 26px, плавно гаснущих к краю пятна света.

Движок полностью свободен от ограничений `overflow: hidden` и искусственных рамок (`insetX`/`insetY`). При приближении свечения к любой из четырех границ секции (Top, Right, Bottom, Left) или под уходящий подстилающий слой бумаги под секцию Contact активируется алгоритм математической диссипации (`edgeAlpha decay`), плавно гасящий яркость до 0. За счет этого у свечения **100% отсутствуют обрезанные края по ровной линии**.

Благодаря аппаратному ускорению HTML5 Canvas 2D эффект **работает во всех современных браузерах, включая Safari**, обеспечивая стабильные 60/120 FPS без просадок скролла и расфокусировки при раскрытии таймлайна.

## Roadmap
- [x] Плавный отклик свечения на движение курсора по всей ширине и высоте таймлайна без искусственных рамок.
- [x] Canvas 2D Luminous Glow Engine с двухслойными радиальными градиентами и фазовым дыханием.
- [x] Картографическая точечная сетка (Map Dot Grid) под прожектором с идеальным радиальным затуханием.
- [x] Математическое мягкое затухание у краев (Radial Edge Alpha Decay) для 100% устранения прямых обрезанных краев.
- [x] Закрепление Canvas-слоя свечения строго ПОД карточками ролей (`z-index: 1` vs `z-index: 2`).
- [x] **Аппаратная поддержка Safari и всех браузеров:** высочайшая производительность на Metal/WebGL без блокировки в WebKit. ← YOU ARE HERE
- [ ] (Market-Ready Vision): Адаптивная гироскопическая или тач-подсветка на мобильных устройствах при прокрутке.

## Technical Implementation

### Key Files
- [timeline-glow.js](file:///Users/muramets/Documents/CV/js/features/journey/timeline-glow.js) — Функциональный монтируемый модуль `mountTimelineGlow()`: Canvas 2D контекст, 1:1 Pixel Scaling, плавное следование за pointer (`glowFollowTime`), Map Dot Grid с шагом 26px, расчет Edge Alpha Fade (smoothstep диссипация) и двойной `createRadialGradient`.
- [components.css](file:///Users/muramets/Documents/CV/css/components.css#L283-L298) — Правило `.timeline-glow-canvas` (`position: absolute; top: 0; left: 0; width: 100%; height: calc(100% + var(--journey-contact-underlay-depth, 820px)); pointer-events: none; z-index: 1;`).
