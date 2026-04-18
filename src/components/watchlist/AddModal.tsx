import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MovieEntry, WatchMeta, WatchStatus, MediaType, WatchPlatform, Section } from '@/types';
import { SECTIONS, PLATFORMS } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (entry: Omit<MovieEntry, 'id' | 'isCustom'>, meta: Partial<WatchMeta>) => void;
  editEntry?: MovieEntry | null;
  editMeta?: WatchMeta | null;
}

const DEFAULT_ENTRY: Omit<MovieEntry, 'id' | 'isCustom'> = {
  title: '', year: '', country: '', genre: '', imdbRating: '', imdbUrl: '',
  section: 'General', type: 'Film',
};
const DEFAULT_META: Partial<WatchMeta> = {
  status: 'plan', personalRating: undefined,
  notes: '', watchedOn: '', watchPlatform: '', watchLink: '',
};

export function AddModal({ open, onClose, onSave, editEntry, editMeta }: Props) {
  const [entry, setEntry] = useState<Omit<MovieEntry, 'id' | 'isCustom'>>(DEFAULT_ENTRY);
  const [meta, setMeta] = useState<Partial<WatchMeta>>(DEFAULT_META);
  const [customSection, setCustomSection] = useState('');

  useEffect(() => {
    if (editEntry) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, isCustom: _ic, ...rest } = editEntry;
      setEntry(rest);
    } else {
      setEntry(DEFAULT_ENTRY);
    }
    setMeta(editMeta ? { ...editMeta } : DEFAULT_META);
  }, [editEntry, editMeta, open]);

  const handleSave = () => {
    if (!entry.title.trim()) return;
    const finalSection = entry.section === '__custom__'
      ? (customSection.trim() || 'General')
      : entry.section;
    onSave({ ...entry, section: finalSection as Section }, meta);
    onClose();
  };

  const setE = <K extends keyof typeof entry>(k: K, v: typeof entry[K]) =>
    setEntry((p) => ({ ...p, [k]: v }));
  const setM = <K extends keyof WatchMeta>(k: K, v: WatchMeta[K]) =>
    setMeta((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editEntry ? 'Edit Entry' : 'Add New Entry'}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 grid gap-4">
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input
              value={entry.title}
              onChange={(e) => setE('title', e.target.value)}
              placeholder="Movie or series title"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Year</Label>
              <Input value={entry.year} onChange={(e) => setE('year', e.target.value)} placeholder="2024" />
            </div>
            <div className="grid gap-1.5">
              <Label>Country</Label>
              <Input value={entry.country} onChange={(e) => setE('country', e.target.value)} placeholder="USA" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Genre</Label>
            <Input value={entry.genre} onChange={(e) => setE('genre', e.target.value)} placeholder="Action, Drama" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={entry.type} onValueChange={(v) => setE('type', v as MediaType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Film">Film</SelectItem>
                  <SelectItem value="Series">Series</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Section</Label>
              <Select value={entry.section} onValueChange={(v) => setE('section', v as Section)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  <SelectItem value="__custom__">+ Custom…</SelectItem>
                </SelectContent>
              </Select>
              {entry.section === '__custom__' && (
                <Input
                  value={customSection}
                  onChange={(e) => setCustomSection(e.target.value)}
                  placeholder="Section name"
                  className="mt-1.5"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>IMDb Rating</Label>
              <Input value={entry.imdbRating} onChange={(e) => setE('imdbRating', e.target.value)} placeholder="8.3" />
            </div>
            <div className="grid gap-1.5">
              <Label>IMDb URL</Label>
              <Input value={entry.imdbUrl} onChange={(e) => setE('imdbUrl', e.target.value)} placeholder="https://imdb.com/..." />
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-3 grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={meta.status ?? 'plan'} onValueChange={(v) => setM('status', v as WatchStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plan">Plan to Watch</SelectItem>
                    <SelectItem value="watching">Watching</SelectItem>
                    <SelectItem value="watched">Watched</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>My Rating (1–10)</Label>
                <Input
                  type="number" min={1} max={10}
                  value={meta.personalRating ?? ''}
                  onChange={(e) => setM('personalRating', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="8"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Platform</Label>
                <Select
                  value={meta.watchPlatform || '_none'}
                  onValueChange={(v) => setM('watchPlatform', (v === '_none' ? '' : v) as WatchPlatform)}
                >
                  <SelectTrigger><SelectValue placeholder="Platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Watched On</Label>
                <Input
                  type="date"
                  value={meta.watchedOn ?? ''}
                  onChange={(e) => setM('watchedOn', e.target.value)}
                  className="[color-scheme:dark]"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Watch Link (private)</Label>
              <Input
                value={meta.watchLink ?? ''}
                onChange={(e) => setM('watchLink', e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Notes / Review</Label>
              <Textarea
                value={meta.notes ?? ''}
                onChange={(e) => setM('notes', e.target.value.slice(0, 500))}
                placeholder="Your thoughts..."
                rows={3}
              />
              <span className="text-right text-[10px] text-[var(--text-disabled)]">
                {(meta.notes ?? '').length}/500
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!entry.title.trim()}>
            {editEntry ? 'Save Changes' : 'Add Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
