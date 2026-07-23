# Journey Timeline Fold — scroll, sticky и глубина страниц

## Зачем существует эта документация

`Journey` на `about.html` — не отдельная страница и не модальное состояние. Это
длинная секция между Impact и `#contact`, в которой посетитель раскрывает девять
ролей, а затем возвращается к трём последним через `Recent only ↑`.

Сворачивание меняет высоту документа примерно на несколько экранов. Поэтому это
не «анимация высоты списка»: одновременно участвуют обычный поток документа,
нативный `position: sticky`, Lenis, scroll-driven CSS-анимации и два бумажных
слоя. Этот документ фиксирует итоговую модель и причины решений, чтобы не
возвращаться к уже пройденным сбоям.

Основной код:

| Зона | Файл |
| --- | --- |
| Оркестрация DOM, Lenis и состояния кнопки | `js/features/journey/index.js` |
| Чистая геометрия | `js/features/journey/timeline-geometry.js` |
| Лейблы и конечные состояния | `js/features/journey/timeline-state.js` |
| Подсветка таймлайна | `js/features/journey/timeline-glow.js` |
| Постоянная глубина страниц и desktop-layout | `css/layout.css` |
| Кнопка, список, маска и индикатор fold | `css/components.css` |
| Проверки геометрии и контрактов | `test/journey-geometry.test.mjs`, `test/site-contracts.test.mjs` |

## Внешний контракт

- Начальное состояние: видны три последние роли; остальные раскрываются
  партиями.
- `Recent only ↑` возвращает ровно три роли за `1500ms`.
- Во время каждого показанного кадра sticky-заголовок Journey остаётся видимым.
- Кнопка — якорь финальной композиции, а не нижняя граница Journey и не начало
  Contact.
- На viewport `797px` ориентир финального кадра: `control.bottom ≈ 385px`,
  `#contact.top ≈ 405px`, sticky intro около `72px` сверху. Конкретный
  `scrollY` зависит от контента, но расчёт должен приводить к этой композиции.
- У последней из трёх ролей может быть виден только хвост; её bullets не должны
  быть обрезаны маской.
- Нет клонов секции/заголовка и нет `position: fixed`-замены для sticky.
- Нет второго, самостоятельного скролла после последнего кадра fold.

## Ментальная модель: четыре независимых процесса

Главное правило: **сворачивание таймлайна не равно движению бумажной страницы**.
У fold четыре связанные, но разные ответственности.

```text
1. Timeline geometry        list height уменьшается и получает нижнюю маску
2. Journey flow footprint   reservation заменяет освобождённую высоту в grid
3. Page-surface composition Contact получает обратный translateY
4. Viewport                 scroll следует за кнопкой-лимитером
```

| Процесс | Владелец | Что он меняет | Чего не должен менять |
| --- | --- | --- | --- |
| Таймлайн | `renderTimelineFoldFrame()` | Только высоту `.timeline-list` и fade | Высоту Journey, Contact, scroll |
| Нормальный поток Journey | `setJourneySurfaceHold()` | Высоту `.timeline-fold-reservation` | Список и sticky intro |
| Визуальный слой Contact | `setJourneySurfaceHold()` | Только `--journey-fold-contact-shift` | Его flow-position и глубину |
| Viewport | `applyControlCeiling()` / `applyScroll()` | Только физический scroll через Lenis | Высоту списка |

Такое разделение не является косметическим. Если список напрямую укорачивает
высоту grid, содержащий блок sticky сокращается раньше, чем scroll успевает
компенсировать изменение. Если Contact не получает обратное смещение, во время
резерва появляется пустой экран. Если страницу Journey «ведёт» за списком,
исчезают её sticky и бумажная граница.

## DOM- и CSS-контракт

Упрощённая структура неизменна:

```html
<section class="section section--journey">
  <div class="section-container journey-layout">
    <div class="journey-layout__intro">…native sticky…</div>
    <div class="journey-layout__timeline">
      <div class="timeline-list">…roles…</div>
      <button class="timeline-expand">…</button>
      <!-- временно: .timeline-fold-reservation -->
    </div>
  </div>
</section>
<section id="contact">…</section>
```

