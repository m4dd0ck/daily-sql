import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';

export interface EditorActions {
  onRun: () => void;
  onSubmit: () => void;
}

// Colors come from CSS variables so the editor follows the page's light and dark themes.
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
  {
    tag: [tags.lineComment, tags.blockComment],
    color: 'var(--syntax-comment)',
    fontStyle: 'italic',
  },
  { tag: [tags.operator, tags.punctuation], color: 'var(--syntax-operator)' },
  { tag: [tags.typeName, tags.standard(tags.name)], color: 'var(--syntax-type)' },
]);

const theme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
    fontSize: '0.95rem',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  },
  '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
  '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--text)', padding: '10px 0' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.5' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-2)',
    color: 'var(--muted)',
    border: 'none',
    borderRadius: '8px 0 0 8px',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important',
  },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
  },
});

/** The SQL editor: CodeMirror with SQL highlighting, table/column completion and run keys. */
export class SqlEditor {
  private readonly view: EditorView;
  private readonly language = new Compartment();

  constructor(parent: HTMLElement, actions: EditorActions) {
    const runKeys = keymap.of([
      { key: 'Mod-Enter', run: () => (actions.onRun(), true) },
      { key: 'Shift-Mod-Enter', run: () => (actions.onSubmit(), true) },
    ]);
    this.view = new EditorView({
      parent,
      extensions: [
        Prec.highest(runKeys),
        basicSetup,
        this.language.of(sql({ dialect: PostgreSQL, upperCaseKeywords: true })),
        syntaxHighlighting(highlight),
        theme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'SQL editor', 'aria-multiline': 'true' }),
      ],
    });
  }

  get text(): string {
    return this.view.state.doc.toString();
  }

  set text(value: string) {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: value } });
  }

  /** Offer these tables and columns in completion. */
  setSchema(schema: Record<string, string[]>): void {
    this.view.dispatch({
      effects: this.language.reconfigure(
        sql({ dialect: PostgreSQL, upperCaseKeywords: true, schema }),
      ),
    });
  }

  focus(): void {
    this.view.focus();
  }
}
