# Journey Timeline Fold — scroll, sticky и Contact-перспектива

## Зачем существует эта документация

`Journey` на `about.html` — не отдельная страница и не модальное состояние. Это
длинная секция между Impact и `#contact`, в которой посетитель раскрывает роли
партиями, а затем сворачивает список обратно до трёх последних через
`Recent only ↑`.

Сворачивание («fold») одновременно меняет высоту документа, синхронизирует
Lenis-скролл и решает, что происходит с 3D-перспективой соседнего листа
Contact. Раньше здесь была отдельная grid-резервация (`.timeline-fold-
reservation`) и собственная перспектива Journey во время fold — обе идеи были
выброшены как источник багов (см. «История сбоев» ниже) в пользу гораздо более
простой модели: **Contact всегда в обычном document flow, никаких клонов и
компенсирующих трансформаций положения.** Этот документ описывает итоговую
модель.

Основной код:

| Зона | Файл |
| --- | --- |
| Оркестрация DOM, Lenis, fold и связь с Contact-перспективой | `js/features/journey/index.js` |
| Чистая геометрия (план, кадр, лимит скролла) | `js/features/journey/timeline-geometry.js` |
| Лейблы и конечные состояния кнопки | `js/features/journey/timeline-state.js` |
| Подсветка таймлайна (Canvas 2D, независимый модуль) | `js/features/journey/timeline-glow.js` |
| Естественная (нефолдовая) перспектива Contact при скролле | `js/features/journey-contact-hold.js` |
| Постоянная глубина страниц, fold-CSS-переменные, Impact-сцена | `css/layout.css` |
| Кнопка, список, маска и индикатор fold | `css/components.css` |
| Проверки геометрии и контрактов | `test/journey-geometry.test.mjs`, `test/site-contracts.test.mjs` |

## Внешний контракт

- Начальное состояние: видны `COMPACT_ROLE_COUNT` (3) последние роли; остальные
  раскрываются партиями по `REVEAL_BATCH_SIZE` (3) через `animateListHeight()`
  (CSS `transition: height`, `520ms`).
- `Recent only ↑` схлопывает список обратно до 3 ролей за `FOLD_DURATION_MS`
  (`1500ms`).
- Кнопка (`.timeline-expand`) — единственный якорь финальной композиции:
  `CONTROL_VIEWPORT_RATIO = 0.48` (её нижняя граница садится примерно на
  середину вьюпорта). Это не граница Journey и не начало Contact.
- Во время авто-фолда (клик по кнопке) **у Journey нет собственной
  3D-перспективы**. Она появляется только из естественной scroll-linked
  анимации (`journey-sheet-settle`/`journey-sheet-exit` в `layout.css`),
  когда посетитель начинает скроллить руками уже после фолда.
- Contact всегда в нормальном document flow; во время fold он получает только
  временный `transform` (perspective-докрутка + `translateY`-компенсация шва),
  никогда — новую тень, рамку, `z-index` или `position`.
- Нет клонов секции/заголовка и нет `position: fixed`-замены для sticky.
- Нет второго, самостоятельного скролла после последнего кадра fold.

## Ментальная модель: один общий `eased`-таймер на всё

Ключевое отличие от старой (grid-reservation) модели: **высота списка и
scroll едут по одной и той же eased-кривой одного и того же кадра**, поэтому
ничего не может «обогнать» друг друга.

```text
eased = foldEase(progress)                      // progress = t / FOLD_DURATION_MS, [0,1]

listHeight  = getCollapseFrame(plan, eased)      // timeline-geometry.js
scrollY     = getFoldScrollLimit(plan, eased)    // timeline-geometry.js, тот же eased
contactTilt = lerp(startSettle, 1, eased)        // journey-contact-hold.js, тот же eased
```

`getFoldScrollLimit` — простая линейная интерполяция `startScroll →
plan.targetScroll` по `eased`; там **намеренно нет** более старой логики
«держать scroll, пока кнопка не подойдёт к своей строке, затем догонять».
Та версия давала длинное визуально статичное плато всякий раз, когда у кнопки
было мало запаса до своей финальной позиции (частый случай) — высота
продолжала схлопываться под капотом, а на экране ничего не двигалось, пока не
происходил рывок в конце. Единый `eased` для высоты и scroll убирает плато:
шов Journey↔Contact всегда видимо движется, а кнопка математически никогда не
проезжает свою финальную линию (интерполяция попадает точно в цель при
`eased = 1`).

