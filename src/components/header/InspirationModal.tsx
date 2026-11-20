import { useState } from "react";
import { nanoid } from "nanoid";
import { toast as sonnerToast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExternalLink, Image as ImageIcon, Trash2, X } from "lucide-react";
import { useSongStore, type InspirationItem, type InspirationLink } from "@/store/song";
import { MAX_INSPIRATION_ITEMS, SERVICE_LABEL, parseStreamingUrl } from "@/lib/inspiration";
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function InspirationLinkField({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (link: InspirationLink) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    const embed = parseStreamingUrl(value);
    if (!embed) {
      setError("Paste a full Spotify, Apple Music, YouTube or SoundCloud link. Short links like spotify.link aren't supported.");
      return;
    }
    if (useSongStore.getState().inspirationPhotos.some((p) => p.kind === "link" && p.url === embed.url)) {
      setError("That link is already added.");
      return;
    }
    onAdd({ id: nanoid(), kind: "link", service: embed.service, url: embed.url });
    setValue("");
    setError(null);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          disabled={disabled}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a song link"
          aria-label="Song link from Spotify, Apple Music, YouTube or SoundCloud"
          aria-invalid={!!error}
          aria-describedby={error ? "inspiration-link-error" : undefined}
          className="h-9"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="btn-sculpt-amber shrink-0 inline-flex items-center justify-center rounded-lg px-4 h-9 font-semibold text-sm disabled:opacity-50"
        >
          Add link
        </button>
      </div>
      {error && (
        <p id="inspiration-link-error" role="alert" className="mt-1.5 text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </form>
  );
}

function ItemCard({ item, onRemove }: { item: InspirationItem; onRemove: (item: InspirationItem) => void }) {
  const link = item.kind === "link" ? item : null;
  const embed = link ? parseStreamingUrl(link.url) : null;
  return (
    <li
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
    >
      {link && embed ? (
        <iframe
          title={`${SERVICE_LABEL[embed.service]} player`}
          src={embed.src}
          height={embed.height}
          allow={embed.allow}
          sandbox={embed.sandbox}
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className={embed.height ? "block w-full border-0" : "block aspect-video w-full border-0"}
        />
      ) : (
        item.kind !== "link" && (
          <div className="p-3">
            <img
              src={item.dataUrl}
              alt="Inspiration photo"
              draggable={false}
              className="mx-auto block max-h-[50vh] w-auto max-w-full rounded-lg object-contain"
            />
          </div>
        )
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        {link && embed ? (
          <a
            href={embed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-sculpt-cream inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in {SERVICE_LABEL[embed.service]}
          </a>
        ) : (
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Photo</span>
        )}
        <button
          type="button"
          onClick={() => onRemove(item)}
          className="btn-sculpt-cream ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg"
          aria-label={link ? "Remove link" : "Remove photo"}
          title={link ? "Remove link" : "Remove photo"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function InspirationModal({ onClose, onAddPhotos }: { onClose: () => void; onAddPhotos: () => void }) {
  const items = useSongStore((s) => s.inspirationPhotos);
  const addItem = useSongStore((s) => s.addInspirationPhoto);
  const removeItem = useSongStore((s) => s.removeInspirationPhoto);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const full = items.length >= MAX_INSPIRATION_ITEMS;

  const remove = (item: InspirationItem) => {
    removeItem(item.id);
    setConfirmRemoveAll(false);
    sonnerToast(item.kind === "link" ? "Link removed" : "Photo removed", {
      action: { label: "Undo", onClick: () => addItem(item) },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        <DialogOverlay
          className="z-[10000] bg-transparent"
          style={{
            background: "color-mix(in oklch, var(--cocoa-deep, black) 55%, transparent)",
            backdropFilter: "blur(40px) saturate(1.4)",
            WebkitBackdropFilter: "blur(40px) saturate(1.4)",
          }}
        />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          onPointerDownOutside={(e) => {
            // The "removed" toast renders outside this dialog's DOM subtree, so
            // Radix would treat a click on its Undo action as an outside click.
            if ((e.target as HTMLElement | null)?.closest(".toaster")) e.preventDefault();
          }}
          className="fixed inset-0 z-[10001] flex flex-col outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
          <div
            className="w-full flex-1 overflow-y-auto"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          >
            <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
              <div className="flex items-baseline justify-between gap-3 pr-8">
                <DialogTitle className="font-display text-2xl text-white">Inspiration</DialogTitle>
                <span className="font-mono-chord text-[13px] text-white/70">
                  {items.length}/{MAX_INSPIRATION_ITEMS}
                </span>
              </div>
              <DialogDescription className="sr-only">
                Up to {MAX_INSPIRATION_ITEMS} photos and song links. Song players are provided by their streaming services.
              </DialogDescription>

              <div
                className="flex flex-col gap-3 rounded-xl p-3"
                style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
              >
                <InspirationLinkField disabled={full} onAdd={addItem} />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onAddPhotos}
                    disabled={full}
                    className="btn-sculpt-cream inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 h-8 text-sm font-semibold disabled:opacity-50"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Add photos
                  </button>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {full
                      ? "Limit reached. Remove one to add another."
                      : `Photos and links share ${MAX_INSPIRATION_ITEMS} slots.`}
                  </p>
                </div>
              </div>

              {items.length > 0 ? (
                <ul className="flex flex-col gap-4">
                  {items.map((item) => (
                    <ItemCard key={item.id} item={item} onRemove={remove} />
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-white/70">
                  Add a photo or paste a song link to keep it in view while you write.
                </p>
              )}

              {items.length > 1 && (confirmRemoveAll ? (
                <div role="group" aria-label="Confirm remove all" className="flex flex-wrap items-center justify-center gap-2 text-sm text-white">
                  <span>Remove all {items.length}? This can't be undone.</span>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveAll(false)}
                    className="btn-sculpt-cream rounded-lg px-3 h-8 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { items.forEach((p) => removeItem(p.id)); onClose(); }}
                    className="btn-sculpt-destructive rounded-lg px-3 h-8 text-sm font-semibold"
                  >
                    Remove all
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveAll(true)}
                  className="self-center px-4 py-2 rounded-lg text-[13px] text-white"
                  style={{ background: "color-mix(in oklch, var(--destructive) 75%, transparent)", border: "1px solid color-mix(in oklch, white 20%, transparent)" }}
                >
                  Remove all
                </button>
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
