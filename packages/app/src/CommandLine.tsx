import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { SessionSnapshot } from './commands/session.ts';

export interface CommandLineHandle {
  /** Focus the input and append a typed character (AutoCAD-style type-anywhere). */
  typeKey(key: string): void;
}

interface Props {
  snapshot: SessionSnapshot;
  onSubmit(text: string): void;
  onCancel(): void;
}

/**
 * The command line (REQ-003.9): last log lines, the current prompt, and an
 * input. Enter or Space submits, Esc cancels, Up/Down recall earlier input.
 */
export const CommandLine = forwardRef<CommandLineHandle, Props>(function CommandLine({ snapshot, onSubmit, onCancel }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [recall, setRecall] = useState<string[]>([]);
  const [recallIndex, setRecallIndex] = useState(-1);

  useImperativeHandle(ref, () => ({
    typeKey(key: string) {
      inputRef.current?.focus();
      setValue((v) => v + key);
    },
  }));

  const submit = () => {
    const text = value;
    setValue('');
    setRecallIndex(-1);
    if (text.trim()) setRecall((r) => [...r.slice(-49), text.trim()]);
    onSubmit(text);
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (/^F\d{1,2}$/.test(ev.key)) return; // function keys (F3/F8/F9) reach the app
    // With nothing typed, Ctrl/Cmd+Z and +Y undo the drawing, not the text box.
    if ((ev.ctrlKey || ev.metaKey) && /^[zy]$/i.test(ev.key) && value === '') return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      submit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      setValue('');
      onCancel();
      inputRef.current?.blur();
    } else if (ev.key === 'ArrowUp' && recall.length > 0) {
      ev.preventDefault();
      const i = recallIndex < 0 ? recall.length - 1 : Math.max(0, recallIndex - 1);
      setRecallIndex(i);
      setValue(recall[i] ?? '');
    } else if (ev.key === 'ArrowDown' && recallIndex >= 0) {
      ev.preventDefault();
      const i = recallIndex + 1;
      setRecallIndex(i >= recall.length ? -1 : i);
      setValue(i >= recall.length ? '' : (recall[i] ?? ''));
    }
    ev.stopPropagation();
  };

  return (
    <section className="cmdline" aria-label="Command line">
      <ol className="cmdlog" data-testid="command-log">
        {snapshot.log.slice(-3).map((line, i) => (
          <li key={snapshot.log.length - 3 + i}>{line}</li>
        ))}
      </ol>
      <label className="cmdprompt">
        <span data-testid="command-prompt">{snapshot.prompt}</span>
        <input
          ref={inputRef}
          data-testid="command-input"
          data-cmdline="true"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
    </section>
  );
});