Contact следует за нижним краем Journey **автоматически, через нормальный
flow** — JS не переводит его отдельным `translateY` под высоту списка. Явный
`translateY` в fold-transform Contact — это только `--journey-fold-contact-
seam-shift`, статичная поправка на разницу между «визуальным» (со снятым/
замороженным transform) и «flow» нижним краем Journey, посчитанная один раз в
момент клика; сам список видимо не требует пересчёта этой поправки по кадрам
(см. `getFoldSeamMetrics()`).

## Геометрия: почему якорь — кнопка

Все измерения выполняются в `getCollapsePlan()` (`timeline-geometry.js`)
**до** первой мутации DOM.

```text
Hexpanded  = текущая высота timeline-list
Hcompact   = высота первых COMPACT_ROLE_COUNT ролей
ΔH         = Hexpanded - Hcompact

C          = document-coordinate нижней границы кнопки до fold
A          = желаемая viewport-coordinate нижней границы кнопки
             = viewportHeight × CONTROL_VIEWPORT_RATIO (0.48)

targetScroll = clamp(C - ΔH - A, 0, finalMaxScroll)
```

`finalMaxScroll` — максимальный scroll уже укороченного документа
(`docHeight - ΔH - innerHeight`). Кламп нужен заранее: финальный DOM никогда
не должен заставлять браузер самому исправлять координату в отдельном кадре.

### Кадр fold (`getCollapseFrame`)

```text
listHeight(e)     = round(Hexpanded - ΔH × e)
releasedHeight(e) = Hexpanded - listHeight(e)
```

Точное дополнение с учётом округления. Список — единственное, что явно меняет
высоту; Journey и весь grid вокруг нет отдельного «резервирования» — их
итоговая высота просто равна высоте списка плюс постоянный padding.

## Contact-перспектива: два порога для одной формулы

`journey-contact-hold.js` управляет обычной (не-fold) паперной перспективой
Contact при органическом скролле — тем самым «наклон + масштаб», который
плавно уходит в `none`, когда Contact считается «полностью прибывшим»
(`getContactApproachSettle`). Порог «прибытия» **разный** в зависимости от
того, сворачивался ли когда-нибудь Journey:

```text
getIntroSettleViewportY(intro)    — до первого фолда: нижний край закреплённого
                                     intro (Contact «прибыл», как только начал
                                     бы закрывать заголовок)
getCompactSettleViewportY()       — после фолда: тот же CONTROL_VIEWPORT_RATIO,
                                     что и якорь самого фолда
```

Выбор порога — по классу `body.is-journey-compact` (см. ниже). Без этой
синхронизации compact-якорь фолда (~48% вьюпорта) физически не доезжает до
intro-порога — естественная формула никогда не читала бы «плоско» в компактной
композиции, и любой последующий скролл заставлял бы перспективу слегка
доигрывать. Общий источник правды для обоих порогов —
`CONTROL_VIEWPORT_RATIO`, экспортированная из `timeline-geometry.js`.

### Почему у фолда нет собственной перспективы

Раньше (`applyFoldPerspective`) fold дополнительно писал `rotateX`/`translateZ`
на Journey в последние ~30% своей длительности — отдельная, явно
запускавшаяся кликом «псевдо-анимация выхода». Убрана целиком: перспектива
должна читаться как «страница отвечает на твой скролл», а не как то, что
вызвал сам клик. `--journey-fold-tilt`/`--journey-fold-depth` (CSS-переменные
под это) удалены вместе с функцией — они постоянно держались на `0deg`/`0px`
и были чистым мёртвым кодом.

### Contact на входе в fold: уважать текущую перспективу

`freezeJourneyPresentation()` не сбрасывает Contact в `none` рывком. Он читает
`getContactApproachSettle()` **в момент клика** (`foldContactStartSettle`) —
то есть какой наклон/масштаб уже был на экране — и весь rAF-цикл фолда плавно
доводит эту стартовую долю до `1` (плоско) к последнему кадру:

```js
contactSettle = foldContactStartSettle + (1 - foldContactStartSettle) * eased;
```

Так клик не «срезает» уже видимую перспективу Contact мгновенно, а органично
её резолвит.

## Два флага заморозки: `is-journey-folded` vs `is-journey-compact`

Оба ставятся в `retainFoldedPresentationUntilIntent()` сразу после успешного
commit compact-состояния, но живут по-разному:

