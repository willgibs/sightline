/**
 * The action map: what each key and button does, as data. Code asks for actions
 * ("forward", "crouch", "grid"), never for keys, so rebinding, a gamepad or a touch
 * layout is a change of table, not of code. Each action belongs to a context, and only
 * the active contexts' bindings count: the debug keys do nothing in the honest view, and
 * Space lifts the fly camera without meaning anything on foot.
 *
 * Inputs are KeyboardEvent.code values (positions, so WASD stays WASD on AZERTY; the
 * labels follow the layout, keys.ts) or Mouse0 to Mouse4 for buttons.
 */

export type Action =
  // On foot, sampled every tick.
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'zoom'
  | 'crouch'
  | 'prone'
  | 'leanLeft'
  | 'leanRight'
  | 'fire'
  // Anywhere, once per press.
  | 'mark'
  | 'debugView'
  // The debug view.
  | 'colliders'
  | 'overwatch'
  | 'grid'
  | 'flyCamera'
  | 'slower'
  | 'faster'
  | 'restart'
  // The fly camera.
  | 'flyUp'
  | 'flyDown'
  // Watching a replay.
  | 'replayPlay'
  | 'replayBack'
  | 'replayForward'
  | 'replayStepBack'
  | 'replayStepForward';

/**
 * Where an action means something: on foot (play), always (even paused), in the debug
 * view, with the fly camera, watching a replay (where the debug view's keys work too).
 */
export type Context = 'play' | 'always' | 'debug' | 'fly' | 'replay';

export interface ActionSpec {
  context: Context;
  /** Held (sampled while down) or pressed (once per press). */
  kind: 'held' | 'pressed';
  inputs: readonly string[];
  /** What it does, in a word or two, for legends. */
  label: string;
}

export const DEFAULT_ACTIONS: Readonly<Record<Action, ActionSpec>> = {
  forward: { context: 'play', kind: 'held', inputs: ['KeyW'], label: 'forward' },
  back: { context: 'play', kind: 'held', inputs: ['KeyS'], label: 'back' },
  left: { context: 'play', kind: 'held', inputs: ['KeyA'], label: 'left' },
  right: { context: 'play', kind: 'held', inputs: ['KeyD'], label: 'right' },
  sprint: { context: 'play', kind: 'held', inputs: ['ShiftLeft', 'ShiftRight'], label: 'sprint' },
  // F as well as the right button: binoculars on a trackpad.
  zoom: { context: 'play', kind: 'held', inputs: ['Mouse2', 'KeyF'], label: 'zoom' },
  crouch: { context: 'play', kind: 'pressed', inputs: ['KeyC'], label: 'crouch' },
  prone: { context: 'play', kind: 'pressed', inputs: ['KeyZ'], label: 'prone' },
  leanLeft: { context: 'play', kind: 'held', inputs: ['KeyQ'], label: 'lean left' },
  leanRight: { context: 'play', kind: 'held', inputs: ['KeyE'], label: 'lean right' },
  fire: { context: 'play', kind: 'pressed', inputs: ['Mouse0'], label: 'fire' },
  mark: { context: 'play', kind: 'pressed', inputs: ['KeyM'], label: 'mark moment' },
  debugView: { context: 'always', kind: 'pressed', inputs: ['F3', 'Backquote'], label: 'debug view' },
  colliders: { context: 'debug', kind: 'pressed', inputs: ['KeyB'], label: 'colliders' },
  overwatch: { context: 'debug', kind: 'pressed', inputs: ['KeyO'], label: 'overwatch' },
  grid: { context: 'debug', kind: 'pressed', inputs: ['KeyG'], label: 'grid' },
  flyCamera: { context: 'debug', kind: 'pressed', inputs: ['KeyN'], label: 'fly camera' },
  slower: { context: 'debug', kind: 'pressed', inputs: ['BracketLeft'], label: 'slower' },
  faster: { context: 'debug', kind: 'pressed', inputs: ['BracketRight'], label: 'faster' },
  restart: { context: 'debug', kind: 'pressed', inputs: ['KeyR'], label: 'restart run' },
  flyUp: { context: 'fly', kind: 'held', inputs: ['Space', 'KeyE'], label: 'up' },
  flyDown: { context: 'fly', kind: 'held', inputs: ['KeyQ'], label: 'down' },
  replayPlay: { context: 'replay', kind: 'pressed', inputs: ['KeyP'], label: 'play or pause' },
  replayBack: { context: 'replay', kind: 'pressed', inputs: ['ArrowLeft'], label: 'back 5 s' },
  replayForward: { context: 'replay', kind: 'pressed', inputs: ['ArrowRight'], label: 'on 5 s' },
  replayStepBack: { context: 'replay', kind: 'pressed', inputs: ['Comma'], label: 'tick back' },
  replayStepForward: { context: 'replay', kind: 'pressed', inputs: ['Period'], label: 'tick on' },
};

