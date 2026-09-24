import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { IconCheck, IconClose } from '../../icons/Icon';

/** Inline name field (no modal — UI_VISION §2.7). Enter saves, Escape cancels. */
export function SaveLookForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const labels = useLabels();
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onSave(name.trim());
  };

  return (
    <form
      className="iu-savelook"
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <input
        ref={input}
        className="iu-savelook__input"
        aria-label={labels.lookName}
        placeholder={labels.lookName}
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <IconButton
        label={labels.save}
        icon={<IconCheck size={18} />}
        type="submit"
        disabled={!name.trim()}
      />
      <IconButton label={labels.cancelEdit} icon={<IconClose size={18} />} onClick={onCancel} />
    </form>
  );
}