| Класс | Снимается | Роль |
| --- | --- | --- |
| `is-journey-folded` | При первом `wheel`/`touchstart`/`pointerdown`/`keydown` посетителя | Держит Journey и Contact на замороженных пикселях fold, не давая scroll-linked view-timeline анимациям переиграть entry-геометрию в кадре коммита |
| `is-journey-compact` | Только при повторном разворачивании ролей (`revealNextRoles`) или `destroy()` | Говорит `journey-contact-hold.js`, каким порогом (`getCompactSettleViewportY`) мерить «прибытие» Contact |

`is-journey-folded` снимается через `wheel`/`touchstart`/`pointerdown`/
`keydown` c `{ once: true }` — обработчик `releaseFoldedPresentation()`. Он же
на `CONTACT_RELEASE_TRANSITION_MS` (320ms) добавляет `is-journey-fold-
releasing`, включая CSS `transition: transform` **только** на этот короткий
момент — обычные scroll-driven обновления (внутри `journey-contact-hold.js`)
по-прежнему пишут `transform` без транзишена, чтобы не отставать от курсора.
После синхронизации порогов (см. выше) обе стороны почти всегда уже совпадают
на момент снятия маски — эта транзишен-подстраховка нужна только для
остаточных под-пиксельных случаев (resize между фолдом и снятием, округление),
а не для рутинного скачка.

## Строгий порядок операций

### Старт (`collapseToCompact`)

1. Измерить `CollapsePlan` в expanded DOM (`getCollapsePlan`).
2. Переключить `phase` в `COLLAPSING`; кнопка получает `disabled`,
   `aria-busy="true"` и текст `compacting life`.
3. `freezeJourneyPresentation()`: снять текущие computed `transform`/`opacity`
   Journey и layout в CSS-переменные (чтобы отключить их scroll-driven
   анимации без визуального сброса), и посчитать/заморозить стартовую
   Contact-перспективу.
4. `useInstantNativeScroll()`: временный inline `html { scroll-behavior: auto
   !important; }` (см. раздел про Lenis ниже).
5. Добавить классы `is-journey-collapsing` и `is-timeline-folding`,
   `dispatchEvent('timelinefoldstart')`.

### Каждый `requestAnimationFrame` (`animateCollapse`)

```text
1. progress = clamp((now - start) / FOLD_DURATION_MS, 0, 1); eased = foldEase(progress).
2. renderTimelineFoldFrame(plan, eased) — реальная высота .timeline-list + fade-маска.
3. applyControlCeiling(plan, startScroll, eased) — lenis.resize(), затем applyScroll(...).
4. Contact: переинтерполировать --contact-fold-entry-transform по contactSettle(eased).
5. Записать debug-кадр (no-op без ?journey-debug).
```

Scroll пишется сразу после изменения высоты списка, в том же кадре — иначе
браузер может показать один кадр уже укороченной страницы со старым scroll, и
sticky успевает «отпуститься».

### Финальный commit

В одном JS-task, до следующего paint:

1. Скрыть роли `COMPACT_ROLE_COUNT+1..N`, список остаётся на измеренной
   compact-высоте.
2. Снять inline-высоту/overflow/transition/fade-маску списка.
3. `syncLenisAfterLayout(plan.targetScroll)` — `lenis.resize()`, затем
   **явно** записать `plan.targetScroll` (не читать `window.scrollY`: это
   может быть уже clamped браузером/Lenis значение, а не расчётная цель).
4. `phase → COMPACT`, обычный label кнопки.
5. `retainFoldedPresentationUntilIntent()` — оба флага заморозки (см. выше).
6. `finally`: снять `is-journey-collapsing`/`is-timeline-folding`, вернуть
   `scroll-behavior`, `dispatchEvent('timelinefoldend')`.

## Lenis 1.1.18: критическая деталь

На desktop Lenis владеет состоянием `animatedScroll`/`targetScroll`. Для
scroll внутри fold используется **только**:

```js
lenis.scrollTo(target, { immediate: true, force: true });
```

Без Lenis (coarse pointer, `prefers-reduced-motion`) допускается нативный
`window.scrollTo`.

### Почему одного `immediate` оказалось недостаточно

Immediate-путь Lenis 1.1.18 делает по сути: `animatedScroll = targetScroll =
target; rootElement.scrollTop = target; reset()` — и `reset()` тут же заново
читает `scrollTop`. В проекте глобально задан `html { scroll-behavior:
smooth; }`. Если в этот момент активен нативный smooth-scroll, немедленное
чтение возвращает ещё старую координату, и `reset()` тихо переписывает
internal target обратно на неё. Поэтому на время fold стоит inline `scroll-
behavior: auto !important` — тогда `scrollTop` меняется синхронно до вызова
`reset()`, и `actualScroll === targetScroll` в том же rAF.

