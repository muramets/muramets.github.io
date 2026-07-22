# Timeline Cursor Glow & Detective Magnifying Glass

## Current State
В разделе **Experience (Professional Journey)** на странице `about.html` курсор пользователя управляет динамическим фоновым свечением («лупой детектива»). При наведении мыши свет плавно следит за курсором по всей рабочей области таймлайна и подсвечивает пространство под карточками ролей, пунктирной рельсой и кнопкой раскрытия дополнительных карточек («Show more / Earlier timeline»).

Свечение живет **строго под подложкой бумаги (`z-index: 0`)** под карточками ролей и кнопкой `Show more` (`.timeline-expand`, `z-index: 6`). Прозрачность свечения сжата к центру (радиальный уход в 0% на 60% радиуса), а математический отступ `insetX` расширен до `280px`. Свет гарантированно растворяется за 80px ДО границы бумаги.

## Roadmap
- [x] Плавный отклик свечения на движение курсора по ширине и высоте таймлайна.
- [x] 4-сторонний математический анкер отступа (`insetX = 280px` и `insetY = 180px`) в обоих скриптах в `main.js`.
- [x] Закрепление слоя свечения строго ПОД бумагой и кнопкой `Show more` (`z-index: 0` vs `z-index: 6`).
- [x] Сжатие спада `radial-gradient` до `transparent 60-64%` в `components.css`.
- [ ] (Market-Ready Vision): Адаптивная гироскопическая или тач-подсветка на мобильных устройствах при прокрутке.

## Technical Implementation

### Key Files
- [main.js](file:///Users/muramets/Documents/CV/js/main.js#L689-L700) — Функция `initJourneyExplorerGlow()`, с `insetX = 280px`.
- [main.js](file:///Users/muramets/Documents/CV/js/main.js#L865-L877) — Функция `initTimelineCollapse()`, с `insetX = 280px`.
- [components.css](file:///Users/muramets/Documents/CV/css/components.css#L285-L385) — Компактные спады `radial-gradient` (0% -> 60-64% transparent).