На desktop `.journey-layout` — двухколоночный grid. Высота правой колонки
задаёт высоту Journey, а `.journey-layout__intro` использует обычный
`position: sticky`. Journey имеет отрицательный верхний margin, собственную
бумажную текстуру, `overflow: clip`, верхнюю тень и `view-timeline`.

### Постоянная архитектура глубины

Глубина — это **не эффект начала fold**. Она задана заранее в `layout.css`:

```text
Journey paper layer = 6  — бумажный лист Journey
Contact paper layer = 7  — следующий лист, принимающий постоянную узкую тень
```

Journey визуально лежит на Contact: у верхней границы Contact есть постоянный
псевдоэлемент-shadow-caster. Его мягкая тень ограничена листом Contact,
заканчивается до формы и затем оставляет светлый `--canvas` с бумажным зерном.
Это не градиент на всю высоту и не эффект прогресса fold. Верхняя граница
Contact и его узкая `inset`-тень рисуют тень Journey **внутри нижнего листа**,
а не большое внешнее облако вокруг Contact. Во время fold Contact меняет только
`transform: translateY(...)`. Нельзя
добавлять в `body.is-journey-collapsing #contact` новую `box-shadow`, рамку,
`z-index` или `position`: это создаёт/меняет визуальный слой в момент клика и
выглядит как скачок интерфейса. Статические свойства слоя объявляются в
обычном состоянии Contact; fold-селектор содержит только временный transform
и отключение pointer events.

## Геометрия: почему якорь — кнопка

Все измерения выполняются в `getCollapsePlan()` **до** первой мутации DOM.

Обозначения:

```text
Hexpanded  = текущая высота timeline-list
Hcompact   = высота первых трёх ролей
ΔH         = Hexpanded - Hcompact
C          = document-coordinate нижней границы кнопки до fold
A          = желаемая viewport-coordinate нижней границы кнопки
             = viewportHeight × 0.48
```

После компактного DOM кнопка физически перемещается вверх на `ΔH`, поэтому
целевой скролл:

```text
targetScroll = C - ΔH - A
targetScroll = clamp(targetScroll, 0, finalMaxScroll)
```

`finalMaxScroll` вычисляется как максимальный scroll уже укороченного
документа. Кламп нужен заранее: финальный DOM никогда не должен заставлять
браузер самому исправлять координату в отдельном кадре.

### Кадр fold

Для eased-прогресса `e ∈ [0, 1]`:

```text
listHeight(e) = round(Hexpanded - ΔH × e)
reservedHeight(e) = Hexpanded - listHeight(e)

listHeight + reservedHeight = Hexpanded
```

Это точное дополнение с учётом округления. Поскольку reservation стоит после
кнопки в той же grid-колонке, физическая высота правой колонки и всей Journey
остаётся постоянной на протяжении всей анимации. Sticky не получает укороченный
containing block.

### Лимитер viewport

До тех пор, пока уменьшающаяся кнопка ещё ниже своей финальной линии, viewport
остаётся там, где был клик. Затем scroll движется вместе с кнопкой:

```text
currentControlDocumentBottom = C - reservedHeight
ceiling = currentControlDocumentBottom - A
frameScroll = min(startScroll, ceiling)
```

Это normal-case: пользователь может нажать кнопку только когда она видна, а
компактная цель обычно выше текущего scroll. Редкий программный обратный случай
(`targetScroll > startScroll`) обрабатывается непрерывной интерполяцией на том
же eased-clock.

Именно это исключает «сначала список схлопнулся, потом страница докрутилась».
Лимит появляется в тот же кадр, в котором кнопка достигла своей линии.

## Строгий порядок операций

### Старт

1. Измерить `CollapsePlan` в expanded DOM.
2. Переключить phase в `COLLAPSING`; кнопка получает `disabled`,
   `aria-busy="true"` и текст `compacting life`.