### Что не делать с Lenis

| Неудачный подход | Почему он ломается |
| --- | --- |
| `window.scrollTo()` при работающем Lenis | Следующий Lenis-rAF может восстановить свой старый target — два владельца scroll. |
| `lenis.setScroll()` вместе с `lenis.scrollTo()` | Две физические записи, два возможных native scroll event, нет транзакции между ними. |
| Оставить глобальный `scroll-behavior: smooth` во время fold | `immediate` прочитает старый `scrollTop` и отменит собственную запись. |
| `lenis.stop()`/`start()` ради native scroll | Отдельная фаза передачи владения и риск jump при `resize()`/`start()` — для этой фичи не нужно. |
| В финале синхронизироваться с `window.scrollY` | Может быть уже browser-clamped значение, а не расчётная цель. |
| Полагаться только на `ResizeObserver`/`autoResize` Lenis во время активной scroll-write фазы | Он асинхронный и отстаёт на кадр-другой от только что изменённого layout — см. `applyControlCeiling`/`animateListHeight`, которые поэтому дёргают `lenis.resize()` явно и синхронно каждый кадр. |

## Reveal («Show more»): та же Lenis-дисциплина, других средств

`revealNextRoles()`/`animateListHeight()` не пишут scroll вообще — только
высоту списка, через нативный CSS `transition: height`. Раньше `lenis.resize()`
вызывался один раз, только после завершения перехода (`transitionend`/
таймаут-fallback) — то есть все ~520ms, пока браузер сам анимировал `height`
каждый кадр, Lenis ориентировался на устаревшие (уже неверные) границы
документа. Если посетитель пытался скроллить в этот момент, Lenis мог упереть
scroll в старый, ещё не выросший потолок — ощущалось как «сопротивление».
Исправлено: пока transition идёт, отдельный rAF-цикл (`syncLenisWhileGrowing`)
на каждом кадре дёргает `lenis.resize()`, как это уже делает fold.

## История сбоев и их реальные причины

### 1. Sticky intro улетал вверх (архитектура reservation, ныне удалена)

Была отдельная grid-резервация (`.timeline-fold-reservation`), которая должна
была точно замещать высоту, отданную списком, чтобы sticky containing block не
укорачивался раньше времени. Сама идея независимого резервирования оказалась
источником рассинхронов (см. ниже) и была заменена на текущую модель: Contact
просто в нормальном flow, без какой-либо резервации вообще.

### 2. Fold выглядел как два этапа: список сжался, потом страница резко довернулась

**Причина.** Прежний лимитер скролла держал `scroll` неподвижным, пока кнопка
не подойдёт к своей финальной строке, и только потом «догонял» — при
достаточном запасе кнопки это давало длинное статичное плато, а редкий рывок в
конце читался как отдельная вторая фаза.

**Решение.** `getFoldScrollLimit` теперь линейно едет по тому же `eased`, что
и высота списка (см. «Ментальная модель» выше) — движение непрерывно на всём
протяжении фолда.

### 3. Contact «срезался» в плоское состояние в момент клика

**Причина.** `freezeJourneyPresentation()` раньше жёстко ставил Contact-
перспективу в `none` сразу же, не читая, что было на экране до клика.

**Решение.** Захват стартовой `settle`-доли (`getContactApproachSettle`) в
момент клика и её плавная интерполяция к `1` по общему `eased` (см. выше).

### 4. После фолда лёгкая перспектива Contact всё равно проскакивала при первом ручном скролле

**Причина.** `journey-contact-hold.js` продолжал в фоне писать
`--contact-sheet-transform` по естественной (intro-based) формуле всё время,
пока Contact был заморожен фолдом — она пряталась под замороженными
пикселями, но была ненулевой, потому что compact-якорь фолда не доезжает до
intro-порога. Переход `is-journey-folded → снят` резко обнажал это значение.

**Решение.** Два порога вместо одного: `getCompactSettleViewportY()` (тот же
`CONTROL_VIEWPORT_RATIO`, что и у самого фолда) вместо `getIntroSettleViewportY`
всякий раз, когда `body.is-journey-compact`. Обе стороны считают «прибытие»
одинаково — рассинхрона не остаётся в принципе, а не просто маскируется
транзишеном.

