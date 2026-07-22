// Entity type registry. Every content unit on the site is an entity:
//   { id: string, type: string, fields: {...} }
// A type declares how to render itself and what a blank instance looks like.
// Adding a future type (article, product card with price, testimonial…)
// means adding one entry here — render/admin/store logic is generic.

let uid = 0;
export function newId(type) {
  return type + '-' + Date.now().toString(36) + '-' + (uid++);
}

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

/* Shared card renderer — used by achievement and the generic card type
   (skillsets / creator tools / collabs / future sales cards). */
function renderCard(entity) {
  const f = entity.fields;
  const tile = el('article', 'story-tile' + (f.variant ? ' ' + f.variant : ''));
  tile.dataset.entityId = entity.id;

  const kicker = el('span', 'story-kicker', f.kicker);
  kicker.dataset.field = 'kicker';
  const headline = el('h3', 'story-headline', f.headline);
  headline.dataset.field = 'headline';
  const deck = el('p', 'story-deck', f.deck);
  deck.dataset.field = 'deck';
  const meta = el('span', 'story-meta', f.meta);
  meta.dataset.field = 'meta';

  tile.append(kicker, headline, deck, meta);
  return tile;
}

/* Role title hover accents (official card palette). Card bodies are
   identical per the Timeline Rail reference — gray tile, mint hover. */
const ROLE_ACCENTS = ['accent-uv', 'accent-mint', 'accent-blue', 'accent-magenta'];

/* "01/2025 — 07/2025" -> "6 months" (calendar difference, so a clean
   07/2025 — 07/2026 year reads "1 year", not "1 year 1 month").
   Returns null when the period doesn't parse — the line is simply omitted. */
function formatDuration(period) {
  const m = String(period).match(/(\d{2})\/(\d{4})\s*[—–-]+\s*(\d{2})\/(\d{4})/);
  if (!m) return null;
  const months = (+m[4] - +m[2]) * 12 + (+m[3] - +m[1]);
  if (months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [
    years ? years + (years > 1 ? ' years' : ' year') : '',
    rest ? rest + (rest > 1 ? ' months' : ' month') : '',
  ].filter(Boolean).join(' ');
}

export const ENTITY_TYPES = {

  achievement: {
    render: renderCard,
    blank: () => ({
      id: newId('achievement'),
      type: 'achievement',
      fields: {
        variant: '',
        kicker: 'New Category',
        headline: 'Double-click to edit this headline',
        deck: 'Describe the achievement or impact here.',
        meta: 'Tag · Tag',
      },
    }),
  },

  role: {
    render(entity, index) {
      const f = entity.fields;
      const accent = ROLE_ACCENTS[index % ROLE_ACCENTS.length];
      const item = el('div', 'timeline-item ' + accent);
      item.dataset.entityId = entity.id;
      item.id = entity.id;

      // Anchor dot on the timeline rail
      const dot = el('span', 'timeline-dot');
      dot.setAttribute('aria-hidden', 'true');

      const meta = el('div', 'timeline-meta');
      const title = el('h4', '', f.title);
      title.dataset.field = 'title';

      if (f.gradCap) {
        const capBadge = el('span', 'grad-cap-badge');
        capBadge.title = 'Graduated with honors';
        capBadge.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ff2a5f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
        title.append(capBadge);
      }

      const company = el('p', 'timeline-company', f.company);
      company.dataset.field = 'company';
      const time = el('div', 'timeline-time', f.period);
      time.dataset.field = 'period';
      meta.append(title, company, time);

      const duration = formatDuration(f.period);
      if (duration) meta.append(el('div', 'timeline-duration', duration));

      const body = el('div', 'timeline-body');
      const deck = el('p', 'story-deck', f.deck);
      deck.dataset.field = 'deck';
      const bullets = el('ul', 'timeline-bullets');
      (f.bullets || []).forEach((text, i) => {
        const li = el('li', '', text);
        li.dataset.field = 'bullets.' + i;
        bullets.append(li);
      });
      body.append(deck, bullets);

      if (f.outro != null) {
        const outro = el('p', 'timeline-outro', f.outro);
        outro.dataset.field = 'outro';
        body.append(outro);
      }

      item.append(dot, meta, body);
      return item;
    },
    blank: () => ({
      id: newId('role'),
      type: 'role',
      fields: {
        title: 'New Role',
        company: 'Company<br>Location',
        period: 'MM/YYYY — MM/YYYY',
        deck: 'Describe your role and key responsibilities here.',
        bullets: ['Key responsibility or achievement.'],
      },
    }),
  },

  /* Generic card — skillsets, creator tools, collabs; the foundation for
     future sales cards (add price/cta fields here when needed). */
  card: {
    render: renderCard,
    blank: () => ({
      id: newId('card'),
      type: 'card',
      fields: {
        variant: '',
        kicker: 'New Item',
        headline: 'Double-click to edit this headline',
        deck: 'Describe this item here.',
        meta: 'Tag · Tag',
      },
    }),
  },
};