3. Снять текущие computed `transform` и `opacity` у Journey и layout в
   CSS-переменные. Так scroll-driven анимации можно остановить без визуального
   сброса страницы в `transform: none`.
4. Временно установить inline `html { scroll-behavior: auto !important; }`.
5. Добавить классы `is-journey-collapsing` и `is-timeline-folding`.
6. Создать reservation с нулевой высотой и применить исходный scroll-ceiling
   до первой видимой мутации списка.

### Каждый `requestAnimationFrame`

Порядок намеренно такой и менять его нельзя без повторной проверки sticky:

```text
1. Рассчитать frame и frameScroll.
2. Записать frameScroll в Lenis.
3. Установить reservation и обратный translateY Contact.
4. Установить listHeight и его fade.
5. Записать debug frame.
```

Scroll пишется раньше геометрии: иначе браузер может показать один кадр уже
укороченной страницы со старым scroll, а sticky успевает «отпуститься».

### Финальный commit

В одном JavaScript task, до следующего paint:

1. Скрыть роли 4–9, оставив список на измеренной compact-высоте.
2. Удалить reservation и translation Contact.
3. Снять inline-высоту/маску списка.
4. Вызвать `lenis.resize()` и **явно** записать `plan.targetScroll`.
5. Перевести phase в `COMPACT`, вернуть обычный label кнопки.
6. Убрать классы, snapshot-переменные Journey и временный
   `scroll-behavior: auto`.

Ключевой нюанс: после `resize()` нельзя брать новый target из `window.scrollY`.
Нужно передать заранее рассчитанный `plan.targetScroll` — это устраняет
доскок в bottom страницы, если Lenis или браузер уже успели клампнуть старую
координату.

## Lenis 1.1.18: критическая деталь

На desktop Lenis использует `document.documentElement.scrollTop` и владеет
состоянием `animatedScroll`/`targetScroll`. В fold для scroll используется
**только**:

```js
lenis.scrollTo(target, { immediate: true, force: true });
```

Без Lenis (coarse pointer, reduced motion и т. п.) допускается нативный
`window.scrollTo`.

### Почему одного `immediate` оказалось недостаточно

У подключённого Lenis 1.1.18 immediate-путь делает по сути следующее:

```text
animatedScroll = targetScroll = target
rootElement.scrollTop = target
reset() // снова читает actualScroll
```

В проекте глобально задан `html { scroll-behavior: smooth; }`. Когда Lenis в
этот момент не держит свой `lenis-smooth` класс, браузер начинает плавный
нативный scroll. Немедленное чтение `actualScroll` возвращает прежнюю
координату; `reset()` переписывает internal target обратно. Симптом в трейсе:

```text
expectedScroll: 3680
actualScroll:   5525
Lenis target:   5525
```

Именно поэтому на время fold inline-приоритетом задан `scroll-behavior: auto`.
Тогда `rootElement.scrollTop` синхронно меняется до вызова `reset()`, и
`actualScroll === targetScroll` в том же rAF. После cleanup исходное значение
inline-свойства восстанавливается.

### Что не делать с Lenis

| Неудачный подход | Почему он ломается |
| --- | --- |
| `window.scrollTo()` при работающем Lenis | Следующий Lenis-rAF может восстановить свой старый target. Получаются два владельца scroll. |
| `lenis.setScroll()` вместе с `lenis.scrollTo()` | Это две физические записи и два возможных native scroll event. Lenis не предоставляет для них транзакцию; такой код маскирует реальную причину рассинхронизации. |
| Оставить глобальный `scroll-behavior: smooth` | `immediate` в Lenis 1.1.18 прочитает старый `scrollTop` и отменит собственную запись. |
| `lenis.stop()`/`start()` как способ получить native scroll | Возникает отдельная фаза передачи владения и риск jump при `resize()`/`start()`. В этой фиче это не нужно. |
| В финале синхронизироваться с `window.scrollY` | Это может быть уже browser-clamped значение, а не рассчитанная цель. |

