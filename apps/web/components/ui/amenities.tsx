import { X } from 'lucide-react';
import { Input } from '@/components/ui/primitives';

/** Room type `amenities` is a loosely-typed JSON column; normalize whatever comes back into a string list. */
export function toAmenitiesList(amenities: unknown): string[] {
  if (!Array.isArray(amenities)) return [];
  return amenities.filter((a): a is string => typeof a === 'string');
}

export function AmenitiesList({ amenities }: { amenities: unknown }) {
  const list = toAmenitiesList(amenities);
  if (list.length === 0) return <span className="text-sm text-slate-400">No amenities listed</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((a) => (
        <span key={a} className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
          {a}
        </span>
      ))}
    </div>
  );
}

/** Comma-separated tag input: type a name + comma (or Enter) to add an amenity. */
export function AmenitiesEditor({
  amenities,
  onChange,
  id,
}: {
  amenities: string[];
  onChange: (amenities: string[]) => void;
  id?: string;
}) {
  function addFromInput(raw: string) {
    const value = raw.trim();
    if (!value || amenities.includes(value)) return;
    onChange([...amenities, value]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const target = e.currentTarget;
      addFromInput(target.value);
      target.value = '';
    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && amenities.length > 0) {
      onChange(amenities.slice(0, -1));
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    addFromInput(e.currentTarget.value);
    e.currentTarget.value = '';
  }

  return (
    <div>
      {amenities.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {amenities.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              {a}
              <button type="button" onClick={() => onChange(amenities.filter((x) => x !== a))} className="text-slate-400 hover:text-slate-700">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input id={id} placeholder="e.g. WiFi, then press Enter" onKeyDown={handleKeyDown} onBlur={handleBlur} />
    </div>
  );
}
