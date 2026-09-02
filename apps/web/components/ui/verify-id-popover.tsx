'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Upload } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { ID_DOC_ACCEPT_ATTR, ID_DOCUMENT_TYPES, isIdDocumentPdf, readIdDocumentFile } from '@/lib/id-document';
import { Button, ErrorBanner, Input, Label, Select } from './primitives';

export interface Anchor {
  top: number;
  left: number;
}

/**
 * Opened from the grey (unverified) icon next to a guest's name, wherever
 * that appears (Bookings tab, Guests tab). Two cases: a document already on
 * file (captured at check-in, see CheckinService) — shown for a look-over
 * before confirming — or nothing on file yet, in which case this doubles as
 * the capture form (type/number/upload) so front desk isn't blocked on the
 * guest going through Check-In again to record it. Either way,
 * POST /guests/:id/verify-id does the confirming (and, in the capture case,
 * the saving) in one call.
 */
export function VerifyIdPopover({
  hotelId,
  guest,
  anchor,
  onClose,
  onVerified,
}: {
  hotelId: string;
  guest: { id: string; fullName: string; idDocumentType: string | null; idDocumentNumber: string | null; idDocumentUrl: string | null };
  anchor: Anchor;
  onClose: () => void;
  onVerified: () => void;
}) {
  const hasDocOnFile = !!guest.idDocumentUrl;
  const [docType, setDocType] = useState(guest.idDocumentType ?? ID_DOCUMENT_TYPES[0]);
  const [docNumber, setDocNumber] = useState(guest.idDocumentNumber ?? '');
  const [docUrl, setDocUrl] = useState(guest.idDocumentUrl ?? '');
  const [docUploadError, setDocUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDocUploadError('');
    readIdDocumentFile(file)
      .then(setDocUrl)
      .catch((err: Error) => setDocUploadError(err.message));
  }

  async function handleVerify() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/guests/${guest.id}/verify-id?hotelId=${hotelId}`, {
        method: 'POST',
        body: JSON.stringify(
          hasDocOnFile ? {} : { idDocumentType: docType, idDocumentNumber: docNumber, idDocumentUrl: docUrl },
        ),
      });
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to verify ID');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = hasDocOnFile || (docType.trim() && docNumber.trim() && docUrl);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        <p className="text-xs font-medium text-slate-500">Verify ID &mdash; {guest.fullName}</p>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {hasDocOnFile ? (
          <>
            <div className="rounded-lg border border-slate-200 p-2">
              {isIdDocumentPdf(guest.idDocumentUrl!) ? (
                <a href={guest.idDocumentUrl!} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-brand-700 hover:underline">
                  <FileText className="h-4 w-4" /> View PDF document
                </a>
              ) : (
                <a href={guest.idDocumentUrl!} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={guest.idDocumentUrl!} alt="ID document" className="max-h-40 w-full rounded object-contain" />
                </a>
              )}
            </div>
            <p className="text-sm text-slate-700">{guest.idDocumentType} &middot; {guest.idDocumentNumber}</p>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">No ID document on file yet &mdash; add it here to verify.</p>
            <div>
              <Label htmlFor="verify-id-type">ID document type</Label>
              <Select id="verify-id-type" value={docType} onChange={(e) => setDocType(e.target.value)} className="text-sm">
                {ID_DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="verify-id-number">ID number</Label>
              <Input id="verify-id-number" placeholder="Document number" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label htmlFor="verify-id-doc">
                ID document photo/scan {!docUrl && <span className="text-rose-600">(required)</span>}
              </Label>
              <div className="flex items-center gap-2">
                {docUrl ? (
                  isIdDocumentPdf(docUrl) ? (
                    <a href={docUrl} target="_blank" rel="noreferrer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-brand-700">
                      <FileText className="h-4 w-4" />
                    </a>
                  ) : (
                    <a href={docUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={docUrl} alt="ID document" className="h-9 w-9 rounded-lg border border-slate-200 object-cover" />
                    </a>
                  )
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300">
                    <Upload className="h-4 w-4" />
                  </span>
                )}
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  {docUrl ? 'Replace' : 'Upload'}
                  <input id="verify-id-doc" type="file" accept={ID_DOC_ACCEPT_ATTR} onChange={handleFileChange} className="hidden" />
                </label>
                {docUploadError && <span className="text-xs text-rose-600">{docUploadError}</span>}
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2 pt-1">
          <Button onClick={handleVerify} disabled={submitting || !canSubmit} className="px-3 py-1.5 text-xs">
            {submitting ? 'Verifying…' : 'Mark Verified'}
          </Button>
          <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