## История сбоев и их реальные причины

### 1. Sticky intro улетал вверх

**Симптом.** При почти неизменном scroll `intro.top` доходил до тысяч
отрицательных пикселей; в интерфейсе исчезали заголовок и описание.

**Причина.** Уменьшалась реальная высота `.timeline-list`, а значит и
containing block native sticky. Scroll ещё не компенсировал укорочение, и
sticky достигал нижней границы Journey.

**Решение.** `timeline-fold-reservation` точно заменяет высоту, отданную
списком. Реальная высота Journey во время fold постоянна.

### 2. Fold выглядел как два этапа

**Симптом.** Список сначала полностью уходил из viewport, затем страница резко
вставала на финальную композицию.

**Причина.** В конце animation физический scroll оставался старым; после
удаления `ΔH` браузер/Lenis пересчитывал короткий документ и зажимал позицию в
его maximum. В одном трейсе ожидалось `3680`, но compact commit оказался на
`4207`.

**Решение.** Рабочий ceiling на каждом кадре плюс явная
`syncLenisAfterLayout(plan.targetScroll)` в финале.

### 3. Лимитер в коде был, но не действовал

**Симптом.** `expectedScroll` уменьшался, а `actualScroll` почти не менялся.
Визуально Contact уходил выше viewport, а снизу появлялась пустота.

**Причина.** Конфликт Lenis immediate с глобальным native smooth-scroll,
описанный выше. Reservation и Contact transform честно следовали модели, но
viewport оставался в старой точке.

**Решение.** Временный `scroll-behavior: auto !important` до cleanup fold.

### 4. Contact двигался, но Journey→Contact теряла глубину

**Симптом.** На клике появлялась дополнительная тень/градиент, разделение
страниц визуально прыгало.

**Причина.** Временный fold-селектор добавлял Contact тень, border и stacking
context только во время анимации. Это превращало служебную компенсацию в новую
анимацию глубины.

**Решение.** Слои объявлены постоянно: Journey 6, Contact 7. Fold меняет
только `translateY`; дополнительной тени не существует.

### 5. Бумажная поверхность Journey резко «плоскела» при клике

**Симптом.** До fold видна ожидаемая перспектива/тень перехода, на первом
кадре она пропадает.

**Причина.** Для защиты sticky scroll-driven `animation` отключалась вместе с
`transform: none`. CSS отменял не только динамику, но и текущий вид бумажного
листа.

**Решение.** До добавления fold-класса сохранить computed transform/opacity в
CSS-переменных. Во время fold animation остановлена, но на элементе остаются
снятые пиксели. После финального commit переменные удаляются.

### 6. Contact не двигать вовсе — тоже неверно

**Симптом альтернативного решения.** Reservation удерживает реальную высоту
Journey, но Contact остаётся далеко внизу. Перед commit появляется большой
пустой участок, а в финале Contact прыгает вверх на `ΔH`.

**Решение.** Contact получает временный `translateY(-reservedHeight)`. После
начала ceiling его экранная позиция математически постоянна:

```text
contactVisualTop = contactDocumentTop - reservedHeight - frameScroll
```

В фазе, где `frameScroll = C - reservedHeight - A`, слагаемое reservation
взаимно сокращается. Поэтому Contact не «догоняет» в конце, а стоит в финальной
композиции вместе с кнопкой.

### 7. Инструментированный rAF-harness зависал

**Симптом.** Консольный harness с `await requestAnimationFrame` переставал
собирать данные.

**Причина.** Среда DevTools/инструментирования может удерживать rAF иначе, чем
обычный код страницы.

**Решение.** Для внешнего замера использовать `setInterval`/`setTimeout` или
события `journeyfolddebug*`, не ожидать rAF из harness.

## Состояние кнопки

Во время `COLLAPSING` сама кнопка остаётся тем же элементом и на том же месте:

