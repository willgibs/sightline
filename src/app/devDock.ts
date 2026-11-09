/**
 * The dev overlay's dock (Lab F): slim panels at the edges of the screen, so the world
 * stays the thing you're looking at while you read what it's doing. Every section is one
 * row with a one-line summary until you open it, and opening one costs only that section's
 * height. A tool adds a section with one call and removes it with another, and nothing here
 * knows what any section is about.
 *
 * Text sections refresh a few times a second, and only while they're open. Which sections
 * are open is remembered in this browser: a convenience, so it survives being unavailable.
 * A click can't reach a panel while the mouse is captured: a key lets it go (game.ts).
 */

export type DockSide = 'left' | 'right';

export interface DockSection {
  id: string;
  title: string;
  side: DockSide;
  /** What it shows, as plain text: asked for only while it's open. */
  text?: () => string;
  /** Or a ready-made element of its own. */
  body?: HTMLElement;
  /** The one line shown beside the title while it's closed. */
  summary?: () => string;
  /** Open the first time it's seen in this browser. */
  open?: boolean;
  /** Where it sits among its side's sections, when they don't all appear at once. */
  order?: number;
}

interface Item {
  section: DockSection;
  root: HTMLElement;
  brief: HTMLElement;
  content: HTMLElement;
  open: boolean;
}

const STORE = 'sightline.dock';

function loadOpen(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveOpen(open: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(open));
  } catch {
    // Private windows and blocked storage: it just won't be remembered.
  }
}

export class DevDock {
  private readonly sides: Record<DockSide, HTMLElement>;
  private readonly items = new Map<string, Item>();
  private readonly remembered = loadOpen();
  private hidden = false;
  /** Where the panels are, measured when they refresh. */
  private covered: DOMRect[] = [];

  constructor(private readonly parent: HTMLElement, hint: string) {
    const side = (name: DockSide): HTMLElement => {
      const el = document.createElement('div');
      el.className = `dev-dock dev-dock-${name}`;
      parent.appendChild(el);
      return el;
    };
    this.sides = { left: side('left'), right: side('right') };
    const keys = document.createElement('div');
    keys.className = 'dev-hint';
    keys.textContent = hint;
    this.sides.right.appendChild(keys);
  }

  /** Adds a section, or updates the one with this id. */
  add(section: DockSection): void {
    const had = this.items.get(section.id);
    if (had) {
      had.section = section;
      had.root.querySelector<HTMLElement>('.dev-title')!.textContent = section.title;
      had.root.style.order = String(section.order ?? 0);
      return;
    }
    const root = document.createElement('section');
    root.className = 'dev-section';
    root.style.order = String(section.order ?? 0);
    const head = document.createElement('button');
    head.className = 'dev-head';
    head.innerHTML = `<span class="dev-title"></span><span class="dev-brief"></span>`;
    head.querySelector<HTMLElement>('.dev-title')!.textContent = section.title;
    const brief = head.querySelector<HTMLElement>('.dev-brief')!;
    const content = document.createElement('div');
    content.className = 'dev-body';
    if (section.body) content.appendChild(section.body);
    else content.classList.add('dev-text');
    root.append(head, content);
    const item: Item = { section, root, brief, content, open: this.remembered[section.id] ?? section.open ?? false };
    // No focus: Space, which climbs or lifts the camera, must not press this again.
    head.addEventListener('mousedown', (e) => e.preventDefault());
    head.addEventListener('click', () => this.setOpen(item, !item.open));
    this.items.set(section.id, item);
    this.sides[section.side].appendChild(root);
    this.show(item);
  }

  /** Takes a section out. */
  remove(id: string): void {
    this.items.get(id)?.root.remove();
    this.items.delete(id);
  }

  /** Hides the panels or brings them back, for a clear look at the world. */
  toggleHidden(): void {
    this.hidden = !this.hidden;
    this.parent.classList.toggle('dock-hidden', this.hidden);
  }

  /** Brings every open section up to date. */
  refresh(): void {
    if (this.hidden) return;
    for (const item of this.items.values()) this.show(item);
    this.covered = [this.sides.left.getBoundingClientRect(), this.sides.right.getBoundingClientRect()];
  }

  /** Whether a point on the screen is behind a panel. */
  covers(x: number, y: number): boolean {
    if (this.hidden) return false;
    return this.covered.some((r) => r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  }

  private setOpen(item: Item, open: boolean): void {
    item.open = open;
    this.remembered[item.section.id] = open;
    saveOpen(this.remembered);
    this.show(item);
  }

  private show(item: Item): void {
    const { section, root, brief, content, open } = item;
    root.classList.toggle('is-open', open);
    const summary = open ? '' : (section.summary?.() ?? '');
    if (brief.textContent !== summary) brief.textContent = summary;
    if (open && section.text) {
      const text = section.text();
      if (content.textContent !== text) content.textContent = text;
    }
  }
}