### 5. Instrumented rAF-harness зависал

Консольный harness с `await requestAnimationFrame` может вести себя иначе в
среде DevTools-инструментирования. Для внешнего замера использовать
`setInterval`/`setTimeout` или события `journeyfolddebug*`, не ждать rAF из
harness напрямую.

## Browser paths

| Среда | Поведение |
| --- | --- |
| Desktop + Lenis | Полная модель: eased-locked scroll/height, временный `scroll-behavior: auto`, Lenis immediate. |
| Desktop без Lenis | Та же геометрия, но `applyScroll()` использует нативный `window.scrollTo`. |
| `prefers-reduced-motion: reduce` | Compact DOM и рассчитанный target применяются синхронно; нет rAF-анимации ни для fold, ни для reveal. |
| Safari | Отдельная сцена: `html.is-webkit-safari` отключает у Journey собственный scroll-linked `animation`/`transform` целиком (см. `@supports (animation-timeline: view())` блок в `layout.css`) — тяжёлая текстурированная простыня не тянет compositing на этом движке. Fold-геометрия (reservation-less модель, eased-lock) не зависит от этого флага и работает одинаково. |
| Admin | Visitor-компонент Journey не монтируется; никакой fold-логики нет. |

## Диагностика

Открыть:

```text
http://localhost:8000/about.html?journey-debug
```

`js/main.js` в этом режиме раскрывает `window.__lenis`, а Journey создаёт
`window.__journeyFoldDebug` и события `journeyfolddebugstart` /
`journeyfolddebugframe` / `journeyfolddebugend`.

Минимальный console-snippet, который слушает весь фолд целиком (не зависит от
того, когда именно нажата кнопка — армируется по `timelinefoldstart`):

```js
(() => {
  const section = document.querySelector('.section--journey');
  const contact = document.getElementById('contact');
  const rows = [];
  let raf, stopAt = null;
  const sample = tStart => {
    const j = section.getBoundingClientRect();
    const c = contact.getBoundingClientRect();
    rows.push({
      ms: Math.round(performance.now() - tStart),
      journeyBottom: Math.round(j.bottom),
      contactTop: Math.round(c.top),
      visualGap: Math.round(c.top - j.bottom),
      bodyClass: document.body.className.match(/is-journey-\S+/g)?.join(' ') || '',
    });
  };
  window.addEventListener('timelinefoldstart', () => {
    rows.length = 0;
    const tStart = performance.now();
    const tick = () => {
      sample(tStart);
      if (stopAt === null || performance.now() < stopAt) raf = requestAnimationFrame(tick);
      else console.table(rows);
    };
    raf = requestAnimationFrame(tick);
  }, { once: true });
  window.addEventListener('timelinefoldend', () => { stopAt = performance.now() + 400; }, { once: true });
})();
```

Признаки здорового прогона: `visualGap` держится около `0` на всём протяжении
(включая хвост после `timelinefoldend`, пока Lenis доводит скролл), без
длинных плато в `journeyBottom`/`contactTop` (это симптом сбоя №2 выше).

## Чек-лист при изменении фичи

1. Не менять разметку на fixed/cloned вариант ради sticky.
2. Сначала обновить `timeline-geometry.js` и его unit-тесты
   (`test/journey-geometry.test.mjs`), если меняется якорь, `viewportRatio`
   или высота compact-состояния — и синхронно поправить
   `journey-contact-hold.js`, если меняется `CONTROL_VIEWPORT_RATIO`
   (оба порога Contact-перспективы завязаны на неё).
3. Не писать scroll через два API и не добавлять второго владельца scroll.
4. Любой новый визуальный слой должен существовать до клика; во fold
   допустимы только трансформы/paint-state, не новая тень или z-index.
5. Не добавлять фолду собственную 3D-перспективу — это сознательно убрано
   (см. «История сбоев» №2–3); перспектива только от органического скролла.
6. Проверить desktop Lenis, no-Lenis, reduced motion и Safari.
7. Проверить клик с разных глубин списка, а не только из одного сохранённого
   scrollY.
8. Проверить, что bullets последней компактной роли не попали в fade mask.
9. Запустить:

```bash
npm run check
```

10. Для визуальной регрессии снять два кадра: старт fold и кадр сразу после
    commit. На них не должны меняться тень/граница Journey→Contact; меняться
    должны только timeline, его маска, статус кнопки и scroll.