- `disabled = true`: повторный клик не запускает конкурирующий fold;
- `aria-busy="true"`: ассистивным технологиям понятна переходная операция;
- текст: `compacting life`;
- маленький spinner показывает, что элемент занят, а не «умер»;
- эти детали paint-only и не влияют на измеряемую высоту/позицию кнопки.

После compact commit возвращаются обычные label, `disabled = false` и
`aria-busy="false"`.

## Browser paths

| Среда | Поведение |
| --- | --- |
| Desktop + Lenis | Полная модель: reservation, ceiling, временный `scroll-behavior: auto`, Lenis immediate. |
| Desktop без Lenis | Та же геометрия и ceiling, но `applyScroll()` использует нативный scroll. |
| `prefers-reduced-motion: reduce` | Compact DOM и рассчитанный target применяются синхронно; нет rAF-анимации. |
| Safari | Та же модель reservation/scroll; существующий Safari fallback для тяжёлых scroll-timeline эффектов сохраняется. |
| Admin | Visitor-компонент Journey не монтируется; никакой fold-логики нет. |

## Диагностика

Открыть:

```text
http://localhost:8000/about?journey-debug=1
```

В этом режиме `js/main.js` раскрывает `window.__lenis`, а Journey создаёт
`window.__journeyFoldDebug` и события:

```text
journeyfolddebugstart
journeyfolddebugframe
journeyfolddebugend
```

Структура лога:

| Поле | Для чего нужно |
| --- | --- |
| `plan` | `Hexpanded`, `Hcompact`, `ΔH`, `targetScroll`, исходный scroll |
| `calls` | Каждая команда scroll: writer, target, `before`, `after`, Lenis state |
| `frames` | Ожидаемый/фактический scroll, control, intro, Contact, list, reservation |
| `final` | Координаты уже после compact commit и cleanup |

Минимальный console-snippet перед нажатием `Recent only ↑`:

```js
window.addEventListener('journeyfolddebugend', ({ detail }) => {
  const folding = detail.frames.filter(({ stage }) => stage === 'folding');
  const maxScrollError = Math.max(...folding.map(frame =>
    Math.abs(frame.expectedScroll - frame.actualScroll),
  ));

  console.table(detail.frames);
  console.log({
    plan: detail.plan,
    final: detail.final,
    maxScrollError,
    lastFoldFrame: folding[folding.length - 1],
  });
}, { once: true });
```

Признаки здорового прогона:

```text
maxScrollError ≤ 1px
last folding actualScroll ≈ expectedScroll ≈ plan.targetScroll
final.scroll = plan.targetScroll
introTop остаётся около sticky top
```

Если `expectedScroll` меняется, а `actualScroll` нет — сначала проверить
временный `scroll-behavior: auto` и состояние Lenis. Если `actualScroll`
правильный, но Contact или intro неверны — проверить равенство
`listHeight + reservedHeight = expandedHeight`, а также наличие только одного
изменяемого свойства глубины: Contact `translateY`.

## Чек-лист при изменении фичи

1. Не менять разметку на fixed/cloned вариант ради sticky.
2. Сначала обновить `timeline-geometry.js` и его unit-тесты, если меняется
   якорь, ratio или высота compact-состояния.
3. Не писать scroll через два API и не добавлять второго владельца scroll.
4. Сохранять порядок: scroll → reservation/Contact → list → debug.
5. Любой новый визуальный слой должен существовать до клика; во fold допустимы
   только трансформы/paint-state, не новая тень или z-index.
6. Проверить desktop Lenis, no-Lenis, reduced motion и Safari.
7. Проверить клик с разных глубин списка, а не только из одного сохранённого
   scrollY.
8. Проверить, что bullets третьей роли не попали в fade mask.
9. Запустить:

```bash
npm run check
git diff --check
```

10. Для визуальной регрессии снять два кадра: старт fold и кадр после
    достижения control-ceiling. На них не должны меняться тень/граница
    Journey→Contact; меняться должны только timeline, его маска, статус кнопки
    и нормальный scroll.
