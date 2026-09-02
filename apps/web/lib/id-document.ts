export const ID_DOCUMENT_TYPES = ['Passport', 'Aadhaar', 'Driving License', 'Voter ID', 'Other'];
const ID_DOC_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_ID_DOC_BYTES = 4 * 1024 * 1024;

export const ID_DOC_ACCEPT_ATTR = 'image/png,image/jpeg,application/pdf';

/** Validates and reads an ID document file into a data URL — same inline-storage pattern as Hotel.logoUrl. */
export function readIdDocumentFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ID_DOC_ACCEPTED_TYPES.includes(file.type)) {
      reject(new Error('File must be a PNG, JPEG, or PDF'));
      return;
    }
    if (file.size > MAX_ID_DOC_BYTES) {
      reject(new Error('File must be under 4MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function isIdDocumentPdf(url: string) {
  return url.startsWith('data:application/pdf');
}
