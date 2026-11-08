import { inputName, type ActionMap } from './actions';

/**
 * The replay's timeline: play and pause, where the replay is and how long it runs, a bar
 * to scrub along with the run's markers and pauses on it, the speed, and the way out.
 * It only reports what the viewer does (TimelineHandlers); the game moves the replay.
 */

export interface TimelineHandlers {
  onToggle(): void;
  /** The viewer dragged or clicked the bar: `done` once they let go. */
  onSeek(tick: number, done: boolean): void;
  onSpeed(): void;
  onLeave(): void;
}

export interface TimelineMark {
  tick: number;
  kind: string;
  text?: string;
}

export class Timeline {
  readonly root: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly time: HTMLElement;
  private readonly bar: HTMLInputElement;
  private readonly marks: HTMLElement;
  private readonly speed: HTMLButtonElement;
  private readonly title: HTMLElement;
  private ticks = 1;
  private hz = 30;
  private shown = '';
  private dragging = false;

  constructor(handlers: TimelineHandlers, map: ActionMap) {
    this.root = document.createElement('div');
    this.root.className = 'timeline';
    this.root.hidden = true;
    const key = (a: Parameters<ActionMap['describe']>[0]) => map.actions[a].inputs.map(inputName).join(' ');
    this.root.innerHTML = `
      <button type="button" class="play" title="Play or pause (${key('replayPlay')})"></button>
      <span class="time"></span>
      <div class="track">
        <div class="marks"></div>
        <input type="range" min="0" step="1" aria-label="Where in the run" />
      </div>
      <button type="button" class="speed" title="Speed ([ and ])"></button>
      <span class="title"></span>
      <button type="button" class="leave" title="Back to the valley">Leave</button>`;
    this.play = this.root.querySelector('.play')!;
    this.time = this.root.querySelector('.time')!;
    this.bar = this.root.querySelector('input')!;
    this.marks = this.root.querySelector('.marks')!;
    this.speed = this.root.querySelector('.speed')!;
    this.title = this.root.querySelector('.title')!;
    this.play.addEventListener('click', () => handlers.onToggle());
    this.speed.addEventListener('click', () => handlers.onSpeed());
    this.root.querySelector('.leave')!.addEventListener('click', () => handlers.onLeave());
    this.bar.addEventListener('input', () => {
      this.dragging = true;
      handlers.onSeek(Number(this.bar.value), false);
    });
    this.bar.addEventListener('change', () => {
      this.dragging = false;
      handlers.onSeek(Number(this.bar.value), true);
      // The arrow keys are the replay's, not the bar's.
      this.bar.blur();
    });
    // Buttons don't keep the focus either: keys go to the replay.
    for (const b of this.root.querySelectorAll('button')) b.addEventListener('mouseup', () => b.blur());
    this.root.addEventListener('keydown', (e) => {
      if (e.target === this.bar && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) e.preventDefault();
    });
    document.body.append(this.root);
  }

  show(title: string, ticks: number, hz: number, marks: readonly TimelineMark[]): void {
    this.ticks = Math.max(1, ticks);
    this.hz = hz;
    this.bar.max = String(this.ticks);
    this.title.textContent = title;
    this.marks.replaceChildren(
      ...marks.map((m) => {
        const el = document.createElement('span');
        el.className = `mark mark-${m.kind === 'marker' ? 'marker' : m.kind === 'pause' ? 'pause' : 'other'}`;
        el.style.left = `${(m.tick / this.ticks) * 100}%`;
        el.title = `${clock(m.tick / hz)} · ${m.kind}${m.text ? `: ${m.text}` : ''}`;
        return el;
      }),
    );
    this.shown = '';
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Every frame: cheap, it only touches the page when something it shows changed. */
  update(tick: number, playing: boolean, speed: number): void {
    const key = `${tick}|${playing}|${speed}`;
    if (key === this.shown) return;
    this.shown = key;
    this.play.textContent = playing ? '❚❚' : '▶';
    this.time.textContent = `${clock(tick / this.hz)} / ${clock(this.ticks / this.hz)}`;
    this.speed.textContent = `×${speed}`;
    if (!this.dragging) this.bar.value = String(tick);
  }
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