/** Looks actions up by input, and inputs up by action, within the active contexts. */
export class ActionMap {
  private readonly byInput = new Map<string, Action[]>();

  constructor(readonly actions: Readonly<Record<Action, ActionSpec>> = DEFAULT_ACTIONS) {
    for (const [action, spec] of Object.entries(actions) as Array<[Action, ActionSpec]>) {
      for (const input of spec.inputs) {
        const list = this.byInput.get(input) ?? [];
        list.push(action);
        this.byInput.set(input, list);
      }
    }
  }

  /** The actions an input triggers in these contexts. */
  actionsOf(input: string, active: ReadonlySet<Context>): Action[] {
    return (this.byInput.get(input) ?? []).filter((a) => active.has(this.actions[a].context));
  }

  /** Whether an input is bound to anything at all (so the browser shouldn't act on it while playing). */
  isBound(input: string): boolean {
    return this.byInput.has(input);
  }

  /** The inputs for an action, as a person would name them: "W", "Right mouse or F". */
  describe(action: Action): string {
    return this.actions[action].inputs.map(inputName).join(' or ');
  }
}

/** A readable name for an input (US layout; keys.ts relabels letters for the player's layout). */
export function inputName(input: string): string {
  const names: Record<string, string> = {
    Mouse0: 'Left mouse',
    Mouse1: 'Middle mouse',
    Mouse2: 'Right mouse',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']',
    Space: 'Space',
    ArrowLeft: '←',
    ArrowRight: '→',
    Comma: ',',
    Period: '.',
  };
  if (names[input]) return names[input]!;
  if (input.startsWith('Key')) return input.slice(3);
  if (input.startsWith('Digit')) return input.slice(5);
  return input;
}

/**
 * A legend entry's keys as HTML: several actions' first inputs together ("W A S D"), or
 * one action's inputs as alternatives ("Right mouse or F"). Keys carry their codes, so
 * keys.ts can relabel them for the player's layout.
 */
export function keysHtml(map: ActionMap, actions: readonly Action[]): string {
  const kbd = (input: string): string => {
    const code = input.startsWith('Mouse') ? '' : ` data-code="${input}"`;
    return `<kbd${code}>${inputName(input)}</kbd>`;
  };
  if (actions.length > 1) {
    const inputs = actions.map((a) => map.actions[a].inputs[0]!);
    const codes = inputs.every((i) => !i.startsWith('Mouse')) ? ` data-code="${inputs.join(' ')}"` : '';
    return `<kbd${codes}>${inputs.map(inputName).join(' ')}</kbd>`;
  }
  return [...new Set(map.actions[actions[0]!].inputs.map(inputName))].length < map.actions[actions[0]!].inputs.length
    ? kbd(map.actions[actions[0]!].inputs[0]!)
    : map.actions[actions[0]!].inputs.map(kbd).join(' or ');
}

